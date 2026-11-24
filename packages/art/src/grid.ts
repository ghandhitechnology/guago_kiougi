import { paintIndex } from "./palette.ts";
import { CLEAR, type Indexed, indexed } from "./raster.ts";

/** A build error. `where` reads like `odap.ts › odap › hop1 › row 3`. */
export class ArtError extends Error {
  readonly where: string;
  constructor(where: string, message: string) {
    super(`${where}: ${message}`);
    this.where = where;
  }
}

/** Legend: one character per pixel, mapped to a palette or slot name, or null for clear. */
export type Legend = Readonly<Record<string, string | null>>;

/** Splits a template-literal grid into trimmed rows, dropping blank first and last lines. */
export function gridRows(src: string): string[] {
  const rows = src.split("\n").map((r) => r.trim());
  while (rows.length > 0 && rows[0] === "") rows.shift();
  while (rows.length > 0 && rows[rows.length - 1] === "") rows.pop();
  return rows;
}

/**
 * Parses a grid against a legend. Every row must be `w` wide, and the grid `h` tall when `h`
 * is given. Characters listed in `lone` are flagged as allowed to stand alone.
 */
export function parseGrid(
  src: string,
  legend: Legend,
  where: string,
  size: { w?: number; h?: number },
  lone = "",
): Indexed {
  const rows = gridRows(src);
  if (rows.length === 0) throw new ArtError(where, "grid is empty");
  const w = size.w ?? (rows[0] as string).length;
  if (size.h !== undefined && rows.length !== size.h) {
    throw new ArtError(where, `grid has ${rows.length} rows, expected ${size.h}`);
  }
  const img = indexed(w, rows.length);
  const cache = new Map<string, number>();
  rows.forEach((row, y) => {
    const chars = [...row];
    if (chars.length !== w) {
      throw new ArtError(`${where} › row ${y + 1}`, `is ${chars.length} wide, expected ${w}`);
    }
    chars.forEach((ch, x) => {
      if (!(ch in legend)) {
        throw new ArtError(
          `${where} › row ${y + 1}`,
          `"${ch}" at column ${x + 1} is not in the legend`,
        );
      }
      const name = legend[ch];
      if (name === null || name === undefined) return;
      let index = cache.get(ch);
      if (index === undefined) {
        try {
          index = paintIndex(name);
        } catch {
          throw new ArtError(where, `legend "${ch}" names unknown colour "${name}"`);
        }
        cache.set(ch, index);
      }
      img.px[y * w + x] = index;
      if (lone.includes(ch)) img.lone[y * w + x] = 1;
    });
  });
  return img;
}

/** Validates every legend entry up front, so a typo fails even if no grid uses the character. */
export function checkLegend(legend: Legend, where: string): void {
  for (const [ch, name] of Object.entries(legend)) {
    if ([...ch].length !== 1) throw new ArtError(where, `legend key "${ch}" must be one character`);
    if (name === null) continue;
    try {
      paintIndex(name);
    } catch {
      throw new ArtError(where, `legend "${ch}" names unknown colour "${name}"`);
    }
  }
}

export { CLEAR };
