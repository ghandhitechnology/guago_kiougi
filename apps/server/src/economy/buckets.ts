/** Token buckets by key: a burst, then so many a second. In memory; this is one process. */
import type { OpRate } from "@guago/shared";

interface Bucket {
  tokens: number;
  at: number;
}

export class Buckets {
  private map = new Map<string, Bucket>();
  private sweptAt = 0;

  private bucket(key: string, rate: OpRate, at: number): Bucket {
    let b = this.map.get(key);
    if (!b) {
      b = { tokens: rate.burst, at };
      this.map.set(key, b);
    }
    b.tokens = Math.min(rate.burst, b.tokens + ((at - b.at) / 1000) * rate.perSecond);
    b.at = at;
    if (at - this.sweptAt > 60_000) this.sweep(at);
    return b;
  }

  /** Milliseconds until a token is free; 0 when one is free now. Takes nothing. */
  wait(key: string, rate: OpRate, at: number): number {
    const b = this.bucket(key, rate, at);
    return b.tokens >= 1 ? 0 : Math.ceil(((1 - b.tokens) / rate.perSecond) * 1000);
  }

  /** Takes a token, down to zero at most. */
  spend(key: string, rate: OpRate, at: number): void {
    const b = this.bucket(key, rate, at);
    b.tokens = Math.max(0, b.tokens - 1);
  }

  /** Takes a token if one is free: 0, else the milliseconds to wait. */
  take(key: string, rate: OpRate, at: number): number {
    const wait = this.wait(key, rate, at);
    if (wait === 0) this.spend(key, rate, at);
    return wait;
  }

  /** Buckets untouched for a minute are full again: they hold nothing a new one would not. */
  private sweep(at: number): void {
    this.sweptAt = at;
    for (const [key, b] of this.map) if (at - b.at > 60_000) this.map.delete(key);
  }
}
