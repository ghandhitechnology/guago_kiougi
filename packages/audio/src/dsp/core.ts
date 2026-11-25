/** Small DSP building blocks shared by the song synth, the effect synth and the ambient beds. */

/** xorshift32, seeded, so renders are repeatable. */
export class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0 || 0x9e3779b9;
  }
  /** 0..1 */
  next(): number {
    let x = this.s;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.s = x >>> 0;
    return this.s / 4294967296;
  }
  /** -1..1 */
  bi(): number {
    return this.next() * 2 - 1;
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
}

const TABLE_BITS = 12;
const TABLE_SIZE = 1 << TABLE_BITS;
const SINE = new Float32Array(TABLE_SIZE + 1);
for (let i = 0; i <= TABLE_SIZE; i++) SINE[i] = Math.sin((2 * Math.PI * i) / TABLE_SIZE);

/** Sine of a phase in cycles, by table with linear interpolation. */
export function sin1(phase: number): number {
  const p = (phase - Math.floor(phase)) * TABLE_SIZE;
  const i = p | 0;
  const f = p - i;
  const a = SINE[i] as number;
  return a + ((SINE[i + 1] as number) - a) * f;
}

/** PolyBLEP residual for a band-limited step at phase `t` with increment `dt`. */
export function blep(t: number, dt: number): number {
  if (t < dt) {
    const x = t / dt;
    return x + x - x * x - 1;
  }
  if (t > 1 - dt) {
    const x = (t - 1) / dt;
    return x * x + x + x + 1;
  }
  return 0;
}

/** Band-limited pulse, centred on zero. */
export function pulse(phase: number, dt: number, duty: number): number {
  let v = phase < duty ? 1 : -1;
  v += blep(phase, dt);
  let t2 = phase - duty;
  if (t2 < 0) t2 += 1;
  v -= blep(t2, dt);
  return v - (2 * duty - 1);
}

export function saw(phase: number, dt: number): number {
  return 2 * phase - 1 - blep(phase, dt);
}

export function tri(phase: number, steps: number): number {
  const v = phase < 0.5 ? 4 * phase - 1 : 3 - 4 * phase;
  if (steps <= 0) return v;
  return Math.round(((v + 1) * (steps - 1)) / 2) / ((steps - 1) / 2) - 1;
}

export function midiToHz(m: number): number {
  return 440 * 2 ** ((m - 69) / 12);
}

export function dbToGain(db: number): number {
  return 10 ** (db / 20);
}

/** Pink noise by Paul Kellet's economy filter. */
export class Pink {
  private b0 = 0;
  private b1 = 0;
  private b2 = 0;
  next(white: number): number {
    this.b0 = 0.99765 * this.b0 + white * 0.099046;
    this.b1 = 0.963 * this.b1 + white * 0.2965164;
    this.b2 = 0.57 * this.b2 + white * 1.0526913;
    return (this.b0 + this.b1 + this.b2 + white * 0.1848) * 0.25;
  }
}

/** Brown noise: leaky integrated white. */
export class Brown {
  private y = 0;
  next(white: number): number {
    this.y = (this.y + 0.02 * white) / 1.02;
    return this.y * 3.5;
  }
}

/** Zero-delay-feedback state variable filter; safe to sweep every sample. */
export class Svf {
  private ic1 = 0;
  private ic2 = 0;
  private a1 = 0;
  private a2 = 0;
  private a3 = 0;
  private k = 1;
  low = 0;
  band = 0;
  high = 0;
  set(sampleRate: number, cutoff: number, q: number): void {
    const fc = Math.min(Math.max(cutoff, 10), sampleRate * 0.45);
    const g = Math.tan((Math.PI * fc) / sampleRate);
    this.k = 1 / Math.max(q, 0.1);
    this.a1 = 1 / (1 + g * (g + this.k));
    this.a2 = g * this.a1;
    this.a3 = g * this.a2;
  }
  process(x: number): void {
    const v3 = x - this.ic2;
    const v1 = this.a1 * this.ic1 + this.a2 * v3;
    const v2 = this.ic2 + this.a2 * this.ic1 + this.a3 * v3;
    this.ic1 = 2 * v1 - this.ic1;
    this.ic2 = 2 * v2 - this.ic2;
    this.low = v2;
    this.band = v1;
    this.high = x - this.k * v1 - v2;
  }
  reset(): void {
    this.ic1 = 0;
    this.ic2 = 0;
  }
}

/** One-pole lowpass; `highpass()` reads the complement. */
export class OnePole {
  private a = 0;
  y = 0;
  set(sampleRate: number, cutoff: number): void {
    this.a = 1 - Math.exp((-2 * Math.PI * Math.min(cutoff, sampleRate * 0.49)) / sampleRate);
  }
  lowpass(x: number): number {
    this.y += this.a * (x - this.y);
    return this.y;
  }
  highpass(x: number): number {
    this.y += this.a * (x - this.y);
    return x - this.y;
  }
}

/** ADSR with a linear attack and exponential decay and release. */
export class Adsr {
  level = 0;
  stage: 0 | 1 | 2 | 3 | 4 = 0; // idle, attack, decay/sustain, release
  private attackStep = 1;
  private decayCoef = 0;
  private releaseCoef = 0;
  private sustain = 1;
  configure(sampleRate: number, a: number, d: number, s: number, r: number): void {
    this.attackStep = 1 / Math.max(1, a * sampleRate);
    this.decayCoef = 1 - Math.exp(-4.6 / Math.max(1, d * sampleRate));
    this.releaseCoef = 1 - Math.exp(-6.9 / Math.max(1, r * sampleRate));
    this.sustain = s;
  }
  on(): void {
    this.stage = 1;
  }
  off(): void {
    if (this.stage !== 0) this.stage = 4;
  }
  next(): number {
    switch (this.stage) {
      case 1:
        this.level += this.attackStep;
        if (this.level >= 1) {
          this.level = 1;
          this.stage = 2;
        }
        break;
      case 2:
        this.level += (this.sustain - this.level) * this.decayCoef;
        break;
      case 4:
        this.level -= this.level * this.releaseCoef;
        if (this.level < 1e-4) {
          this.level = 0;
          this.stage = 0;
        }
        break;
    }
    return this.level;
  }
}

/** Circular delay line with fractional reads. */
export class DelayLine {
  readonly buf: Float32Array;
  private w = 0;
  constructor(size: number) {
    this.buf = new Float32Array(size);
  }
  write(x: number): void {
    this.buf[this.w] = x;
    this.w = (this.w + 1) % this.buf.length;
  }
  /** Reads `d` samples back (d >= 1). */
  read(d: number): number {
    const n = this.buf.length;
    let p = this.w - d;
    while (p < 0) p += n;
    const i = p | 0;
    const f = p - i;
    const a = this.buf[i] as number;
    const b = this.buf[(i + 1) % n] as number;
    return a + (b - a) * f;
  }
  readInt(d: number): number {
    let p = this.w - d;
    if (p < 0) p += this.buf.length;
    return this.buf[p] as number;
  }
  clear(): void {
    this.buf.fill(0);
  }
}

/**
 * A small feedback delay network reverb: two diffusers into four damped lines with a Hadamard
 * mix. About forty operations a sample, cheap enough for a phone.
 */
export class Reverb {
  private readonly lines: DelayLine[];
  private readonly lengths: number[];
  private readonly damp: OnePole[];
  private readonly diff: DelayLine[];
  private readonly diffLen: number[];
  private readonly pre: DelayLine;
  private readonly preLen: number;
  private gains: number[] = [];
  private readonly sampleRate: number;
  constructor(sampleRate: number, time: number, damping = 5000) {
    this.sampleRate = sampleRate;
    const k = sampleRate / 44100;
    this.lengths = [1557, 1617, 1491, 1422].map((n) => Math.round(n * k * 1.4));
    this.lines = this.lengths.map((n) => new DelayLine(n + 2));
    this.damp = this.lengths.map(() => {
      const p = new OnePole();
      p.set(sampleRate, damping);
      return p;
    });
    this.diffLen = [225, 341, 556, 441].map((n) => Math.round(n * k));
    this.diff = this.diffLen.map((n) => new DelayLine(n + 2));
    this.preLen = Math.round(0.012 * sampleRate);
    this.pre = new DelayLine(this.preLen + 2);
    this.setTime(time);
  }
  setTime(seconds: number): void {
    this.gains = this.lengths.map((n) => 10 ** ((-3 * n) / this.sampleRate / seconds));
  }
  /** Adds the wet signal for a mono input into `out` at `i`. */
  process(x: number, outL: Float32Array, outR: Float32Array, i: number, level: number): void {
    this.pre.write(x);
    let s = this.pre.readInt(this.preLen);
    for (let d = 0; d < 2; d++) {
      const line = this.diff[d] as DelayLine;
      const delayed = line.readInt(this.diffLen[d] as number);
      const v = s + 0.6 * delayed;
      line.write(v);
      s = delayed - 0.6 * v;
    }
    const y0 = this.lines[0]?.readInt(this.lengths[0] as number) as number;
    const y1 = this.lines[1]?.readInt(this.lengths[1] as number) as number;
    const y2 = this.lines[2]?.readInt(this.lengths[2] as number) as number;
    const y3 = this.lines[3]?.readInt(this.lengths[3] as number) as number;
    const h0 = (y0 + y1 + y2 + y3) * 0.5;
    const h1 = (y0 - y1 + y2 - y3) * 0.5;
    const h2 = (y0 + y1 - y2 - y3) * 0.5;
    const h3 = (y0 - y1 - y2 + y3) * 0.5;
    const g = this.gains;
    this.lines[0]?.write(s + (this.damp[0] as OnePole).lowpass(h0) * (g[0] as number));
    this.lines[1]?.write(s + (this.damp[1] as OnePole).lowpass(h1) * (g[1] as number));
    this.lines[2]?.write(s + (this.damp[2] as OnePole).lowpass(h2) * (g[2] as number));
    this.lines[3]?.write(s + (this.damp[3] as OnePole).lowpass(h3) * (g[3] as number));
    // Two more diffusers per side decorrelate left and right.
    let l = y0 + y2;
    let r = y1 + y3;
    const dl = this.diff[2] as DelayLine;
    const dr = this.diff[3] as DelayLine;
    const ql = dl.readInt(this.diffLen[2] as number);
    const vl = l + 0.5 * ql;
    dl.write(vl);
    l = ql - 0.5 * vl;
    const qr = dr.readInt(this.diffLen[3] as number);
    const vr = r + 0.5 * qr;
    dr.write(vr);
    r = qr - 0.5 * vr;
    outL[i] = (outL[i] as number) + l * level * 0.5;
    outR[i] = (outR[i] as number) + r * level * 0.5;
  }
}

/** Ping-pong echo with a darkening feedback path. */
export class Echo {
  private readonly left: DelayLine;
  private readonly right: DelayLine;
  private readonly lpL = new OnePole();
  private readonly lpR = new OnePole();
  private readonly time: number;
  private readonly feedback: number;
  constructor(sampleRate: number, time: number, feedback: number, damping = 3500) {
    this.feedback = feedback;
    const n = Math.ceil(time * sampleRate) + 2;
    this.left = new DelayLine(n);
    this.right = new DelayLine(n);
    this.lpL.set(sampleRate, damping);
    this.lpR.set(sampleRate, damping);
    this.time = time * sampleRate;
  }
  process(x: number, outL: Float32Array, outR: Float32Array, i: number): void {
    const l = this.left.read(this.time);
    const r = this.right.read(this.time);
    this.left.write(x + this.lpR.lowpass(r) * this.feedback);
    this.right.write(this.lpL.lowpass(l) * this.feedback);
    outL[i] = (outL[i] as number) + l;
    outR[i] = (outR[i] as number) + r;
  }
}

/** Constant-power pan gains for -1..1. */
export function panGains(pan: number): [number, number] {
  const a = ((Math.max(-1, Math.min(1, pan)) + 1) * Math.PI) / 4;
  return [Math.cos(a), Math.sin(a)];
}
