/** Renders an effect's parameter set to mono samples. Pure, so it runs in a worker or in Node. */

import {
  Brown,
  dbToGain,
  OnePole,
  Pink,
  pulse,
  Reverb,
  Rng,
  Svf,
  saw,
  sin1,
  tri,
} from "../dsp/core.ts";
import { CATEGORY_TARGET, type EffectSource, type Layer, parseEffect } from "./format.ts";

const FADE = 0.004;

function jittered(layer: Layer, rng: Rng, amount: number): Layer {
  if (amount <= 0) return layer;
  const j = (x: number) => x * (1 + rng.bi() * amount);
  return {
    ...layer,
    freq: j(layer.freq),
    hold: j(layer.hold),
    decay: j(layer.decay),
    ...(layer.lowpass ? { lowpass: { ...layer.lowpass, freq: j(layer.lowpass.freq) } } : {}),
    ...(layer.band ? { band: { ...layer.band, freq: j(layer.band.freq) } } : {}),
    ...(layer.highpass ? { highpass: { ...layer.highpass, freq: j(layer.highpass.freq) } } : {}),
  };
}

function layerLength(l: Layer): number {
  return (l.delay ?? 0) + l.attack + l.hold + l.decay;
}

function renderLayer(l: Layer, sr: number, out: Float32Array, rng: Rng): void {
  const start = Math.round((l.delay ?? 0) * sr);
  const len = Math.ceil((l.attack + l.hold + l.decay) * sr);
  const gain = dbToGain(l.gain ?? 0);
  const curve = l.curve ?? 2;
  const pink = new Pink();
  const brown = new Brown();
  const lp = l.lowpass ? new Svf() : null;
  const hp = l.highpass ? new Svf() : null;
  const bp = l.band ? new Svf() : null;
  let phase = 0;
  let held = 0;
  let lfsr = 1;
  let crackle = 0;
  let crackleEnv = 0;
  let restart = 0;
  for (let i = 0; i < len && start + i < out.length; i++) {
    const t = i / sr;
    let tp = t;
    if (l.repeat && l.repeat > 0) {
      tp = t % l.repeat;
      if (Math.floor(t / l.repeat) !== restart) {
        restart = Math.floor(t / l.repeat);
      }
    }
    // Pitch path.
    let oct = (l.slide ?? 0) * tp + 0.5 * (l.accel ?? 0) * tp * tp;
    if (l.jumps) for (const j of l.jumps) if (tp >= j.at) oct += j.semitones / 12;
    if (l.vibrato) oct += (l.vibrato.depth / 12) * Math.sin(2 * Math.PI * l.vibrato.rate * t);
    const f = l.freq * 2 ** oct;
    if (l.floor && f < l.floor) break;
    const dt = Math.min(0.5, f / sr);
    // Source.
    let s = 0;
    switch (l.wave) {
      case "square": {
        phase += dt;
        if (phase >= 1) phase -= 1;
        const duty = Math.min(0.95, Math.max(0.05, (l.duty ?? 0.5) + (l.dutySlide ?? 0) * t));
        s = pulse(phase, dt, duty);
        break;
      }
      case "saw":
        phase += dt;
        if (phase >= 1) phase -= 1;
        s = saw(phase, dt);
        break;
      case "tri":
        phase += dt;
        if (phase >= 1) phase -= 1;
        s = tri(phase, 0);
        break;
      case "sine":
        phase += f / sr;
        if (phase >= 1) phase -= 1;
        s = sin1(phase);
        break;
      case "noise":
        if (l.freq <= 0) s = rng.bi();
        else {
          phase += f / sr;
          if (phase >= 1) {
            phase -= Math.floor(phase);
            held = rng.bi();
          }
          s = held;
        }
        break;
      case "pink":
        s = pink.next(rng.bi()) * 2.2;
        break;
      case "brown":
        s = brown.next(rng.bi());
        break;
      case "metal":
        phase += (f * 93) / sr;
        while (phase >= 1) {
          phase -= 1;
          const bit = (lfsr ^ (lfsr >> 6)) & 1;
          lfsr = (lfsr >> 1) | (bit << 14);
        }
        s = lfsr & 1 ? 1 : -1;
        break;
      case "crackle":
        if (rng.next() < f / sr) crackleEnv = 0.6 + 0.4 * rng.next();
        crackleEnv *= 0.93;
        crackle = rng.bi() * crackleEnv;
        s = crackle;
        break;
    }
    // Filters, coefficients refreshed every 16 samples.
    if ((i & 15) === 0) {
      if (lp && l.lowpass)
        lp.set(sr, l.lowpass.freq * 2 ** ((l.lowpass.slide ?? 0) * t), l.lowpass.q ?? Math.SQRT1_2);
      if (hp && l.highpass)
        hp.set(
          sr,
          l.highpass.freq * 2 ** ((l.highpass.slide ?? 0) * t),
          l.highpass.q ?? Math.SQRT1_2,
        );
      if (bp && l.band) bp.set(sr, l.band.freq * 2 ** ((l.band.slide ?? 0) * t), l.band.q ?? 1);
    }
    if (bp) {
      bp.process(s);
      s = bp.band;
    }
    if (lp) {
      lp.process(s);
      s = lp.low;
    }
    if (hp) {
      hp.process(s);
      s = hp.high;
    }
    // Envelope.
    let env: number;
    if (t < l.attack) env = t / l.attack;
    else if (t < l.attack + l.hold) {
      const h = (t - l.attack) / (l.hold || 1);
      env = 1 + (l.punch ?? 0) * (1 - h);
    } else {
      const d = (t - l.attack - l.hold) / (l.decay || 1e-9);
      env = d >= 1 ? 0 : (1 - d) ** curve;
    }
    if (l.am) env *= 1 - l.am.depth * (0.5 + 0.5 * Math.sin(2 * Math.PI * l.am.rate * t));
    out[start + i] = (out[start + i] as number) + s * env * gain;
  }
}

/** Loudest 50 ms of the K-weighted signal, dB. Short sounds are judged by their body. */
export function shortLoudness(x: Float32Array, sr: number): number {
  // A simple pre-filter close to K-weighting: high shelf +4 dB above 1.5 kHz and a 40 Hz high-pass.
  const hp = new OnePole();
  hp.set(sr, 40);
  const shelf = new OnePole();
  shelf.set(sr, 1500);
  const w = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) {
    const v = hp.highpass(x[i] as number);
    const high = shelf.highpass(v);
    w[i] = v + high * 0.585;
  }
  const win = Math.max(1, Math.round(0.05 * sr));
  let sum = 0;
  let best = 0;
  for (let i = 0; i < w.length; i++) {
    sum += (w[i] as number) ** 2;
    if (i >= win) sum -= (w[i - win] as number) ** 2;
    const p = sum / win;
    if (p > best) best = p;
  }
  return 10 * Math.log10(best + 1e-20);
}

export interface RenderedEffect {
  readonly variants: Float32Array[];
  /** True when the buffers loop seamlessly. */
  readonly loop: boolean;
}

/**
 * Renders every variant of an effect at `sr`. Variants share one gain, set so the first variant
 * meets its category's loudness target, so their natural differences survive.
 */
export function renderEffect(id: string, source: EffectSource, sr: number): RenderedEffect {
  const fx = parseEffect(id, source);
  let seed = 0;
  for (let i = 0; i < id.length; i++) seed = (seed * 31 + id.charCodeAt(i)) >>> 0;
  const length = Math.max(...fx.layers.map(layerLength)) + (fx.room > 0 ? 0.5 : 0);
  const loopLen = fx.loop ?? 0;
  const xfade = loopLen > 0 ? Math.min(0.25, loopLen / 4) : 0;
  const total = Math.ceil((loopLen > 0 ? loopLen + xfade : length) * sr);
  const variants: Float32Array[] = [];
  let gain = 1;
  for (let v = 0; v < fx.variants; v++) {
    const rng = new Rng(seed + v * 7919 + 1);
    let x = new Float32Array(total);
    for (const layer of fx.layers)
      renderLayer(jittered(layer, rng, v === 0 ? 0 : fx.jitter), sr, x, rng);
    if (fx.room > 0) {
      const reverb = new Reverb(sr, 0.7, 6000);
      const wetL = new Float32Array(total);
      const wetR = new Float32Array(total);
      for (let i = 0; i < total; i++) reverb.process(x[i] as number, wetL, wetR, i, fx.room);
      for (let i = 0; i < total; i++)
        x[i] = (x[i] as number) + ((wetL[i] as number) + (wetR[i] as number)) * 0.5;
    }
    // DC block.
    const dc = new OnePole();
    dc.set(sr, 15);
    for (let i = 0; i < total; i++) x[i] = dc.highpass(x[i] as number);
    if (loopLen > 0) {
      // Fold the tail onto the head with an equal-power crossfade.
      const n = Math.round(loopLen * sr);
      const xf = Math.round(xfade * sr);
      const looped = new Float32Array(n);
      looped.set(x.subarray(0, n));
      for (let i = 0; i < xf; i++) {
        const a = Math.sin((0.5 * Math.PI * i) / xf);
        const b = Math.cos((0.5 * Math.PI * i) / xf);
        looped[i] = (x[i] as number) * a + (x[n + i] as number) * b;
      }
      x = looped;
    } else {
      const fade = Math.round(FADE * sr);
      for (let i = 0; i < fade; i++) {
        const k = x.length - 1 - i;
        x[k] = (x[k] as number) * (i / fade);
      }
    }
    if (v === 0) {
      const target = CATEGORY_TARGET[fx.category] + fx.level;
      gain = dbToGain(target - shortLoudness(x, sr));
      let peak = 0;
      for (let i = 0; i < x.length; i++) peak = Math.max(peak, Math.abs(x[i] as number));
      // Keep every effect a decibel under full scale before the mixer's limiter.
      if (peak * gain > 0.89) gain = 0.89 / peak;
    }
    for (let i = 0; i < x.length; i++) x[i] = (x[i] as number) * gain;
    variants.push(x);
  }
  return { variants, loop: loopLen > 0 };
}
