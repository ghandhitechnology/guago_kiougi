import type { Stamp, StampCell, TileRect } from "./format.ts";

export interface ParsedStamp {
  readonly w: number;
  readonly h: number;
  /** Cells the stamp changes, relative to its top left. */
  readonly cells: readonly { readonly x: number; readonly y: number; readonly cell: StampCell }[];
  /** Region name to its rectangle, relative to the stamp's top left. */
  readonly regions: ReadonlyMap<string, TileRect>;
}

/** Rows of an ASCII grid: indentation and blank lines dropped, `.` kept. */
export function gridLines(src: string): string[] {
  return src
    .split("\n")
    .map((r) => r.trim())
    .filter((r) => r.length > 0);
}

/**
 * Parses a stamp. `.` leaves the map as it is. Every other character must be in the legend, and
 * each region's cells must fill their bounding rectangle exactly.
 */
export function parseStamp(stamp: Stamp): ParsedStamp {
  const rows = gridLines(stamp.grid);
  const where = `stamp ${stamp.name}`;
  const w = rows[0]?.length ?? 0;
  const cells: { x: number; y: number; cell: StampCell }[] = [];
  const spots = new Map<string, { x: number; y: number }[]>();
  rows.forEach((row, y) => {
    if (row.length !== w) throw new Error(`${where}: row ${y + 1} is ${row.length} wide, not ${w}`);
    [...row].forEach((ch, x) => {
      if (ch === ".") return;
      const cell = stamp.legend[ch];
      if (!cell) throw new Error(`${where}: "${ch}" in row ${y + 1} is not in the legend`);
      cells.push({ x, y, cell });
      if (cell.region) {
        const list = spots.get(cell.region) ?? [];
        list.push({ x, y });
        spots.set(cell.region, list);
      }
    });
  });
  const regions = new Map<string, TileRect>();
  for (const [name, list] of spots) {
    const x0 = Math.min(...list.map((p) => p.x));
    const y0 = Math.min(...list.map((p) => p.y));
    const x1 = Math.max(...list.map((p) => p.x));
    const y1 = Math.max(...list.map((p) => p.y));
    const rect = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
    if (list.length !== rect.w * rect.h)
      throw new Error(`${where}: region "${name}" is not a filled rectangle`);
    regions.set(name, rect);
  }
  return { w, h: rows.length, cells, regions };
}
