/** Phrase text to rows. The grammar is documented in `format.ts`. */

import { DRUM_PIECES, type DrumPiece } from "./format.ts";

export type FxCode = "a" | "u" | "d" | "p" | "~" | "f" | "c" | "e" | "t" | "q";

export interface Fx {
  readonly code: FxCode;
  /** The two digits as one byte, 0..255. */
  readonly value: number;
}

export interface Cell {
  readonly kind: "note" | "drum" | "hold" | "off" | "cut";
  /** MIDI notes for `note`. */
  readonly notes?: readonly number[];
  readonly drums?: readonly DrumPiece[];
  /** 0..1, when a `v` effect is present. */
  readonly vol?: number;
  readonly fx: readonly Fx[];
}

/** A parsed phrase: one entry per row, `null` for a bare `.`. */
export type Phrase = readonly (Cell | null)[];

export class ParseError extends Error {}

const NOTE = /^([A-G])(#|b)?([0-8])/;
const SEMITONE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const FX_CODES = new Set<string>(["a", "u", "d", "p", "~", "f", "c", "e", "t", "q"]);
const HEX = /^[0-9a-f]$/;

/** `C4` is 60. Returns null when the text is not a note name. */
export function noteNumber(name: string): number | null {
  const m = NOTE.exec(name);
  if (!m || m[0].length !== name.length) return null;
  const [, letter, accidental, octave] = m;
  const base = SEMITONE[letter as string] as number;
  const shift = accidental === "#" ? 1 : accidental === "b" ? -1 : 0;
  return 12 * (Number(octave) + 1) + base + shift;
}

const SHARPS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLATS = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
/** `60` is `C4`. Spelled with flats when `flats` is set, as in F major or F minor. */
export function noteName(midi: number, flats = false): string {
  return `${(flats ? FLATS : SHARPS)[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

/** Whether a key like "F major" or "F minor" is written with flats. */
export function flatKey(key: string): boolean {
  return /^(F|Bb|Eb|Ab|Db|Gb)\b/.test(key) || /^(C|G|D) minor/.test(key);
}

function parseHead(token: string, at: string): { cell: Omit<Cell, "fx" | "vol">; rest: string } {
  const first = token[0];
  if (first === ".") return { cell: { kind: "hold" }, rest: token.slice(1) };
  if (first === "-") return { cell: { kind: "off" }, rest: token.slice(1) };
  if (first === "x") return { cell: { kind: "cut" }, rest: token.slice(1) };
  if (first && DRUM_PIECES.includes(first as DrumPiece) && !NOTE.test(token)) {
    const drums: DrumPiece[] = [];
    let rest = token;
    for (;;) {
      const d = rest[0] as DrumPiece;
      if (!DRUM_PIECES.includes(d)) throw new ParseError(`${at}: bad drum in "${token}"`);
      drums.push(d);
      rest = rest.slice(1);
      if (rest[0] !== ",") break;
      rest = rest.slice(1);
    }
    return { cell: { kind: "drum", drums }, rest };
  }
  const notes: number[] = [];
  let rest = token;
  for (;;) {
    const m = NOTE.exec(rest);
    if (!m) throw new ParseError(`${at}: cannot read "${token}"`);
    notes.push(noteNumber(m[0]) as number);
    rest = rest.slice(m[0].length);
    if (rest[0] !== ",") break;
    rest = rest.slice(1);
  }
  return { cell: { kind: "note", notes }, rest };
}

/** Reads one token into a cell and how many rows it spans. */
export function parseToken(token: string, at = "token"): { cell: Cell | null; rows: number } {
  const { cell, rest: afterHead } = parseHead(token, at);
  let rest = afterHead;
  const fx: Fx[] = [];
  let vol: number | undefined;
  let rows = 1;
  while (rest.length > 0) {
    const code = rest[0] as string;
    if (code === "*") {
      const n = rest.slice(1);
      if (!/^[1-9][0-9]*$/.test(n)) throw new ParseError(`${at}: bad length in "${token}"`);
      rows = Number(n);
      rest = "";
      break;
    }
    if (code === "v") {
      const d = rest[1] ?? "";
      if (!HEX.test(d)) throw new ParseError(`${at}: bad volume in "${token}"`);
      vol = Number.parseInt(d, 16) / 15;
      rest = rest.slice(2);
      continue;
    }
    if (!FX_CODES.has(code)) throw new ParseError(`${at}: unknown effect "${code}" in "${token}"`);
    const digits = rest.slice(1, 3);
    if (digits.length !== 2 || !HEX.test(digits[0] as string) || !HEX.test(digits[1] as string))
      throw new ParseError(`${at}: effect "${code}" needs two hex digits in "${token}"`);
    fx.push({ code: code as FxCode, value: Number.parseInt(digits, 16) });
    rest = rest.slice(3);
  }
  const empty = cell.kind === "hold" && fx.length === 0 && vol === undefined;
  return {
    cell: empty ? null : { ...cell, fx, ...(vol === undefined ? {} : { vol }) },
    rows,
  };
}

/**
 * Parses a phrase. `rowsPerBar` checks the bar lines; `where` names the phrase in errors.
 */
export function parsePhrase(text: string, rowsPerBar: number, where = "phrase"): Phrase {
  const rows: (Cell | null)[] = [];
  for (const token of text.trim().split(/\s+/)) {
    if (token === "") continue;
    if (token === "|") {
      if (rows.length % rowsPerBar !== 0)
        throw new ParseError(
          `${where}: bar line after ${rows.length} rows, not a multiple of ${rowsPerBar}`,
        );
      continue;
    }
    const { cell, rows: n } = parseToken(token, `${where} row ${rows.length}`);
    rows.push(cell);
    for (let i = 1; i < n; i++) rows.push(null);
  }
  return rows;
}

/** Splits `name+N` into a phrase name and a transposition. */
export function phraseRef(ref: string): { name: string; transpose: number } {
  const m = /^(.*?)([+-]\d+)?$/.exec(ref);
  return { name: m?.[1] ?? ref, transpose: m?.[2] ? Number(m[2]) : 0 };
}
