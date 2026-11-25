/**
 * Batched quest progress (PLAN §15), the way combat credit is batched (`grants.ts`): events from
 * combat and navigation land in memory with no I/O, and every few seconds each character's
 * pending events go to the executor as one `live.progress` operation. A character's events are
 * also flushed when they leave a room and everyone's at shutdown. A map's simulation tick never
 * waits on the database.
 *
 * A batch takes its operation id when it leaves the buffer and keeps it until it lands: a flush
 * that failed on the connection is retried under the same id and applies once. One the rules or
 * the database refuse is logged whole and dropped.
 */

import { randomUUID } from "node:crypto";
import { boardDay } from "@guago/shared";
import { sql } from "drizzle-orm";
import { background } from "../background.ts";
import type { Db } from "../db/index.ts";
import { describeError } from "../db/index.ts";
import { type ExecResult, type Executor, isTransient } from "../economy/executor.ts";
import type { ProgressRequest } from "./ops.ts";

export const PROGRESS_FLUSH_MS = 5000;

type Counts = Record<string, number>;

interface Pending {
  kills: Counts;
  collect: Counts;
  deliver: Counts;
  escort: Counts;
  nohit: Counts;
  help: Counts;
  story: Set<string>;
  chores: Set<string>;
  bosses: Set<string>;
  visit: Set<string>;
  met: Set<string>;
  notice?: string;
}

const empty = (): Pending => ({
  kills: {},
  collect: {},
  deliver: {},
  escort: {},
  nohit: {},
  help: {},
  story: new Set(),
  chores: new Set(),
  bosses: new Set(),
  visit: new Set(),
  met: new Set(),
});

interface Batch {
  opId: string;
  request: ProgressRequest;
}

export interface ProgressOptions {
  /** A batch landed: its result, for pushes. */
  onLanded?(characterId: string, result: Extract<ExecResult, { ok: true }>): void;
  log?(line: string): void;
}

const ID = /^[a-z0-9:-]{1,64}$/;
const bump = (m: Counts, key: string, n: number) => {
  m[key] = (m[key] ?? 0) + n;
};

export class ProgressBuffer {
  private readonly db: Db;
  private readonly executor: Pick<Executor, "execute">;
  private readonly now: () => Date;
  private readonly options: ProgressOptions;
  private readonly prefix = `progress:${randomUUID()}`;
  private seq = 0;
  private pending = new Map<string, Pending>();
  private inflight = new Map<string, Batch>();
  private running = new Map<string, Promise<void>>();

  constructor(
    db: Db,
    executor: Pick<Executor, "execute">,
    now: () => Date,
    options: ProgressOptions = {},
  ) {
    this.db = db;
    this.executor = executor;
    this.now = now;
    this.options = options;
  }

  private of(characterId: string): Pending {
    let p = this.pending.get(characterId);
    if (!p) {
      p = empty();
      this.pending.set(characterId, p);
    }
    return p;
  }

  /** Counts `n` of something; ids that cannot be content ids are refused and logged. */
  count(
    characterId: string,
    kind: "kills" | "collect" | "deliver" | "escort" | "nohit",
    id: string,
    n = 1,
  ): boolean {
    if (!ID.test(id) || !Number.isSafeInteger(n) || n <= 0) {
      this.log(`progress refused (${kind}): ${JSON.stringify({ characterId, id, n })}`);
      return false;
    }
    bump(this.of(characterId)[kind], id, n);
    return true;
  }

  mark(
    characterId: string,
    kind: "story" | "bosses" | "visit" | "met" | "chores",
    id: string,
  ): boolean {
    if (!ID.test(id)) {
      this.log(`progress refused (${kind}): ${JSON.stringify({ characterId, id })}`);
      return false;
    }
    this.of(characterId)[kind].add(id);
    return true;
  }

  /** Moves a helper's `help:` row; `notice` is the notice it works on. */
  help(characterId: string, questId: string, notice: string, n = 1): void {
    const p = this.of(characterId);
    bump(p.help, questId, n);
    p.notice = notice;
  }

  async flush(characterId?: string): Promise<void> {
    const ids =
      characterId === undefined
        ? [...new Set([...this.pending.keys(), ...this.inflight.keys()])]
        : [characterId];
    await Promise.all(ids.map((id) => this.serial(id)));
  }

  start(ms = PROGRESS_FLUSH_MS): () => void {
    const timer = setInterval(() => background("progress flush", this.flush()), ms);
    timer.unref();
    return () => clearInterval(timer);
  }

  inflightIds(): string[] {
    return [...this.inflight.values()].map((b) => b.opId);
  }

  get waiting(): number {
    return new Set([...this.pending.keys(), ...this.inflight.keys()]).size;
  }

  private log(line: string): void {
    (this.options.log ?? console.error)(line);
  }

  private serial(characterId: string): Promise<void> {
    const before = this.running.get(characterId) ?? Promise.resolve();
    // A failed send must neither block the next one nor surface as an unhandled rejection.
    const next = before.then(
      () => this.send(characterId),
      () => this.send(characterId),
    );
    this.running.set(characterId, next);
    const clear = () => {
      if (this.running.get(characterId) === next) this.running.delete(characterId);
    };
    void next.then(clear, clear);
    return next;
  }

  private async batch(characterId: string, p: Pending): Promise<Batch> {
    // The rows the batch can move: active and not yet down. Read once, kept for every retry.
    const { rows } = await this.db.execute(sql`
      select quest_id from quest_progress
      where character_id = ${characterId} and state = 'active'
        and (reset_at is null or reset_at > ${this.now().toISOString()}::timestamptz)
      order by quest_id`);
    return {
      opId: `${this.prefix.slice(0, 40)}:${++this.seq}`,
      request: {
        quests: rows.map((r) => r.quest_id as string),
        kills: p.kills,
        collect: p.collect,
        deliver: p.deliver,
        escort: p.escort,
        nohit: p.nohit,
        story: [...p.story],
        bosses: [...p.bosses],
        chores: [...p.chores],
        help: p.help,
        visit: [...p.visit],
        met: [...p.met],
        ...(p.notice ? { notice: p.notice } : {}),
        day: boardDay(this.now().getTime()),
      },
    };
  }

  private async send(characterId: string): Promise<void> {
    let batch = this.inflight.get(characterId);
    if (!batch) {
      const p = this.pending.get(characterId);
      if (!p) return;
      this.pending.delete(characterId);
      try {
        batch = await this.batch(characterId, p);
      } catch (error) {
        // Nothing left the buffer yet: put the events back for the next flush.
        this.merge(characterId, p);
        if (!isTransient(error)) this.log(`progress read failed: ${describeError(error)}`);
        return;
      }
      this.inflight.set(characterId, batch);
    }
    let result: ExecResult;
    try {
      result = await this.executor.execute(characterId, batch.opId, "live.progress", batch.request);
    } catch (error) {
      if (isTransient(error)) return;
      this.inflight.delete(characterId);
      return this.drop(characterId, batch, describeError(error));
    }
    this.inflight.delete(characterId);
    if (!result.ok) return this.drop(characterId, batch, result.error);
    try {
      this.options.onLanded?.(characterId, result);
    } catch (error) {
      this.log(`progress notice failed: ${describeError(error)}`);
    }
  }

  private merge(characterId: string, p: Pending): void {
    const into = this.of(characterId);
    for (const k of ["kills", "collect", "deliver", "escort", "nohit", "help"] as const) {
      for (const [id, n] of Object.entries(p[k])) bump(into[k], id, n);
    }
    for (const k of ["story", "bosses", "visit", "met", "chores"] as const) {
      for (const id of p[k]) into[k].add(id);
    }
    if (p.notice) into.notice = p.notice;
  }

  private drop(characterId: string, batch: Batch, reason: string): void {
    this.log(
      `progress dropped (${reason}): ${JSON.stringify({ characterId, opId: batch.opId, request: batch.request })}`,
    );
  }
}
