/**
 * 야간 자습: the 자습실 at 23:38, the opening's first scene. Quiet, warm, a little too late.
 *
 * E♭ major, 66 BPM. A clock ticks on the rim, soft keys hold the harmony, a hummed line drifts
 * over it. In B the school motif plays once on a bell, slow and far, as if the building were
 * dreaming of the day.
 *
 * | Section | Bars | What happens | Harmony |
 * |---|---|---|---|
 * | A | 8 | the hummed line | E♭maj7 Cm7 A♭maj7 B♭sus4 E♭maj7 Gm7 A♭maj7 B♭7 |
 * | B | 8 | the motif on a bell, then the line again | E♭maj7 A♭maj7 Fm7 B♭sus4 E♭maj7 Gm7 A♭maj7 B♭7 |
 */

import type { SongSource } from "../../tracker/format.ts";
import { quote } from "./motif.ts";
import { bars, chord, times } from "./write.ts";

const KEYS: Record<string, string> = {
  Ebmaj7: "G3 Bb3 Eb4",
  Cm7: "G3 Bb3 Eb4",
  Abmaj7: "G3 C4 Eb4",
  Bbsus: "F3 Bb3 Eb4",
  Gm7: "F3 Bb3 D4",
  Bb7: "F3 Ab3 D4",
  Fm7: "F3 Ab3 Eb4",
};
const BASS: Record<string, string> = {
  Ebmaj7: "Eb2",
  Cm7: "C2",
  Abmaj7: "Ab1",
  Bbsus: "Bb1",
  Gm7: "G1",
  Bb7: "Bb1",
  Fm7: "F1",
};
const A = "Ebmaj7 Cm7 Abmaj7 Bbsus Ebmaj7 Gm7 Abmaj7 Bb7";
const B = "Ebmaj7 Abmaj7 Fm7 Bbsus Ebmaj7 Gm7 Abmaj7 Bb7";
const each = (list: string, f: (c: string) => string) => bars(...list.split(" ").map(f));

export const nightStudy: SongSource = {
  title: "야간 자습",
  key: "E♭ major",
  bpm: 66,
  rowsPerBeat: 4,
  beatsPerBar: 4,
  gain: -1.5,
  reverb: { time: 2.4, damp: 4200, level: 0.9 },
  echo: { beats: 1.5, feedback: 0.3, damp: 2400 },
  instruments: {
    keys: {
      kind: "fm",
      gain: 0.11,
      ratio: 1,
      index: 1.2,
      indexSustain: 0.15,
      indexDecay: 0.5,
      env: { a: 0.01, d: 2.8, s: 0.3, r: 0.8 },
      chorus: 4,
    },
    hum: {
      kind: "osc",
      gain: 0.11,
      osc: [{ wave: "sine" }, { wave: "tri", gain: 0.3 }],
      env: { a: 0.12, d: 0.6, s: 0.8, r: 0.5 },
      filter: { type: "lp", cutoff: 1800 },
      vibrato: { rate: 4.5, depth: 0.1, delay: 0.5 },
    },
    bass: {
      kind: "osc",
      gain: 0.22,
      osc: [{ wave: "tri" }],
      env: { a: 0.02, d: 1, s: 0.6, r: 0.4 },
    },
    bell: {
      kind: "fm",
      gain: 0.09,
      ratio: 3,
      index: 1.6,
      indexDecay: 0.3,
      env: { a: 0.002, d: 2.6, s: 0, r: 1.2 },
    },
    clock: { kind: "kit", gain: 0.2, pieces: { R: { gain: 5, tune: 0.7 } } },
  },
  channels: [
    { name: "keys", instrument: "keys", stem: "base", pan: -0.15, reverb: 0.35 },
    { name: "bass", instrument: "bass", stem: "base", reverb: 0.1 },
    { name: "clock", instrument: "clock", stem: "base", pan: 0.45, reverb: 0.2 },
    { name: "hum", instrument: "hum", stem: "melody", reverb: 0.4, delay: 0.2 },
    { name: "bell", instrument: "bell", stem: "melody", pan: 0.25, reverb: 0.5, delay: 0.3 },
  ],
  phrases: {
    keysA: each(A, (c) => `${chord(KEYS[c] as string, 10)} ${chord(KEYS[c] as string, 6, "v8")}`),
    keysB: each(B, (c) => `${chord(KEYS[c] as string, 10)} ${chord(KEYS[c] as string, 6, "v8")}`),
    bassA: each(A, (c) => `${BASS[c]}*16`),
    bassB: each(B, (c) => `${BASS[c]}*16`),
    clock: times("Rv5*4 Rv3*4 Rv5*4 Rv3*4", 8),
    humA: bars(
      "G5*12 F5*4",
      "Eb5*8 -*4 Bb4*4",
      "C5*6 Eb5*2 G5*8",
      "F5*16",
      "G5*8 F5*4 Bb5*4",
      "G5*12 -*4",
      "Eb5*6 F5*2 G5*4 C5*4",
      "D5*16",
    ),
    humB: bars(
      "-*16",
      "-*16",
      "-*16",
      "-*16",
      "G5*8 F5*4 Bb5*4",
      "G5*12 -*4",
      "Eb5*6 F5*2 G5*4 C5*4",
      "D5*16",
    ),
    bellB: bars(quote({ tonic: "Eb5" }), "-*16", "-*16", "-*16", "-*16", "-*16", "-*16"),
    r8: "-*128",
  },
  sections: { 0: "A", 1: "B" },
  order: [
    { keys: "keysA", bass: "bassA", clock: "clock", hum: "humA", bell: "r8" },
    { keys: "keysB", bass: "bassB", clock: "clock", hum: "humB", bell: "bellB" },
  ],
  loop: 0,
};
