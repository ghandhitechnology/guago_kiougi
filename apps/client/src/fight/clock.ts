import { TICK_MS } from "@guago/shared";

/** Arrivals remembered for finding the fastest path: three seconds of snapshots. */
const WINDOW = 60;
/** The render timeline may run this much faster or slower than real time while it adjusts. */
const SLEW = 0.05;
/** An offset jump past this is a stall or a reconnect: jump instead of gliding. */
const SNAP_MS = 250;
/** Snapshots are drawn at least this far behind the newest, in ticks. */
const BASE_DELAY = 1;
/** Most extra delay jitter may add, in ticks. */
const MAX_JITTER = 3;

/**
 * Maps snapshot ticks onto the local clock. Every message carries one tick of the world, so
 * the fastest recent arrival is the offset; the delay behind it is one tick plus the jitter the
 * link has shown lately, so a late message rarely leaves the timeline with nothing to draw.
 * Allocation-free: arrivals live in a fixed ring.
 */
export class TickClock {
  private readonly seen = new Float64Array(WINDOW);
  private count = 0;
  private head = 0;
  private target = 0;
  private offset = 0;
  private ready = false;
  private lastNow = 0;
  /** Recent lateness behind the fastest arrival, ms, decaying slowly. */
  private jitter = 0;
  /** Newest tick seen. */
  newest = 0;

  observe(tick: number, now: number): void {
    const at = now - tick * TICK_MS;
    this.seen[this.head] = at;
    this.head = (this.head + 1) % WINDOW;
    if (this.count < WINDOW) this.count++;
    let min = Number.POSITIVE_INFINITY;
    for (let i = 0; i < this.count; i++) min = Math.min(min, this.seen[i] as number);
    this.target = min;
    if (!this.ready) {
      this.offset = min;
      this.ready = true;
    }
    const late = at - min;
    this.jitter = late > this.jitter ? late : this.jitter * 0.995 + late * 0.005;
    this.newest = tick;
  }

  /** The fractional server tick to draw at local time `now`. Call once per frame. */
  at(now: number): number {
    const dt = Math.max(0, now - this.lastNow);
    this.lastNow = now;
    if (!this.ready) return this.newest;
    const gap = this.target - this.offset;
    if (Math.abs(gap) > SNAP_MS) this.offset = this.target;
    else this.offset += Math.max(-dt * SLEW, Math.min(dt * SLEW, gap));
    const delay = BASE_DELAY + Math.min(MAX_JITTER, this.jitter / TICK_MS);
    return (now - this.offset) / TICK_MS - delay;
  }

  /** The delay behind the newest snapshot now, ticks. */
  get delay(): number {
    return BASE_DELAY + Math.min(MAX_JITTER, this.jitter / TICK_MS);
  }

  reset(): void {
    this.count = 0;
    this.head = 0;
    this.ready = false;
    this.jitter = 0;
  }
}
