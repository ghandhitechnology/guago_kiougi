/**
 * 해솔과학고 교가: the morning assembly after the first night (opening beat 7). The school motif
 * made into the school's anthem, the way a school song sounds: stately, square, a little too
 * proud of itself.
 *
 * F major, 100 BPM, a march. The motif at half speed is the first line; the second line climbs
 * to the dominant; the third repeats the motif and the fourth closes on the tonic. The second
 * pass adds a glockenspiel and a counter-line in the brass.
 *
 * | Section | Bars | Harmony |
 * |---|---|---|
 * | Intro | 2 | F C7 (a fanfare on the motif head) |
 * | Verse | 16 | F C/E B♭ F · F Dm7 Gm C · F C/E Dm B♭ · F/C C7 F C7 |
 * | Verse′ | 16 | as Verse, with glockenspiel and counter-line |
 */

import type { SongSource } from "../../tracker/format.ts";
import { quote } from "./motif.ts";
import { bars, chord, rest, times } from "./write.ts";

const VERSE = "F C/E Bb F F Dm7 Gm C F C/E Dm Bb F/C C7 F C7";
const ORGAN: Record<string, string> = {
  F: "A3 C4 F4",
  "C/E": "G3 C4 E4",
  Bb: "Bb3 D4 F4",
  Dm7: "A3 C4 F4",
  Gm: "G3 Bb3 D4",
  C: "G3 C4 E4",
  Dm: "A3 D4 F4",
  "F/C": "A3 C4 F4",
  C7: "G3 Bb3 E4",
};
const TUBA: Record<string, [string, string]> = {
  F: ["F2", "C3"],
  "C/E": ["E2", "C3"],
  Bb: ["Bb1", "F2"],
  Dm7: ["D2", "A2"],
  Gm: ["G1", "D2"],
  C: ["C2", "G2"],
  Dm: ["D2", "A2"],
  "F/C": ["C2", "F2"],
  C7: ["C2", "G2"],
};
const each = (list: string, f: (c: string) => string) => bars(...list.split(" ").map(f));

const melody = bars(
  quote({ tonic: "F5", stretch: 2 }),
  "C5*4 F5*12",
  "G5*4 A5*12",
  "Bb5*8 A5*8",
  "G5*16",
  "C5*4 F5*12",
  "E5*4 C5*12",
  "D5*8 F5*8",
  "Bb5*8 A5*4 G5*4",
  "A5*8 F5*8",
  "G5*8 E5*8",
  "F5*16",
  "-*8 G4*4 Bb4*4",
);

/** A brass counter-line for the second verse, mostly a third or sixth under the tune. */
const counter = bars(
  "A4*16",
  "G4*16",
  "F4*8 F4*8",
  "F4*8 -*8",
  "A4*4 C5*12",
  "D5*4 F5*12",
  "D5*8 C5*8",
  "E5*16",
  "A4*4 C5*12",
  "C5*4 G4*12",
  "F4*8 A4*8",
  "D5*8 C5*4 Bb4*4",
  "C5*8 A4*8",
  "Bb4*8 G4*8",
  "A4*16",
  "-*8 E4*4 G4*4",
);

export const schoolTheme: SongSource = {
  title: "해솔과학고 교가",
  key: "F major",
  bpm: 100,
  rowsPerBeat: 4,
  beatsPerBar: 4,
  gain: 0,
  reverb: { time: 2, damp: 5000, level: 0.9 },
  instruments: {
    trumpet: {
      kind: "osc",
      gain: 0.13,
      osc: [
        { wave: "pulse", duty: 0.25 },
        { wave: "saw", gain: 0.4 },
      ],
      env: { a: 0.02, d: 0.4, s: 0.75, r: 0.15 },
      filter: { type: "lp", cutoff: 2600, env: 0.6, decay: 0.12 },
      vibrato: { rate: 5.5, depth: 0.1, delay: 0.3 },
    },
    horn: {
      kind: "osc",
      gain: 0.08,
      osc: [
        { wave: "saw", detune: -5 },
        { wave: "saw", detune: 5 },
      ],
      env: { a: 0.03, d: 0.5, s: 0.7, r: 0.2 },
      filter: { type: "lp", cutoff: 1500 },
    },
    organ: {
      kind: "osc",
      gain: 0.045,
      osc: [
        { wave: "pulse", duty: 0.5 },
        { wave: "pulse", duty: 0.5, octave: 1, gain: 0.35 },
      ],
      env: { a: 0.04, d: 0.3, s: 0.85, r: 0.3 },
      filter: { type: "lp", cutoff: 1700 },
    },
    tuba: {
      kind: "osc",
      gain: 0.14,
      osc: [{ wave: "pulse", duty: 0.5 }, { wave: "tri" }],
      env: { a: 0.006, d: 0.2, s: 0.5, r: 0.08 },
      filter: { type: "lp", cutoff: 650 },
    },
    glock: {
      kind: "fm",
      gain: 0.1,
      ratio: 3.5,
      index: 1.8,
      indexDecay: 0.08,
      env: { a: 0.001, d: 0.9, s: 0, r: 0.4 },
    },
    kit: { kind: "kit", gain: 0.28, pieces: { S: { gain: 0.8 }, Y: { gain: 0.5, decay: 1.2 } } },
  },
  channels: [
    { name: "trumpet", instrument: "trumpet", stem: "melody", reverb: 0.3 },
    { name: "horn", instrument: "horn", stem: "melody", pan: -0.25, reverb: 0.3 },
    { name: "glock", instrument: "glock", stem: "melody", pan: 0.3, reverb: 0.35 },
    { name: "organ", instrument: "organ", stem: "base", pan: 0.1, reverb: 0.4 },
    { name: "tuba", instrument: "tuba", stem: "base", reverb: 0.1 },
    { name: "drums", instrument: "kit", stem: "base", reverb: 0.2 },
  ],
  phrases: {
    r16: rest(16),
    introTrumpet: "C5*4 F5*4 E5*4 C5*4 | G4*16",
    introOrgan: `${chord(ORGAN.F as string, 16)} | ${chord(ORGAN.C7 as string, 16)}`,
    introTuba: "F2*16 | C2*16",
    introDrums: "S S S S S S S S Sv9 Svb Svd Svf S*4 | Y,K*16",
    melody,
    counter,
    glock: melody.replace(/([A-G][#b]?)(\d)/g, (_, l, o) => `${l}${Number(o) + 1}`),
    organ: each(VERSE, (c) => `${chord(ORGAN[c] as string, 8)} ${chord(ORGAN[c] as string, 8)}`),
    tuba: each(VERSE, (c) => {
      const [r, f] = TUBA[c] as [string, string];
      return `${r}*2 -*2 ${f}*2 -*2 ${r}*2 -*2 ${f}*2 -*2`;
    }),
    march: bars(times("K*4 S*4 K*4 S*2 S*2", 15), "K*4 S*4 S*2 S*2 Sv9 Svb Svd Svf"),
  },
  sections: { 0: "intro", 1: "verse", 2: "verse′" },
  order: [
    { trumpet: "introTrumpet", organ: "introOrgan", tuba: "introTuba", drums: "introDrums" },
    { trumpet: "melody", horn: "r16", glock: "r16", organ: "organ", tuba: "tuba", drums: "march" },
    {
      trumpet: "melody",
      horn: "counter",
      glock: "glock",
      organ: "organ",
      tuba: "tuba",
      drums: "march",
    },
  ],
  loop: 1,
};
