import { INTERPOLATION_DELAY_MS, TICK_MS } from "@guago/shared";

/**
 * Maps server ticks onto the local clock. The offset follows the earliest arrival quickly and
 * late arrivals slowly, so network jitter does not shake the render timeline.
 */
export class ServerClock {
  private offset: number | undefined;

  /** Records a patch carrying `tick`, received now. */
  observe(tick: number, now: number): void {
    const seen = now - tick * TICK_MS;
    if (this.offset === undefined || seen < this.offset) this.offset = seen;
    else this.offset += (seen - this.offset) * 0.02;
  }

  /** The server time, in ms, that should be on screen now. */
  renderTime(now: number): number {
    return now - (this.offset ?? now) - INTERPOLATION_DELAY_MS;
  }

  reset(): void {
    this.offset = undefined;
  }
}

interface Sample {
  readonly t: number;
  readonly x: number;
  readonly y: number;
  readonly facing: number;
}

const KEEP = 12;

/** A short history of one entity's positions, sampled between at render time. */
export class Track {
  private readonly samples: Sample[] = [];

  push(tick: number, x: number, y: number, facing = 0): void {
    const t = tick * TICK_MS;
    const last = this.samples.at(-1);
    if (last && last.t >= t) this.samples.pop();
    this.samples.push({ t, x, y, facing });
    if (this.samples.length > KEEP) this.samples.shift();
  }

  /** Position at server time `t`, held at the ends rather than extrapolated. */
  at(t: number): { x: number; y: number; facing: number; moving: boolean } {
    const s = this.samples;
    const first = s[0];
    if (!first) return { x: 0, y: 0, facing: 0, moving: false };
    if (t <= first.t) return { ...first, moving: false };
    for (let i = 1; i < s.length; i++) {
      const b = s[i] as Sample;
      if (t > b.t) continue;
      const a = s[i - 1] as Sample;
      const k = (t - a.t) / (b.t - a.t);
      return {
        x: a.x + (b.x - a.x) * k,
        y: a.y + (b.y - a.y) * k,
        facing: b.facing,
        moving: a.x !== b.x || a.y !== b.y,
      };
    }
    const last = s.at(-1) as Sample;
    return { ...last, moving: false };
  }
}
