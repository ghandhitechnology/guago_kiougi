/**
 * 23:40: the title screen. Night on the island, sea wind, a school whose lights never go off.
 *
 * D dorian, 96 BPM. A restless sixteenth-note pulse (the ticking) runs under everything; the hook
 * is a 3+3+2 figure that climbs to the dorian B natural, the note that makes the night feel open
 * rather than sad. The bell plays the school motif in the intro and again in B, so the title
 * already carries the campus theme.
 *
 * | Section | Bars | What happens | Harmony |
 * |---|---|---|---|
 * | Intro | 4 | wind, the pulse fades in, the motif on the bell | Dm9 G7 B♭maj7 A7sus4–A7 |
 * | A  | 8 | the hook | Dm9 C Dm9 G B♭maj7 C A7sus4 A7 |
 * | B  | 8 | long lead tones over lydian B♭, the motif again on the bell | B♭maj7♯11 ×2, Gm9 ×2, Dm9 G7 B♭maj7 A7sus4–A7 |
 * | A′ | 8 | the hook with a harmony in sixths, octave bass and hats | as A |
 * | Outro | 4 | the hook's tail, the drums leave | Dm9 C B♭maj7 A7sus4–A7 |
 *
 * The loop returns to A. Stems: `base` (pulse, pad, bass, wind, drums), `melody` (lead,
 * harmony, bell), `extra` (hats).
 */

import type { SongSource } from "../../tracker/format.ts";
import { quote } from "./motif.ts";
import { bars, chord, rest, times } from "./write.ts";

/** A four-note sixteenth cell, four times a bar or twice for half a bar. */
const cell = (notes: string, n = 4, vol = "") =>
  Array.from({ length: n }, () =>
    notes
      .split(" ")
      .map((x) => `${x}${vol}`)
      .join(" "),
  ).join(" ");

const DM9 = "D4 A4 E4 F4";
const C = "C4 G4 D4 E4";
const G = "B3 G4 D4 A4";
const G7 = "B3 F4 D4 G4";
const BB = "D4 A4 F4 C5";
const BB11 = "D4 A4 E4 C5";
const GM9 = "Bb3 F4 D4 A4";
const A7S = "A3 E4 B3 D4";
const A7 = "A3 E4 B3 C#4";

const tickA = bars(cell(DM9), cell(C), cell(DM9), cell(G), cell(BB), cell(C), cell(A7S), cell(A7));

const padChords = {
  dm: "F3 A3 C4",
  c: "E3 G3 C4",
  g: "D3 G3 B3",
  g7: "D3 F3 B3",
  bb: "D3 F3 Bb3",
  bb11: "D3 F3 A3",
  gm: "F3 Bb3 D4 A4",
  a7s: "E3 G3 D4",
  a7: "E3 G3 C#4",
};
const pad = (name: keyof typeof padChords, rows = 16) => chord(padChords[name], rows);

const padA = bars(
  pad("dm"),
  pad("c"),
  pad("dm"),
  pad("g"),
  pad("bb"),
  pad("c"),
  pad("a7s"),
  pad("a7"),
);

const hook = bars(
  "D5*3 D5*3 E5*2 F5*4 A5*4",
  "G5*6 F5*2 E5*4 C5*4",
  "D5*3 D5*3 E5*2 F5*4 C6*4",
  "B5*8 A5*4 -*4",
  "F5*3 F5*3 G5*2 A5*4 F5*4",
  "E5*6 D5*2 C5*4 G4*4",
  "A4*4 D5*8 E5*4",
  "C#5*12 -*4",
);

const harmony = bars(
  "F4*3 F4*3 G4*2 A4*4 C5*4",
  "B4*6 A4*2 G4*4 E4*4",
  "F4*3 F4*3 G4*2 A4*4 E5*4",
  "D5*8 B4*4 -*4",
  "A4*3 A4*3 Bb4*2 C5*4 A4*4",
  "G4*6 F4*2 E4*4 E4*4",
  "E4*4 A4*8 B4*4",
  "E4*12 -*4",
);

const leadB = bars(
  "D5*8 E5*8",
  "A5*12 -*4",
  "G5*8 F5*4 D5*4",
  "A5*12 -*4",
  "-*16",
  "-*16",
  "F5*8 A5*8",
  "G5*8 E5*4 C#5*4",
);

const leadOutro = bars("D5*3 D5*3 E5*2 F5*8", "E5*8 C5*8", "D5*16", "-*16");

export const title: SongSource = {
  title: "23:40",
  key: "D dorian",
  bpm: 96,
  rowsPerBeat: 4,
  beatsPerBar: 4,
  gain: -1.8,
  reverb: { time: 2.4, damp: 4800, level: 1 },
  echo: { beats: 0.75, feedback: 0.4, damp: 2800 },
  instruments: {
    tick: {
      kind: "osc",
      gain: 0.2,
      osc: [{ wave: "pulse", duty: 0.125 }],
      env: { a: 0.002, d: 0.09, s: 0, r: 0.05 },
      filter: { type: "lp", cutoff: 4200 },
    },
    pad: {
      kind: "osc",
      gain: 0.05,
      osc: [
        { wave: "saw", detune: -8 },
        { wave: "saw", detune: 8 },
        { wave: "pulse", duty: 0.4, pwm: { depth: 0.15, rate: 0.3 }, octave: -1, gain: 0.5 },
      ],
      env: { a: 1.2, d: 1, s: 0.85, r: 1.5 },
      filter: { type: "lp", cutoff: 1100, q: 0.9 },
    },
    lead: {
      kind: "osc",
      gain: 0.125,
      osc: [
        { wave: "pulse", duty: 0.5 },
        { wave: "pulse", duty: 0.5, detune: 6, gain: 0.6 },
      ],
      env: { a: 0.015, d: 0.6, s: 0.65, r: 0.3 },
      filter: { type: "lp", cutoff: 2300, env: 0.5, decay: 0.25 },
      vibrato: { rate: 5, depth: 0.15, delay: 0.25 },
    },
    harmony: {
      kind: "osc",
      gain: 0.1,
      osc: [{ wave: "pulse", duty: 0.25 }],
      env: { a: 0.02, d: 0.6, s: 0.6, r: 0.3 },
      filter: { type: "lp", cutoff: 1800 },
      vibrato: { rate: 5, depth: 0.1, delay: 0.3 },
    },
    bell: {
      kind: "fm",
      gain: 0.07,
      ratio: 3,
      index: 2.2,
      indexDecay: 0.15,
      env: { a: 0.002, d: 2.2, s: 0, r: 1.2 },
    },
    bass: {
      kind: "osc",
      gain: 0.15,
      osc: [
        { wave: "pulse", duty: 0.5 },
        { wave: "tri", gain: 0.8 },
      ],
      env: { a: 0.01, d: 0.5, s: 0.75, r: 0.2 },
      filter: { type: "lp", cutoff: 650 },
    },
    wind: {
      kind: "osc",
      gain: 0.55,
      osc: [{ wave: "noise" }],
      env: { a: 2.5, d: 1, s: 1, r: 3 },
      filter: { type: "bp", cutoff: 700, q: 1.6, track: 1 },
    },
    kit: {
      kind: "kit",
      gain: 0.32,
      pieces: { S: { gain: 1, decay: 1.4 }, H: { gain: 2.5 }, Y: { gain: 0.5, decay: 1.5 } },
    },
  },
  channels: [
    { name: "tick", instrument: "tick", stem: "base", pan: 0.15, reverb: 0.25, delay: 0.45 },
    { name: "pad", instrument: "pad", stem: "base", reverb: 0.4 },
    { name: "bass", instrument: "bass", stem: "base", reverb: 0.05 },
    { name: "wind", instrument: "wind", stem: "base", pan: -0.3, reverb: 0.3 },
    { name: "drums", instrument: "kit", stem: "base", reverb: 0.35 },
    { name: "lead", instrument: "lead", stem: "melody", reverb: 0.3, delay: 0.18 },
    { name: "harmony", instrument: "harmony", stem: "melody", pan: -0.3, reverb: 0.3, delay: 0.1 },
    { name: "bell", instrument: "bell", stem: "melody", pan: 0.3, reverb: 0.5, delay: 0.3 },
    { name: "hats", instrument: "kit", stem: "extra", pan: 0.2, reverb: 0.15 },
  ],
  phrases: {
    r4: rest(4),
    r8: rest(8),
    tickI: bars(
      cell(DM9, 4, "v3"),
      cell(G7, 4, "v5"),
      cell(BB, 4, "v7"),
      `${cell(A7S, 2)} ${cell(A7, 2)}`,
    ),
    padI: bars(pad("dm"), pad("g7"), pad("bb"), `${pad("a7s", 8)} ${pad("a7", 8)}`),
    bassI: "D2v8*16 | G1v8*16 | Bb1v8*16 | A1*16",
    windI: "C5v8*32 G4v6*32",
    bellI: bars(quote({ tonic: "D6", mode: "dorian" }), "-*16", "-*16"),
    tickA,
    padA,
    bassA: bars(
      "D2*12 A2*4",
      "C2*12 G2*4",
      "D2*12 A2*4",
      "G2*12 D2*4",
      "Bb1*12 F2*4",
      "C2*12 G2*4",
      "A1*16",
      "A1*12 E2*4",
    ),
    bassA2: bars(
      "D2*2 D3*2 D2*2 D3*2 D2*2 D3*2 A2*2 C3*2",
      "C2*2 C3*2 C2*2 C3*2 C2*2 C3*2 G2*2 C3*2",
      "D2*2 D3*2 D2*2 D3*2 D2*2 D3*2 A2*2 F2*2",
      "G2*2 G3*2 G2*2 G3*2 G2*2 G3*2 D3*2 C3*2",
      "Bb1*2 Bb2*2 Bb1*2 Bb2*2 Bb1*2 Bb2*2 F2*2 Bb2*2",
      "C2*2 C3*2 C2*2 C3*2 C2*2 C3*2 G2*2 E2*2",
      "A1*2 A2*2 A1*2 A2*2 A1*2 A2*2 E2*2 G2*2",
      "A1*2 A2*2 A1*2 A2*2 C#2*2 E2*2 G2*2 E2*2",
    ),
    windA: "D4v4*64 F4v5*64",
    hook,
    harmony,
    bellA2: bars(
      "-*16",
      "-*16",
      "-*16",
      "-*12 D6*2 A5*2",
      "-*16",
      "-*16",
      "-*16",
      "-*12 E6*2 C#6*2",
    ),
    drumsA: bars(times("K*8 Sv6*8", 7), "K*8 Sv6*4 Sv7*2 Sv8*2"),
    drumsA2: bars(times("K*6 Kv7*2 S*8", 7), "K*6 Kv7*2 S*4 Sv7*2 Sv9*2"),
    hatsA: times("Hv6*2 Hv4*2 Hv8*2 Hv4*2 Hv6*2 Hv4*2 Hv8*2 Hv4*2", 8),
    hatsA2: times("Hv9 Hv5 Hv7 Hv5 Hv9 Hv5 Hv7 Hv6 Hv9 Hv5 Hv7 Hv5 Hv9 Hv5 Hv7 Hv6", 8),
    tickB: bars(
      cell(BB11),
      cell(BB11),
      cell(GM9),
      cell(GM9),
      cell(DM9),
      cell(G7),
      cell(BB),
      `${cell(A7S, 2)} ${cell(A7, 2)}`,
    ),
    padB: bars(
      pad("bb11"),
      pad("bb11"),
      pad("gm"),
      pad("gm"),
      pad("dm"),
      pad("g7"),
      pad("bb"),
      `${pad("a7s", 8)} ${pad("a7", 8)}`,
    ),
    bassB: bars(
      "Bb1*16",
      "Bb1*12 F2*4",
      "G1*16",
      "G1*12 D2*4",
      "D2*16",
      "G1*12 B1*4",
      "Bb1*16",
      "A1*8 A1*8",
    ),
    windB: "A4v7*64 E4v6*64",
    leadB,
    bellB: bars(
      "-*16",
      "-*16",
      "-*16",
      "-*16",
      quote({ tonic: "D6", mode: "dorian" }),
      "-*16",
      "-*16",
    ),
    drumsB: bars("Y,Kv8*16", "-*16", "Kv7*16", "-*16", "-*16", "-*16", "Kv7*16", "Kv6*8 Sv5*8"),
    tickO: bars(
      cell(DM9),
      cell(C, 4, "v6"),
      cell(BB, 4, "v5"),
      `${cell(A7S, 2, "v4")} ${cell(A7, 2, "v5")}`,
    ),
    padO: bars(pad("dm"), pad("c"), pad("bb"), `${pad("a7s", 8)} ${pad("a7", 8)}`),
    bassO: "D2*16 | C2*16 | Bb1*16 | A1*8 A1*8",
    windO: "C5v7*64",
    leadOutro,
    drumsO: "Kv6*16 | -*16 | Kv5*16 | -*16",
  },
  sections: { 0: "intro", 1: "A", 2: "B", 3: "A′", 4: "outro" },
  order: [
    { tick: "tickI", pad: "padI", bass: "bassI", wind: "windI", bell: "bellI" },
    {
      tick: "tickA",
      pad: "padA",
      bass: "bassA",
      wind: "windA",
      drums: "drumsA",
      lead: "hook",
      harmony: "r8",
      bell: "r8",
      hats: "hatsA",
    },
    {
      tick: "tickB",
      pad: "padB",
      bass: "bassB",
      wind: "windB",
      drums: "drumsB",
      lead: "leadB",
      bell: "bellB",
      hats: "r8",
    },
    {
      tick: "tickA",
      pad: "padA",
      bass: "bassA2",
      wind: "windA",
      drums: "drumsA2",
      lead: "hook",
      harmony: "harmony",
      bell: "bellA2",
      hats: "hatsA2",
    },
    {
      tick: "tickO",
      pad: "padO",
      bass: "bassO",
      wind: "windO",
      drums: "drumsO",
      lead: "leadOutro",
      harmony: "r4",
      bell: "r4",
      hats: "r4",
    },
  ],
  loop: 1,
};
