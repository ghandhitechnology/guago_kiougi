import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { Rgba } from "../raster.ts";

interface Glyph {
  readonly advance: number;
  readonly w: number;
  readonly h: number;
  readonly x: number;
  readonly y: number;
  readonly rows: readonly number[];
}

export interface BitmapFont {
  readonly ascent: number;
  readonly lineHeight: number;
  readonly glyphs: ReadonlyMap<number, Glyph>;
}

/** Galmuri's BDF directory, resolved through the installed package. */
export function galmuriDir(): string {
  const require = createRequire(import.meta.url);
  return join(dirname(require.resolve("galmuri/package.json")), "dist");
}

/** Parses a BDF bitmap font. Only the fields the contact sheet needs. */
export function loadBdf(file: string): BitmapFont {
  const lines = readFileSync(file, "utf8").split("\n");
  const glyphs = new Map<number, Glyph>();
  let ascent = 0;
  let descent = 0;
  let code = -1;
  let advance = 0;
  let box = [0, 0, 0, 0];
  let rows: number[] | null = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (rows) {
      if (line === "ENDCHAR") {
        const [w = 0, h = 0, x = 0, y = 0] = box;
        glyphs.set(code, { advance, w, h, x, y, rows });
        rows = null;
      } else {
        rows.push(Number.parseInt(line, 16) << (32 - line.length * 4));
      }
      continue;
    }
    const [key, ...rest] = line.split(" ");
    if (key === "FONT_ASCENT") ascent = Number(rest[0]);
    else if (key === "FONT_DESCENT") descent = Number(rest[0]);
    else if (key === "ENCODING") code = Number(rest[0]);
    else if (key === "DWIDTH") advance = Number(rest[0]);
    else if (key === "BBX") box = rest.map(Number);
    else if (key === "BITMAP") rows = [];
  }
  return { ascent, lineHeight: ascent + descent, glyphs };
}

export function textWidth(font: BitmapFont, text: string): number {
  let w = 0;
  for (const ch of text) w += font.glyphs.get(ch.codePointAt(0) ?? 0)?.advance ?? 0;
  return w;
}

/** Draws text with its top at y. Returns the advance. */
export function drawText(
  out: Rgba,
  font: BitmapFont,
  text: string,
  x: number,
  y: number,
  rgb: readonly number[],
): number {
  let pen = x;
  for (const ch of text) {
    const g = font.glyphs.get(ch.codePointAt(0) ?? 0);
    if (!g) continue;
    const top = y + font.ascent - g.y - g.h;
    g.rows.forEach((bits, row) => {
      for (let col = 0; col < g.w; col++) {
        if ((bits >>> (31 - col)) & 1) out.rect(pen + g.x + col, top + row, 1, 1, rgb);
      }
    });
    pen += g.advance;
  }
  return pen - x;
}
