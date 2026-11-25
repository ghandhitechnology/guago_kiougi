/**
 * 해솔 motif: the school's own tune. It is born in the campus hub and, by PLAN §17, comes back
 * inside every boss theme, so it is stored here as data and written into songs with `quote()`.
 *
 * Written in F major, the hub's key, with F5 as the tonic, sixteenth-note rows:
 *
 * ```
 *   C5  F5 . . . . .  E5  C5 . . . . . | D5 . . .  A4 . . . . . . .  (rest)
 *   8th dotted qtr    8th dotted qtr     quarter   half              quarter
 * ```
 *
 * Scale steps from the tonic: 5 below, 1, 7 below, 5 below, 6 below, 3 below. A rising fourth
 * answered by a falling fourth, in a short-long lilt: a student nodding off and jolting awake.
 * The first bar outlines Fmaj7 and the second sits on B♭maj7, so the motif ends open, on the
 * third, and asks for an answer.
 *
 * Quoting it in another mood: change the mode (`minor`: C F E♭ C D♭ A♭, heroic and dark),
 * stretch the rhythm (`stretch: 2` for a slow, far-away quote, `0.5` for a march), or bend single
 * notes by semitones (the night field turns the rising fourth into a tritone).
 */

import { noteName, noteNumber } from "../../tracker/parse.ts";

export interface MotifNote {
  /** Scale step from the tonic: 0 is the tonic, -1 the step below. `null` is a rest. */
  readonly step: number | null;
  readonly rows: number;
}

export const MOTIF: readonly MotifNote[] = [
  { step: -3, rows: 2 },
  { step: 0, rows: 6 },
  { step: -1, rows: 2 },
  { step: -3, rows: 6 },
  { step: -2, rows: 4 },
  { step: -5, rows: 8 },
  { step: null, rows: 4 },
];

export const MODES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  harmonic: [0, 2, 3, 5, 7, 8, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
} as const;
export type Mode = keyof typeof MODES;

/** MIDI note for a scale step from a tonic. */
export function stepNote(tonic: number, mode: Mode, step: number): number {
  const scale = MODES[mode];
  const octave = Math.floor(step / 7);
  const degree = ((step % 7) + 7) % 7;
  return tonic + octave * 12 + (scale[degree] as number);
}

export interface QuoteOptions {
  /** Tonic note name, like `F5`. */
  readonly tonic: string;
  readonly mode?: Mode;
  /** Multiplies every length; the result must be whole rows. */
  readonly stretch?: number;
  /** Semitones added to each note, by index. */
  readonly bend?: readonly number[];
  /** Effects appended to each note token, by index, like `~48` or `p06`. */
  readonly fx?: readonly string[];
  /** Leave out the closing rest. */
  readonly open?: boolean;
  /** Replace the last note's length; the rest absorbs the difference. */
  readonly notes?: number;
}

/** Writes the motif as phrase tokens. */
export function quote(o: QuoteOptions): string {
  const tonic = noteNumber(o.tonic);
  if (tonic === null) throw new Error(`quote: bad tonic ${o.tonic}`);
  const stretch = o.stretch ?? 1;
  const notes = o.notes ?? MOTIF.length;
  const tokens: string[] = [];
  let restRows = 0;
  MOTIF.forEach((m, i) => {
    const rows = m.rows * stretch;
    if (!Number.isInteger(rows)) throw new Error(`quote: stretch ${stretch} makes part rows`);
    if (m.step === null || i >= notes) {
      restRows += rows;
      return;
    }
    const midi = stepNote(tonic, o.mode ?? "major", m.step) + (o.bend?.[i] ?? 0);
    tokens.push(`${noteName(midi)}${o.fx?.[i] ?? ""}${rows > 1 ? `*${rows}` : ""}`);
  });
  if (!o.open && restRows > 0) tokens.push(`-${restRows > 1 ? `*${restRows}` : ""}`);
  return tokens.join(" ");
}

/** Rows the motif takes at a stretch, with or without its closing rest. */
export function motifRows(stretch = 1, open = false): number {
  return MOTIF.reduce((n, m) => n + (open && m.step === null ? 0 : m.rows * stretch), 0);
}
