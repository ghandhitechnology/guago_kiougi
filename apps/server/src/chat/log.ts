/**
 * `chat_log` writes and retention (PLAN §12, §20). Lines are queued in memory and written as one
 * multi-row insert a second, so a busy room never waits on the database.
 */
import type { ChatChannel } from "@guago/shared";
import { type Db, describeError, pgErrorCode } from "../db/index.ts";
import { chatLog } from "../db/schema.ts";

export interface ChatLogRow {
  channel: ChatChannel;
  senderId: string | null;
  target: string | null;
  body: string;
  masked: boolean;
  at: Date;
}

/** Where the rooms put chat lines. */
export interface ChatSink {
  push(row: ChatLogRow): void;
  flush(): Promise<void>;
}

export const CHAT_RETENTION_DAYS = 90;
/** Day partitions made ahead, so a server that was down over midnight still has one. */
const PARTITIONS_AHEAD = 3;
const MAINTAIN_EVERY_MS = 60 * 60 * 1000;
const MAINTAIN_RETRY_MS = 5 * 60 * 1000;
/**
 * How long maintenance waits for a lock. Adding a partition locks the whole table, and inserts
 * queue behind a waiting lock, so it gives up quickly behind a long read and tries again later.
 */
const LOCK_TIMEOUT_MS = 1000;

const FLUSH_EVERY_MS = 1000;
const MAX_BATCH = 500;
/** Lines held while the database is away; past this the oldest are dropped. */
const MAX_QUEUED = 50_000;
const MAX_BACKOFF_MS = 30_000;
/** At most one error line per this long while writes keep failing. */
const ERROR_LOG_EVERY_MS = 60_000;

const utcToday = () => new Date().toISOString().slice(0, 10);

/**
 * Adds the coming days' partitions and drops those past retention; returns how many it dropped.
 * Old partitions are detached concurrently (no table-wide lock, inserts carry on) and then
 * dropped alone. A detach cut short by the lock timeout is finished on the next run.
 */
export async function maintainChatLog(db: Db, today = utcToday()): Promise<number> {
  const client = await db.pool.connect();
  try {
    await client.query(`set lock_timeout = ${LOCK_TIMEOUT_MS}`);
    await client.query("select chat_log_add_partitions($1, $2::date)", [PARTITIONS_AHEAD, today]);
    const old = await client.query<{ name: string; pending: boolean }>(
      `select c.relname as name, i.inhdetachpending as pending
       from pg_inherits i join pg_class c on c.oid = i.inhrelid
       where i.inhparent = 'chat_log'::regclass and c.relname ~ '^chat_log_[0-9]{8}$'
         and to_date(substring(c.relname from 10), 'YYYYMMDD') < $1::date - $2::int`,
      [today, CHAT_RETENTION_DAYS],
    );
    for (const { name, pending } of old.rows) {
      const table = client.escapeIdentifier(name);
      const how = pending ? "finalize" : "concurrently";
      await client.query(`alter table chat_log detach partition ${table} ${how}`);
      await client.query(`drop table ${table}`);
    }
    return old.rows.length;
  } finally {
    await client.query("reset lock_timeout").catch(() => {});
    client.release();
  }
}

/** Runs maintenance now and every hour, sooner again after a failure. Returns the stop. */
export function startChatLogMaintenance(db: Db): () => void {
  let timer: NodeJS.Timeout | undefined;
  let stopped = false;
  const run = async () => {
    let next = MAINTAIN_EVERY_MS;
    try {
      await maintainChatLog(db);
    } catch (error) {
      console.error(`chat_log maintenance failed, retrying: ${describeError(error)}`);
      next = MAINTAIN_RETRY_MS;
    }
    if (!stopped) timer = setTimeout(run, next).unref();
  };
  void run();
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}

export interface ChatLogOptions {
  /** Called when an insert finds no partition for its day. */
  onMissingPartition?: () => Promise<unknown>;
}

export class ChatLog implements ChatSink {
  private queue: ChatLogRow[] = [];
  private writing: Promise<void> | undefined;
  private readonly timer: NodeJS.Timeout;
  private readonly db: Db;
  private readonly onMissingPartition: (() => Promise<unknown>) | undefined;
  /** After a failed write nothing is tried before this time; the wait doubles per failure. */
  private retryAt = 0;
  private backoff = FLUSH_EVERY_MS;
  private loggedAt = -Infinity;
  private unlogged = 0;

  constructor(db: Db, options: ChatLogOptions = {}) {
    this.db = db;
    this.onMissingPartition = options.onMissingPartition;
    this.timer = setInterval(() => void this.flush(), FLUSH_EVERY_MS);
    this.timer.unref();
  }

  push(row: ChatLogRow): void {
    this.queue.push(row);
    if (this.queue.length > MAX_QUEUED) this.queue.splice(0, this.queue.length - MAX_QUEUED);
    if (this.queue.length >= MAX_BATCH) void this.flush();
  }

  /** Writes what is queued, unless a write is running or the last one failed recently. */
  async flush(): Promise<void> {
    if (this.writing || this.queue.length === 0 || Date.now() < this.retryAt) return;
    await this.run();
  }

  /** Stops the timer and makes one last attempt, whatever the backoff. */
  async close(): Promise<void> {
    clearInterval(this.timer);
    while (this.writing) await this.writing;
    if (this.queue.length > 0) await this.run();
  }

  private async run(): Promise<void> {
    this.writing = this.write().finally(() => (this.writing = undefined));
    await this.writing;
  }

  private async write(): Promise<void> {
    while (this.queue.length > 0) {
      const batch = this.queue.splice(0, MAX_BATCH);
      try {
        await this.db.insert(chatLog).values(batch);
      } catch (error) {
        this.queue.unshift(...batch);
        this.failed(error);
        // 23514: no partition for the row's day yet (the clock passed the partitions made ahead).
        if (pgErrorCode(error).code === "23514") await this.onMissingPartition?.().catch(() => 0);
        return;
      }
      this.retryAt = 0;
      this.backoff = FLUSH_EVERY_MS;
    }
  }

  private failed(error: unknown): void {
    const now = Date.now();
    this.retryAt = now + this.backoff;
    this.backoff = Math.min(this.backoff * 2, MAX_BACKOFF_MS);
    if (now - this.loggedAt < ERROR_LOG_EVERY_MS) {
      this.unlogged++;
      return;
    }
    const more = this.unlogged > 0 ? ` (${this.unlogged} more failures since the last report)` : "";
    console.error(
      `chat_log write failed, ${this.queue.length} lines queued, retrying in ${this.retryAt - now} ms${more}: ${describeError(error)}`,
    );
    this.loggedAt = now;
    this.unlogged = 0;
  }
}
