/**
 * Batched kill credit. Combat calls `add` once per credited kill, with no I/O; every few seconds
 * (and when a character leaves, and at shutdown) each character's pending credit goes to the
 * executor as one `grant` operation. A horde's kills cost one transaction per player per flush,
 * never one per monster.
 *
 * A batch takes its operation id when it leaves the buffer and keeps it until it lands. A flush
 * that failed or whose answer was lost is retried under the same id, so it applies exactly once.
 * What is still in memory when the process dies is lost, like an unsaved position (PLAN §19).
 */
import { randomUUID } from "node:crypto";
import { type Drop, ledgerKey } from "@guago/content";
import type { Executor } from "./executor.ts";
import type { GrantRequest } from "./ops.ts";

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

export class GrantBuffer {
  private readonly executor: Pick<Executor, "execute">;
  private readonly prefix = `grant:${randomUUID()}`;
  private seq = 0;
  private pending = new Map<string, Pending>();
  private inflight = new Map<string, Batch>();
  private running = new Map<string, Promise<void>>();

  constructor(executor: Pick<Executor, "execute">) {
    this.executor = executor;
  }

  /** One credited kill (or any credit combat makes): EXP after multipliers and the drops. */
  add(characterId: string, credit: { exp: number; drops: readonly Drop[] }): void {
    let p = this.pending.get(characterId);
    if (!p) {
      p = { exp: 0, stacks: new Map(), tools: [] };
      this.pending.set(characterId, p);
    }
    p.exp += credit.exp;
    for (const drop of credit.drops) {
      const key = stackKey(drop);
      if (key === null) {
        p.tools.push(drop);
        continue;
      }
      const held = p.stacks.get(key);
      p.stacks.set(key, held ? stack(held, drop) : drop);
    }
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
    const timer = setInterval(() => void this.flush(), ms);
    timer.unref();
    return () => clearInterval(timer);
  }

  /** Characters with credit not yet written. */
  get waiting(): number {
    return new Set([...this.pending.keys(), ...this.inflight.keys()]).size;
  }

  private serial(characterId: string): Promise<void> {
    const before = this.running.get(characterId) ?? Promise.resolve();
    const next = before.then(() => this.send(characterId));
    this.running.set(characterId, next);
    void next.finally(() => {
      if (this.running.get(characterId) === next) this.running.delete(characterId);
    });
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
    try {
      await this.executor.execute(characterId, batch.opId, "grant", batch.request);
      // Landed, or refused for good (the character is gone): either way it is done.
      this.inflight.delete(characterId);
    } catch {
      // Logged by the executor; the batch stays in flight under its id for the next flush.
    }
  }
}
