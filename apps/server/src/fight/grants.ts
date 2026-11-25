import type { Drop } from "@guago/content";

/**
 * Where combat's earnings go (PLAN §6 drops, §9 EXP). Combat never opens a transaction per kill:
 * it adds to a character's pending grant as it goes and the room flushes every few seconds and
 * on leave. The item-operations executor's batched `grant` operation (`{ exp, drops }`, one
 * operation id per flush) is the real sink; until it is wired, `MemoryGrants` keeps the totals.
 */
export interface GrantSink {
  /** EXP earned, after every multiplier combat applies. */
  exp(characterId: string, amount: number): void;
  /** A drop its owner walked over. */
  drop(characterId: string, drop: Drop): void;
  /** Sends what has collected for one character, or for all. */
  flush(characterId?: string): Promise<void>;
  /** Where combat last left a character's level, so a rejoin does not lose it. */
  progress(characterId: string): { level: number; exp: number } | undefined;
  setProgress(characterId: string, level: number, exp: number): void;
}

interface Pending {
  exp: number;
  drops: Drop[];
}

/** Keeps every grant in memory, flushed into running totals. */
export class MemoryGrants implements GrantSink {
  private readonly pending = new Map<string, Pending>();
  private readonly levels = new Map<string, { level: number; exp: number }>();
  /** Everything flushed so far, per character. */
  readonly totals = new Map<string, { exp: number; drops: number; coins: number }>();

  private of(id: string): Pending {
    let p = this.pending.get(id);
    if (!p) {
      p = { exp: 0, drops: [] };
      this.pending.set(id, p);
    }
    return p;
  }

  exp(characterId: string, amount: number): void {
    if (amount > 0) this.of(characterId).exp += amount;
  }

  drop(characterId: string, drop: Drop): void {
    this.of(characterId).drops.push(drop);
  }

  async flush(characterId?: string): Promise<void> {
    const ids = characterId ? [characterId] : [...this.pending.keys()];
    for (const id of ids) {
      const p = this.pending.get(id);
      if (!p) continue;
      this.pending.delete(id);
      const t = this.totals.get(id) ?? { exp: 0, drops: 0, coins: 0 };
      t.exp += p.exp;
      t.drops += p.drops.length;
      for (const d of p.drops) if (d.item.kind === "coin") t.coins += d.item.amount;
      this.totals.set(id, t);
    }
  }

  progress(characterId: string): { level: number; exp: number } | undefined {
    return this.levels.get(characterId);
  }

  setProgress(characterId: string, level: number, exp: number): void {
    this.levels.set(characterId, { level, exp });
  }
}
