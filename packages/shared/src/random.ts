import { nextRandom } from "./rng.ts";

/**
 * The one seeded generator for server-side randomness: crits, drops, spawns, AI. Its state is a
 * single uint32, so a world snapshot can store it and a replay reproduces every roll.
 */
export class Random {
  #state: number;

  constructor(seed: number) {
    this.#state = seed >>> 0;
  }

  get state(): number {
    return this.#state;
  }

  /** A float in [0, 1). */
  next(): number {
    const [value, state] = nextRandom(this.#state);
    this.#state = state;
    return value;
  }

  /** An integer in [0, n). */
  int(n: number): number {
    return Math.floor(this.next() * n);
  }

  /** A float in [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error("pick from an empty list");
    return items[this.int(items.length)] as T;
  }

  /** One item, chosen with probability proportional to `weight(item)`. */
  weighted<T>(items: readonly T[], weight: (item: T) => number): T {
    const total = items.reduce((sum, item) => sum + weight(item), 0);
    let r = this.next() * total;
    for (const item of items) {
      r -= weight(item);
      if (r < 0) return item;
    }
    return this.pick(items);
  }
}
