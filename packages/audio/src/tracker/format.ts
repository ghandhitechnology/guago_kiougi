/**
 * The tracker format songs are written in.
 *
 * A song has instruments, channels and phrases. A phrase is one channel's part for a stretch of
 * rows, written as a string with one token per row. The order is a list of frames; each frame
 * names the phrase every channel plays, and all phrases in one frame are the same length.
 *
 * ```ts
 * phrases: {
 *   lead: "C5*2 F5*6 E5*2 C5*6 | D5*4 A4*8 -*4",   // the school motif, two bars of 16 rows
 *   bass: "F2*6 C3*2 F2*4 A2*4 | Bb2*6 F2*2 D3*4 Bb2*4",
 * },
 * order: [{ lead: "lead", bass: "bass" }],
 * ```
 *
 * Token grammar, one per row:
 *
 * | Head        | Meaning |
 * |---|---|
 * | `C4` `F#5` `Bb3` | note on, octave 0 to 8, `C4` is MIDI 60 |
 * | `C4,E4,G4`  | a chord on one channel |
 * | `K` `S` `H` `O` `T` `L` `R` `P` `Y` `M` | drum pieces on a `kit` channel: kick, snare, closed hat, open hat, high tom, low tom, rim, clap, cymbal, shaker |
 * | `.`         | nothing new: the current note keeps sounding |
 * | `-`         | release the current note |
 * | `x`         | cut the current note at once |
 *
 * After the head come any number of effects, then an optional `*N` that repeats `.` for a total
 * of N rows (`C5*4` is `C5 . . .`). Effects are a letter and two hex digits, except `v` which
 * takes one:
 *
 * | Effect | Meaning |
 * |---|---|
 * | `vN`  | volume 0 to f. On a note it is the note's velocity, on `.` it changes the channel volume |
 * | `aXY` | arpeggio: cycle base, +X, +Y semitones every tick |
 * | `uXX` | slide up XX/16 semitones per row |
 * | `dXX` | slide down XX/16 semitones per row |
 * | `pXX` | glide to this note without retriggering, XX/16 semitones per row; `p00` is instant |
 * | `~XY` | vibrato at X Hz, Y/8 semitones deep; `~00` stops it |
 * | `fXY` | volume slide, up X/16 and down Y/16 of full per row |
 * | `cXX` | cut the note after XX ticks |
 * | `eXX` | delay the note by XX ticks |
 * | `tXX` | timbre 00 to ff, meaning depends on the instrument (pulse duty, FM index, filter, pluck brightness) |
 * | `qXX` | channel pan, 00 left, 80 centre, ff right |
 *
 * `|` marks a bar line. It is checked: a bar line anywhere but on a bar boundary is an error,
 * which catches a phrase whose rhythm adds up wrong.
 *
 * A frame may transpose a phrase: `{ lead: "a1+2" }` plays phrase `a1` two semitones up.
 *
 * Effects set on a note last for that note; effects on `.` change the sounding note from that
 * row on.
 */

export type Wave = "pulse" | "saw" | "tri" | "sine" | "noise" | "metal";

export interface Osc {
  readonly wave: Wave;
  /** Pulse duty 0..1, default 0.5. `t` effects override it. */
  readonly duty?: number;
  /** Pulse-width wobble: depth in duty units and rate in Hz. */
  readonly pwm?: { readonly depth: number; readonly rate: number };
  /** Detune in cents. */
  readonly detune?: number;
  /** Octave offset. */
  readonly octave?: number;
  /** Linear gain inside the voice, default 1. */
  readonly gain?: number;
  /** Quantise a triangle to this many levels, like an old sound chip. */
  readonly steps?: number;
}

export interface Envelope {
  /** Seconds. */
  readonly a: number;
  /** Seconds to fall to the sustain level. */
  readonly d: number;
  /** Sustain level 0..1. */
  readonly s: number;
  /** Seconds to fall silent after release. */
  readonly r: number;
}

export interface FilterSpec {
  readonly type: "lp" | "bp" | "hp";
  /** Hz. */
  readonly cutoff: number;
  /** Resonance, 0.5 (none) to about 8. */
  readonly q?: number;
  /** Octaves the cutoff rises at note on, decaying with `decay`. */
  readonly env?: number;
  /** Seconds for the filter envelope to fall back. */
  readonly decay?: number;
  /** 0..1, how much the cutoff follows the note pitch (1 = moves with it). */
  readonly track?: number;
}

export interface Vibrato {
  readonly rate: number;
  /** Semitones, peak. */
  readonly depth: number;
  /** Seconds after note on before the vibrato fades in. */
  readonly delay?: number;
}

interface InstrumentBase {
  /** Linear output gain. */
  readonly gain: number;
  readonly vibrato?: Vibrato;
}

/** Subtractive voice: up to three oscillators, a filter and an envelope. */
export interface OscInstrument extends InstrumentBase {
  readonly kind: "osc";
  readonly osc: readonly Osc[];
  readonly env: Envelope;
  readonly filter?: FilterSpec;
}

/** Two-operator FM: soft keys, bells, glassy pads. */
export interface FmInstrument extends InstrumentBase {
  readonly kind: "fm";
  /** Modulator frequency ÷ carrier frequency. */
  readonly ratio: number;
  /** Modulation index at note on, radians. */
  readonly index: number;
  /** Index it settles to. */
  readonly indexSustain?: number;
  /** Seconds for the index to fall. */
  readonly indexDecay: number;
  readonly env: Envelope;
  /** Detuned second carrier in cents for width; 0 or absent for one. */
  readonly chorus?: number;
}

/** Karplus-Strong plucked string. */
export interface PluckInstrument extends InstrumentBase {
  readonly kind: "pluck";
  /** Seconds for a note to fall 60 dB. */
  readonly decay: number;
  /** 0..1, brightness of the pluck. */
  readonly brightness: number;
  /** Seconds to fade after release. */
  readonly release?: number;
}

export type DrumPiece = "K" | "S" | "H" | "O" | "T" | "L" | "R" | "P" | "Y" | "M";
export const DRUM_PIECES: readonly DrumPiece[] = ["K", "S", "H", "O", "T", "L", "R", "P", "Y", "M"];

export interface DrumTuning {
  /** Linear gain for this piece. */
  readonly gain?: number;
  /** Pitch multiplier. */
  readonly tune?: number;
  /** Decay multiplier. */
  readonly decay?: number;
}

/** A drum kit built from noise and sine. */
export interface KitInstrument extends InstrumentBase {
  readonly kind: "kit";
  readonly pieces?: Partial<Record<DrumPiece, DrumTuning>>;
}

export type Instrument = OscInstrument | FmInstrument | PluckInstrument | KitInstrument;

export interface ChannelSource {
  readonly name: string;
  readonly instrument: string;
  /** The stem this channel plays on. Stems fade in and out on their own. */
  readonly stem: string;
  /** Linear volume, default 1. */
  readonly volume?: number;
  /** -1..1. */
  readonly pan?: number;
  /** Reverb send 0..1. */
  readonly reverb?: number;
  /** Echo send 0..1. */
  readonly delay?: number;
}

/** Channel name to phrase name (optionally `name+N` or `name-N` to transpose). */
export type Frame = Readonly<Record<string, string>>;

export interface SongSource {
  readonly title: string;
  readonly bpm: number;
  /** Rows per beat; 4 makes a row a sixteenth note. */
  readonly rowsPerBeat: number;
  readonly beatsPerBar: number;
  /** Ticks per row for arpeggios and slides, default 6. */
  readonly speed?: number;
  /** 0..0.5: how far every second row is pushed late, as a fraction of a row. */
  readonly swing?: number;
  /** Output gain in dB. */
  readonly gain?: number;
  /** Key and form, for the lab and the score review. */
  readonly key: string;
  readonly instruments: Readonly<Record<string, Instrument>>;
  readonly channels: readonly ChannelSource[];
  readonly phrases: Readonly<Record<string, string>>;
  readonly order: readonly Frame[];
  /** Section names shown in the lab, keyed by the frame they start on. */
  readonly sections?: Readonly<Record<number, string>>;
  /** Frame to jump back to after the last one; `false` plays once. */
  readonly loop: number | false;
  /**
   * Named parts, first and last frame. Playing a part loops those frames; switching parts waits
   * for the next bar line. A boss's phases are parts of one song.
   */
  readonly parts?: Readonly<Record<string, readonly [number, number]>>;
  readonly reverb?: { readonly time: number; readonly damp?: number; readonly level?: number };
  /** Echo time in beats, feedback 0..0.9. */
  readonly echo?: { readonly beats: number; readonly feedback: number; readonly damp?: number };
}
