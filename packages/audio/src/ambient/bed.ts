/** Plays an ambient bed. Pure, so the worker and the WAV renderer share it. */

import {
  Brown,
  dbToGain,
  OnePole,
  Pink,
  panGains,
  pulse,
  Reverb,
  Rng,
  Svf,
  sin1,
} from "../dsp/core.ts";
import type {
  BedSource,
  CallKind,
  EventLayer,
  HumLayer,
  InsectLayer,
  NoiseLayer,
  ThrobLayer,
} from "./format.ts";

/** A smooth random value in -1..1 that drifts at about `rate` changes a second. */
class Drift {
  private a: number;
  private b: number;
  private t = 0;
  private readonly step: number;
  private readonly rng: Rng;
  constructor(rng: Rng, rate: number, sr: number) {
    this.rng = rng;
    this.step = rate / sr;
    this.a = rng.bi();
    this.b = rng.bi();
  }
  /** Advances `n` samples and returns the value. */
  next(n = 1): number {
    this.t += this.step * n;
    while (this.t >= 1) {
      this.t -= 1;
      this.a = this.b;
      this.b = this.rng.bi();
    }
    const k = 0.5 - 0.5 * Math.cos(Math.PI * this.t);
    return this.a + (this.b - this.a) * k;
  }
}

interface Part {
  render(L: Float32Array, R: Float32Array, offset: number, n: number): void;
}

class Noise implements Part {
  private readonly layer: NoiseLayer;
  private readonly gen: [(w: number) => number, (w: number) => number];
  private readonly fl = new Svf();
  private readonly fr = new Svf();
  private readonly sway: Drift | null;
  private readonly gust: Drift | null;
  private readonly rng: Rng;
  private readonly gain: number;
  private readonly sr: number;
  constructor(layer: NoiseLayer, sr: number, rng: Rng) {
    this.layer = layer;
    this.sr = sr;
    this.rng = rng;
    const make = () => {
      if (layer.color === "pink") {
        const p = new Pink();
        return (w: number) => p.next(w) * 2.5;
      }
      if (layer.color === "brown") {
        const b = new Brown();
        return (w: number) => b.next(w);
      }
      return (w: number) => w;
    };
    this.gen = [make(), make()];
    this.sway = layer.sway ? new Drift(rng, layer.sway.rate, sr) : null;
    this.gust = layer.gust ? new Drift(rng, layer.gust.rate, sr) : null;
    this.gain = dbToGain(layer.gain);
  }
  render(L: Float32Array, R: Float32Array, offset: number, n: number): void {
    const l = this.layer;
    const w = l.width ?? 0.6;
    const norm = 1 / (1 + w);
    for (let k = 0; k < n; k += 32) {
      const m = Math.min(32, n - k);
      const sway = this.sway ? this.sway.next(m) * (l.sway?.depth ?? 0) : 0;
      const cutoff = l.filter.freq * 2 ** sway;
      this.fl.set(this.sr, cutoff, l.filter.q ?? Math.SQRT1_2);
      this.fr.set(this.sr, cutoff * 1.03, l.filter.q ?? Math.SQRT1_2);
      const g = this.gust ? 1 - (l.gust?.depth ?? 0) * (0.5 + 0.5 * this.gust.next(m)) : 1;
      const gain = this.gain * g;
      for (let j = 0; j < m; j++) {
        const a = this.gen[0](this.rng.bi());
        const b = this.gen[1](this.rng.bi());
        const x = (a + w * b) * norm;
        const y = (a - w * b) * norm;
        this.fl.process(x);
        this.fr.process(y);
        const t = l.filter.type;
        const ol = t === "lp" ? this.fl.low : t === "bp" ? this.fl.band : this.fl.high;
        const or = t === "lp" ? this.fr.low : t === "bp" ? this.fr.band : this.fr.high;
        const i = offset + k + j;
        L[i] = (L[i] as number) + ol * gain;
        R[i] = (R[i] as number) + or * gain;
      }
    }
  }
}

class Hum implements Part {
  private readonly layer: HumLayer;
  private readonly phases: Float64Array;
  private readonly drift: Drift;
  private readonly buzz = new Svf();
  private readonly rng: Rng;
  private readonly sr: number;
  private readonly gl: number;
  private readonly gr: number;
  private readonly gain: number;
  constructor(layer: HumLayer, sr: number, rng: Rng) {
    this.layer = layer;
    this.sr = sr;
    this.rng = rng;
    this.phases = new Float64Array(layer.partials.length);
    this.drift = new Drift(rng, 0.2, sr);
    this.buzz.set(sr, 3200, 2);
    [this.gl, this.gr] = panGains(layer.pan ?? 0);
    this.gain = dbToGain(layer.gain);
  }
  render(L: Float32Array, R: Float32Array, offset: number, n: number): void {
    const l = this.layer;
    const f = l.freq * (1 + this.drift.next(n) * 0.002);
    const buzz = l.buzz ?? 0;
    for (let k = 0; k < n; k++) {
      let v = 0;
      for (let h = 0; h < l.partials.length; h++) {
        const p = (this.phases[h] as number) + (f * (h + 1)) / this.sr;
        this.phases[h] = p - Math.floor(p);
        v += sin1(p) * (l.partials[h] as number);
      }
      if (buzz > 0) {
        this.buzz.process(this.rng.bi());
        const gate = 0.5 + 0.5 * sin1(this.phases[0] as number);
        v += this.buzz.band * gate ** 6 * buzz;
      }
      const i = offset + k;
      L[i] = (L[i] as number) + v * this.gain * this.gl;
      R[i] = (R[i] as number) + v * this.gain * this.gr;
    }
  }
}

class Insects implements Part {
  private readonly bugs: {
    f: number;
    period: number;
    phase: number;
    gl: number;
    gr: number;
    amp: number;
    pause: Drift;
    osc: number;
  }[];
  private readonly sr: number;
  private readonly pulses: number;
  private readonly gain: number;
  constructor(layer: InsectLayer, sr: number, rng: Rng) {
    this.sr = sr;
    this.pulses = layer.pulses;
    this.gain = dbToGain(layer.gain);
    this.bugs = Array.from({ length: layer.count }, () => {
      const [gl, gr] = panGains(rng.bi() * 0.9);
      return {
        f: rng.range(layer.freq[0], layer.freq[1]),
        period: sr / rng.range(layer.rate[0], layer.rate[1]),
        phase: rng.next() * sr,
        gl,
        gr,
        amp: rng.range(0.35, 1),
        pause: new Drift(rng, 0.15, sr),
        osc: 0,
      };
    });
  }
  render(L: Float32Array, R: Float32Array, offset: number, n: number): void {
    const pulseLen = 0.014 * this.sr;
    const pulseGap = 0.036 * this.sr;
    const chirpLen = this.pulses * pulseGap;
    for (const b of this.bugs) {
      const on = Math.max(0, b.pause.next(n) + 0.35);
      if (on <= 0) {
        b.phase = (b.phase + n) % b.period;
        continue;
      }
      const amp = b.amp * Math.min(1, on * 2) * this.gain;
      const dt = b.f / this.sr;
      for (let k = 0; k < n; k++) {
        b.phase += 1;
        if (b.phase >= b.period) b.phase -= b.period;
        b.osc += dt;
        if (b.osc >= 1) b.osc -= 1;
        if (b.phase >= chirpLen) continue;
        const inPulse = b.phase % pulseGap;
        if (inPulse >= pulseLen) continue;
        const e = Math.sin((Math.PI * inPulse) / pulseLen);
        const v = sin1(b.osc) * e * e * amp;
        const i = offset + k;
        L[i] = (L[i] as number) + v * b.gl;
        R[i] = (R[i] as number) + v * b.gr;
      }
    }
  }
}

class Throb implements Part {
  private readonly layer: ThrobLayer;
  private readonly sr: number;
  private readonly gain: number;
  private t = 0;
  private p1 = 0;
  private p2 = 0;
  private readonly glass: { f: number; p: number; drift: Drift; gl: number; gr: number }[];
  constructor(layer: ThrobLayer, sr: number, rng: Rng) {
    this.layer = layer;
    this.sr = sr;
    this.gain = dbToGain(layer.gain);
    this.glass = [1900, 2390, 2870, 3580, 4410].map((f) => {
      const [gl, gr] = panGains(rng.bi() * 0.8);
      return {
        f: f * rng.range(0.99, 1.01),
        p: rng.next(),
        drift: new Drift(rng, 0.3, sr),
        gl,
        gr,
      };
    });
  }
  render(L: Float32Array, R: Float32Array, offset: number, n: number): void {
    const l = this.layer;
    const glassAmp = this.glass.map((g) => Math.max(0, g.drift.next(n)) * l.shimmer * 0.05);
    for (let k = 0; k < n; k++) {
      const time = this.t / this.sr;
      const ph = (time * l.rate) % 1;
      const bump = (c: number, w: number) => Math.exp(-(((ph - c) / w) ** 2));
      const env = 0.22 + bump(0.06, 0.06) + 0.6 * bump(0.24, 0.07);
      const wobble = 1 + 0.01 * Math.sin(2 * Math.PI * 0.07 * time);
      this.p1 += (l.freq * wobble) / this.sr;
      this.p2 += (l.freq * 1.5 * wobble) / this.sr;
      if (this.p1 >= 1) this.p1 -= 1;
      if (this.p2 >= 1) this.p2 -= 1;
      const low = (sin1(this.p1) + 0.35 * sin1(this.p2)) * env * this.gain;
      let gl = 0;
      let gr = 0;
      for (let g = 0; g < this.glass.length; g++) {
        const s = this.glass[g] as (typeof this.glass)[number];
        s.p += s.f / this.sr;
        if (s.p >= 1) s.p -= 1;
        const v = sin1(s.p) * (glassAmp[g] as number) * this.gain;
        gl += v * s.gl;
        gr += v * s.gr;
      }
      const i = offset + k;
      L[i] = (L[i] as number) + low * Math.SQRT1_2 + gl;
      R[i] = (R[i] as number) + low * Math.SQRT1_2 + gr;
      this.t++;
    }
  }
}

/** One call in progress: renders mono into a buffer that the event layer places. */
interface Call {
  /** Adds up to `n` samples into `out`; returns false when finished. */
  render(out: Float32Array, n: number): boolean;
}

const VOWELS: [number, number][] = [
  [800, 1250],
  [500, 1850],
  [320, 2300],
  [520, 920],
  [350, 820],
  [650, 1650],
];

interface Syllable {
  start: number;
  len: number;
  f0: number;
  f1: number;
  vowel: [number, number];
  breath: number;
}

/** Syllable-based call used by gulls, voices and laughs. */
class Syllables implements Call {
  private readonly sr: number;
  private readonly rng: Rng;
  private readonly plan: Syllable[];
  private readonly f1 = new Svf();
  private readonly f2 = new Svf();
  private readonly kind: CallKind;
  private t = 0;
  private cursor = 0;
  private phase = 0;
  private readonly end: number;
  constructor(kind: CallKind, sr: number, rng: Rng) {
    this.sr = sr;
    this.rng = rng;
    this.kind = kind;
    this.plan = [];
    let at = 0;
    if (kind === "gull") {
      const base = rng.range(950, 1350);
      const count = 2 + Math.floor(rng.next() * 3);
      for (let i = 0; i < count; i++) {
        const len = rng.range(0.2, 0.32) * sr;
        const f = base * (1 - i * 0.04);
        this.plan.push({
          start: at,
          len,
          f0: f * 0.8,
          f1: f * 1.18,
          vowel: [2200, 3300],
          breath: 0.15,
        });
        at += len + rng.range(0.1, 0.22) * sr;
      }
    } else if (kind === "laugh") {
      const base = rng.range(180, 300);
      const count = 4 + Math.floor(rng.next() * 4);
      for (let i = 0; i < count; i++) {
        const len = rng.range(0.07, 0.1) * sr;
        const f = base * (1 + 0.15 * Math.sin((Math.PI * i) / count));
        this.plan.push({
          start: at,
          len,
          f0: f * 1.05,
          f1: f * 0.92,
          vowel: [800, 1250],
          breath: 0.45,
        });
        at += len + rng.range(0.06, 0.09) * sr;
      }
    } else {
      const base = rng.next() < 0.5 ? rng.range(110, 150) : rng.range(190, 250);
      const seconds = rng.range(1.2, 3.5);
      while (at < seconds * sr) {
        const len = rng.range(0.09, 0.22) * sr;
        const decl = 1 - (0.15 * at) / (seconds * sr);
        const f = base * decl * (1 + rng.bi() * 0.08);
        this.plan.push({
          start: at,
          len,
          f0: f,
          f1: f * (1 + rng.bi() * 0.1),
          vowel: VOWELS[Math.floor(rng.next() * VOWELS.length)] as [number, number],
          breath: 0.12,
        });
        at += len + rng.range(0.03, 0.12) * sr + (rng.next() < 0.12 ? rng.range(0.2, 0.5) * sr : 0);
      }
    }
    this.end = at + 0.05 * sr;
  }
  render(out: Float32Array, n: number): boolean {
    for (let k = 0; k < n; k++, this.t++) {
      if (this.t >= this.end) return false;
      while (
        this.cursor < this.plan.length &&
        this.t >=
          (this.plan[this.cursor] as Syllable).start + (this.plan[this.cursor] as Syllable).len
      )
        this.cursor++;
      const s = this.plan[this.cursor];
      if (!s || this.t < s.start) continue;
      const u = (this.t - s.start) / s.len;
      let f: number;
      if (this.kind === "gull")
        f =
          u < 0.15
            ? s.f0 + (s.f1 - s.f0) * (u / 0.15)
            : s.f1 - (s.f1 - s.f0 * 0.9) * ((u - 0.15) / 0.85);
      else f = s.f0 + (s.f1 - s.f0) * u;
      const dt = f / this.sr;
      this.phase += dt;
      if (this.phase >= 1) this.phase -= 1;
      let src = pulse(this.phase, dt, this.kind === "gull" ? 0.3 : 0.12) * (1 - s.breath);
      src += this.rng.bi() * s.breath;
      if (this.kind === "gull")
        src *= 1 - 0.4 * (0.5 + 0.5 * Math.sin(2 * Math.PI * 42 * (this.t / this.sr)));
      if ((k & 31) === 0) {
        this.f1.set(this.sr, s.vowel[0], 4);
        this.f2.set(this.sr, s.vowel[1], 5);
      }
      this.f1.process(src);
      this.f2.process(src);
      const attack = Math.min(1, u / 0.12);
      const release = Math.min(1, (1 - u) / 0.25);
      const env = attack * release;
      out[k] = (out[k] as number) + (this.f1.band + 0.6 * this.f2.band) * env;
    }
    return true;
  }
}

class Door implements Call {
  private readonly sr: number;
  private readonly rng: Rng;
  private t = 0;
  private p = 0;
  private readonly lp = new OnePole();
  private readonly hp = new OnePole();
  constructor(sr: number, rng: Rng) {
    this.sr = sr;
    this.rng = rng;
    this.lp.set(sr, 380);
    this.hp.set(sr, 2200);
  }
  render(out: Float32Array, n: number): boolean {
    for (let k = 0; k < n; k++, this.t++) {
      const time = this.t / this.sr;
      if (time > 0.6) return false;
      this.p += (68 * (1 - 0.2 * time)) / this.sr;
      const attack = Math.min(1, time / 0.003);
      const thud =
        (sin1(this.p) * Math.exp(-time / 0.11) +
          this.lp.lowpass(this.rng.bi()) * 2.5 * Math.exp(-time / 0.06)) *
        attack;
      const ct = time - 0.045;
      const click = ct > 0 ? this.hp.highpass(this.rng.bi()) * Math.exp(-ct / 0.006) * 0.6 : 0;
      out[k] = (out[k] as number) + thud + click;
    }
    return true;
  }
}

class Events implements Part {
  private readonly layer: EventLayer;
  private readonly sr: number;
  private readonly rng: Rng;
  private readonly reverb: Reverb;
  private wait: number;
  private readonly active: {
    call: Call;
    gl: number;
    gr: number;
    gain: number;
    wet: number;
    lp: OnePole;
  }[] = [];
  private readonly scratch = new Float32Array(128);
  constructor(layer: EventLayer, sr: number, rng: Rng, reverb: Reverb) {
    this.layer = layer;
    this.sr = sr;
    this.rng = rng;
    this.reverb = reverb;
    this.wait = rng.range(0.3, 1) * layer.every[0] * sr;
  }
  private spawn(): void {
    const l = this.layer;
    const [p0, p1] = l.pan ?? [-0.8, 0.8];
    const [d0, d1] = l.distance ?? [0.4, 0.9];
    const d = this.rng.range(d0, d1);
    const [gl, gr] = panGains(this.rng.range(p0, p1));
    const lp = new OnePole();
    lp.set(this.sr, 9000 * (1 - 0.82 * d));
    const call: Call =
      l.call === "door" ? new Door(this.sr, this.rng) : new Syllables(l.call, this.sr, this.rng);
    this.active.push({
      call,
      gl,
      gr,
      gain: dbToGain(l.gain) * (1 - 0.65 * d),
      wet: 0.15 + 0.7 * d,
      lp,
    });
  }
  render(L: Float32Array, R: Float32Array, offset: number, n: number): void {
    for (let k = 0; k < n; k += 128) {
      const m = Math.min(128, n - k);
      this.wait -= m;
      if (this.wait <= 0) {
        this.spawn();
        this.wait = this.rng.range(this.layer.every[0], this.layer.every[1]) * this.sr;
      }
      for (let a = this.active.length - 1; a >= 0; a--) {
        const c = this.active[a] as (typeof this.active)[number];
        this.scratch.fill(0, 0, m);
        const alive = c.call.render(this.scratch, m);
        for (let j = 0; j < m; j++) {
          const v = c.lp.lowpass(this.scratch[j] as number) * c.gain;
          const i = offset + k + j;
          L[i] = (L[i] as number) + v * c.gl * (1 - c.wet * 0.5);
          R[i] = (R[i] as number) + v * c.gr * (1 - c.wet * 0.5);
          this.reverb.process(v * c.wet, L, R, i, 1);
        }
        if (!alive) this.active.splice(a, 1);
      }
      if (this.active.length === 0) {
        // Keep the reverb tail running between calls.
        for (let j = 0; j < m; j++) this.reverb.process(0, L, R, offset + k + j, 1);
      }
    }
  }
}

export class BedPlayer {
  readonly source: BedSource;
  private readonly parts: Part[];
  private readonly gain: number;
  private readonly dcLeft = new OnePole();
  private readonly dcRight = new OnePole();
  constructor(source: BedSource, sr: number, seed = 1) {
    this.source = source;
    this.dcLeft.set(sr, 12);
    this.dcRight.set(sr, 12);
    const rng = new Rng(seed);
    this.gain = dbToGain(source.gain);
    this.parts = source.layers.map((l) => {
      switch (l.kind) {
        case "noise":
          return new Noise(l, sr, rng);
        case "hum":
          return new Hum(l, sr, rng);
        case "insects":
          return new Insects(l, sr, rng);
        case "throb":
          return new Throb(l, sr, rng);
        case "events":
          return new Events(l, sr, rng, new Reverb(sr, source.space, 4500));
        default:
          throw new Error(`unknown bed layer ${(l as { kind: string }).kind}`);
      }
    });
  }
  /** Adds `n` samples into `out[0]` (left) and `out[1]` (right) from `offset`. */
  render(out: readonly Float32Array[], offset: number, n: number): void {
    const L = out[0] as Float32Array;
    const R = out[1] as Float32Array;
    for (const p of this.parts) p.render(L, R, offset, n);
    // Brown noise drifts; a 12 Hz high-pass keeps the bed centred on zero.
    for (let i = offset; i < offset + n; i++) {
      L[i] = this.dcLeft.highpass(L[i] as number) * this.gain;
      R[i] = this.dcRight.highpass(R[i] as number) * this.gain;
    }
  }
}
