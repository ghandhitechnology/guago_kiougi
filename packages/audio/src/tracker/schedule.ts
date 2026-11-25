/**
 * Timing maths for songs. Every row boundary is computed from the absolute row count, never by
 * adding row lengths, so a song that has looped a thousand times is still on the sample.
 */

export interface Timing {
  /** Samples per row, fractional. */
  readonly samplesPerRow: number;
  /** 0..0.5 of a row that odd rows start late. */
  readonly swing: number;
  /** Ticks per row. */
  readonly speed: number;
}

export function timing(
  sampleRate: number,
  bpm: number,
  rowsPerBeat: number,
  swing = 0,
  speed = 6,
): Timing {
  return { samplesPerRow: (sampleRate * 60) / (bpm * rowsPerBeat), swing, speed };
}

/** First sample of the absolute row `row`. */
export function rowStart(t: Timing, row: number): number {
  const late = row % 2 === 1 ? t.swing : 0;
  return Math.floor((row + late) * t.samplesPerRow);
}

/** First sample of tick `tick` of the absolute row `row`. */
export function tickStart(t: Timing, row: number, tick: number): number {
  const start = rowStart(t, row);
  const length = rowStart(t, row + 1) - start;
  return start + Math.floor((length * tick) / t.speed);
}

export interface Position {
  readonly frame: number;
  readonly row: number;
}

/** The row after `p`, following the loop, or null at the end of a song that plays once. */
export function nextRow(
  frameRows: readonly number[],
  loop: number | false,
  p: Position,
): Position | null {
  const rows = frameRows[p.frame] ?? 0;
  if (p.row + 1 < rows) return { frame: p.frame, row: p.row + 1 };
  if (p.frame + 1 < frameRows.length) return { frame: p.frame + 1, row: 0 };
  return loop === false ? null : { frame: loop, row: 0 };
}

/** Rows before the loop point and rows in one pass of the loop. */
export function songShape(
  frameRows: readonly number[],
  loop: number | false,
): { intro: number; loop: number } {
  const start = loop === false ? frameRows.length : loop;
  let intro = 0;
  let body = 0;
  frameRows.forEach((rows, i) => {
    if (i < start) intro += rows;
    else body += rows;
  });
  return { intro, loop: body };
}
