/**
 * `chat_log` writes and retention (PLAN §12, §20). Lines are queued in memory and written as one
 * multi-row insert a second, so a busy room never waits on the database.
 */
import type { ChatChannel } from "@guago/shared";
import { sql } from "drizzle-orm";
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

const FLUSH_EVERY_MS = 1000;
const MAX_BATCH = 500;
/** Lines held while the database is away; past this the oldest are dropped. */
const MAX_QUEUED = 50_000;

/** Adds the coming days' partitions and drops those past retention. Returns how many dropped. */
export async function maintainChatLog(db: Db): Promise<number> {
  const result = await db.execute<{ dropped: number }>(
    sql`select chat_log_maintain(${CHAT_RETENTION_DAYS}, ${PARTITIONS_AHEAD}) as dropped`,
  );
  return Number(result.rows[0]?.dropped ?? 0);
}

export class ChatLog implements ChatSink {
  private queue: ChatLogRow[] = [];
  private writing: Promise<void> | undefined;
  private readonly timers: NodeJS.Timeout[];
  private readonly db: Db;

  constructor(db: Db) {
    this.db = db;
    const maintain = () =>
      maintainChatLog(db).catch((e) =>
        console.error(`chat_log maintenance failed: ${describeError(e)}`),
      );
    void maintain();
    this.timers = [
      setInterval(() => void this.flush(), FLUSH_EVERY_MS),
      setInterval(maintain, MAINTAIN_EVERY_MS),
    ];
    for (const t of this.timers) t.unref();
  }

  push(row: ChatLogRow): void {
    this.queue.push(row);
    if (this.queue.length > MAX_QUEUED) this.queue.splice(0, this.queue.length - MAX_QUEUED);
    if (this.queue.length >= MAX_BATCH) void this.flush();
  }

  /** Writes everything queued; one write at a time. */
  async flush(): Promise<void> {
    while (this.writing) await this.writing;
    if (this.queue.length === 0) return;
    this.writing = this.write().finally(() => (this.writing = undefined));
    await this.writing;
  }

  async close(): Promise<void> {
    for (const t of this.timers) clearInterval(t);
    await this.flush();
  }

  private async write(): Promise<void> {
    while (this.queue.length > 0) {
      const batch = this.queue.splice(0, MAX_BATCH);
      try {
        await this.db.insert(chatLog).values(batch);
      } catch (error) {
        // 23514: no partition for the row's day yet (the clock passed the partitions made ahead).
        if (pgErrorCode(error).code === "23514") await maintainChatLog(this.db).catch(() => 0);
        console.error(`chat_log write of ${batch.length} failed: ${describeError(error)}`);
        this.queue.unshift(...batch);
        return;
      }
    }
  }
}
