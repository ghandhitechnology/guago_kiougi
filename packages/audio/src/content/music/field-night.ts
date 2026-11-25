/**
 * 운동장 23:40: the sports field at night with a rift open on it. Uneasy wonder.
 *
 * F minor, 72 BPM. The school motif comes back slowed to half speed and bent: in harmonic minor
 * its major seventh becomes a leading tone, the third note glides down instead of stepping, the
 * last note sags flat, and the second time its rising fourth is stretched into a tritone. In B the
 * era behind the rift leaks in: a reed line in C phrygian over a drone and a frame drum. The last
 * section plays the motif once unbent, faint, on glass: the school, far away.
 *
 * | Section | Bars | What happens | Harmony |
 * |---|---|---|---|
 * | Intro | 4 | drone, heartbeat, whole-tone harp | F+C, augmented colours |
 * | A  | 8 | the motif bent, twice | Fm(add9) Fm D♭maj7♯11 ×2 B♭m9 ×2 C7♭9 C7♯5 |
 * | B  | 8 | phrygian reed melody, frame drum | C drone, D♭ in bars 5–6 |
 * | A2 | 8 | the motif in lydian colours on glass, the bent lead below | D♭maj7 ×2 B♭m9 ×2 G♭maj7♯11 ×3 C7sus4 |
 * | A′ | 4 | the motif unbent | F+C |
 *
 * The loop returns to A. Stems: `base` (drone, heartbeat, harp), `melody` (bent lead, reed,
 * glass), `extra` (frame drum).
 */

import type { SongSource } from "../../tracker/format.ts";
import { quote } from "./motif.ts";
import { bars, chord, rest, times } from "./write.ts";

/** Three notes cycling against sixteen rows: a figure that never lands on the same beat twice. */
const cycle = (notes: string, rows = 16) => {
  const n = notes.split(" ");
  return Array.from({ length: rows }, (_, i) => n[i % n.length]).join(" ");
};

const drone = (notes: string, barsCount: number) => chord(notes, barsCount * 16);

export const fieldNight: SongSource = {
  title: "운동장 23:40",
  key: "F minor",
  bpm: 72,
  rowsPerBeat: 4,
  beatsPerBar: 4,
  gain: 1.6,
  reverb: { time: 3.2, damp: 4200, level: 1 },
  echo: { beats: 0.75, feedback: 0.45, damp: 2600 },
  instruments: {
    drone: {
      kind: "osc",
      gain: 0.042,
      osc: [
        { wave: "saw", detune: -6 },
        { wave: "saw", detune: 6 },
        { wave: "tri", octave: -1, gain: 0.6 },
      ],
      env: { a: 3, d: 2, s: 0.9, r: 4 },
      filter: { type: "lp", cutoff: 480, q: 1.4 },
    },
    warp: {
      kind: "osc",
      gain: 0.08,
      osc: [
        { wave: "pulse", duty: 0.25 },
        { wave: "pulse", duty: 0.25, detune: 14, gain: 0.7 },
      ],
      env: { a: 0.08, d: 0.8, s: 0.7, r: 0.7 },
      filter: { type: "lp", cutoff: 1700, q: 1 },
      vibrato: { rate: 3.5, depth: 0.18, delay: 0.15 },
    },
    glass: {
      kind: "fm",
      gain: 0.075,
      ratio: 2.76,
      index: 1.4,
      indexSustain: 0.2,
      indexDecay: 0.8,
      env: { a: 0.003, d: 2.8, s: 0, r: 1.8 },
      chorus: 7,
    },
    harp: { kind: "pluck", gain: 0.12, decay: 2.2, brightness: 0.65 },
    reed: {
      kind: "osc",
      gain: 0.075,
      osc: [
        { wave: "pulse", duty: 0.25 },
        { wave: "saw", gain: 0.35 },
      ],
      env: { a: 0.03, d: 0.3, s: 0.8, r: 0.25 },
      filter: { type: "lp", cutoff: 2000, q: 3 },
      vibrato: { rate: 5.5, depth: 0.12, delay: 0.2 },
    },
    kit: {
      kind: "kit",
      gain: 0.29,
      pieces: {
        K: { tune: 0.72, decay: 1.6 },
        L: { gain: 0.8, tune: 0.9 },
        T: { gain: 0.6, tune: 0.85 },
        Y: { gain: 0.35, decay: 2 },
      },
    },
  },
  channels: [
    { name: "drone", instrument: "drone", stem: "base", reverb: 0.3 },
    { name: "heart", instrument: "kit", stem: "base", reverb: 0.25 },
    { name: "harp", instrument: "harp", stem: "base", pan: 0.3, reverb: 0.35, delay: 0.4 },
    { name: "warp", instrument: "warp", stem: "melody", pan: -0.1, reverb: 0.4, delay: 0.25 },
    { name: "reed", instrument: "reed", stem: "melody", pan: 0.1, reverb: 0.35, delay: 0.15 },
    { name: "glass", instrument: "glass", stem: "melody", pan: 0.2, reverb: 0.55, delay: 0.35 },
    { name: "frame", instrument: "kit", stem: "extra", pan: -0.25, reverb: 0.4 },
  ],
  phrases: {
    r4: rest(4),
    r8: rest(8),
    droneI: drone("F2 C3", 4),
    harpI: bars(cycle("F4 A4 C#5"), cycle("F4 A4 C#5"), cycle("G4 B4 D#5"), cycle("G4 B4 D#5")),
    heartI: times("K*3 Kv6*13", 4),
    glassI: bars("-*16", "-*16", "-*16", "-*8 B5*8"),

    droneA: bars(
      drone("F2 C3 Ab3", 2),
      drone("Db2 Ab2 F3", 2),
      drone("Bb1 F2 Db3", 2),
      drone("C2 E3 Bb3", 1),
      drone("C2 E3 Ab3", 1),
    ),
    warpA: bars(
      "C5*4 F5~44*12",
      "E5*4 C5p06*12",
      "Db5*8 Ab4*8",
      ".d01*8 -*8",
      "C5*4 Gb5~44*12",
      "F5*4 Db5p06*12",
      "Db5*8 Ab4*8",
      ".d02*8 -*8",
    ),
    harpA: bars(
      cycle("F4 C5 G5"),
      cycle("Ab4 C5 G5"),
      cycle("F4 C5 G5"),
      cycle("F4 C5 G5"),
      cycle("Bb3 Db4 Ab4"),
      cycle("Bb3 F4 Ab4"),
      cycle("E4 Bb4 Db5"),
      cycle("C4 E4 Ab4"),
    ),
    glassA: bars("-*16", "-*16", "-*16", "-*8 C6*4 F6*4", "-*16", "-*16", "-*16", "-*8 E6*4 C6*4"),
    heartA: times("K*3 Kv6*13", 8),

    droneB: bars(drone("C2 C3", 4), drone("Db2 Db3", 2), drone("C2 C3", 2)),
    reedB: bars(
      "C5*6 Db5*2 C5*4 Bb4*4",
      "Ab4*4 Bb4*4 C5*8",
      "Eb5*6 Db5*2 C5*4 Db5*4",
      "C5*12 -*4",
      "Ab5*6 F5*2 Eb5*4 Db5*4",
      "Eb5*4 Db5*4 C5*4 Bb4*4",
      "Ab4*6 Bb4*2 C5*4 Db5*4",
      "C5*12 -*4",
    ),
    frameB: bars(
      "-*16",
      "-*16",
      times("Lv8*3 Lv5*3 Tv6*2 Lv7*3 Lv5*3 Tv5*2", 5),
      "Lv8*3 Lv5*3 Tv6*2 Lv7*4 Y*4",
    ),
    glassB: bars("-*16", "-*16", "-*16", "-*12 G5*4", "-*16", "-*16", "-*16", "-*12 C6*4"),
    heartB: times("Kv7*16", 8),

    droneA2: bars(
      drone("Db2 Ab2 F3", 2),
      drone("Bb1 F2 Db3", 2),
      drone("Gb1 Db2 Bb2", 3),
      drone("C2 G2 F3", 1),
    ),
    glassA2: bars(quote({ tonic: "Ab5", stretch: 2 }), quote({ tonic: "Db6", stretch: 2 })),
    warpA2: bars("F4*24 Ab4p04*8", "Bb4*24 Ab4p04*8", "Db5*40 Bb4p04*8", "C5*16"),
    harpA2: bars(
      cycle("Db4 Ab4 C5"),
      cycle("F4 Ab4 C5"),
      cycle("Bb3 F4 Ab4"),
      cycle("Bb3 F4 Ab4"),
      cycle("Gb3 Db4 F4"),
      cycle("Gb3 Db4 F4"),
      cycle("Gb3 Db4 F4"),
      cycle("C4 F4 Bb4"),
    ),
    heartA2: times("K*3 Kv6*13", 8),

    droneO: drone("F2 C3", 4),
    glassO: quote({ tonic: "F5", stretch: 2 }),
    heartO: times("Kv6*3 Kv4*13", 4),
  },
  sections: { 0: "intro", 1: "A", 2: "B", 3: "A2", 4: "A′" },
  order: [
    { drone: "droneI", harp: "harpI", heart: "heartI", glass: "glassI" },
    { drone: "droneA", warp: "warpA", harp: "harpA", glass: "glassA", heart: "heartA" },
    {
      drone: "droneB",
      warp: "r8",
      reed: "reedB",
      harp: "r8",
      frame: "frameB",
      glass: "glassB",
      heart: "heartB",
    },
    {
      drone: "droneA2",
      reed: "r8",
      glass: "glassA2",
      warp: "warpA2",
      harp: "harpA2",
      frame: "r8",
      heart: "heartA2",
    },
    { drone: "droneO", warp: "r4", glass: "glassO", harp: "r4", heart: "heartO" },
  ],
  loop: 1,
};
