/**
 * 해솔 마당: the campus yard in late afternoon.
 *
 * F major, 84 BPM, a light sixteenth swing. AABA with a two-bar intro; the loop returns to the
 * first A, so the intro plays once.
 *
 * | Section | Bars | Melody | Harmony |
 * |---|---|---|---|
 * | Intro | 2 | the motif on the bell | Fadd9, B♭maj7 |
 * | A  | 8 | the motif on the lead, a sequence a third up, a cadence | Fadd9 B♭maj7 Am7 Dm7 Gm7 C7sus4–C7 F/A–B♭6 Gm7–C7 |
 * | A′ | 8 | the same with a counter line and harp arpeggios, climbing to C6 | ending on C7 for a deceptive turn |
 * | B  | 8 | a flute takes over, the lead rests | Dm9 B♭maj7 Gm9 A7sus4–A7 Dm9 B♭maj7 Gm9 C7sus4–C7 |
 * | A″ | 8 | the motif harmonised in thirds, then a closing phrase that hands back to A | |
 *
 * Stems: `melody` (lead, counter, flute), `base` (keys, harp, bass, kick and rim), `extra`
 * (shaker and bell). Fading `melody` out leaves a bed for menus and dialogue.
 */

import type { SongSource } from "../../tracker/format.ts";
import { quote } from "./motif.ts";
import { arp, bars, chord, rest, times } from "./write.ts";

const ARP = [0, 2, 1, 3];
const half = (notes: string[]) => arp(notes, ARP, 2, 8);
const full = (notes: string[]) => arp(notes, ARP, 2, 16);

// Keys: a hit on the beat and one on the "and" of two; two-chord bars change on beat three.
const k1 = (v: string) => `${chord(v, 6)} ${chord(v, 10)}`;
const k2 = (a: string, b: string) => `${chord(a, 8)} ${chord(b, 8)}`;

const F9 = "A3 C4 G4";
const BB7 = "A3 D4 F4";
const AM7 = "G3 C4 E4";
const DM7 = "F3 A3 C4";
const GM7 = "F3 Bb3 D4";
const C7S = "F3 Bb3 C4";
const C7 = "E3 Bb3 D4";
const FA = "A3 C4 F4";
const BB6 = "G3 Bb3 D4";

const keysA = bars(
  k1(F9),
  k1(BB7),
  k1(AM7),
  k1(DM7),
  k1(GM7),
  k2(C7S, C7),
  k2(FA, BB6),
  k2(GM7, C7),
);

const keysB = bars(
  chord("F3 A3 C4", 16, "v9"),
  chord("F3 Bb3 D4", 16, "v9"),
  chord("F3 Bb3 D4", 16, "v9"),
  `${chord("G3 D4 E4", 8, "v9")} ${chord("G3 C#4 E4", 8, "v9")}`,
  chord("F3 A3 C4", 16, "v9"),
  chord("F3 Bb3 D4", 16, "v9"),
  chord("F3 Bb3 D4", 16, "v9"),
  `${chord(C7S, 8, "v9")} ${chord("E3 Bb3 C4", 8, "v9")}`,
);

const bassA = bars(
  "F2*6 C3*2 F2*4 A2*4",
  "Bb2*6 F2*2 D3*4 Bb2*4",
  "A2*6 E2*2 A2*4 C3*4",
  "D3*6 A2*2 D3*4 A2*4",
  "G2*6 D3*2 G2*4 Bb2*4",
  "C3*6 G2*2 C3*4 Bb2*4",
  "A2*6 C3*2 Bb2*6 D3*2",
  "G2*6 D3*2 C3*6 E2*2",
);

const bassB = bars(
  "D3*12 A2*4",
  "Bb2*12 F2*4",
  "G2*12 Bb2*4",
  "A2*8 C#3*8",
  "D3*12 A2*4",
  "Bb2*12 F2*4",
  "G2*12 Bb2*4",
  "C3*8 E2*8",
);

const leadA = bars(
  quote({ tonic: "F5" }),
  "E5*2 A5*6 G5*2 E5*6",
  "F5*4 C5*8 -*4",
  "Bb4*2 D5*2 F5*4 G5*2 F5*2 D5*4",
  "F5*8 E5*4 -*2 G5*2",
  "A5*6 G5*2 F5*4 D5*4",
  "Bb4*2 C5*2 D5*4 E5*6 -*2",
);

const leadA2 = bars(
  "C5*2 F5*6 E5*2 C5*6",
  "D5*4 A4*8 -*2 C5*2",
  "E5*2 A5*6 G5*2 E5*6",
  "F5*4 C5*8 -*4",
  "Bb4*2 D5*2 F5*4 A5*2 G5*2 F5*4",
  "G5*6 F5*2 E5*4 -*2 G5*2",
  "C6*6 A5*2 G5*4 F5*4",
  "D5*2 E5*2 F5*4 E5*8",
);

const leadA3 = bars(
  "C5*2 F5*6 E5*2 C5*6",
  "D5*4 A4*8 -*4",
  "E5*2 A5*6 G5*2 E5*6",
  "F5*4 C5*8 -*4",
  "Bb4*2 D5*2 F5*4 G5*2 F5*2 D5*4",
  "F5*8 E5*4 -*4",
  "C5*2 F5*6 E5*2 C5*6",
  "D5*4 C5*4 Bb4*4 G4*4",
);

const counterA2 = bars(
  "A4*16",
  "-*4 C4*2 F4*6 D4*4",
  "C5*8 G4*8",
  "A4*16",
  "G4*8 F4*8",
  "Bb4*16",
  "A4*8 Bb4*8",
  "Bb4*8 G4*8",
);

const counterA3 = bars(
  "A4*2 D5*6 C5*2 A4*6",
  "F4*12 -*4",
  "C5*2 E5*6 E5*2 C5*6",
  "D5*4 A4*8 -*4",
  "G4*2 Bb4*2 D5*4 E5*2 D5*2 Bb4*4",
  "Bb4*8 G4*4 -*4",
  "A4*2 C5*6 G4*2 F4*6",
  "Bb4*4 A4*4 G4*4 E4*4",
);

const fluteB = bars(
  "A5*6 G5*2 F5*4 E5*4",
  "D5*12 -*4",
  "Bb5*6 A5*2 G5*4 F5*4",
  "D5*8 C#5*4 E5*4",
  "F5*6 E5*2 D5*4 A5*4",
  "C6*8 Bb5*4 A5*4",
  "G5*6 F5*2 G5*4 Bb5*4",
  "F5*8 E5*4 G5*4",
);

const harpA2 = bars(
  full(["F4", "A4", "C5", "G5"]),
  full(["F4", "A4", "D5", "F5"]),
  full(["E4", "G4", "A4", "C5"]),
  full(["F4", "A4", "C5", "D5"]),
  full(["F4", "G4", "Bb4", "D5"]),
  `${half(["F4", "G4", "Bb4", "C5"])} ${half(["E4", "G4", "Bb4", "C5"])}`,
  `${half(["F4", "A4", "C5", "F5"])} ${half(["F4", "G4", "Bb4", "D5"])}`,
  `${half(["F4", "G4", "Bb4", "D5"])} ${half(["E4", "G4", "Bb4", "C5"])}`,
);

const harpB = bars(
  arp(["D4", "A4", "C5", "E5"], [0, 1, 2, 3], 4, 16),
  "Bb3*4 F4*4 D5*4 A4*4",
  "G3*4 D4*4 F4*4 Bb4*4",
  "A3*4 D4*4 C#4*4 G4*4",
  arp(["D4", "A4", "C5", "E5"], [0, 1, 2, 3], 4, 16),
  "Bb3*4 F4*4 D5*4 A4*4",
  "G3*4 D4*4 F4*4 Bb4*4",
  "C4*4 F4*4 E4*4 Bb4*4",
);

const DRUM = "K*4 R*2 Kv8*6 R*2 Rv5*2";
const FILL = "K*4 R*2 Kv8*2 Rv5*2 Rv6*2 Rv7*2 R*2";
const SHAKE = "Mv4 Mv6 Mv8 Mv5 Mv4 Mv6 Mv8 Mv5 Mv4 Mv6 Mv8 Mv5 Mv4 Mv6 Mv8 Mv5";
const SHAKE_SOFT = "Mv3 Mv4 Mv6 Mv4 Mv3 Mv4 Mv6 Mv4 Mv3 Mv4 Mv6 Mv4 Mv3 Mv4 Mv6 Mv4";

export const hub: SongSource = {
  title: "해솔 마당",
  key: "F major",
  bpm: 84,
  rowsPerBeat: 4,
  beatsPerBar: 4,
  swing: 0.16,
  gain: -2.4,
  reverb: { time: 1.8, damp: 5200, level: 0.9 },
  echo: { beats: 0.75, feedback: 0.3, damp: 3000 },
  instruments: {
    lead: {
      kind: "osc",
      gain: 0.19,
      osc: [
        { wave: "pulse", duty: 0.25 },
        { wave: "pulse", duty: 0.25, detune: 7, gain: 0.5 },
      ],
      env: { a: 0.012, d: 0.5, s: 0.55, r: 0.18 },
      filter: { type: "lp", cutoff: 2600, env: 0.6, decay: 0.15, q: 0.8 },
      vibrato: { rate: 5.2, depth: 0.1, delay: 0.3 },
    },
    flute: {
      kind: "osc",
      gain: 0.19,
      osc: [
        { wave: "tri" },
        { wave: "sine", octave: 1, gain: 0.12 },
        { wave: "noise", gain: 0.025 },
      ],
      env: { a: 0.05, d: 0.4, s: 0.8, r: 0.22 },
      filter: { type: "lp", cutoff: 3000 },
      vibrato: { rate: 4.8, depth: 0.14, delay: 0.35 },
    },
    counter: {
      kind: "osc",
      gain: 0.14,
      osc: [{ wave: "pulse", duty: 0.125 }],
      env: { a: 0.03, d: 0.6, s: 0.45, r: 0.25 },
      filter: { type: "lp", cutoff: 1900 },
      vibrato: { rate: 4.5, depth: 0.08, delay: 0.4 },
    },
    keys: {
      kind: "fm",
      gain: 0.13,
      ratio: 1,
      index: 1.8,
      indexSustain: 0.25,
      indexDecay: 0.35,
      env: { a: 0.004, d: 1.8, s: 0.22, r: 0.35 },
      chorus: 5,
    },
    harp: { kind: "pluck", gain: 0.35, decay: 1.1, brightness: 0.45 },
    bass: {
      kind: "osc",
      gain: 0.22,
      osc: [{ wave: "tri" }, { wave: "pulse", duty: 0.5, gain: 0.15 }],
      env: { a: 0.008, d: 0.3, s: 0.85, r: 0.08 },
      filter: { type: "lp", cutoff: 1100 },
    },
    bell: {
      kind: "fm",
      gain: 0.09,
      ratio: 3,
      index: 2.4,
      indexDecay: 0.12,
      env: { a: 0.002, d: 1.3, s: 0, r: 0.6 },
    },
    kit: {
      kind: "kit",
      gain: 0.32,
      pieces: { K: { gain: 0.9, tune: 0.95 }, R: { gain: 0.45 }, M: { gain: 2.5 } },
    },
  },
  channels: [
    { name: "lead", instrument: "lead", stem: "melody", pan: 0.05, reverb: 0.25, delay: 0.12 },
    { name: "counter", instrument: "counter", stem: "melody", pan: -0.35, reverb: 0.3, delay: 0.2 },
    { name: "flute", instrument: "flute", stem: "melody", pan: -0.05, reverb: 0.3, delay: 0.1 },
    { name: "keys", instrument: "keys", stem: "base", pan: -0.2, reverb: 0.3 },
    { name: "harp", instrument: "harp", stem: "base", pan: 0.35, reverb: 0.2, delay: 0.08 },
    { name: "bass", instrument: "bass", stem: "base", reverb: 0.05 },
    { name: "drums", instrument: "kit", stem: "base", reverb: 0.12 },
    { name: "shaker", instrument: "kit", stem: "extra", pan: 0.25, reverb: 0.1 },
    { name: "bell", instrument: "bell", stem: "extra", pan: 0.3, reverb: 0.4, delay: 0.3 },
  ],
  phrases: {
    r2: rest(2),
    r8: rest(8),
    keysI: bars(chord(F9, 16), chord(BB7, 16)),
    harpI: bars(full(["F4", "A4", "C5", "G5"]), full(["F4", "A4", "D5", "F5"])),
    bassI: bars("F2v9*16", "Bb2v9*12 C3*4"),
    bellI: quote({ tonic: "F6" }),
    shakeI: bars("-*16", SHAKE_SOFT),
    keysA,
    keysB,
    bassA,
    bassB,
    leadA,
    leadA2,
    leadA3,
    counterA2,
    counterA3,
    fluteB,
    harpA2,
    harpB,
    drumsA: times(DRUM, 8),
    drumsA2: bars(times(DRUM, 7), FILL),
    drumsA3: bars(times(DRUM, 7), "K*4 R*2 Kv8*6 R*2 Rv6 Rv7"),
    drumsB: times("Kv9*8 Rv6*8", 8),
    shakeA: times(SHAKE, 8),
    shakeB: times(SHAKE_SOFT, 8),
    bellA: bars("-*16", "-*12 D6*2 A5*2", "-*16", "-*12 F6*2 C6*2", "-*16", "-*16", "-*16", "-*16"),
    bellB: bars("-*16", "-*12 F6*4", "-*16", "-*16", "-*16", "-*12 D6*4", "-*16", "-*16"),
  },
  sections: { 0: "intro", 1: "A", 2: "A′", 3: "B", 4: "A″" },
  order: [
    { keys: "keysI", harp: "harpI", bass: "bassI", bell: "bellI", shaker: "shakeI" },
    {
      lead: "leadA",
      counter: "r8",
      keys: "keysA",
      harp: "r8",
      bass: "bassA",
      drums: "drumsA",
      shaker: "shakeA",
      bell: "bellA",
    },
    {
      lead: "leadA2",
      counter: "counterA2",
      keys: "keysA",
      harp: "harpA2",
      bass: "bassA",
      drums: "drumsA2",
      shaker: "shakeA",
      bell: "r8",
    },
    {
      lead: "r8",
      counter: "r8",
      flute: "fluteB",
      keys: "keysB",
      harp: "harpB",
      bass: "bassB",
      drums: "drumsB",
      shaker: "shakeB",
      bell: "bellB",
    },
    {
      lead: "leadA3",
      counter: "counterA3",
      flute: "r8",
      keys: "keysA",
      harp: "harpA2",
      bass: "bassA",
      drums: "drumsA3",
      shaker: "shakeA",
      bell: "bellA",
    },
  ],
  loop: 1,
};
