/** Samples kept: the render delay plus the longest hitstop, with room to spare. */
const SIZE = 12;
/** Past the newest sample a track keeps walking at its last step for this many ticks at most. */
const EXTRAPOLATE = 2;

/** A point written by `Track.sample`, reused by the caller. */
export interface Point {
  x: number;
  y: number;
}

/**
 * One entity's perceived positions, one per snapshot tick, sampled between at render time. The
 * wire is dead-reckoned, so each tick's position is already within a pixel of the truth and a
 * straight line between two ticks is the motion; a missing tick is bridged by the last step.
 * Fixed arrays, so sampling and pushing allocate nothing.
 */
export class Track {
  private readonly t = new Float64Array(SIZE);
  private readonly x = new Float32Array(SIZE);
  private readonly y = new Float32Array(SIZE);
  private n = 0;
  private head = 0;

  reset(): void {
    this.n = 0;
    this.head = 0;
  }

  get empty(): boolean {
    return this.n === 0;
  }

  /** Position at `tick`; a later push for the same tick replaces it. */
  push(tick: number, x: number, y: number): void {
    if (this.n > 0) {
      const last = (this.head + SIZE - 1) % SIZE;
      if ((this.t[last] as number) >= tick) {
        this.x[last] = x;
        this.y[last] = y;
        this.t[last] = tick;
        return;
      }
    }
    this.t[this.head] = tick;
    this.x[this.head] = x;
    this.y[this.head] = y;
    this.head = (this.head + 1) % SIZE;
    if (this.n < SIZE) this.n++;
  }

  /** The newest sample. */
  last(out: Point): Point {
    const i = (this.head + SIZE - 1) % SIZE;
    out.x = this.x[i] as number;
    out.y = this.y[i] as number;
    return out;
  }

  /** The step per tick between the two newest samples. */
  velocity(out: Point): Point {
    if (this.n < 2) {
      out.x = 0;
      out.y = 0;
      return out;
    }
    const a = (this.head + SIZE - 2) % SIZE;
    const b = (this.head + SIZE - 1) % SIZE;
    const dt = Math.max(1, (this.t[b] as number) - (this.t[a] as number));
    out.x = ((this.x[b] as number) - (this.x[a] as number)) / dt;
    out.y = ((this.y[b] as number) - (this.y[a] as number)) / dt;
    return out;
  }

  /** Position at fractional tick `tick`: between samples, held before the first, walked on past the last. */
  sample(tick: number, out: Point): Point {
    const n = this.n;
    if (n === 0) return out;
    const first = (this.head + SIZE - n) % SIZE;
    if (tick <= (this.t[first] as number)) {
      out.x = this.x[first] as number;
      out.y = this.y[first] as number;
      return out;
    }
    for (let k = 1; k < n; k++) {
      const b = (first + k) % SIZE;
      const tb = this.t[b] as number;
      if (tick > tb) continue;
      const a = (first + k - 1) % SIZE;
      const ta = this.t[a] as number;
      const f = (tick - ta) / Math.max(1e-6, tb - ta);
      out.x = (this.x[a] as number) + ((this.x[b] as number) - (this.x[a] as number)) * f;
      out.y = (this.y[a] as number) + ((this.y[b] as number) - (this.y[a] as number)) * f;
      return out;
    }
    const b = (this.head + SIZE - 1) % SIZE;
    out.x = this.x[b] as number;
    out.y = this.y[b] as number;
    if (n < 2) return out;
    const a = (this.head + SIZE - 2) % SIZE;
    const span = Math.max(1, (this.t[b] as number) - (this.t[a] as number));
    const over = Math.min(EXTRAPOLATE, tick - (this.t[b] as number));
    out.x += (((this.x[b] as number) - (this.x[a] as number)) / span) * over;
    out.y += (((this.y[b] as number) - (this.y[a] as number)) / span) * over;
    return out;
  }
}
