import { TICK_MS } from "@guago/shared";

/** Ticks the loop will run back to back after a stall; the rest are skipped. */
export const MAX_CATCH_UP = 3;

/**
 * Turns wall time into fixed ticks. After a stall the room runs a few ticks back to back and
 * skips the rest, but the skipped ticks are still counted: tick numbers keep wall time, so a
 * client drawing other players 100 ms in the past loses only the stall, never a lasting slice
 * of its buffer.
 */
export class TickClock {
  private acc = 0;
  private last: number;

  constructor(now: number) {
    this.last = now;
  }

  /** Ticks due at `now`: `run` to simulate, `skip` lost to a stall but still numbered. */
  advance(now: number): { run: number; skip: number } {
    this.acc += now - this.last;
    this.last = now;
    const due = Math.floor(this.acc / TICK_MS);
    this.acc -= due * TICK_MS;
    const run = Math.min(due, MAX_CATCH_UP);
    return { run, skip: due - run };
  }
}
