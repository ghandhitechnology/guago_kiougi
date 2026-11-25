import { INTERPOLATION_DELAY_MS, TICK_MS } from "@guago/shared";

/** Arrivals remembered for finding the network's fastest path, about three seconds of patches. */
const WINDOW = 60;
/** How fast the render timeline may run ahead or fall behind while it adjusts: ±5%. */
const SLEW = 0.05;
/** An offset change past this is a stall or a reconnect: jump instead of gliding. */
const SNAP_MS = 250;

/**
 * Maps server ticks onto the local clock for drawing other entities in the past. The target
 * offset is the fastest recent arrival, so a late patch never drags the timeline; the offset in
 * use glides toward the target at a few percent of real time, so neither a fast patch nor a
 * slow drift makes anything on screen jump.
 */
export class ServerClock {
  private readonly seen: number[] = [];
  private target: number | undefined;
  private offset: number | undefined;
  private lastNow = 0;
  /** Frames that had to hold an entity because its next sample had not arrived. */
  starved = 0;

  /** Records a patch carrying `tick`, received at `now`. */
  observe(tick: number, now: number): void {
    this.seen.push(now - tick * TICK_MS);
    if (this.seen.length > WINDOW) this.seen.shift();
    this.target = Math.min(...this.seen);
    if (this.offset === undefined) this.offset = this.target;
  }

  /** The server time, in ms, to draw at local time `now`. Call once per frame. */
  renderTime(now: number): number {
    const dt = Math.max(0, now - this.lastNow);
    this.lastNow = now;
    if (this.target === undefined || this.offset === undefined) return 0;
    const gap = this.target - this.offset;
    if (Math.abs(gap) > SNAP_MS) this.offset = this.target;
    else this.offset += Math.max(-dt * SLEW, Math.min(dt * SLEW, gap));
    return now - this.offset - INTERPOLATION_DELAY_MS;
  }

  reset(): void {
    this.seen.length = 0;
    this.target = undefined;
    this.offset = undefined;
  }
}

interface Sample {
  readonly t: number;
  readonly x: number;
  readonly y: number;
  readonly facing: number;
}

export interface TrackPoint {
  readonly x: number;
  readonly y: number;
  readonly facing: number;
  /** False when `t` was past the newest sample and the entity is held there. */
  readonly fresh: boolean;
}

const KEEP = 16;

/** A short history of one entity's positions in pixels, sampled between at render time. */
export class Track {
  private readonly samples: Sample[] = [];

  push(tick: number, x: number, y: number, facing = 0): void {
    const t = tick * TICK_MS;
    const last = this.samples.at(-1);
    if (last && last.t >= t) this.samples.pop();
    this.samples.push({ t, x, y, facing });
    if (this.samples.length > KEEP) this.samples.shift();
  }

  /** Position at server time `t`, held at the ends rather than guessed past them. */
  at(t: number): TrackPoint {
    const s = this.samples;
    const first = s[0];
    if (!first) return { x: 0, y: 0, facing: 0, fresh: false };
    if (t <= first.t) return { ...first, fresh: true };
    for (let i = 1; i < s.length; i++) {
      const b = s[i] as Sample;
      if (t > b.t) continue;
      const a = s[i - 1] as Sample;
      const k = (t - a.t) / (b.t - a.t);
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, facing: b.facing, fresh: true };
    }
    const last = s.at(-1) as Sample;
    return { ...last, fresh: false };
  }
}
