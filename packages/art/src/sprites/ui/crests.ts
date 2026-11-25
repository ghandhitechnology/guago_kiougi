import { body, cells, grid, inStar, mask, stack } from "../../draw.ts";
import { type Legend, sprite } from "../../format.ts";

/**
 * Club crests (PLAN §12 "과잠"): the back emblem a club builds in the 동아리 editor, named by the
 * content's ids (`EMBLEM_SHAPES`, `EMBLEM_SYMBOLS`) and coloured by its `EMBLEM_COLORS` through
 * two swap slots: the shape in `emblem` (`Emblem.shapeColor`), the symbol in `mark`
 * (`Emblem.symbolColor`). One grid serves every colour. (`emblem` is already the five class
 * emblems' sprite, so these are `crest`.)
 *
 * - `crest`: 6×6, drawn at the 과잠's `jacket/varsity/emblem` anchor, shape then symbol. Designed
 *   first, a pixel at a time; the symbol keeps a pixel of shape round it where the shape allows.
 * - `crest-large`: 24×24, for the editor and the club panel. The same silhouettes: shapes as
 *   smooth outlines, symbols at ×4 like felt. Borders (`border/<style>/<shape>`) are here only,
 *   as a six-pixel panel has no room for them; `Emblem` has no border yet.
 *
 * Frames: `shape/<id>`, `symbol/<id>`, and in the large set `border/<style>/<shape>`.
 */

const legend: Legend = {
  ".": null,
  B: "emblem.deep",
  b: "emblem.dark",
  M: "emblem.mid",
  L: "emblem.light",
  K: "mark.deep",
  k: "mark.dark",
  n: "mark.mid",
  N: "mark.light",
  D: "gold.deep",
  A: "gold.light",
};
/** Symbols and borders are drawn onto a shape: any pixel may stand alone. */
const LONE = "BbMLKknNDA";

// Shapes ------------------------------------------------------------------------------------

/** 6×6 masks, `#` inside. */
const SHAPES: Readonly<Record<string, string>> = {
  shield: stack("######", "######", "######", "######", ".####.", "..##.."),
  circle: stack(".####.", "######", "######", "######", "######", ".####."),
  diamond: stack("..##..", ".####.", ".####.", ".####.", ".####.", "..##.."),
  banner: stack("######", "######", "######", "######", "######", "##..##"),
  hexagon: stack("..##..", ".####.", "######", "######", ".####.", "..##.."),
  star: stack("..##..", "..##..", "######", ".####.", ".####.", "##..##"),
  laurel: stack("#....#", "#....#", "##..##", ".#..#.", "..##..", "......"),
  crown: stack("#.##.#", "######", "######", "######", "######", "......"),
};

const at24 = (x: number, y: number) => [x + 0.5 - 12, y + 0.5 - 12] as const;

/** The same shapes at 24×24, as smooth outlines. */
const LARGE: Readonly<Record<string, (x: number, y: number) => boolean>> = {
  shield: (x, y) => {
    if (y < 12) return true;
    const t = (y + 0.5 - 12) / 12;
    return Math.abs(x + 0.5 - 12) <= 12 * (1 - t ** 1.6);
  },
  circle: (x, y) => Math.hypot(...at24(x, y)) <= 12,
  diamond: (x, y) => {
    const [dx, dy] = at24(x, y);
    return Math.abs(dx) / 9.5 + Math.abs(dy) / 12 <= 1;
  },
  banner: (x, y) => !(y >= 18 && Math.abs(x + 0.5 - 12) < (y + 0.5 - 18) * 1.4),
  hexagon: (x, y) => {
    const [dx, dy] = at24(x, y);
    return Math.abs(dx) <= 10.6 && Math.abs(dy) + Math.abs(dx) * 0.577 <= 12;
  },
  star: (x, y) => inStar(x, y, 24, 0.48),
  laurel: (x, y) => {
    const [dx, dy] = at24(x, y + 1);
    const r = Math.hypot(dx, dy);
    const open = dy < 0 && Math.abs(dx) < -dy * 0.75;
    return r >= 7.5 && r <= 12 && !open;
  },
  crown: (x, y) => {
    if (y >= 20) return false;
    if (y >= 9) return true;
    return [3, 12, 20.5].some((c) => Math.abs(x + 0.5 - c) <= 1 + y * 0.42);
  },
};

const fill = { line: "B", light: "L", mid: "M", dark: "b" };

/** A mask's edge pixels (touching the outside in four directions). */
function edge(inside: (x: number, y: number) => boolean, x: number, y: number, n: number): boolean {
  const at = (xx: number, yy: number) => xx >= 0 && yy >= 0 && xx < n && yy < n && inside(xx, yy);
  return at(x, y) && (!at(x - 1, y) || !at(x + 1, y) || !at(x, y - 1) || !at(x, y + 1));
}

/** Border styles: each recolours the edge of a shape. */
const BORDERS: Readonly<
  Record<
    string,
    (inside: (x: number, y: number) => boolean, x: number, y: number, n: number) => string
  >
> = {
  /** A dark edge: a patch sewn on. */
  rim: (inside, x, y, n) => (edge(inside, x, y, n) ? "B" : "."),
  /** A gold edge: for clubs that won something. */
  gold: (inside, x, y, n) => (edge(inside, x, y, n) ? (y < n / 2 ? "A" : "D") : "."),
  /** A trim in the symbol's colour. */
  trim: (inside, x, y, n) => (edge(inside, x, y, n) ? "N" : "."),
  /** Stitches round the edge, every other pixel. */
  stitch: (inside, x, y, n) => (edge(inside, x, y, n) && (x + y) % 2 === 0 ? "K" : "."),
};

/** A small shape: flat, lit from the top left, no outline, so the colour carries it. */
function flat(src: string): string {
  const m = mask(src);
  return grid(6, 6, (x, y) => (m(x, y) ? (x + y < 6 ? "L" : "M") : "."));
}

// Symbols -----------------------------------------------------------------------------------
// Masks up to 6×6, most 4×4, centred on the panel. The first fourteen are the content's ids;
// the rest are drawn ready for the list to grow.

const SYMBOLS: Readonly<Record<string, string>> = {
  pi: stack("####", ".#.#", ".#.#", ".#.#"),
  atom: stack("#..#", ".##.", ".##.", "#..#"),
  flask: stack(".##.", ".##.", "#..#", "####"),
  leaf: stack("..##", ".###", "###.", "#..."),
  planet: stack(".##.", "####", ".##.", "#..#"),
  pencil: stack("...#", "..##", ".##.", "#..."),
  book: stack("####", "#..#", "####", "####"),
  gear: stack("#.##.#", ".####.", "##..##", "##..##", ".####.", "#.##.#"),
  dna: stack("#..#", ".##.", "#..#", ".##."),
  magnet: stack("#..#", "#..#", "#..#", ".##."),
  comet: stack("#...", ".#..", "..##", "..##"),
  pinecone: stack(".##.", "#.##", "##.#", ".##."),
  infinity: stack("##..##", "#.##.#", "#.##.#", "##..##"),
  lightning: stack("..##", ".##.", "####", ".#.."),
  setsquare: stack("#...", "##..", "#.#.", "####"),
  compass: stack(".##.", ".##.", "#..#", "#..#"),
  sigma: stack("####", ".#..", "#...", "####"),
  apple: stack("..#.", ".##.", "####", ".##."),
  flame: stack(".#..", ".##.", "####", ".##."),
  sprout: stack("#..#", ".##.", ".#..", ".#.."),
  moon: stack(".##.", "#...", "#...", ".##."),
  star: stack(".##.", "####", ".##.", "#..#"),
  mountain: stack("....", ".#..", "###.", "####"),
  cat: stack("#..#", "####", "#.##", ".##."),
  heart: stack("#.#.", "####", ".##.", "...."),
};

// Sprites -----------------------------------------------------------------------------------

const sizeOf = (src: string): readonly [number, number] => {
  const rows = cells(src);
  return [rows[0]?.length ?? 0, rows.length];
};

/** A symbol in the middle of the 6×6 panel, in the mark's mid step. */
function centred(src: string): string {
  const m = mask(src);
  const [w, h] = sizeOf(src);
  const ox = Math.floor((6 - w) / 2);
  const oy = Math.floor((6 - h) / 2);
  return grid(6, 6, (x, y) => (m(x - ox, y - oy) ? "n" : "."));
}

/** The symbol at ×4 in the middle of 24×24, outlined and lit from the top left, like felt. */
function felt(src: string): string {
  const m = mask(src);
  const [w, h] = sizeOf(src);
  const ox = (24 - 4 * w) / 2;
  const oy = (24 - 4 * h) / 2;
  const big = (x: number, y: number) =>
    x >= ox &&
    y >= oy &&
    x < ox + 4 * w &&
    y < oy + 4 * h &&
    m(Math.floor((x - ox) / 4), Math.floor((y - oy) / 4));
  return grid(24, 24, (x, y) => {
    if (big(x, y)) return !big(x, y - 1) || !big(x - 1, y) ? "N" : "n";
    const near = [-1, 0, 1].some((dy) => [-1, 0, 1].some((dx) => big(x + dx, y + dy)));
    return near ? "K" : ".";
  });
}

const ui = { group: "ui", origin: [0, 0], anim: {} } as const;

const small: Record<string, string> = {};
const large: Record<string, string> = {};
for (const [name, src] of Object.entries(SHAPES)) {
  small[`shape/${name}`] = flat(src);
  const inside = LARGE[name] as (x: number, y: number) => boolean;
  large[`shape/${name}`] = body(24, 24, inside, fill);
  for (const [style, draw] of Object.entries(BORDERS)) {
    large[`border/${style}/${name}`] = grid(24, 24, (x, y) => draw(inside, x, y, 24));
  }
}
for (const [name, src] of Object.entries(SYMBOLS)) {
  small[`symbol/${name}`] = centred(src);
  large[`symbol/${name}`] = felt(src);
}

const crest = sprite({
  ...ui,
  name: "crest",
  size: [6, 6],
  palette: legend,
  lone: LONE,
  outline: false,
  frames: small,
});

const crestLarge = sprite({
  ...ui,
  name: "crest-large",
  size: [24, 24],
  palette: legend,
  lone: LONE,
  outline: false,
  frames: large,
});

/**
 * The club tag under a member's name: the nameplate's dark card with the club's colour down its
 * left edge, where the 6×6 crest sits. Stretches sideways for the club's name.
 */
const clubTag = sprite({
  ...ui,
  name: "club-tag",
  size: [11, 10],
  slice: [9, 1, 2, 2],
  palette: {
    ".": null,
    o: "ink.deep",
    k: "ink.dark",
    J: "jacket.deep",
    j: "jacket.dark",
    c: "jacket.mid",
  },
  frames: {
    idle: stack(
      ".JJJJJJJoo.",
      "JcccccccJko",
      "JcccccccJko",
      "JcccccccJko",
      "JcccccccJko",
      "JcccccccJko",
      "JcccccccJko",
      "JcccccccJko",
      "JjjjjjjjJko",
      ".JJJJJJJoo.",
    ),
  },
});

export default [crest, crestLarge, clubTag];
