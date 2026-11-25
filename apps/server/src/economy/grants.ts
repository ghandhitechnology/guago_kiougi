/**
 * Batched kill credit. Combat calls `grants()?.add(characterId, credit)` once per credited kill,
 * with no I/O; every few seconds each character's pending credit goes to the executor as one
 * `grant` operation. A character's credit is also flushed when they leave a room (the seats do
 * it) and everyone's at shutdown (`shutdown.ts`). A horde's kills cost one transaction per player
 * per flush, never one per monster.
 *
 * A batch takes its operation id when it leaves the buffer and keeps it until it lands: a flush
 * that failed on the connection, or whose answer was lost, is retried under the same id and
 * applies exactly once. A batch the database or the rules refuse would fail the same way forever;
 * it is written to the log whole, so it can be put back by hand, and dropped, so the character's
 * later credit keeps flowing. Credit that is malformed (NaN EXP, a fraction, an unknown item) is
 * refused at `add` and never joins a batch. What is still in memory when the process dies is lost,
 * like an unsaved position (PLAN §19).
 */

import { randomUUID } from "node:crypto";
import { type Drop, ledgerKey } from "@guago/content";
import type { ChangeNotice } from "@guago/shared";
import { background } from "../background.ts";
import { describeError } from "../db/index.ts";
import { type Executor, isTransient } from "./executor.ts";
import { checkDrop, checkGrant, type GrantRequest } from "./ops.ts";

export const GRANT_FLUSH_MS = 5000;

interface Batch {
  opId: string;
  request: GrantRequest;
}

/** Same kind, same book and same source add up into one drop; tools stay one per item. */
function stackKey(drop: Drop): string | null {
  const { item } = drop;
  if (item.kind === "tool") return null;
  return `${item.kind}\u0000${item.kind === "page" ? item.book : ""}\u0000${ledgerKey(drop.source)}`;
}

function stack(into: Drop, add: Drop): Drop {
  const a = into.item;
  const b = add.item;
  if (a.kind === "coin" && b.kind === "coin") {
    return { ...into, item: { kind: "coin", amount: a.amount + b.amount } };
  }
  if (a.kind === "page" && b.kind === "page") {
    return { ...into, item: { ...a, qty: a.qty + b.qty } };
  }
  if ((a.kind === "ink" || a.kind === "binding") && a.kind === b.kind) {
    return { ...into, item: { kind: a.kind, qty: a.qty + b.qty } };
  }
  throw new Error("stacked drops of different kinds");
}

interface Pending {
  exp: number;
  stacks: Map<string, Drop>;
  tools: Drop[];
}

export interface GrantBufferOptions {
  /** A batch landed: its change notice, for the player's client. */
  onLanded?(characterId: string, change: ChangeNotice): void;
  /** Credit accepted, as combat gave it (the 자습 pool measures income from it). */
  onCredit?(characterId: string, credit: { exp: number; drops: readonly Drop[] }): void;
  /** Where refused credit and dropped batches are written; `console.error` by default. */
  log?(line: string): void;
}

export class GrantBuffer {
  private readonly executor: Pick<Executor, "execute">;
  private readonly options: GrantBufferOptions;
  private readonly prefix = `grant:${randomUUID()}`;
  private seq = 0;
  private pending = new Map<string, Pending>();
  private inflight = new Map<string, Batch>();
  private running = new Map<string, Promise<void>>();

  constructor(executor: Pick<Executor, "execute">, options: GrantBufferOptions = {}) {
    this.executor = executor;
    this.options = options;
  }

  /**
   * One credited kill (or any credit combat makes): EXP after multipliers and the drops. Returns
   * false, and keeps nothing, when the credit is malformed.
   */
  add(characterId: string, credit: { exp: number; drops: readonly Drop[] }): boolean {
    const bad = checkGrant({ exp: credit.exp, drops: [...credit.drops] });
    if (bad) {
      this.log(`grant credit refused (${bad}): ${JSON.stringify({ characterId, credit })}`);
      return false;
    }
    let p = this.pending.get(characterId);
    if (!p) {
      p = { exp: 0, stacks: new Map(), tools: [] };
      this.pending.set(characterId, p);
    }
    p.exp += credit.exp;
    for (const drop of credit.drops) {
      const key = stackKey(drop);
      const held = key === null ? undefined : p.stacks.get(key);
      const stacked = held ? stack(held, drop) : drop;
      // A stack that would pass its bound starts a new entry instead of overflowing.
      if (key === null || checkDrop(stacked) !== null) p.tools.push(drop);
      else p.stacks.set(key, stacked);
    }
    try {
      this.options.onCredit?.(characterId, credit);
    } catch (error) {
      this.log(`credit listener failed: ${describeError(error)}`);
    }
    return true;
  }

  /** Sends one character's credit, or everyone's. Resolves once each batch landed or failed. */
  async flush(characterId?: string): Promise<void> {
    const ids =
      characterId === undefined
        ? [...new Set([...this.pending.keys(), ...this.inflight.keys()])]
        : [characterId];
    await Promise.all(ids.map((id) => this.serial(id)));
  }

  /** Flushes every `ms`; returns the stop. */
  start(ms = GRANT_FLUSH_MS): () => void {
    const timer = setInterval(() => background("grant flush", this.flush()), ms);
    timer.unref();
    return () => clearInterval(timer);
  }

  /** Characters with credit not yet written. */
  get waiting(): number {
    return new Set([...this.pending.keys(), ...this.inflight.keys()]).size;
  }

  /** Operation ids sent but not yet known to have landed; pruning must keep their records. */
  inflightIds(): string[] {
    return [...this.inflight.values()].map((b) => b.opId);
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

  private async send(characterId: string): Promise<void> {
    let batch = this.inflight.get(characterId);
    if (!batch) {
      const p = this.pending.get(characterId);
      if (!p) return;
      this.pending.delete(characterId);
      batch = {
        opId: `${this.prefix.slice(0, 40)}:${++this.seq}`,
        request: { exp: p.exp, drops: [...p.stacks.values(), ...p.tools] },
      };
      this.inflight.set(characterId, batch);
    }
    let result: Awaited<ReturnType<Executor["execute"]>>;
    try {
      result = await this.executor.execute(characterId, batch.opId, "grant", batch.request);
    } catch (error) {
      // The connection failed: the batch stays in flight under its id for the next flush.
      if (isTransient(error)) return;
      this.inflight.delete(characterId);
      return this.drop(characterId, batch, describeError(error));
    }
    this.inflight.delete(characterId);
    if (!result.ok) return this.drop(characterId, batch, result.error);
    try {
      this.options.onLanded?.(characterId, result.change);
    } catch (error) {
      this.log(`grant notice failed: ${describeError(error)}`);
    }
  }

  /** A batch that would fail the same way forever: logged whole, then let go. */
  private drop(characterId: string, batch: Batch, reason: string): void {
    this.log(
      `grant dropped (${reason}): ${JSON.stringify({ characterId, opId: batch.opId, request: batch.request })}`,
    );
  }
}

let current: GrantBuffer | undefined;

/** Called once at server start. */
export function provideGrants(buffer: GrantBuffer | undefined): void {
  current = buffer;
}

/** The process's grant buffer, for combat: `grants()?.add(characterId, credit)`. */
export function grants(): GrantBuffer | undefined {
  return current;
}
