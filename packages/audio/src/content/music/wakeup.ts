/**
 * 기상송: the first login of the day (PLAN §17). Ten seconds, relentlessly cheerful, built to be
 * learned and then hated.
 *
 * C major, 150 BPM, six bars, plays once. An alarm rings and gets slapped off; a beat of silence;
 * then a polka band (kazoo, tuba, brass stabs) marches the school motif at double speed. The kazoo
 * runs up a scale, gets stuck like a scratched record, a slide whistle shoots up two octaves into a
 * final stab, and the whistle falls back down with a boing.
 *
 * | Bar | What happens | Harmony |
 * |---|---|---|
 * | 1 | alarm, snare roll, slap | C |
 * | 2–3 | the motif and its answer, double time | C Am / C G C |
 * | 4 | kazoo scale run | C |
 * | 5 | stuck record | F G7 |
 * | 6 | slide whistle, stab, boing | C |
 */

import type { SongSource } from "../../tracker/format.ts";
import { quote } from "./motif.ts";
import { bars } from "./write.ts";

const C = "C4,E4,G4";
const AM = "C4,E4,A4";
const G = "B3,D4,G4";
const F = "C4,F4,A4";
const G7 = "B3,D4,F4";
const stabs = (a: string, b: string, c: string, d: string) =>
  `-*2 ${a}*2 -*2 ${b}*2 -*2 ${c}*2 -*2 ${d}*2`;

export const wakeup: SongSource = {
  title: "기상송",
  key: "C major",
  bpm: 150,
  rowsPerBeat: 4,
  beatsPerBar: 4,
  gain: 0.3,
  reverb: { time: 1.1, damp: 6000, level: 0.7 },
  instruments: {
    alarm: {
      kind: "osc",
      gain: 0.06,
      osc: [{ wave: "pulse", duty: 0.5 }],
      env: { a: 0.001, d: 0.05, s: 0.9, r: 0.02 },
      filter: { type: "lp", cutoff: 5000 },
    },
    kazoo: {
      kind: "osc",
      gain: 0.12,
      osc: [
        { wave: "pulse", duty: 0.25 },
        { wave: "saw", gain: 0.4 },
      ],
      env: { a: 0.01, d: 0.1, s: 0.9, r: 0.04 },
      filter: { type: "lp", cutoff: 1600, q: 4 },
      vibrato: { rate: 7, depth: 0.25, delay: 0.03 },
    },
    glock: {
      kind: "fm",
      gain: 0.085,
      ratio: 3.5,
      index: 1.8,
      indexDecay: 0.08,
      env: { a: 0.001, d: 0.7, s: 0, r: 0.3 },
    },
    tuba: {
      kind: "osc",
      gain: 0.2,
      osc: [{ wave: "pulse", duty: 0.5 }, { wave: "tri" }],
      env: { a: 0.005, d: 0.15, s: 0.5, r: 0.06 },
      filter: { type: "lp", cutoff: 700 },
    },
    brass: {
      kind: "osc",
      gain: 0.09,
      osc: [
        { wave: "saw", detune: -5 },
        { wave: "saw", detune: 5 },
      ],
      env: { a: 0.005, d: 0.12, s: 0.3, r: 0.06 },
      filter: { type: "lp", cutoff: 2200, env: 0.7, decay: 0.08 },
    },
    whistle: {
      kind: "osc",
      gain: 0.16,
      osc: [{ wave: "sine" }, { wave: "tri", gain: 0.3 }],
      env: { a: 0.01, d: 0.1, s: 0.9, r: 0.05 },
      vibrato: { rate: 6, depth: 0.2 },
    },
    kit: { kind: "kit", gain: 0.34, pieces: { R: { gain: 0.6, tune: 1.3 }, P: { gain: 0.9 } } },
  },
  channels: [
    { name: "alarm", instrument: "alarm", stem: "main", pan: 0.2, reverb: 0.1 },
    { name: "kazoo", instrument: "kazoo", stem: "main", reverb: 0.15 },
    { name: "glock", instrument: "glock", stem: "main", pan: 0.3, reverb: 0.3 },
    { name: "tuba", instrument: "tuba", stem: "main", reverb: 0.05 },
    { name: "brass", instrument: "brass", stem: "main", pan: -0.25, reverb: 0.15 },
    { name: "whistle", instrument: "whistle", stem: "main", pan: 0.1, reverb: 0.2 },
    { name: "drums", instrument: "kit", stem: "main", reverb: 0.12 },
  ],
  phrases: {
    alarm: "C6a47*12 x*4 | -*16 | -*16 | -*16 | -*16 | -*16",
    kazoo: bars(
      "-*16",
      quote({ tonic: "C5", stretch: 0.5 }),
      "G4 C5*3 B4 D5*3 C5*2 G5*4 -*2",
      "C5 D5 E5 F5 G5 A5 B5 C6*3 G5*2 E5*2 C5*2",
      "A4 C5*3 A4 C5*3 B4 D5*3 B4 D5*3",
      "-*8 C5c06*8",
    ),
    glock: bars(
      "-*16",
      quote({ tonic: "C6", stretch: 0.5 }),
      "G5 C6*3 B5 D6*3 C6*2 G6*4 -*2",
      "-*16",
      "-*16",
      "-*8 C6*8",
    ),
    tuba: bars(
      "-*16",
      "C3*2 -*2 G2*2 -*2 A2*2 -*2 E2*2 -*2",
      "C3*2 -*2 G2*2 -*2 C3*2 -*2 G2*2 -*2",
      "C3*2 -*2 G2*2 -*2 C3*2 -*2 G2*2 -*2",
      "F2*2 -*2 C3*2 -*2 G2*2 -*2 D3*2 -*2",
      "-*8 C2*4 -*4",
    ),
    brass: bars(
      "-*16",
      stabs(C, C, AM, AM),
      stabs(C, G, C, C),
      stabs(C, C, C, C),
      stabs(F, F, G7, G7),
      "-*8 C4,E4,G4,C5*3 -*5",
    ),
    whistle: "-*16 | -*16 | -*16 | -*16 | -*16 | G4u30*8 -*4 C6d60*3 -",
    drums: bars(
      "Sv3 Sv3 Sv4 Sv4 Sv5 Sv5 Sv6 Sv6 Sv7 Sv8 Sv9 Sva P,K*4",
      "Y,K*2 Rv5*2 S*2 Rv5*2 K*2 Rv5*2 S*2 Rv5*2",
      "K*2 Rv5*2 S*2 Rv5*2 K*2 Rv5*2 S*2 Rv5*2",
      "K*2 Rv5*2 S*2 Rv5*2 K*2 Rv5*2 S*2 Rv5*2",
      "K*2 Rv5*2 S*2 Rv5*2 S S S S Sv9 Svb Svd Svf",
      "-*8 Y,K*8",
    ),
  },
  order: [
    {
      alarm: "alarm",
      kazoo: "kazoo",
      glock: "glock",
      tuba: "tuba",
      brass: "brass",
      whistle: "whistle",
      drums: "drums",
    },
  ],
  loop: false,
};
