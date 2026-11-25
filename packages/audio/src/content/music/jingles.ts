/**
 * Short pieces played over the music like effects (see `../jingles.ts`). Each plays once.
 */

import type { Instrument, SongSource } from "../../tracker/format.ts";
import { quote } from "./motif.ts";

const brass: Instrument = {
  kind: "osc",
  gain: 0.12,
  osc: [
    { wave: "pulse", duty: 0.25 },
    { wave: "saw", gain: 0.45 },
  ],
  env: { a: 0.01, d: 0.3, s: 0.75, r: 0.15 },
  filter: { type: "lp", cutoff: 3000, env: 0.6, decay: 0.1 },
  vibrato: { rate: 5.5, depth: 0.1, delay: 0.2 },
};
const chords: Instrument = {
  kind: "osc",
  gain: 0.055,
  osc: [
    { wave: "saw", detune: -6 },
    { wave: "saw", detune: 6 },
  ],
  env: { a: 0.01, d: 0.4, s: 0.6, r: 0.3 },
  filter: { type: "lp", cutoff: 2200, env: 0.6, decay: 0.15 },
};
const bell: Instrument = {
  kind: "fm",
  gain: 0.09,
  ratio: 3.5,
  index: 1.8,
  indexDecay: 0.1,
  env: { a: 0.001, d: 1.2, s: 0, r: 0.5 },
};
const kit: Instrument = { kind: "kit", gain: 0.3, pieces: { Y: { gain: 0.6, decay: 1.3 } } };

/** Level up: a D major arpeggio leaping to the octave, a stab and a cymbal. 1.6 s. */
export const levelUp: SongSource = {
  title: "레벨 업",
  key: "D major",
  bpm: 150,
  rowsPerBeat: 4,
  beatsPerBar: 4,
  loop: false,
  reverb: { time: 1.2, level: 0.6 },
  instruments: { brass, chords, bell, kit },
  channels: [
    { name: "brass", instrument: "brass", stem: "main", reverb: 0.2 },
    { name: "chords", instrument: "chords", stem: "main", pan: -0.2, reverb: 0.2 },
    { name: "bell", instrument: "bell", stem: "main", pan: 0.3, reverb: 0.35 },
    { name: "drums", instrument: "kit", stem: "main", reverb: 0.2 },
  ],
  phrases: {
    brass: "A4 D5 F#5 A5 D6*4 C#6 D6 E6*2 F#6*4 | F#6*8 -*8",
    chords: "-*8 D4,F#4,A4*2 -*2 E4,A4,C#5*4 | D4,F#4,A4,D5*8 -*8",
    bell: "-*12 A6*4 | D7*8 -*8",
    drums: "Sv4 Sv5 Sv6 Sv7 Sv8 Sv9 Sva Svb Svc*8 | Y,K*16",
  },
  order: [{ brass: "brass", chords: "chords", bell: "bell", drums: "drums" }],
};

/** A rare drop: a celesta-like run down and back up, one sparkle on top. 1.3 s. */
export const rareDrop: SongSource = {
  title: "희귀 드롭",
  key: "D major",
  bpm: 160,
  rowsPerBeat: 4,
  beatsPerBar: 4,
  loop: false,
  reverb: { time: 1.6, level: 0.8 },
  instruments: { bell, chords },
  channels: [
    { name: "bell", instrument: "bell", stem: "main", pan: 0.2, reverb: 0.4 },
    { name: "chords", instrument: "chords", stem: "main", pan: -0.2, reverb: 0.4 },
  ],
  phrases: {
    bell: "A6 F#6 D6 A5 D6 F#6 A6 D7*9 | -*16",
    chords: "-*6 F#4,A4,D5*10 | -*16",
  },
  order: [{ bell: "bell", chords: "chords" }],
};

/** 전직: the school motif in F major, made to finish on top: it climbs to A5 and lands on C6. */
export const jeonjik: SongSource = {
  title: "전직",
  key: "F major",
  bpm: 120,
  rowsPerBeat: 4,
  beatsPerBar: 4,
  loop: false,
  reverb: { time: 1.8, level: 0.8 },
  instruments: { brass, chords, bell, kit },
  channels: [
    { name: "brass", instrument: "brass", stem: "main", reverb: 0.25 },
    { name: "chords", instrument: "chords", stem: "main", pan: -0.2, reverb: 0.3 },
    { name: "bell", instrument: "bell", stem: "main", pan: 0.3, reverb: 0.4 },
    { name: "drums", instrument: "kit", stem: "main", reverb: 0.2 },
  ],
  phrases: {
    brass: `${quote({ tonic: "F5", open: true, notes: 4 })} | D5*2 E5*2 F5*4 A5*8 | C6*16`,
    chords: "A3,C4,F4*8 G3,C4,E4*8 | Bb3,D4,F4*8 C4,E4,G4*8 | A3,C4,F4,C5*16",
    bell: "-*16 | -*8 F6*4 A6*4 | C7*16",
    drums: "K*4 S*4 K*4 S*2 S*2 | K*4 S*4 S S S S Sv9 Svb Svd Svf | Y,K*16",
  },
  order: [{ brass: "brass", chords: "chords", bell: "bell", drums: "drums" }],
};

/**
 * Liberation: a wrong theory gives way. A suspended chord that will not settle, then the school
 * motif in A♭ major on a bell, slow, and the chord opens. About ten seconds.
 */
export const liberation: SongSource = {
  title: "해방",
  key: "A♭ major",
  bpm: 72,
  rowsPerBeat: 4,
  beatsPerBar: 4,
  loop: false,
  reverb: { time: 3, level: 1 },
  instruments: {
    pad: {
      kind: "osc",
      gain: 0.06,
      osc: [
        { wave: "saw", detune: -8 },
        { wave: "saw", detune: 8 },
        { wave: "tri", octave: -1, gain: 0.5 },
      ],
      env: { a: 1.2, d: 1, s: 0.85, r: 2.5 },
      filter: { type: "lp", cutoff: 1400, env: 0.6, decay: 2 },
    },
    bell: { ...bell, gain: 0.12, env: { a: 0.002, d: 2.4, s: 0, r: 1.5 } },
    lead: { ...brass, gain: 0.1, env: { a: 0.3, d: 0.6, s: 0.85, r: 2 } },
  },
  channels: [
    { name: "pad", instrument: "pad", stem: "main", reverb: 0.5 },
    { name: "bell", instrument: "bell", stem: "main", pan: 0.25, reverb: 0.6 },
    { name: "lead", instrument: "lead", stem: "main", reverb: 0.5 },
  ],
  phrases: {
    pad: "Ab2,Db3,Eb3*16 | Ab2,C3,Eb3,G3*16 | Db3,F3,Ab3,C4*16 | Ab2,C3,Eb3,Ab3*12 -*4",
    bell: `-*16 | ${quote({ tonic: "Ab5" })} | -*16`,
    lead: "-*16 | -*16 | -*16 | Ab5*12 -*4",
  },
  order: [{ pad: "pad", bell: "bell", lead: "lead" }],
};
