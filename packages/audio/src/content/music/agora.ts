/**
 * 아고라: the Greek hunting fields of Page 1. Bright, modal, meant to be hunted to for an hour.
 *
 * D mixolydian, 7/8 grouped 3+2+2 (a quarter at 126, a bar of 1.67 s), a lyre ostinato under a
 * reed melody. The meter is the dance pulse of the region; every note is original.
 *
 * | Section | Bars | What happens | Harmony |
 * |---|---|---|---|
 * | Intro | 4 | lyre and drone, the tambourine creeps in | D C D D |
 * | A  | 8 | the reed tune, flat seventh and all | D D C D G D C D |
 * | A′ | 8 | the tune climbs to C6 and A5 | as A |
 * | B  | 8 | dorian turn on a chip voice, darker | Dm C B♭ C Dm C B♭ A |
 * | C  | 8 | the lyre alone over a pad: a breath | G D Em A G D C D |
 * | D  | 8 | reed calls, chip answers, then both in sixths | D C D C G A D D |
 * | A″ | 8 | the tune with a harmony in sixths below | as A |
 *
 * Stems: `base` (lyre, pad, bass) stays up always; `melody` (reed, chip voice); `drive` (frame drum,
 * tambourine) and `surge` (kick, clap, horn) are what the game thins for 쉬는 시간 and brings
 * back when a surge starts: `audio.music("agora", { stems: { drive: 0.3, surge: 0 } })`.
 */

import type { SongSource } from "../../tracker/format.ts";
import { bars, chord, rest, times } from "./write.ts";

const ROWS = 14;

const LYRE: Record<string, string> = {
  D: "D4 A4 F#4 D5 A4 F#4 A4",
  C: "C4 G4 E4 C5 G4 E4 G4",
  G: "G3 D4 B3 G4 D4 B3 D4",
  Em: "E4 B4 G4 E5 B4 G4 B4",
  A: "A3 E4 C#4 A4 E4 C#4 E4",
  Dm: "D4 A4 F4 D5 A4 F4 A4",
  Bb: "Bb3 F4 D4 Bb4 F4 D4 F4",
};
const PAD: Record<string, string> = {
  D: "D3 F#3 A3",
  C: "C3 E3 G3",
  G: "B2 D3 G3",
  Em: "B2 E3 G3",
  A: "A2 C#3 E3",
  Dm: "D3 F3 A3",
  Bb: "Bb2 D3 F3",
};
const BASS: Record<string, string> = {
  D: "D2*6 A2*4 D3*4",
  C: "C2*6 G2*4 C3*4",
  G: "G2*6 D3*4 G2*4",
  Em: "E2*6 B2*4 E3*4",
  A: "A1*6 E2*4 A2*4",
  Dm: "D2*6 A2*4 D3*4",
  Bb: "Bb1*6 F2*4 Bb2*4",
};
const HORN: Record<string, string> = {
  D: "D3,A3",
  C: "C3,G3",
  G: "G2,D3",
  Em: "E3,B3",
  A: "A2,E3",
  Dm: "D3,A3",
  Bb: "Bb2,F3",
};

/** One bar of eighth-note lyre in the 3+2+2 shape. */
const lyre = (c: string) =>
  (LYRE[c] as string)
    .split(" ")
    .map((n) => `${n}*2`)
    .join(" ");
const pad = (c: string) => chord(PAD[c] as string, ROWS);
const horn = (c: string) => `${HORN[c]}*6 ${HORN[c]}v9*4 ${HORN[c]}*4`;
const each = (chords: string, f: (c: string) => string) => bars(...chords.split(" ").map(f));

const A_CHORDS = "D D C D G D C D";
const B_CHORDS = "Dm C Bb C Dm C Bb A";
const C_CHORDS = "G D Em A G D C D";
const D_CHORDS = "D C D C G A D D";

const DRUM = "L*6 Tv6*4 Tv5*4";
const TAMB = "Mv8*2 Mv4*2 Mv5*2 Mv7*2 Mv4*2 Mv7*2 Mv4*2";
const KICK = "K*6 K,Pv6*4 K,Pv7*4";

const tuneA = bars(
  "A4*6 D5*4 E5*4",
  "F#5*2 E5*2 D5*2 E5*4 C5*4",
  "G5*6 E5*4 C5*4",
  "D5*10 -*4",
  "B4*6 D5*4 G5*4",
  "F#5*2 G5*2 A5*2 F#5*4 D5*4",
  "E5*6 C5*4 G4*4",
  "A4*6 C5*4 D5*4",
);

const tuneA2 = bars(
  "A4*6 D5*4 E5*4",
  "F#5*2 E5*2 D5*2 A5*4 F#5*4",
  "G5*6 C6*4 G5*4",
  "A5*10 -*4",
  "B5*6 A5*4 G5*4",
  "F#5*6 E5*4 D5*4",
  "E5*2 F#5*2 G5*2 E5*4 C5*4",
  "D5*10 -*4",
);

const voiceB = bars(
  "D5*6 F5*4 A5*4",
  "G5*6 E5*4 C5*4",
  "D5*6 F5*4 D5*4",
  "E5*10 -*4",
  "F5*6 E5*4 D5*4",
  "E5*6 G5*4 E5*4",
  "F5*6 D5*4 Bb4*4",
  "C#5*10 -*4",
);

const lyreC = bars(
  "B4*6 D5*4 G5*4",
  "F#5*6 E5*4 D5*4",
  "G5*6 B4*4 E5*4",
  "C#5*6 E5*4 A4*4",
  "B4*6 G5*4 F#5*4",
  "A5*6 F#5*4 D5*4",
  "E5*6 G5*4 C5*4",
  "D5*14",
);

const callD = bars(
  "D5*2 D5*2 F#5*2 A5*4 -*4",
  "-*14",
  "A5*2 A5*2 F#5*2 D5*4 -*4",
  "-*14",
  "B5*6 A5*4 G5*4",
  "A5*6 G5*4 E5*4",
  "F#5*6 E5*4 D5*4",
  "D5*10 -*4",
);
const answerD = bars(
  "-*14",
  "G5*2 G5*2 E5*2 C5*4 -*4",
  "-*14",
  "E5*2 E5*2 G5*2 C6*4 -*4",
  "D5*6 D5*4 B4*4",
  "E5*6 C#5*4 A4*4",
  "A4*6 A4*4 F#4*4",
  "F#4*10 -*4",
);

/** The A tune's harmony: chord tones a third or sixth under the tune. */
const harmonyA = bars(
  "F#4*6 A4*8",
  "D5*6 A4*8",
  "E5*6 C5*4 G4*4",
  "F#4*10 -*4",
  "G4*6 B4*4 D5*4",
  "D5*6 A4*4 F#4*4",
  "C5*6 G4*4 E4*4",
  "F#4*6 A4*8",
);

export const agora: SongSource = {
  title: "아고라",
  key: "D mixolydian",
  bpm: 126,
  rowsPerBeat: 4,
  beatsPerBar: 3.5,
  gain: -2.4,
  reverb: { time: 1.6, damp: 5600, level: 0.85 },
  echo: { beats: 0.5, feedback: 0.25, damp: 3200 },
  instruments: {
    lyre: { kind: "pluck", gain: 0.3, decay: 1.4, brightness: 0.72 },
    pad: {
      kind: "osc",
      gain: 0.035,
      osc: [
        { wave: "saw", detune: -7 },
        { wave: "saw", detune: 7 },
      ],
      env: { a: 0.4, d: 0.6, s: 0.8, r: 0.6 },
      filter: { type: "lp", cutoff: 1300, q: 0.8 },
    },
    bass: {
      kind: "osc",
      gain: 0.2,
      osc: [{ wave: "tri" }, { wave: "pulse", duty: 0.5, gain: 0.18 }],
      env: { a: 0.006, d: 0.25, s: 0.7, r: 0.08 },
      filter: { type: "lp", cutoff: 1000 },
    },
    reed: {
      kind: "osc",
      gain: 0.12,
      osc: [
        { wave: "pulse", duty: 0.25 },
        { wave: "saw", gain: 0.35 },
      ],
      env: { a: 0.025, d: 0.3, s: 0.8, r: 0.15 },
      filter: { type: "lp", cutoff: 2300, q: 2.6 },
      vibrato: { rate: 5.6, depth: 0.12, delay: 0.18 },
    },
    voice: {
      kind: "osc",
      gain: 0.11,
      osc: [
        { wave: "pulse", duty: 0.5 },
        { wave: "pulse", duty: 0.5, detune: 6, gain: 0.5 },
      ],
      env: { a: 0.02, d: 0.5, s: 0.65, r: 0.2 },
      filter: { type: "lp", cutoff: 2400, env: 0.5, decay: 0.2 },
      vibrato: { rate: 5, depth: 0.12, delay: 0.25 },
    },
    horn: {
      kind: "osc",
      gain: 0.08,
      osc: [
        { wave: "saw", detune: -4 },
        { wave: "saw", detune: 4 },
      ],
      env: { a: 0.01, d: 0.18, s: 0.4, r: 0.1 },
      filter: { type: "lp", cutoff: 1500, env: 0.8, decay: 0.08 },
    },
    kit: {
      kind: "kit",
      gain: 0.34,
      pieces: {
        L: { gain: 1, tune: 0.95 },
        T: { gain: 0.8, tune: 1.1 },
        M: { gain: 3.5 },
        K: { gain: 0.9 },
        P: { gain: 0.6 },
      },
    },
  },
  channels: [
    { name: "lyre", instrument: "lyre", stem: "base", pan: 0.3, reverb: 0.25, delay: 0.12 },
    { name: "pad", instrument: "pad", stem: "base", reverb: 0.35 },
    { name: "bass", instrument: "bass", stem: "base", reverb: 0.05 },
    { name: "reed", instrument: "reed", stem: "melody", pan: -0.05, reverb: 0.3, delay: 0.12 },
    { name: "voice", instrument: "voice", stem: "melody", pan: -0.3, reverb: 0.3, delay: 0.15 },
    { name: "drum", instrument: "kit", stem: "drive", pan: -0.1, reverb: 0.2 },
    { name: "tamb", instrument: "kit", stem: "drive", pan: 0.35, reverb: 0.15 },
    { name: "kick", instrument: "kit", stem: "surge", reverb: 0.1 },
    { name: "horn", instrument: "horn", stem: "surge", pan: -0.2, reverb: 0.2 },
  ],
  phrases: {
    r4: rest(4, ROWS),
    r8: rest(8, ROWS),
    lyreI: each("D C D D", lyre),
    padI: each("D C D D", pad),
    tambI: bars("-*14", "-*14", "Mv3*2 Mv2*2 Mv3*2 Mv4*2 Mv2*2 Mv4*2 Mv2*2", TAMB),
    lyreA: each(A_CHORDS, lyre),
    padA: each(A_CHORDS, pad),
    bassA: each(A_CHORDS, (c) => BASS[c] as string),
    hornA: each(A_CHORDS, horn),
    lyreB: each(B_CHORDS, lyre),
    padB: each(B_CHORDS, pad),
    bassB: each(B_CHORDS, (c) => BASS[c] as string),
    hornB: each(B_CHORDS, horn),
    padC: each(C_CHORDS, pad),
    bassC: each(C_CHORDS, (c) => `${(BASS[c] as string).split(" ")[0]?.replace("*6", "*14")}`),
    lyreD: each(D_CHORDS, lyre),
    padD: each(D_CHORDS, pad),
    bassD: each(D_CHORDS, (c) => BASS[c] as string),
    hornD: each(D_CHORDS, horn),
    tuneA,
    tuneA2,
    voiceB,
    lyreC,
    callD,
    answerD,
    harmonyA,
    drums: times(DRUM, 8),
    drumsHalf: times("L*6 -*8", 8),
    drumsSoft: times("Lv6*14", 8),
    tamb: times(TAMB, 8),
    kicks: times(KICK, 8),
  },
  sections: { 0: "intro", 1: "A", 2: "A′", 3: "B", 4: "C", 5: "D", 6: "A″" },
  order: [
    { lyre: "lyreI", pad: "padI", tamb: "tambI" },
    {
      lyre: "lyreA",
      pad: "padA",
      bass: "bassA",
      reed: "tuneA",
      voice: "r8",
      drum: "drums",
      tamb: "tamb",
      kick: "kicks",
      horn: "hornA",
    },
    {
      lyre: "lyreA",
      pad: "padA",
      bass: "bassA",
      reed: "tuneA2",
      drum: "drums",
      tamb: "tamb",
      kick: "kicks",
      horn: "hornA",
    },
    {
      lyre: "lyreB",
      pad: "padB",
      bass: "bassB",
      reed: "r8",
      voice: "voiceB",
      drum: "drumsHalf",
      tamb: "tamb",
      kick: "kicks",
      horn: "hornB",
    },
    {
      lyre: "lyreC",
      pad: "padC",
      bass: "bassC",
      voice: "r8",
      drum: "drumsSoft",
      tamb: "r8",
      kick: "r8",
      horn: "r8",
    },
    {
      lyre: "lyreD",
      pad: "padD",
      bass: "bassD",
      reed: "callD",
      voice: "answerD",
      drum: "drums",
      tamb: "tamb",
      kick: "kicks",
      horn: "hornD",
    },
    {
      lyre: "lyreA",
      pad: "padA",
      bass: "bassA",
      reed: "tuneA",
      voice: "harmonyA",
      drum: "drums",
      tamb: "tamb",
      kick: "kicks",
      horn: "hornA",
    },
  ],
  loop: 1,
};
