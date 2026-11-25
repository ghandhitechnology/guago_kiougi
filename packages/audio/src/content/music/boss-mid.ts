/**
 * 중간 보스: one theme for both Page 1 mid-bosses, with a variation layer for each.
 *
 * E minor, 132 BPM, a triplet shuffle (three rows a beat). The boss line is stern and climbing;
 * in B the school motif answers it, broad, in harmonic minor (B E D♯ B C G), then a fourth higher
 * over the phrygian F.
 *
 * Variations, as stems the game turns on for one boss:
 * - `pythagoras`: four pure voices on the chord root at harmonics 1, 2, 3 and 4 (root, octave,
 *   twelfth, double octave), playing 1, 2, 3 and 4 notes a bar. Whole-number rhythms on
 *   whole-number pitches: the school's own creed, sounding.
 * - `zeno`: a line that climbs the chord toward its octave in phrases of 48, 24, 12 and 6 rows,
 *   each half the last, and stops one note short every time.
 *
 * `audio.music("boss-mid", { stems: { zeno: 0 } })` for 피타고라스 학파,
 * `{ stems: { pythagoras: 0 } }` for 제논.
 *
 * | Section | Bars | What happens | Harmony |
 * |---|---|---|---|
 * | Intro | 2 | bass gallop, cymbal | Em Em |
 * | A | 8 | the boss line | Em Em C D Em Em C B |
 * | B | 8 | the school motif answers, half-time drums | Em B C C Am E F B |
 * | C | 8 | boss line and motif head trade bars | Em Em B B Em Em C B |
 * | D | 8 | breakdown on an E pedal, a snare build | Em ×6 C B |
 */

import type { SongSource } from "../../tracker/format.ts";
import { noteName, noteNumber } from "../../tracker/parse.ts";
import { quote } from "./motif.ts";
import { bars, chord, rest, times } from "./write.ts";

const ROWS = 12;

/** Root (octave 2) and triad of each chord. */
const CHORDS: Record<string, { root: string; triad: [number, number, number] }> = {
  Em: { root: "E2", triad: [0, 3, 7] },
  B: { root: "B1", triad: [0, 4, 7] },
  Bsus: { root: "B1", triad: [0, 5, 7] },
  C: { root: "C2", triad: [0, 4, 7] },
  D: { root: "D2", triad: [0, 4, 7] },
  G: { root: "G2", triad: [0, 4, 7] },
  Am: { root: "A1", triad: [0, 3, 7] },
  E: { root: "E2", triad: [0, 4, 7] },
  F: { root: "F2", triad: [0, 4, 7] },
};
const root = (c: string) => noteNumber(CHORDS[c]?.root as string) as number;
const n = (midi: number) => noteName(midi, true);

/** Tetractys: four voices on harmonics 1, 2, 3, 4 of the root, 1, 2, 3 and 4 notes a bar. */
function tetractys(chords: string, voice: 1 | 2 | 3 | 4): string {
  const shift = [0, 0, 12, 19, 24][voice] as number;
  return bars(
    ...chords.split(" ").map((c) => {
      const note = n(root(c) + 12 + shift);
      return Array.from({ length: voice }, () => `${note}*${ROWS / voice}`).join(" ");
    }),
  );
}

/**
 * Zeno: every eight bars, four phrases of six notes climbing the chord's tones toward its octave,
 * each phrase half as long as the last (8, 4, 2, 1 rows a note), then a breath. Never arrives.
 * A note held over a bar line glides, without a new attack, to the same step of the next chord.
 */
function zeno(chords: string): string {
  const list = chords.split(" ");
  const step = (row: number, k: number) => {
    const c = list[Math.floor(row / ROWS)] as string;
    const { triad } = CHORDS[c] as (typeof CHORDS)[string];
    const ladder = [...triad.map((s) => s + 12), ...triad.map((s) => s + 24)];
    return n(root(c) + 12 + (ladder[k] as number));
  };
  const out: string[] = [];
  let row = 0;
  for (const each of [8, 4, 2, 1]) {
    for (let k = 0; k < 6; k++) {
      let left = each;
      let first = true;
      while (left > 0) {
        if (row > 0 && row % ROWS === 0) out.push("|");
        const room = Math.min(left, ROWS - (row % ROWS));
        out.push(`${step(row, k)}${first ? "" : "p00"}*${room}`);
        first = false;
        left -= room;
        row += room;
      }
    }
  }
  while (row < list.length * ROWS) {
    if (row % ROWS === 0) out.push("|");
    const room = ROWS - (row % ROWS);
    out.push(`-*${room}`);
    row += room;
  }
  return out.join(" ");
}

const gallop = (c: string) => {
  const r = root(c);
  const lo = n(r);
  const hi = n(r + 12);
  return `${lo}*2 ${hi} ${lo}*2 ${hi} ${lo}*2 ${hi} ${lo}*2 ${n(r + 10)}`;
};
const padChord = (c: string) => {
  const { triad } = CHORDS[c] as (typeof CHORDS)[string];
  return chord(triad.map((s) => n(root(c) + 12 + s)).join(" "), ROWS);
};
const each = (chords: string, f: (c: string) => string) => bars(...chords.split(" ").map(f));

const A = "Em Em C D Em Em C B";
const B = "Em B C C Am E F B";
const C = "Em Em Bsus B Em Em C B";
const D = "Em Em Em Em Em Em C B";

const leadA = bars(
  "B4*3 E5*6 G5*3",
  "F#5*3 E5*3 D5*2 E5 B4*3",
  "C5*3 E5*6 G5*3",
  "F#5*6 D5*3 A4*3",
  "B4*3 E5*6 B5*3",
  "A5*3 G5*3 F#5*2 G5 E5*3",
  "E5*3 G5*3 C6*6",
  "B5*3 A5*3 F#5*3 D#5*3",
);

const leadC = bars(
  "B4*3 E5*6 G5*3",
  "F#5*3 E5*3 D5*2 E5 B4*3",
  "-*12",
  "-*12",
  "E5*3 G5*6 B5*3",
  "A5*3 G5*3 F#5*2 G5 E5*3",
  "-*12",
  "-*12",
);

/** The school motif in E harmonic minor, then a fourth higher in A harmonic minor. */
const motifB = bars(
  quote({ tonic: "E5", mode: "harmonic", stretch: 1.5 }),
  quote({ tonic: "A5", mode: "harmonic", stretch: 1.5 }),
);

const bellC = bars(
  "-*12",
  "-*12",
  "B4*3 E5*9",
  "D#5*3 B4*9",
  "-*12",
  "-*12",
  "G4*3 C5*9",
  "F#4*12",
);

const GROOVE = "K,H*2 Hv5 S,H*2 Hv5 K,H*2 K S,H*2 Hv6";

export const bossMid: SongSource = {
  title: "중간 보스",
  key: "E minor",
  bpm: 132,
  rowsPerBeat: 3,
  beatsPerBar: 4,
  speed: 6,
  gain: -2,
  reverb: { time: 1.6, damp: 5000, level: 0.8 },
  echo: { beats: 1, feedback: 0.25, damp: 3000 },
  instruments: {
    lead: {
      kind: "osc",
      gain: 0.12,
      osc: [
        { wave: "pulse", duty: 0.25 },
        { wave: "pulse", duty: 0.25, detune: 8, gain: 0.6 },
      ],
      env: { a: 0.01, d: 0.3, s: 0.7, r: 0.12 },
      filter: { type: "lp", cutoff: 3000, env: 0.6, decay: 0.12 },
      vibrato: { rate: 6, depth: 0.12, delay: 0.2 },
    },
    brass: {
      kind: "osc",
      gain: 0.11,
      osc: [
        { wave: "saw", detune: -6 },
        { wave: "saw", detune: 6 },
        { wave: "pulse", duty: 0.5, octave: -1, gain: 0.4 },
      ],
      env: { a: 0.03, d: 0.4, s: 0.75, r: 0.2 },
      filter: { type: "lp", cutoff: 1800, env: 0.7, decay: 0.2 },
      vibrato: { rate: 5, depth: 0.08, delay: 0.3 },
    },
    bell: {
      kind: "fm",
      gain: 0.16,
      ratio: 3,
      index: 2.2,
      indexDecay: 0.15,
      env: { a: 0.002, d: 1.6, s: 0, r: 0.8 },
    },
    bass: {
      kind: "osc",
      gain: 0.13,
      osc: [
        { wave: "pulse", duty: 0.5 },
        { wave: "tri", gain: 0.8 },
      ],
      env: { a: 0.004, d: 0.15, s: 0.6, r: 0.05 },
      filter: { type: "lp", cutoff: 900, env: 0.8, decay: 0.06 },
    },
    pad: {
      kind: "osc",
      gain: 0.035,
      osc: [
        { wave: "saw", detune: -8 },
        { wave: "saw", detune: 8 },
      ],
      env: { a: 0.3, d: 0.5, s: 0.8, r: 0.5 },
      filter: { type: "lp", cutoff: 1100, q: 0.9 },
    },
    pure: {
      kind: "osc",
      gain: 0.2,
      osc: [{ wave: "sine" }, { wave: "tri", gain: 0.25 }],
      env: { a: 0.002, d: 0.35, s: 0, r: 0.1 },
    },
    arrow: {
      kind: "osc",
      gain: 0.18,
      osc: [{ wave: "pulse", duty: 0.125 }],
      env: { a: 0.002, d: 0.18, s: 0.3, r: 0.05 },
      filter: { type: "lp", cutoff: 4000 },
    },
    kit: {
      kind: "kit",
      gain: 0.29,
      pieces: { H: { gain: 2 }, S: { gain: 0.9 }, Y: { gain: 0.5 } },
    },
  },
  channels: [
    { name: "bass", instrument: "bass", stem: "base", reverb: 0.05 },
    { name: "pad", instrument: "pad", stem: "base", reverb: 0.35 },
    { name: "drums", instrument: "kit", stem: "base", reverb: 0.15 },
    { name: "lead", instrument: "lead", stem: "melody", pan: 0.05, reverb: 0.25, delay: 0.12 },
    { name: "brass", instrument: "brass", stem: "melody", pan: -0.2, reverb: 0.3 },
    { name: "bell", instrument: "bell", stem: "melody", pan: 0.3, reverb: 0.45, delay: 0.25 },
    { name: "tet1", instrument: "pure", stem: "pythagoras", pan: -0.45, reverb: 0.2 },
    { name: "tet2", instrument: "pure", stem: "pythagoras", pan: -0.15, reverb: 0.2 },
    { name: "tet3", instrument: "pure", stem: "pythagoras", pan: 0.15, reverb: 0.2 },
    { name: "tet4", instrument: "pure", stem: "pythagoras", pan: 0.45, reverb: 0.2 },
    { name: "zeno", instrument: "arrow", stem: "zeno", pan: 0.2, reverb: 0.25, delay: 0.3 },
  ],
  phrases: {
    r8: rest(8, ROWS),
    bassI: each("Em Em", gallop),
    drumsI: bars("Y,K*12", "K*12"),
    bassA: each(A, gallop),
    bassB: each(B, gallop),
    bassC: each(C, gallop),
    bassD: each(D, (c) => (c === "Em" ? "E1*12" : gallop(c))),
    padA: each(A, padChord),
    padB: each(B, padChord),
    padC: each(C, padChord),
    padD: each(D, padChord),
    drumsA: bars(times(GROOVE, 7), "K,H*2 Hv5 S*2 S S*2 S S S S"),
    drumsB: bars(times("K*6 S*6", 7), "K*6 S S S Sv9 Svb Svd"),
    drumsC: bars(times(GROOVE, 7), "Y,K*2 Hv5 S*2 S S*2 S S S S"),
    drumsD: bars(
      times("K*12", 4),
      "K*6 K*6",
      "K*3 K*3 K*3 K*3",
      "S*3 S*3 S*2 S S*2 S",
      "S S S S S S Sv9 Svb Svc Svd Sve Svf",
    ),
    leadA,
    leadC,
    motifB,
    brassB: bars(
      "B3*3 E4*9",
      "D#4*3 B3*9",
      "C4*6 G3*6",
      "G3*6 -*6",
      "E4*3 A4*9",
      "G#4*3 E4*9",
      "F4*6 C4*6",
      "B3*6 -*6",
    ),
    bellC,
    ...Object.fromEntries(
      ([1, 2, 3, 4] as const).flatMap((v) => [
        [`tet${v}I`, tetractys("Em Em", v)],
        [`tet${v}A`, tetractys(A, v)],
        [`tet${v}B`, tetractys(B, v)],
        [`tet${v}C`, tetractys(C, v)],
        [`tet${v}D`, tetractys(D, v)],
      ]),
    ),
    zenoA: zeno(A),
    zenoB: zeno(B),
    zenoC: zeno(C),
    zenoD: zeno(D),
  },
  sections: { 0: "intro", 1: "A", 2: "B", 3: "C", 4: "D" },
  order: [
    { bass: "bassI", drums: "drumsI", tet1: "tet1I", tet2: "tet2I", tet3: "tet3I", tet4: "tet4I" },
    ...(["A", "B", "C", "D"] as const).map((s) => ({
      bass: `bass${s}`,
      pad: `pad${s}`,
      drums: `drums${s}`,
      lead: s === "A" ? "leadA" : s === "C" ? "leadC" : "r8",
      brass: s === "B" ? "brassB" : "r8",
      bell: s === "B" ? "motifB" : s === "C" ? "bellC" : "r8",
      tet1: `tet1${s}`,
      tet2: `tet2${s}`,
      tet3: `tet3${s}`,
      tet4: `tet4${s}`,
      zeno: `zeno${s}`,
    })),
  ],
  loop: 1,
};
