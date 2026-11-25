/**
 * Grid helpers for geometric art: discs, rings, sweeps and outlined glyph masks. They only
 * produce ordinary text grids, so their output goes through the same parser and checks as a
 * hand-drawn grid. Art files import them; nothing here knows about palettes.
 */
import { gridRows } from "./grid.ts";

/** A grid of `w`×`h` characters chosen per pixel. */
export function grid(w: number, h: number, at: (x: number, y: number) => string): string {
  const rows: string[] = [];
  for (let y = 0; y < h; y++) {
    let row = "";
    for (let x = 0; x < w; x++) row += at(x, y);
    rows.push(row);
  }
  return rows.join("\n");
}

/** Splits a grid into rows of characters. */
export function cells(src: string): string[][] {
  return gridRows(src).map((r) => [...r]);
}

/** Draws `top` over `bottom` at (dx, dy); `.` in `top` lets the bottom show. */
export function over(bottom: string, top: string, dx = 0, dy = 0): string {
  const b = cells(bottom);
  cells(top).forEach((row, y) => {
    row.forEach((ch, x) => {
      const line = b[y + dy];
      if (ch !== "." && line && x + dx >= 0 && x + dx < line.length) line[x + dx] = ch;
    });
  });
  return b.map((r) => r.join("")).join("\n");
}

/** Distance of pixel (x, y)'s centre from the centre of a `d`-wide square. */
export function dist(x: number, y: number, d: number): number {
  const c = d / 2;
  return Math.hypot(x + 0.5 - c, y + 0.5 - c);
}

/** Clockwise turn of pixel (x, y) from 12 o'clock around the centre, from 0 to 1. */
export function turn(x: number, y: number, d: number): number {
  const c = d / 2;
  const a = Math.atan2(x + 0.5 - c, -(y + 0.5 - c));
  return (a < 0 ? a + 2 * Math.PI : a) / (2 * Math.PI);
}

/**
 * A disc `d` pixels wide built from rings, outermost first: `[width, char]`. A ring char may
 * be a function of the pixel's turn from 12 o'clock, for lighting. The rest is `core`.
 */
export function disc(
  d: number,
  rings: readonly (readonly [number, string | ((t: number) => string)])[],
  core: string | ((x: number, y: number) => string),
): string {
  const r = d / 2;
  return grid(d, d, (x, y) => {
    const e = dist(x, y, d);
    if (e > r - 0.25) return ".";
    let edge = r;
    for (const [w, ch] of rings) {
      if (e > edge - w - 0.25) return typeof ch === "string" ? ch : ch(turn(x, y, d));
      edge -= w;
    }
    return typeof core === "string" ? core : core(x, y);
  });
}

/** Top-left lighting for a ring: light from 7:30 round to 1:30 o'clock, shade opposite. */
export function lit(light: string, mid: string, shade: string): (t: number) => string {
  return (t) => (t > 0.7 || t < 0.1 ? light : t > 0.3 && t < 0.6 ? shade : mid);
}

/**
 * Outlines a glyph mask (`#` fill, `.` clear). Fill rows above `split` take `top`, the rest
 * `bottom`. Clear pixels touching the fill in 8 directions become `line`, and a drop shadow
 * of `line` runs one row under the whole glyph. A one-pixel counter, like the hole of a small
 * ㅁ, comes out as `counter` so the legend can mark it lone.
 */
export function outlined(
  mask: string,
  split: number,
  { top = "W", bottom = "p", line = "o", counter = "c" } = {},
): string {
  const m = cells(mask);
  const h = m.length + 3;
  const w = (m[0]?.length ?? 0) + 2;
  const fill = (x: number, y: number) => m[y - 1]?.[x - 1] === "#";
  const near = (x: number, y: number) =>
    [-1, 0, 1].some((dy) => [-1, 0, 1].some((dx) => fill(x + dx, y + dy)));
  const isLine = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < w && y < h && !fill(x, y) && (near(x, y) || near(x, y - 1));
  return grid(w, h, (x, y) => {
    if (fill(x, y)) return y - 1 < split ? top : bottom;
    if (!isLine(x, y)) return ".";
    const alone = [-1, 0, 1].every((dy) =>
      [-1, 0, 1].every((dx) => (dx === 0 && dy === 0) || !isLine(x + dx, y + dy)),
    );
    return alone ? counter : line;
  });
}

/** Rows top to bottom; `[row, n]` repeats a row n times. For tall frames with plain middles. */
export function stack(...rows: readonly (string | readonly [string, number])[]): string {
  return rows
    .flatMap((r) => (typeof r === "string" ? [r] : Array.from({ length: r[1] }, () => r[0])))
    .join("\n");
}

/** Mirrors a grid left to right. */
export function flipX(src: string): string {
  return cells(src)
    .map((r) => r.reverse().join(""))
    .join("\n");
}

/** Mirrors a grid top to bottom. */
export function flipY(src: string): string {
  return cells(src)
    .reverse()
    .map((r) => r.join(""))
    .join("\n");
}

/**
 * A solid lit from the top left: pixels inside on the shape's edge (4 directions) take `line`,
 * the rest `light`, `mid` or `dark` by which side of the centre they lie.
 */
export function body(
  w: number,
  h: number,
  inside: (x: number, y: number) => boolean,
  c: { line: string; light: string; mid: string; dark: string },
  bias = 0.15,
): string {
  const at = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && inside(x, y);
  return grid(w, h, (x, y) => {
    if (!at(x, y)) return ".";
    if (!at(x - 1, y) || !at(x + 1, y) || !at(x, y - 1) || !at(x, y + 1)) return c.line;
    const t = (x + 0.5 - w / 2) / w + (y + 0.5 - h / 2) / h;
    return t < -bias ? c.light : t > bias ? c.dark : c.mid;
  });
}

/** Point in a five-pointed star centred in a `size` square, point up. */
export function inStar(x: number, y: number, size: number, inner = 0.42): boolean {
  const cx = size / 2;
  const cy = size / 2 + size * 0.05;
  const px = x + 0.5 - cx;
  const py = y + 0.5 - cy;
  const a = Math.atan2(px, -py);
  const r = Math.hypot(px, py);
  const sector = (2 * Math.PI) / 5;
  const k = (((a % sector) + sector) % sector) / sector;
  const outer = size / 2;
  // Radius of the star's edge at this angle: linear between point and notch.
  const tri = Math.abs(k - 0.5) * 2;
  const edge = outer * inner + (outer - outer * inner) * tri ** 1.6;
  return r <= edge;
}

/** A mask grid (`#` inside) as an inside test for `body`. */
export function mask(src: string): (x: number, y: number) => boolean {
  const m = cells(src);
  return (x, y) => m[y]?.[x] === "#";
}
