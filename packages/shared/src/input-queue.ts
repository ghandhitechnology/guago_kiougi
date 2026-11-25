import type { MoveInput } from "./movement.ts";

/** Inputs a player may have waiting; past this the oldest is dropped (half a second). */
export const INPUT_QUEUE_MAX = 10;
/** Extra inputs a player may bank to catch up with after a stall. */
export const INPUT_BURST = 10;
/** Inputs left waiting after a tick before the queue spends an extra one to catch up. */
export const INPUT_JITTER_DEPTH = 1;
/** Ticks between extra inputs: catching up runs at 5/4 speed at most. */
export const INPUT_CATCH_UP_EVERY = 4;
/** Bank earned on a tick that applied nothing: a full bank takes a second of standing. */
const EARN_PER_IDLE_TICK = 0.5;
/** Ticks an input must sit unused in reserve before the reserve is spent: a calm link sheds its buffer. */
const RESERVE_TICKS = 40;

/**
 * One player's inputs between arrival and simulation. Each tick applies one input. When inputs
 * pile up behind a stall, an extra one is applied at most every fourth tick, paid from a small
 * bank that fills only on ticks that applied nothing, half an input per tick. So a burst after a
 * stall drains at 5/4 speed, and a modified client that stops and then floods gains at most that
 * speed for two seconds per second it stood: no dash, and nothing over time. Repeated and
 * out-of-order inputs are dropped.
 *
 * A late input leaves the next tick with nothing to apply, and the input after it then waits a
 * tick in reserve, which absorbs the next late one. When two seconds pass without the reserve
 * being needed, it is spent, so a link that has calmed down stops paying a tick of delay.
 */
export class InputQueue {
  private readonly waiting: MoveInput[] = [];
  private bank = INPUT_BURST;
  private sinceExtra = INPUT_CATCH_UP_EVERY;
  /** Ticks in a row that ended with an input still waiting. */
  private reserved = 0;
  /** Highest sequence number accepted. */
  lastSeq = 0;
  /** Inputs refused or pushed out since the queue was made. */
  dropped = 0;

  get length(): number {
    return this.waiting.length;
  }

  /** Takes one arriving input; returns how many inputs this cost: 1 when it was refused or pushed the oldest out. */
  push(input: MoveInput): number {
    if (input.seq <= this.lastSeq) {
      this.dropped++;
      return 1;
    }
    this.lastSeq = input.seq;
    this.waiting.push(input);
    if (this.waiting.length > INPUT_QUEUE_MAX) {
      this.waiting.shift();
      this.dropped++;
      return 1;
    }
    return 0;
  }

  /** The inputs to apply this tick, oldest first. Call exactly once per tick. */
  take(): MoveInput[] {
    this.sinceExtra++;
    const first = this.waiting.shift();
    if (!first) {
      this.bank = Math.min(INPUT_BURST, this.bank + EARN_PER_IDLE_TICK);
      this.reserved = 0;
      return [];
    }
    const out = [first];
    this.reserved = this.waiting.length > 0 ? this.reserved + 1 : 0;
    const behind = this.waiting.length > INPUT_JITTER_DEPTH || this.reserved >= RESERVE_TICKS;
    if (behind && this.bank >= 1 && this.sinceExtra >= INPUT_CATCH_UP_EVERY) {
      out.push(this.waiting.shift() as MoveInput);
      this.bank -= 1;
      this.sinceExtra = 0;
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
