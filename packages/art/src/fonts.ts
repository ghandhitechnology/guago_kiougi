/**
 * Bitmap fonts. Canvas text with a pixel font is never crisp (engine-notes §10), so every
 * letter in the game is drawn from an atlas built here, in the BMFont XML that Phaser's
 * `load.bitmapFont` reads:
 *
 * - Galmuri faces from their BDF sources, one colour (white, tinted at runtime), packed into a
 *   1-bit PNG. Each face carries all 11,172 Hangul syllables, compatibility jamo, ASCII and the
 *   punctuation and science signs Korean copy uses.
 * - Hand-drawn `glyphs` fonts (damage numerals), in palette colours.
 */
import { copyFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { crc32, deflateSync } from "node:zlib";
import type { CompiledGlyphs } from "./glyphs.ts";
import type { FontMeta } from "./meta.ts";
import { pack } from "./pack.ts";
import { INDEX_RGB } from "./palette.ts";
import { Rgba } from "./raster.ts";
import { type BitmapFont, galmuriDir, loadBdf } from "./sheet/font.ts";

export const MAX_FONT_ATLAS = 2048;

/** Where font files go, inside the build directory. */
export const FONT_DIR = "fonts";

/** The Galmuri faces the game ships. `size` is the nominal pixel size BitmapText draws 1:1. */
export const FACES = [
  { name: "galmuri11", file: "Galmuri11.bdf", face: "Galmuri11", size: 12 },
  { name: "galmuri11-bold", file: "Galmuri11-Bold.bdf", face: "Galmuri11 Bold", size: 12 },
  { name: "galmuri9", file: "Galmuri9.bdf", face: "Galmuri9", size: 10 },
] as const;

const RANGES: readonly (readonly [number, number, "required" | "optional"])[] = [
  [0x20, 0x7e, "required"], // ASCII
  [0xac00, 0xd7a3, "required"], // Hangul syllables
  [0x3131, 0x3163, "required"], // modern compatibility jamo: ㅋㅋ, ㅠㅠ
  [0x3164, 0x318e, "optional"], // archaic compatibility jamo
];

/** Punctuation and signs beyond ASCII. Each face takes the ones it has. */
const SIGNS = [
  "「」『』《》〈〉‘’“”·…~♪♥♡★☆※○●◎□■△▲▽▼◆◇→←↑↓—–−×÷±°℃‰",
  "≠≤≥≈∞√∫πΣΔθλμαβγδεσφωΩ′″¹²³⁴½、。・",
].join("");

/** Signs Korean copy cannot do without; a face missing one fails the build. */
const REQUIRED_SIGNS = "「」·…~";

export function charset(font: BitmapFont, where: string): number[] {
  const codes: number[] = [];
  const missing: string[] = [];
  const want = (code: number, required: boolean): void => {
    if (font.glyphs.has(code)) codes.push(code);
    else if (required) missing.push(String.fromCodePoint(code));
  };
  for (const [from, to, need] of RANGES) {
    for (let c = from; c <= to; c++) want(c, need === "required");
  }
  for (const ch of SIGNS) want(ch.codePointAt(0) as number, REQUIRED_SIGNS.includes(ch));
  if (missing.length > 0) {
    throw new Error(`${where} lacks ${missing.length} required glyphs: ${missing.slice(0, 20)}`);
  }
  return [...new Set(codes)].sort((a, b) => a - b);
}

interface Char {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly xoffset: number;
  readonly yoffset: number;
  readonly xadvance: number;
}

export interface BuiltFont {
  readonly name: string;
  readonly png: Buffer;
  readonly xml: string;
  readonly meta: FontMeta;
}

function xml(
  face: string,
  meta: Omit<FontMeta, "image" | "data" | "chars" | "tint" | "ink">,
  w: number,
  h: number,
  file: string,
  chars: readonly Char[],
): string {
  const lines = chars.map(
    (c) =>
      `<char id="${c.id}" x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" xoffset="${c.xoffset}" yoffset="${c.yoffset}" xadvance="${c.xadvance}"/>`,
  );
  return [
    '<?xml version="1.0"?>',
    "<font>",
    `<info face="${face}" size="${meta.size}"/>`,
    `<common lineHeight="${meta.lineHeight}" base="${meta.base}" scaleW="${w}" scaleH="${h}" pages="1"/>`,
    `<pages><page id="0" file="${file}"/></pages>`,
    `<chars count="${chars.length}">`,
    ...lines,
    "</chars>",
    "</font>",
    "",
  ].join("\n");
}

function packOrThrow(name: string, rects: { key: string; w: number; h: number }[]) {
  const layout = pack(
    rects.filter((r) => r.w > 0 && r.h > 0),
    MAX_FONT_ATLAS,
    1,
  );
  if (!layout) throw new Error(`font ${name} does not fit in ${MAX_FONT_ATLAS}×${MAX_FONT_ATLAS}`);
  return layout;
}

function chunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body) >>> 0, body.length + 4);
  return out;
}

/** A 1-bit PNG: palette of clear and white. A quarter of an 8-bit grey file before deflate. */
export function maskPng(w: number, h: number, on: Uint8Array): Buffer {
  const stride = Math.ceil(w / 8) + 1;
  const raw = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * stride + 1 + (x >> 3);
      if (on[y * w + x]) raw[i] = (raw[i] as number) | (0x80 >> (x & 7));
    }
  }
  const head = Buffer.alloc(13);
  head.writeUInt32BE(w, 0);
  head.writeUInt32BE(h, 4);
  head.set([1, 3, 0, 0, 0], 8); // bit depth 1, indexed colour
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", head),
    chunk("PLTE", Buffer.from([0, 0, 0, 255, 255, 255])),
    chunk("tRNS", Buffer.from([0])),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Packs one Galmuri face into a white 1-bit atlas and its BMFont data. */
export function buildFace(face: (typeof FACES)[number], dir = galmuriDir()): BuiltFont {
  const font = loadBdf(join(dir, face.file));
  const codes = charset(font, face.file);
  const layout = packOrThrow(
    face.name,
    codes.map((c) => {
      const g = font.glyphs.get(c);
      return { key: String(c), w: g?.w ?? 0, h: g?.h ?? 0 };
    }),
  );
  const on = new Uint8Array(layout.w * layout.h);
  const chars: Char[] = codes.map((id) => {
    const g = font.glyphs.get(id);
    if (!g) throw new Error(`${face.file}: no glyph ${id}`);
    const at = layout.at.get(String(id)) ?? { x: 0, y: 0 };
    g.rows.forEach((bits, row) => {
      for (let col = 0; col < g.w; col++) {
        if ((bits >>> (31 - col)) & 1) on[(at.y + row) * layout.w + at.x + col] = 1;
      }
    });
    return {
      id,
      x: at.x,
      y: at.y,
      w: g.w,
      h: g.h,
      xoffset: g.x,
      yoffset: font.ascent - g.y - g.h,
      xadvance: g.advance,
    };
  });
  const ga = font.glyphs.get(0xac00);
  const meta = { size: face.size, lineHeight: font.lineHeight, base: font.ascent };
  const file = `${face.name}.png`;
  return {
    name: face.name,
    png: maskPng(layout.w, layout.h, on),
    xml: xml(face.face, meta, layout.w, layout.h, file, chars),
    meta: {
      ...meta,
      image: `${FONT_DIR}/${file}`,
      data: `${FONT_DIR}/${face.name}.xml`,
      chars: chars.length,
      tint: true,
      ink: { top: font.ascent - (ga?.y ?? 0) - (ga?.h ?? 0), height: ga?.h ?? 0 },
    },
  };
}

/** Packs a hand-drawn glyph font into a palette-coloured atlas and its BMFont data. */
export function buildGlyphFont(g: CompiledGlyphs): BuiltFont {
  const layout = packOrThrow(
    g.name,
    g.glyphs.map((d, i) => ({ key: String(i), w: d.img.w, h: d.img.h })),
  );
  const png = new Rgba(layout.w, layout.h);
  const chars: Char[] = [
    { id: 32, x: 0, y: 0, w: 0, h: 0, xoffset: 0, yoffset: 0, xadvance: g.space },
  ];
  g.glyphs.forEach((d, i) => {
    const at = layout.at.get(String(i)) as { x: number; y: number };
    png.draw(d.img, at.x, at.y, INDEX_RGB);
    for (const ch of d.chars) {
      chars.push({
        id: ch.codePointAt(0) as number,
        x: at.x,
        y: at.y,
        w: d.img.w,
        h: d.img.h,
        xoffset: 0,
        yoffset: 0,
        xadvance: d.img.w + g.spacing,
      });
    }
  });
  chars.sort((a, b) => a.id - b.id);
  const meta = { size: g.height, lineHeight: g.height, base: g.base };
  const file = `${g.name}.png`;
  return {
    name: g.name,
    png: png.png(),
    xml: xml(g.name, meta, layout.w, layout.h, file, chars),
    meta: {
      ...meta,
      image: `${FONT_DIR}/${file}`,
      data: `${FONT_DIR}/${g.name}.xml`,
      chars: chars.length,
      tint: false,
      ink: { top: 0, height: g.height },
    },
  };
}

/** Writes every font and Galmuri's licence into `<dir>/fonts`. */
export function writeFonts(dir: string, fonts: readonly BuiltFont[]): void {
  const out = join(dir, FONT_DIR);
  for (const f of fonts) {
    writeFileSync(join(out, `${f.name}.png`), f.png);
    writeFileSync(join(out, `${f.name}.xml`), f.xml);
  }
  copyFileSync(join(galmuriDir(), "LICENSE.txt"), join(out, "OFL-Galmuri.txt"));
}
