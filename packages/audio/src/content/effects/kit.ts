/**
 * A small vocabulary of sound layers for combat: thumps, ticks, chalk, glass, splashes, zaps,
 * rubble. Each returns one layer; effects stack up to three for an impact (PLAN §6 body,
 * material, sweetener) and more for events.
 */

import type { Layer } from "../../sfx/format.ts";

type Extra = Partial<Layer>;

/** A pitched body that drops: the weight of a hit. */
export const thump = (freq: number, decay: number, x: Extra = {}): Layer => ({
  role: "body",
  wave: "sine",
  freq,
  slide: -2,
  attack: 0.001,
  hold: 0.008,
  decay,
  punch: 0.4,
  ...x,
});

/** A dry transient. */
export const tick = (freq: number, decay = 0.012, x: Extra = {}): Layer => ({
  role: "material",
  wave: "noise",
  freq: 0,
  band: { freq, q: 2 },
  attack: 0.0004,
  hold: 0.002,
  decay,
  ...x,
});

/** Chalk on a board: a scratchy, jittering band of noise. */
export const chalk = (freq: number, decay: number, x: Extra = {}): Layer => ({
  role: "material",
  wave: "noise",
  freq: 0,
  band: { freq, q: 2.5 },
  am: { rate: 70, depth: 0.6 },
  attack: 0.002,
  hold: decay * 0.3,
  decay,
  ...x,
});

/** A clean tone: the exact ring of 수학, a chime, a glass. */
export const ping = (freq: number, decay: number, x: Extra = {}): Layer => ({
  role: "sweetener",
  wave: "sine",
  freq,
  attack: 0.001,
  hold: 0.005,
  decay,
  ...x,
});

/** Liquid: a band of pink noise sweeping down. */
export const splash = (freq: number, decay: number, x: Extra = {}): Layer => ({
  role: "material",
  wave: "pink",
  freq: 0,
  band: { freq, slide: -2.5, q: 1 },
  attack: 0.002,
  hold: 0.01,
  decay,
  ...x,
});

/** Air moving: pink noise sweeping from `freq` by `slide` octaves a second. */
export const whoosh = (freq: number, slide: number, length: number, x: Extra = {}): Layer => ({
  role: "material",
  wave: "pink",
  freq: 0,
  band: { freq, slide, q: 1.2 },
  attack: length * 0.45,
  hold: length * 0.1,
  decay: length * 0.45,
  curve: 1.5,
  ...x,
});

/** Electricity: a buzzing square with a crackle of amplitude. */
export const zap = (freq: number, decay: number, x: Extra = {}): Layer => ({
  role: "sweetener",
  wave: "square",
  freq,
  duty: 0.2,
  am: { rate: 110, depth: 0.8 },
  lowpass: { freq: 6000 },
  attack: 0.001,
  hold: decay * 0.3,
  decay,
  ...x,
});

/** Small hard pieces: grit, debris, glass shards, fire crackle. */
export const crackle = (rate: number, from: number, decay: number, x: Extra = {}): Layer => ({
  role: "material",
  wave: "crackle",
  freq: rate,
  highpass: { freq: from },
  attack: 0.002,
  hold: decay * 0.2,
  decay,
  curve: 1.5,
  ...x,
});

/** A low tail of rumble. */
export const rumble = (cutoff: number, decay: number, x: Extra = {}): Layer => ({
  role: "sweetener",
  wave: "brown",
  freq: 0,
  lowpass: { freq: cutoff },
  attack: 0.005,
  hold: decay * 0.2,
  decay,
  ...x,
});

/** Soft organic matter: a body whose pitch rises, like a pop or a squelch. */
export const squelch = (freq: number, decay: number, x: Extra = {}): Layer => ({
  role: "body",
  wave: "sine",
  freq,
  slide: 2.5,
  attack: 0.002,
  hold: 0.01,
  decay,
  punch: 0.2,
  ...x,
});

/** Hiss: fizz, steam, a fuse. */
export const hiss = (from: number, decay: number, x: Extra = {}): Layer => ({
  role: "sweetener",
  wave: "noise",
  freq: 0,
  highpass: { freq: from },
  attack: 0.005,
  hold: decay * 0.4,
  decay,
  ...x,
});

/** Paper: a crisp band of noise with a fast flutter. */
export const paper = (freq: number, decay: number, x: Extra = {}): Layer => ({
  role: "material",
  wave: "noise",
  freq: 0,
  band: { freq, q: 1.4 },
  am: { rate: 45, depth: 0.5 },
  attack: 0.002,
  hold: decay * 0.3,
  decay,
  ...x,
});

/** Semitones to a frequency ratio, for writing intervals. */
export const semis = (n: number): number => 2 ** (n / 12);
