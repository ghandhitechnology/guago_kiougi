/**
 * Instrument voices. A voice is mono: it adds its samples into a scratch buffer and the channel
 * pans and sends the result. Pitch is set once per control block; everything else runs per
 * sample.
 */

import type {
  DrumPiece,
  DrumTuning,
  FmInstrument,
  Instrument,
  KitInstrument,
  OscInstrument,
  PluckInstrument,
} from "../tracker/format.ts";
import { Adsr, DelayLine, midiToHz, OnePole, pulse, Rng, Svf, saw, sin1, tri } from "./core.ts";

export interface Voice {
  /** Still making sound. */
  readonly active: boolean;
  /** Released or fading. */
  readonly releasing: boolean;
  /** Samples since note on. */
  readonly age: number;
  /** The piece a kit voice plays, for hat choke. */
  readonly piece?: DrumPiece;
  start(midi: number, velocity: number, timbre: number, piece?: DrumPiece): void;
  release(): void;
  /** Fades out over a few milliseconds; used when a voice is stolen. */
  kill(): void;
  setPitch(midi: number): void;
  setTimbre(timbre: number): void;
  render(out: Float32Array, start: number, n: number): void;
}

const KILL_SECONDS = 0.006;

abstract class BaseVoice implements Voice {
  active = false;
  releasing = false;
  age = 0;
  protected velocity = 1;
  protected midi = 60;
  protected hz = 261.6;
  protected killGain = 1;
  protected killStep = 0;
  protected readonly sr: number;
  private vibRate = 0;
  private vibDepth = 0;
  private vibDelay = 0;
  private vibPhase = 0;
  constructor(sr: number, inst: Instrument) {
    this.sr = sr;
    if (inst.vibrato) {
      this.vibRate = inst.vibrato.rate;
      this.vibDepth = inst.vibrato.depth;
      this.vibDelay = inst.vibrato.delay ?? 0;
    }
  }
  start(midi: number, velocity: number, _timbre: number, _piece?: DrumPiece): void {
    this.active = true;
    this.releasing = false;
    this.age = 0;
    this.velocity = velocity;
    this.killGain = 1;
    this.killStep = 0;
    this.vibPhase = 0;
    this.setPitch(midi);
  }
  release(): void {
    this.releasing = true;
  }
  kill(): void {
    this.releasing = true;
    this.killStep = 1 / (KILL_SECONDS * this.sr);
  }
  setPitch(midi: number): void {
    this.midi = midi;
    let m = midi;
    if (this.vibDepth > 0) {
      const t = this.age / this.sr;
      const fade = this.vibDelay <= 0 ? 1 : Math.min(1, Math.max(0, (t - this.vibDelay) / 0.4));
      m += Math.sin(this.vibPhase) * this.vibDepth * fade;
    }
    this.hz = midiToHz(m);
  }
  setTimbre(_timbre: number): void {}
  /** Advances the auto-vibrato by one block. */
  protected advanceVibrato(n: number): void {
    if (this.vibDepth > 0) this.vibPhase += (2 * Math.PI * this.vibRate * n) / this.sr;
  }
  /** Applies the kill fade; returns false when the voice has gone silent. */
  protected stepKill(): boolean {
    if (this.killStep === 0) return true;
    this.killGain -= this.killStep;
    if (this.killGain <= 0) {
      this.killGain = 0;
      this.active = false;
      return false;
    }
    return true;
  }
  abstract render(out: Float32Array, start: number, n: number): void;
}

export class OscVoice extends BaseVoice {
  private readonly inst: OscInstrument;
  private readonly env = new Adsr();
  private readonly filter = new Svf();
  private readonly phases: number[];
  private readonly duties: number[];
  private readonly mult: number[];
  private readonly rng: Rng;
  private lfsr = 1;
  private noiseHeld = 0;
  private pwmPhase = 0;
  constructor(sr: number, inst: OscInstrument, seed: number) {
    super(sr, inst);
    this.inst = inst;
    this.rng = new Rng(seed);
    this.phases = inst.osc.map(() => 0);
    this.duties = inst.osc.map((o) => o.duty ?? 0.5);
    this.mult = inst.osc.map((o) => 2 ** ((o.octave ?? 0) + (o.detune ?? 0) / 1200));
    const e = inst.env;
    this.env.configure(sr, e.a, e.d, e.s, e.r);
  }
  override start(midi: number, velocity: number, timbre: number): void {
    super.start(midi, velocity, timbre);
    this.env.on();
    this.inst.osc.forEach((o, i) => {
      this.duties[i] = o.duty ?? 0.5;
    });
    if (timbre >= 0) this.setTimbre(timbre);
  }
  override setTimbre(timbre: number): void {
    const duty = Math.min(0.95, Math.max(0.03, timbre / 256));
    this.inst.osc.forEach((o, i) => {
      if (o.wave === "pulse") this.duties[i] = duty;
    });
  }
  override release(): void {
    super.release();
    this.env.off();
  }
  render(out: Float32Array, start: number, n: number): void {
    if (!this.active) return;
    const sr = this.sr;
    const f = this.inst.filter;
    if (f) {
      const t = this.age / sr;
      let cutoff = f.cutoff;
      if (f.env) cutoff *= 2 ** (f.env * Math.exp(-t / (f.decay ?? 0.2)));
      if (f.track) cutoff *= (this.hz / 261.63) ** f.track;
      this.filter.set(sr, cutoff, f.q ?? Math.SQRT1_2);
    }
    const oscs = this.inst.osc;
    const gain = this.inst.gain * this.velocity;
    const pwm = oscs[0]?.pwm;
    for (let k = 0; k < n; k++) {
      let v = 0;
      for (let j = 0; j < oscs.length; j++) {
        const o = oscs[j] as (typeof oscs)[number];
        const dt = (this.hz * (this.mult[j] as number)) / sr;
        let p = (this.phases[j] as number) + dt;
        let wrapped = false;
        if (p >= 1) {
          p -= Math.floor(p);
          wrapped = true;
        }
        this.phases[j] = p;
        let s: number;
        switch (o.wave) {
          case "pulse": {
            let duty = this.duties[j] as number;
            if (o.pwm) duty += Math.sin(this.pwmPhase) * o.pwm.depth;
            s = pulse(p, dt, Math.min(0.97, Math.max(0.03, duty)));
            break;
          }
          case "saw":
            s = saw(p, dt);
            break;
          case "tri":
            s = tri(p, o.steps ?? 0);
            break;
          case "sine":
            s = sin1(p);
            break;
          case "noise":
            s = this.rng.bi();
            break;
          case "metal":
            if (wrapped || dt > 0.5) {
              const bit = (this.lfsr ^ (this.lfsr >> 6)) & 1;
              this.lfsr = (this.lfsr >> 1) | (bit << 14);
              this.noiseHeld = this.lfsr & 1 ? 1 : -1;
            }
            s = this.noiseHeld;
            break;
        }
        v += s * (o.gain ?? 1);
      }
      if (pwm) this.pwmPhase += (2 * Math.PI * pwm.rate) / sr;
      if (f) {
        this.filter.process(v);
        v =
          f.type === "lp" ? this.filter.low : f.type === "bp" ? this.filter.band : this.filter.high;
      }
      const e = this.env.next();
      if (!this.stepKill()) break;
      out[start + k] = (out[start + k] as number) + v * e * gain * this.killGain;
    }
    this.age += n;
    this.advanceVibrato(n);
    if (this.env.stage === 0) this.active = false;
  }
}

export class FmVoice extends BaseVoice {
  private readonly inst: FmInstrument;
  private readonly env = new Adsr();
  private pc = 0;
  private pc2 = 0;
  private pm = 0;
  private indexScale = 1;
  constructor(sr: number, inst: FmInstrument) {
    super(sr, inst);
    this.inst = inst;
    const e = inst.env;
    this.env.configure(sr, e.a, e.d, e.s, e.r);
  }
  override start(midi: number, velocity: number, timbre: number): void {
    super.start(midi, velocity, timbre);
    this.env.on();
    this.indexScale = timbre >= 0 ? timbre / 128 : 1;
  }
  override setTimbre(timbre: number): void {
    this.indexScale = timbre / 128;
  }
  override release(): void {
    super.release();
    this.env.off();
  }
  render(out: Float32Array, start: number, n: number): void {
    if (!this.active) return;
    const sr = this.sr;
    const inst = this.inst;
    const t = this.age / sr;
    const sus = inst.indexSustain ?? 0;
    const index =
      (sus + (inst.index - sus) * Math.exp(-t / inst.indexDecay)) * this.indexScale * 0.159155;
    // Brighter at low velocity is wrong; soften the index with velocity.
    const idx = index * (0.6 + 0.4 * this.velocity);
    const dtc = this.hz / sr;
    const dtm = (this.hz * inst.ratio) / sr;
    const chorus = inst.chorus ?? 0;
    const dtc2 = chorus ? dtc * 2 ** (chorus / 1200) : 0;
    const gain = inst.gain * this.velocity * (chorus ? 0.6 : 1);
    for (let k = 0; k < n; k++) {
      this.pm += dtm;
      if (this.pm >= 1) this.pm -= 1;
      this.pc += dtc;
      if (this.pc >= 1) this.pc -= 1;
      const mod = idx * sin1(this.pm);
      let v = sin1(this.pc + mod);
      if (chorus) {
        this.pc2 += dtc2;
        if (this.pc2 >= 1) this.pc2 -= 1;
        v += sin1(this.pc2 + mod);
      }
      const e = this.env.next();
      if (!this.stepKill()) break;
      out[start + k] = (out[start + k] as number) + v * e * gain * this.killGain;
    }
    this.age += n;
    this.advanceVibrato(n);
    if (this.env.stage === 0) this.active = false;
  }
}

export class PluckVoice extends BaseVoice {
  private readonly inst: PluckInstrument;
  private readonly line: DelayLine;
  private readonly rng: Rng;
  private prev = 0;
  private loss = 0.99;
  private fade = 1;
  private fadeStep = 0;
  private quiet = 0;
  private brightness: number;
  constructor(sr: number, inst: PluckInstrument, seed: number) {
    super(sr, inst);
    this.inst = inst;
    this.line = new DelayLine(Math.ceil(sr / 25) + 4);
    this.rng = new Rng(seed);
    this.brightness = inst.brightness;
  }
  override start(midi: number, velocity: number, timbre: number): void {
    super.start(midi, velocity, timbre);
    if (timbre >= 0) this.brightness = timbre / 255;
    else this.brightness = this.inst.brightness;
    const len = Math.max(2, Math.round(this.sr / this.hz));
    const lp = new OnePole();
    lp.set(this.sr, 400 + this.brightness * this.brightness * 12000);
    this.line.clear();
    // Excite with filtered noise, softer with lower velocity, and remove its mean so a
    // decaying string never leaves a DC step.
    const burst = new Float32Array(len);
    let mean = 0;
    for (let i = 0; i < len; i++) {
      burst[i] = lp.lowpass(this.rng.bi());
      mean += burst[i] as number;
    }
    mean /= len;
    for (let i = 0; i < len; i++) this.line.write(((burst[i] as number) - mean) * 1.6);
    this.prev = 0;
    this.fade = 1;
    this.fadeStep = 0;
    this.quiet = 0;
    this.loss = 10 ** (-3 / (this.inst.decay * this.hz));
  }
  override release(): void {
    super.release();
    this.fadeStep = 1 / ((this.inst.release ?? 0.12) * this.sr);
  }
  override setTimbre(timbre: number): void {
    this.brightness = timbre / 255;
  }
  render(out: Float32Array, start: number, n: number): void {
    if (!this.active) return;
    const delay = Math.max(2, this.sr / this.hz - 0.5);
    const gain = this.inst.gain * this.velocity;
    const loss = this.loss;
    let peak = 0;
    for (let k = 0; k < n; k++) {
      const y = this.line.read(delay);
      const v = (y + this.prev) * 0.5 * loss;
      this.prev = y;
      this.line.write(v);
      if (this.fadeStep) {
        this.fade -= this.fadeStep;
        if (this.fade <= 0) {
          this.active = false;
          break;
        }
      }
      if (!this.stepKill()) break;
      const s = y * gain * this.fade * this.killGain;
      out[start + k] = (out[start + k] as number) + s;
      const a = Math.abs(y);
      if (a > peak) peak = a;
    }
    this.age += n;
    this.advanceVibrato(n);
    this.quiet = peak < 1e-4 ? this.quiet + n : 0;
    if (this.quiet > this.sr * 0.05) this.active = false;
  }
}

interface PieceShape {
  /** Start and end frequency of the tone, Hz. */
  f0: number;
  f1: number;
  /** Pitch fall time constant, s. */
  pitchTau: number;
  /** Tone and noise amplitude decay time constants, s. */
  toneTau: number;
  noiseTau: number;
  tone: number;
  noise: number;
  filter: "lp" | "bp" | "hp";
  cutoff: number;
  q: number;
  /** Seconds of attack fade, to soften shakers. */
  attack: number;
  /** Clap bursts. */
  bursts: number;
  /** Metallic partials for the cymbal. */
  metal: boolean;
  gain: number;
}

const PIECES: Record<DrumPiece, PieceShape> = {
  K: shape({
    f0: 150,
    f1: 47,
    pitchTau: 0.03,
    toneTau: 0.16,
    noise: 0.25,
    noiseTau: 0.003,
    filter: "hp",
    cutoff: 1500,
    gain: 1.15,
  }),
  S: shape({
    f0: 210,
    f1: 180,
    pitchTau: 0.02,
    toneTau: 0.045,
    tone: 0.55,
    noise: 0.85,
    noiseTau: 0.075,
    filter: "bp",
    cutoff: 2200,
    q: 0.7,
  }),
  H: shape({ tone: 0, noise: 0.65, noiseTau: 0.022, filter: "hp", cutoff: 7500 }),
  O: shape({ tone: 0, noise: 0.55, noiseTau: 0.2, filter: "hp", cutoff: 7000 }),
  T: shape({
    f0: 220,
    f1: 150,
    pitchTau: 0.08,
    toneTau: 0.22,
    noise: 0.08,
    noiseTau: 0.01,
    filter: "lp",
    cutoff: 3000,
  }),
  L: shape({
    f0: 140,
    f1: 95,
    pitchTau: 0.1,
    toneTau: 0.28,
    noise: 0.08,
    noiseTau: 0.01,
    filter: "lp",
    cutoff: 2500,
  }),
  R: shape({
    f0: 1650,
    f1: 1600,
    pitchTau: 0.01,
    toneTau: 0.012,
    tone: 0.5,
    noise: 0.5,
    noiseTau: 0.006,
    filter: "bp",
    cutoff: 3200,
    q: 2,
    gain: 0.8,
  }),
  P: shape({ tone: 0, noise: 1, noiseTau: 0.1, filter: "bp", cutoff: 1250, q: 1.4, bursts: 3 }),
  Y: shape({
    tone: 0,
    noise: 0.35,
    noiseTau: 0.9,
    filter: "hp",
    cutoff: 5500,
    metal: true,
    gain: 0.5,
  }),
  M: shape({
    tone: 0,
    noise: 0.6,
    noiseTau: 0.045,
    filter: "bp",
    cutoff: 6500,
    q: 0.9,
    attack: 0.012,
  }),
};

function shape(p: Partial<PieceShape>): PieceShape {
  return {
    f0: 100,
    f1: 100,
    pitchTau: 0.05,
    toneTau: 0.1,
    noiseTau: 0.05,
    tone: 1,
    noise: 0,
    filter: "lp",
    cutoff: 8000,
    q: Math.SQRT1_2,
    attack: 0,
    bursts: 0,
    metal: false,
    gain: 1,
    ...p,
  };
}

const METAL_RATIOS = [1, 1.483, 1.932, 2.546, 2.63, 3.897];

export class KitVoice extends BaseVoice {
  private readonly kit: KitInstrument;
  private readonly filter = new Svf();
  private readonly rng: Rng;
  private shapeNow: PieceShape = PIECES.K;
  private tuning: DrumTuning = {};
  private phase = 0;
  private metalPhases = new Float64Array(6);
  private end = 0;
  piece?: DrumPiece;
  constructor(sr: number, inst: KitInstrument, seed: number) {
    super(sr, inst);
    this.kit = inst;
    this.rng = new Rng(seed);
  }
  override start(midi: number, velocity: number, timbre: number, piece?: DrumPiece): void {
    super.start(midi, velocity, timbre);
    const p = piece ?? "K";
    this.piece = p;
    this.shapeNow = PIECES[p];
    this.tuning = this.kit.pieces?.[p] ?? {};
    const s = this.shapeNow;
    const tune = this.tuning.tune ?? 1;
    this.filter.reset();
    this.filter.set(this.sr, s.cutoff * tune, s.q);
    this.phase = 0;
    this.metalPhases.fill(0);
    const decay = this.tuning.decay ?? 1;
    this.end = Math.ceil(7 * Math.max(s.toneTau * (s.tone ? 1 : 0), s.noiseTau) * decay * this.sr);
  }
  override release(): void {}
  render(out: Float32Array, start: number, n: number): void {
    if (!this.active) return;
    const s = this.shapeNow;
    const sr = this.sr;
    const tune = this.tuning.tune ?? 1;
    const decay = this.tuning.decay ?? 1;
    const gain = s.gain * (this.tuning.gain ?? 1) * this.kit.gain * this.velocity;
    const kTone = Math.exp(-1 / (s.toneTau * decay * sr));
    const kNoise = Math.exp(-1 / (s.noiseTau * decay * sr));
    const kPitch = Math.exp(-1 / (s.pitchTau * sr));
    let ampTone = s.tone * kTone ** this.age;
    let ampNoise = s.noise * kNoise ** this.age;
    let pitchEnv = kPitch ** this.age;
    for (let k = 0; k < n; k++) {
      const t = this.age + k;
      if (t >= this.end) {
        this.active = false;
        break;
      }
      let v = 0;
      if (s.tone > 0) {
        const f = (s.f1 + (s.f0 - s.f1) * pitchEnv) * tune;
        this.phase += f / sr;
        if (this.phase >= 1) this.phase -= 1;
        v += sin1(this.phase) * ampTone;
      }
      let noise = this.rng.bi();
      if (s.metal) {
        let m = 0;
        for (let j = 0; j < 6; j++) {
          const ph =
            (this.metalPhases[j] as number) + (330 * tune * (METAL_RATIOS[j] as number)) / sr;
          this.metalPhases[j] = ph - Math.floor(ph);
          m += ph - Math.floor(ph) < 0.5 ? 1 : -1;
        }
        noise = noise * 0.5 + m * 0.18;
      }
      let burst = 1;
      if (s.bursts > 0) {
        const ms = t / sr;
        burst = ms < 0.03 ? Math.exp(-((ms % 0.01) / 0.003)) * 1.4 : 1;
      }
      this.filter.process(noise);
      const shaped =
        s.filter === "lp"
          ? this.filter.low
          : s.filter === "bp"
            ? this.filter.band
            : this.filter.high;
      v += shaped * ampNoise * burst;
      if (s.attack > 0 && t < s.attack * sr) v *= t / (s.attack * sr);
      if (!this.stepKill()) break;
      out[start + k] = (out[start + k] as number) + v * gain * this.killGain;
      ampTone *= kTone;
      ampNoise *= kNoise;
      pitchEnv *= kPitch;
    }
    this.age += n;
  }
}

export function makeVoice(sr: number, inst: Instrument, seed: number): Voice {
  switch (inst.kind) {
    case "osc":
      return new OscVoice(sr, inst, seed);
    case "fm":
      return new FmVoice(sr, inst);
    case "pluck":
      return new PluckVoice(sr, inst, seed);
    case "kit":
      return new KitVoice(sr, inst, seed);
  }
}
