import type { MoveInput } from "./movement.ts";

/** Inputs a player may have waiting; past this the oldest is dropped (half a second). */
export const INPUT_QUEUE_MAX = 10;
/** Ticks of movement a player may bank and spend catching up after a stall. */
export const INPUT_BURST = 10;
/** Inputs left waiting after a tick before the queue spends a second one to catch up. */
export const INPUT_JITTER_DEPTH = 1;
/** Ticks an input must sit unused in reserve before the reserve is spent: a calm link sheds its buffer. */
const RESERVE_TICKS = 40;

/**
 * One player's inputs between arrival and simulation. Each tick applies one input, or two while
 * the queue runs deeper than the jitter buffer, and never more than the ticks that have passed
 * plus a small bank: a flood, a burst after a stall or a held-back input never buys more than
 * {@link INPUT_BURST} ticks of extra distance. Repeated and out-of-order inputs are dropped.
 *
 * A late input leaves the next tick with nothing to apply, and the input after it then waits a
 * tick in reserve, which absorbs the next late one. When two seconds pass without the reserve
 * being needed, it is spent, so a link that has calmed down stops paying a tick of delay.
 */
export class InputQueue {
  private readonly waiting: MoveInput[] = [];
  private tokens = INPUT_BURST;
  /** Ticks in a row that ended with an input still waiting. */
  private reserved = 0;
  /** Highest sequence number accepted. */
  lastSeq = 0;
  /** Inputs refused or pushed out since the queue was made. */
  dropped = 0;

  get length(): number {
    return this.waiting.length;
  }

  /** Accepts one arriving input; false when it was refused. */
  push(input: MoveInput): boolean {
    if (input.seq <= this.lastSeq) {
      this.dropped++;
      return false;
    }
    this.lastSeq = input.seq;
    this.waiting.push(input);
    if (this.waiting.length > INPUT_QUEUE_MAX) {
      this.waiting.shift();
      this.dropped++;
    }
    return true;
  }

  /** The inputs to apply this tick, oldest first. Call exactly once per tick. */
  take(): MoveInput[] {
    this.tokens = Math.min(INPUT_BURST, this.tokens + 1);
    const out: MoveInput[] = [];
    while (this.tokens >= 1 && this.waiting.length > 0) {
      if (out.length === 1 && this.waiting.length <= INPUT_JITTER_DEPTH) break;
      if (out.length === 2) break;
      out.push(this.waiting.shift() as MoveInput);
      this.tokens -= 1;
    }
    this.reserved = this.waiting.length > 0 ? this.reserved + 1 : 0;
    if (this.reserved >= RESERVE_TICKS && out.length === 1 && this.tokens >= 1) {
      out.push(this.waiting.shift() as MoveInput);
      this.tokens -= 1;
      this.reserved = 0;
    }
    return out;
  }

  /** Forgets waiting inputs, as when the player drops; the sequence floor stays. */
  clear(): void {
    this.waiting.length = 0;
    this.reserved = 0;
  }
}
