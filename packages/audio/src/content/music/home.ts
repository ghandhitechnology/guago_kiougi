/**
 * 집: the 명령퇴사 home scene. A parent, a fridge with 장조림 in it, a talk after dinner.
 *
 * B♭ major, a 3/4 waltz at 84 BPM, music box over a soft guitar. Sixteen bars and round again.
 *
 * Harmony: B♭ E♭ B♭/D F · Gm E♭ C7 F7 · B♭ E♭ Dm Gm · E♭ F B♭ B♭
 */

import type { SongSource } from "../../tracker/format.ts";
import { bars, chord } from "./write.ts";

const CHORDS = "Bb Eb Bb/D F Gm Eb C7 F7 Bb Eb Dm Gm Eb F Bb Bb";
const GUITAR: Record<string, [string, string, string]> = {
  Bb: ["Bb2", "F3", "D4"],
  Eb: ["Eb3", "Bb3", "G4"],
  "Bb/D": ["D3", "Bb3", "F4"],
  F: ["F2", "C4", "A4"],
  Gm: ["G2", "D4", "Bb4"],
  C7: ["C3", "Bb3", "E4"],
  F7: ["F2", "Eb4", "A4"],
  Dm: ["D3", "A3", "F4"],
};
const PAD: Record<string, string> = {
  Bb: "D3 F3 Bb3",
  Eb: "Eb3 G3 Bb3",
  "Bb/D": "D3 F3 Bb3",
  F: "C3 F3 A3",
  Gm: "D3 G3 Bb3",
  C7: "C3 E3 Bb3",
  F7: "C3 Eb3 A3",
  Dm: "D3 F3 A3",
};

export const home: SongSource = {
  title: "집",
  key: "B♭ major",
  bpm: 84,
  rowsPerBeat: 4,
  beatsPerBar: 3,
  gain: 4.5,
  reverb: { time: 1.6, damp: 4500, level: 0.8 },
  instruments: {
    box: {
      kind: "fm",
      gain: 0.1,
      ratio: 4,
      index: 1.4,
      indexDecay: 0.12,
      env: { a: 0.001, d: 1.4, s: 0, r: 0.6 },
    },
    guitar: { kind: "pluck", gain: 0.19, decay: 1.6, brightness: 0.35 },
    pad: {
      kind: "osc",
      gain: 0.03,
      osc: [{ wave: "tri" }, { wave: "sine", octave: 1, gain: 0.3 }],
      env: { a: 0.5, d: 0.5, s: 0.8, r: 0.8 },
    },
  },
  channels: [
    { name: "box", instrument: "box", stem: "melody", pan: 0.15, reverb: 0.35 },
    { name: "guitar", instrument: "guitar", stem: "base", pan: -0.2, reverb: 0.2 },
    { name: "pad", instrument: "pad", stem: "base", reverb: 0.4 },
  ],
  phrases: {
    box: bars(
      "F5*4 D5*4 Bb4*4",
      "G5*8 F5*4",
      "D5*4 F5*4 Bb5*4",
      "A5*8 -*4",
      "G5*4 Bb5*4 D6*4",
      "C6*8 Bb5*4",
      "A5*4 G5*4 E5*4",
      "F5*8 -*4",
      "F5*4 D5*4 Bb4*4",
      "G5*8 Bb5*4",
      "A5*4 F5*4 D5*4",
      "G5*8 -*4",
      "Eb5*4 G5*4 Bb5*4",
      "A5*4 C6*4 A5*4",
      "Bb5*12",
      "-*12",
    ),
    guitar: bars(
      ...CHORDS.split(" ").map((c) => {
        const [r, a, b] = GUITAR[c] as [string, string, string];
        return `${r}*4 ${a}*2 ${b}*2 ${a}*2 ${b}*2`;
      }),
    ),
    pad: bars(...CHORDS.split(" ").map((c) => chord(PAD[c] as string, 12))),
  },
  order: [{ box: "box", guitar: "guitar", pad: "pad" }],
  loop: 0,
};
