/** Small helpers for writing phrases. Each returns plain phrase text, so a score stays readable. */

/** Joins bars with bar lines. */
export function bars(...xs: readonly string[]): string {
  return xs.join(" | ");
}

/** One bar repeated. */
export function times(bar: string, n: number): string {
  return bars(...Array.from({ length: n }, () => bar));
}

/** A rest of whole bars: releases what sounds, then waits. */
export function rest(barsCount: number, rowsPerBar = 16): string {
  return `-*${barsCount * rowsPerBar}`;
}

/**
 * An arpeggio: walks `notes` in `order`, `each` rows per note, to fill `rows`.
 * `arp(["F4", "A4", "C5", "E5"], [0, 2, 1, 3], 2, 16)` is `F4*2 C5*2 A4*2 E5*2 F4*2 C5*2 A4*2 E5*2`.
 */
export function arp(
  notes: readonly string[],
  order: readonly number[],
  each: number,
  rows: number,
  suffix = "",
): string {
  const out: string[] = [];
  for (let r = 0, i = 0; r < rows; r += each, i++) {
    const n = notes[order[i % order.length] as number];
    out.push(`${n}${suffix}${each > 1 ? `*${each}` : ""}`);
  }
  return out.join(" ");
}

/** A chord token: `chord("F3 A3 C4", 8)` is `F3,A3,C4*8`. */
export function chord(notes: string, rows: number, suffix = ""): string {
  return `${notes.trim().split(/\s+/).join(",")}${suffix}${rows > 1 ? `*${rows}` : ""}`;
}
