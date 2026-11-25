/**
 * 아리스토텔레스: the era boss of Page 1, one part per 논제. 138 BPM, 4/4.
 *
 * His own motif falls through the old Greek Dorian scale (E D C B | A G F E, the white-key E
 * phrygian), stately, a lecture. Each 논제 moves the key up (E, F♯, G, A minor) and has its own
 * idea; the school motif answers him in every part, closer and louder each time, and wins in A
 * major at the end.
 *
 * | Part | Key | His idea | The answer |
 * |---|---|---|---|
 * | `thesis-1` 무거운 것이 더 빨리 떨어진다 | E minor | falling runs that speed up (the boulder) over a line that falls slowly (the feather) | the motif far away on a bell |
 * | `thesis-2` 모든 것은 제자리로 돌아간다 | F♯ minor | a figure that climbs four octaves, earth to fire, and always snaps back to where it began | the motif on the lead |
 * | `thesis-3` 움직이는 것은 무언가가 민다 | G minor | the band stops dead every other bar until a drum fill pushes it on | the motif in the bass, doing the pushing |
 * | `thesis-4` 자연에 빈 곳은 없다 | A minor → A major | no rests anywhere: sixteenths in every voice | the motif in A major in octaves, after one bar of near silence: the void he said could not exist |
 *
 * Each part is two frames of eight bars and loops on itself; `audio.part("thesis-2")` moves on at
 * the next bar line. Frame `ab` of each part is: his motif and idea (a), then the answer (b).
 * Chords (in E): a = Em Em C B Em Em F B, b = Am B C C Am E F F; the F before Em is the Greek
 * cadence, ♭II to i.
 */

import type { SongSource } from "../../tracker/format.ts";
import { quote } from "./motif.ts";
import { bars, chord, rest, times } from "./write.ts";

const CHORDS_A = "Em Em C B Em Em F B";
const CHORDS_B = "Am B C C Am E F F";
const ROOT: Record<string, string> = {
  Em: "E2",
  C: "C2",
  B: "B1",
  F: "F2",
  Am: "A1",
  E: "E2",
  D: "D2",
  A: "A1",
  "F#m": "F#2",
  Bm: "B1",
};
const OCT: Record<string, string> = {
  Em: "E3",
  C: "C3",
  B: "B2",
  F: "F3",
  Am: "A2",
  E: "E3",
  D: "D3",
  A: "A2",
  "F#m": "F#3",
  Bm: "B2",
};
const ORGAN: Record<string, string> = {
  /** Under his motif the organ drones on E alone, the old modal way. */
  Ep: "E3 E4",
  Em: "E3 G3 B3",
  C: "E3 G3 C4",
  B: "D#3 F#3 B3",
  F: "F3 A3 C4",
  Am: "E3 A3 C4",
  E: "E3 G#3 B3",
  D: "D3 F#3 A3",
  A: "E3 A3 C#4",
  "F#m": "F#3 A3 C#4",
  Bm: "D3 F#3 B3",
};
/** Chord tones over four octaves, low to high, for the 제자리 figure and the T4 sixteenths. */
const LADDER: Record<string, string[]> = {
  Em: ["E3", "G3", "B3", "E4", "G4", "B4", "E5", "G5"],
  C: ["C3", "E3", "G3", "C4", "E4", "G4", "C5", "E5"],
  B: ["B2", "D#3", "F#3", "B3", "D#4", "F#4", "B4", "D#5"],
  F: ["F3", "A3", "C4", "F4", "A4", "C5", "F5", "A5"],
  Am: ["A2", "C3", "E3", "A3", "C4", "E4", "A4", "C5"],
  E: ["E3", "G#3", "B3", "E4", "G#4", "B4", "E5", "G#5"],
  D: ["D3", "F#3", "A3", "D4", "F#4", "A4", "D5", "F#5"],
  A: ["A2", "C#3", "E3", "A3", "C#4", "E4", "A4", "C#5"],
  "F#m": ["F#3", "A3", "C#4", "F#4", "A4", "C#5", "F#5", "A5"],
  Bm: ["B2", "D3", "F#3", "B3", "D4", "F#4", "B4", "D5"],
};

const each = (chords: string, f: (c: string) => string) => bars(...chords.split(" ").map(f));
const organ = (c: string) => chord(ORGAN[c] as string, 16);
/** Open fifths, for when the bass carries the tune. */
const fifth = (c: string) => {
  const r = (OCT[c] as string).replace(/\d$/, (o) => String(Number(o)));
  return chord(`${r} ${(LADDER[c] as string[])[2]}`, 16);
};

// Bass, one style per thesis.
const bassHalf = (c: string) => `${ROOT[c]}*8 ${ROOT[c]}*8`;
const bass8 = (c: string) => `${ROOT[c]}*2 ${OCT[c]}*2 `.repeat(4).trim();
const bassStop = (c: string, i: number) =>
  i % 2 === 0
    ? `${ROOT[c]}*2 `.repeat(8).trim()
    : `${ROOT[c]}*2 ${ROOT[c]}*2 ${ROOT[c]}*3 ${ROOT[c]}d08*4 -*5`;
const bass16 = (c: string) => `${ROOT[c]} ${ROOT[c]} ${OCT[c]}*2 `.repeat(4).trim();

/** 제자리: up through the four registers and back down to where it started, every bar. */
const PLACE = [0, 1, 2, 3, 4, 5, 6, 7, 6, 5, 4, 3, 2, 1, 0, 0];
const place = (c: string) => PLACE.map((i) => (LADDER[c] as string[])[i]).join(" ");
/** T4: sixteenths that never rest, up and down the chord. */
const FILL = [0, 2, 4, 6, 7, 5, 3, 1, 2, 4, 6, 7, 5, 3, 1, 0];
const fill = (c: string) => FILL.map((i) => (LADDER[c] as string[])[i]).join(" ");

/** His motif: down an octave through the Greek Dorian, brass register. */
const ARISTOTLE = "E4*6 D4*2 C4*4 B3*4 | A3*8 G3*2 F3*2 E3*4";

const brassA = bars(ARISTOTLE, "-*16", "-*16", ARISTOTLE, "F3*8 A3*4 C4*4", "B3*16");
/** The boulder: a falling run that speeds up, bars 3, 4, 7 and 8. */
const boulder = bars(
  "-*16",
  "-*16",
  "C6*4 G5*4 E5*2 C5*2 G4 E4 C4 G3",
  "B5*4 F#5*4 D#5*2 B4*2 F#4 D#4 B3 F#3",
  "-*16",
  "-*16",
  "C6*4 A5*4 F5*2 C5*2 A4 F4 C4 A3",
  "B5*4 F#5*4 D#5*2 B4*2 F#4 D#4 B3 F#3",
);
/** The feather: the same fall, a step a bar. */
const feather = bars("-*16", "-*16", "E5*16", "D#5*16", "-*16", "-*16", "F5*16", "D#5*16");

/** The school motif: E harmonic minor, then a fourth higher in A; four bars each, half speed. */
const motifE = quote({ tonic: "E5", mode: "harmonic", stretch: 2 });
const motifA = quote({ tonic: "A5", mode: "harmonic", stretch: 2 });
const motifLow = bars(
  quote({ tonic: "E3", mode: "harmonic", stretch: 2 }),
  quote({ tonic: "A2", mode: "harmonic", stretch: 2 }),
);
const ROOTS_B = each(CHORDS_B, (c) => `${OCT[c]}*16`);

// T4's answer, in A major: the motif in A, then a fourth higher in D, then the void.
const CHORDS_T4B = "A E F#m F#m D A Bm E";
const motifMajor = bars(
  quote({ tonic: "A5", stretch: 2 }),
  `${quote({ tonic: "D6", stretch: 2, open: true, notes: 5 })} F#5*8`,
  "-*16",
);
const motifMajorLow = bars(
  quote({ tonic: "A4", stretch: 2 }),
  `${quote({ tonic: "D5", stretch: 2, open: true, notes: 5 })} F#4*8`,
  "-*16",
);
/** The void: everything falls away but one held E. */
const voidBar = (line: string) => line.replace(/\| [^|]*$/, "| -*16");

const DRUM = {
  t1: "Y,K*8 S*8",
  t1b: "K*8 S*8",
  t2: "K*4 S*4 K*2 K*2 S*4",
  t3: "K*2 H*2 S*2 H*2 K*2 H*2 S*2 H*2",
  t3stop: "K*2 H*2 S*2 H*2 -*4 Sv9 Svb Svd Svf",
  t4: "K*2 S*2 K*2 S*2 K*2 S*2 K*2 S,K*2",
};
const HATS16 = "Hv8 Hv4 Hv6 Hv4 Hv8 Hv4 Hv6 Hv4 Hv8 Hv4 Hv6 Hv4 Hv8 Hv4 Hv6 Hv4";

export const bossEra: SongSource = {
  title: "아리스토텔레스",
  key: "E minor",
  bpm: 138,
  rowsPerBeat: 4,
  beatsPerBar: 4,
  gain: -2,
  reverb: { time: 2.2, damp: 4800, level: 0.9 },
  echo: { beats: 0.75, feedback: 0.25, damp: 3000 },
  instruments: {
    bass: {
      kind: "osc",
      gain: 0.13,
      osc: [
        { wave: "pulse", duty: 0.5 },
        { wave: "tri", gain: 0.9 },
      ],
      env: { a: 0.004, d: 0.2, s: 0.7, r: 0.06 },
      filter: { type: "lp", cutoff: 850, env: 0.7, decay: 0.08 },
    },
    organ: {
      kind: "osc",
      gain: 0.04,
      osc: [
        { wave: "pulse", duty: 0.5 },
        { wave: "pulse", duty: 0.5, octave: 1, gain: 0.4 },
        { wave: "tri", octave: -1, gain: 0.6 },
      ],
      env: { a: 0.05, d: 0.4, s: 0.85, r: 0.3 },
      filter: { type: "lp", cutoff: 1500 },
    },
    brass: {
      kind: "osc",
      gain: 0.12,
      osc: [
        { wave: "saw", detune: -6 },
        { wave: "saw", detune: 6 },
        { wave: "pulse", duty: 0.5, octave: -1, gain: 0.5 },
      ],
      env: { a: 0.04, d: 0.5, s: 0.8, r: 0.25 },
      filter: { type: "lp", cutoff: 1600, env: 0.8, decay: 0.25 },
      vibrato: { rate: 5, depth: 0.08, delay: 0.35 },
    },
    lead: {
      kind: "osc",
      gain: 0.12,
      osc: [
        { wave: "pulse", duty: 0.25 },
        { wave: "pulse", duty: 0.25, detune: 7, gain: 0.6 },
      ],
      env: { a: 0.015, d: 0.4, s: 0.75, r: 0.2 },
      filter: { type: "lp", cutoff: 2800, env: 0.5, decay: 0.15 },
      vibrato: { rate: 5.5, depth: 0.14, delay: 0.25 },
    },
    arp: { kind: "pluck", gain: 0.22, decay: 0.9, brightness: 0.6 },
    bell: {
      kind: "fm",
      gain: 0.14,
      ratio: 3,
      index: 2,
      indexDecay: 0.2,
      env: { a: 0.002, d: 2.2, s: 0, r: 1 },
    },
    kit: {
      kind: "kit",
      gain: 0.3,
      pieces: {
        K: { gain: 1, tune: 0.9 },
        S: { gain: 0.9, decay: 1.2 },
        H: { gain: 2 },
        Y: { gain: 0.6, decay: 1.5 },
      },
    },
  },
  channels: [
    { name: "bass", instrument: "bass", stem: "base", reverb: 0.05 },
    { name: "organ", instrument: "organ", stem: "base", pan: -0.15, reverb: 0.4 },
    { name: "drums", instrument: "kit", stem: "base", reverb: 0.2 },
    { name: "brass", instrument: "brass", stem: "melody", pan: -0.2, reverb: 0.3 },
    { name: "lead", instrument: "lead", stem: "melody", pan: 0.1, reverb: 0.3, delay: 0.12 },
    { name: "bell", instrument: "bell", stem: "melody", pan: 0.35, reverb: 0.55, delay: 0.3 },
    { name: "arp", instrument: "arp", stem: "extra", pan: 0.3, reverb: 0.2, delay: 0.15 },
    { name: "hats", instrument: "kit", stem: "extra", pan: 0.2, reverb: 0.1 },
  ],
  phrases: {
    r8: rest(8),
    organA: each("Ep Ep C B Ep Ep F B", organ),
    organB5: each(CHORDS_B, fifth),
    organB: each(CHORDS_B, organ),
    organT4B: each(CHORDS_T4B, organ),
    // Thesis 1.
    bassHalfA: each(CHORDS_A, bassHalf),
    bassHalfB: each(CHORDS_B, bassHalf),
    brassA,
    boulder,
    feather,
    bellAnswer: bars(motifE, motifA),
    brassRoots: ROOTS_B,
    drumsT1: bars(DRUM.t1, times(DRUM.t1b, 7)),
    // Thesis 2.
    bass8A: each(CHORDS_A, bass8),
    bass8B: each(CHORDS_B, bass8),
    placeA: each(CHORDS_A, place),
    placeB: each(CHORDS_B, place),
    leadAnswer: bars(motifE, motifA),
    drumsT2: times(DRUM.t2, 8),
    hats8: times("Hv7*2 Hv4*2 Hv6*2 Hv4*2 Hv7*2 Hv4*2 Hv6*2 Hv4*2", 8),
    // Thesis 3.
    bassStopA: bars(...CHORDS_A.split(" ").map(bassStop)),
    motifLow,
    leadPush: bars(
      ...CHORDS_B.split(" ").map((c, i) =>
        i % 2 === 1 ? `-*12 ${OCT[c]?.replace("3", "5").replace("2", "4")}*4` : "-*16",
      ),
    ),
    drumsT3: times(`${DRUM.t3} | ${DRUM.t3stop}`, 4),
    hatsStop: times(
      "Hv7*2 Hv4*2 Hv6*2 Hv4*2 Hv7*2 Hv4*2 Hv6*2 Hv4*2 | Hv7*2 Hv4*2 Hv6*2 Hv4*2 -*8",
      4,
    ),
    // Thesis 4.
    bass16A: each(CHORDS_A, bass16),
    fillA: each(CHORDS_A, fill),
    leadDouble: bars(
      ARISTOTLE.replace(/([A-G]#?)(\d)/g, (_, l, o) => `${l}${Number(o) + 1}`),
      "C6*4 G5*4 E5*4 C5*4",
      "B5*4 F#5*4 D#5*4 B4*4",
      ARISTOTLE.replace(/([A-G]#?)(\d)/g, (_, l, o) => `${l}${Number(o) + 1}`),
      "F4*8 A4*4 C5*4",
      "B4*16",
    ),
    bass16T4B: voidBar(each(CHORDS_T4B, bass16)),
    fillT4B: voidBar(each(CHORDS_T4B, fill)),
    organT4Bv: voidBar(each(CHORDS_T4B, organ)),
    motifMajor,
    motifMajorLow,
    holdE: bars("-*16", "-*16", "-*16", "-*16", "-*16", "-*16", "-*16", "E6*16"),
    drumsT4: times(DRUM.t4, 8),
    drumsT4B: bars(times(DRUM.t4, 6), "K*2 S*2 K*2 S*2 S S S S Sv9 Svb Svd Svf", "-*16"),
    hats16: times(HATS16, 8),
    hats16B: bars(times(HATS16, 7), "-*16"),
  },
  sections: { 0: "논제 1", 2: "논제 2", 4: "논제 3", 6: "논제 4" },
  parts: { "thesis-1": [0, 1], "thesis-2": [2, 3], "thesis-3": [4, 5], "thesis-4": [6, 7] },
  order: [
    // 1: E minor.
    {
      bass: "bassHalfA",
      organ: "organA",
      drums: "drumsT1",
      brass: "brassA",
      lead: "feather",
      arp: "boulder",
      bell: "r8",
      hats: "r8",
    },
    {
      bass: "bassHalfB",
      organ: "organB",
      drums: "drumsT1",
      brass: "brassRoots",
      lead: "r8",
      arp: "r8",
      bell: "bellAnswer",
    },
    // 2: F♯ minor.
    {
      bass: "bass8A+2",
      organ: "organA+2",
      drums: "drumsT2",
      brass: "brassA+2",
      lead: "r8",
      arp: "placeA+2",
      bell: "r8",
      hats: "hats8",
    },
    {
      bass: "bass8B+2",
      organ: "organB+2",
      drums: "drumsT2",
      brass: "brassRoots+2",
      lead: "leadAnswer+2",
      arp: "placeB+2",
      hats: "hats8",
    },
    // 3: G minor.
    {
      bass: "bassStopA+3",
      organ: "organA+3",
      drums: "drumsT3",
      brass: "brassA+3",
      lead: "r8",
      arp: "r8",
      hats: "hatsStop",
    },
    {
      bass: "motifLow+3",
      organ: "organB5+3",
      drums: "drumsT3",
      brass: "brassRoots+3",
      lead: "leadPush+3",
      arp: "placeB+3",
      hats: "hatsStop",
    },
    // 4: A minor, then A major.
    {
      bass: "bass16A+5",
      organ: "organA+5",
      drums: "drumsT4",
      brass: "brassA+5",
      lead: "leadDouble+5",
      arp: "fillA+5",
      bell: "r8",
      hats: "hats16",
    },
    {
      bass: "bass16T4B",
      organ: "organT4Bv",
      drums: "drumsT4B",
      brass: "motifMajorLow",
      lead: "motifMajor",
      arp: "fillT4B",
      bell: "holdE",
      hats: "hats16B",
    },
  ],
  loop: 0,
};
