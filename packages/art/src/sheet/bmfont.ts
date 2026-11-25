/**
 * Reads the BMFont XML the build writes, the way Phaser's ParseXMLBitmapFont does, and lays
 * out text with it. Browser-safe: the page and the static sheets both draw text through this.
 */

export interface BmChar {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly xoffset: number;
  readonly yoffset: number;
  readonly xadvance: number;
}

export interface BmFont {
  readonly size: number;
  readonly lineHeight: number;
  readonly base: number;
  readonly chars: ReadonlyMap<number, BmChar>;
}

const num = (tag: string, attr: string): number => {
  const m = new RegExp(`\\b${attr}="(-?\\d+)"`).exec(tag);
  if (!m) throw new Error(`BMFont tag lacks ${attr}: ${tag.slice(0, 60)}`);
  return Number(m[1]);
};

export function parseBmFont(xml: string): BmFont {
  const info = /<info [^>]*>/.exec(xml)?.[0] ?? "";
  const common = /<common [^>]*>/.exec(xml)?.[0] ?? "";
  const chars = new Map<number, BmChar>();
  for (const [tag] of xml.matchAll(/<char [^>]*>/g)) {
    chars.set(num(tag, "id"), {
      x: num(tag, "x"),
      y: num(tag, "y"),
      w: num(tag, "width"),
      h: num(tag, "height"),
      xoffset: num(tag, "xoffset"),
      yoffset: num(tag, "yoffset"),
      xadvance: num(tag, "xadvance"),
    });
  }
  return {
    size: num(info, "size"),
    lineHeight: num(common, "lineHeight"),
    base: num(common, "base"),
    chars,
  };
}

export function measure(font: BmFont, text: string): number {
  let w = 0;
  for (const ch of text) w += font.chars.get(ch.codePointAt(0) ?? 0)?.xadvance ?? 0;
  return w;
}

export interface Placed {
  readonly c: BmChar;
  readonly x: number;
  readonly y: number;
}

/** Where each glyph of one line lands when the line's top left is at (x, y). */
export function place(font: BmFont, text: string, x: number, y: number): Placed[] {
  const out: Placed[] = [];
  let pen = x;
  for (const ch of text) {
    const c = font.chars.get(ch.codePointAt(0) ?? 0);
    if (!c) continue;
    if (c.w > 0 && c.h > 0) out.push({ c, x: pen + c.xoffset, y: y + c.yoffset });
    pen += c.xadvance;
  }
  return out;
}
