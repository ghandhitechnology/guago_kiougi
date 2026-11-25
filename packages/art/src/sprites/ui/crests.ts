import { body, grid, mask, stack } from "../../draw.ts";
import { type Legend, sprite } from "../../format.ts";
import { gridRows } from "../../grid.ts";

/**
 * Club crests (PLAN §12 "과잠"): a club builds one in the 동아리 editor from a background, a
 * symbol and a border, in two colours of its choosing, and members wear it on the back of the
 * 과잠. (`emblem` is the five class emblems, so these are `crest`.)
 *
 * Every part is drawn in two swap slots, so one grid serves every club: the background in the
 * club's `emblem` colour, the symbol and the dark borders in its `jacket` colour. Parts stack at
 * one point, background, then border, then symbol:
 *
 * - `crest`: 6×6, drawn at the 과잠's `emblem` anchor: a background and a 4×4 symbol with a
 *   pixel of background all round it. Designed first, a pixel at a time.
 * - `crest-large`: 24×24, for the editor and the club panel. The same silhouettes: backgrounds
 *   are the small masks redrawn as smooth shapes, symbols are the small masks at ×4, like felt,
 *   and a border round the edge, which the back panel has no room for.
 *
 * Frames: `bg/<shape>`, `symbol/<name>`, and in the large set `border/<style>/<shape>` (a
 * border follows its background's edge, so there is one per shape).
 */

const legend: Legend = {
  ".": null,
  B: "emblem.deep",
  b: "emblem.dark",
  M: "emblem.mid",
  L: "emblem.light",
  J: "jacket.deep",
  j: "jacket.dark",
  c: "jacket.mid",
  C: "jacket.light",
  D: "gold.deep",
  a: "gold.mid",
  A: "gold.light",
};
/** Borders and symbols are drawn onto a background: any pixel may stand alone. */
const LONE = "BbMLJjcCDaA";

// Backgrounds -------------------------------------------------------------------------------

/** 6×6 masks, `#` inside. */
const SHAPES: Readonly<Record<string, string>> = {
  shield: stack("######", "######", "######", "######", ".####.", "..##.."),
  circle: stack(".####.", "######", "######", "######", "######", ".####."),
  hexagon: stack("..##..", ".####.", "######", "######", ".####.", "..##.."),
  square: stack("######", "######", "######", "######", "######", "######"),
  banner: stack("######", "######", "######", "######", "######", "##..##"),
  pennant: stack("######", "######", "######", ".####.", ".####.", "..##.."),
};

/** The same shapes at 24×24, as smooth outlines. */
const LARGE: Readonly<Record<string, (x: number, y: number) => boolean>> = {
  shield: (x, y) => {
    if (y < 12) return true;
    const t = (y + 0.5 - 12) / 12;
    return Math.abs(x + 0.5 - 12) <= 12 * (1 - t ** 1.6);
  },
  circle: (x, y) => {
    const dx = Math.max(0, Math.abs(x + 0.5 - 12) - 6);
    const dy = Math.max(0, Math.abs(y + 0.5 - 12) - 6);
    return Math.hypot(dx, dy) <= 6.2;
  },
  hexagon: (x, y) => Math.abs(x + 0.5 - 12) <= 12 - Math.abs(y + 0.5 - 12) * 0.62 && y >= 0,
  square: () => true,
  banner: (x, y) => !(y >= 18 && Math.abs(x + 0.5 - 12) < (y + 0.5 - 18) * 1.4),
  pennant: (x, y) => Math.abs(x + 0.5 - 12) <= 12 - Math.max(0, y + 0.5 - 10) * 0.85,
};

const fill = { line: "B", light: "L", mid: "M", dark: "b" };

/** A mask's edge pixels (touching the outside in four directions). */
function edge(inside: (x: number, y: number) => boolean, x: number, y: number, n: number): boolean {
  const at = (xx: number, yy: number) => xx >= 0 && yy >= 0 && xx < n && yy < n && inside(xx, yy);
  return at(x, y) && (!at(x - 1, y) || !at(x + 1, y) || !at(x, y - 1) || !at(x, y + 1));
}

/** Border styles: each recolours the edge of a background's mask. */
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
  /** A light trim in the jacket's own colour. */
  trim: (inside, x, y, n) => (edge(inside, x, y, n) ? "C" : "."),
  /** Stitches round the edge, every other pixel. */
  stitch: (inside, x, y, n) => (edge(inside, x, y, n) && (x + y) % 2 === 0 ? "J" : "."),
};

/** A small background: flat, lit from the top left, no outline, so the colour carries it. */
function flat(src: string): string {
  const m = mask(src);
  return grid(6, 6, (x, y) => (m(x, y) ? (x + y < 6 ? "L" : "M") : "."));
}

// Symbols ---------------------------------------------------------------------------------
// 4×4 masks: the back panel leaves a one-pixel ring of background round them on every shape.

const SYMBOLS: Readonly<Record<string, string>> = {
  /** 수학 */
  setsquare: stack("#...", "##..", "#.#.", "####"),
  compass: stack(".##.", ".##.", "#..#", "#..#"),
  pi: stack("####", ".#.#", ".#.#", ".#.#"),
  sigma: stack("####", ".#..", "#...", "####"),
  /** 물리 */
  atom: stack("#..#", ".##.", ".##.", "#..#"),
  magnet: stack("#..#", "#..#", "#..#", ".##."),
  bolt: stack("..##", ".##.", "####", ".#.."),
  apple: stack("..#.", ".##.", "####", ".##."),
  /** 화학 */
  flask: stack(".##.", ".##.", "#..#", "####"),
  ring: stack(".##.", "#..#", "#..#", ".##."),
  flame: stack(".#..", ".##.", "####", ".##."),
  /** 생명 */
  dna: stack("#..#", ".##.", "#..#", ".##."),
  leaf: stack("..##", ".###", "###.", "#..."),
  sprout: stack("#..#", ".##.", ".#..", ".#.."),
  /** 지구과학 */
  planet: stack(".##.", "####", ".##.", "#..#"),
  moon: stack(".##.", "#...", "#...", ".##."),
  star: stack(".##.", "####", ".##.", "#..#"),
  mountain: stack("....", ".#..", "###.", "####"),
  /** 학교 */
  pinecone: stack(".##.", "#.##", "##.#", ".##."),
  cat: stack("#..#", "####", "#.##", ".##."),
  pencil: stack("...#", "..##", ".##.", "#..."),
  book: stack("####", "#..#", "####", "####"),
  crown: stack("#..#", "#..#", "####", "####"),
  heart: stack("#.#.", "####", ".##.", "...."),
};

// Sprites -----------------------------------------------------------------------------------

/** A 4×4 symbol in the middle of the 6×6 panel, in the jacket's dark. */
function centred(src: string): string {
  const m = mask(src);
  return grid(6, 6, (x, y) =>
    x >= 1 && y >= 1 && x <= 4 && y <= 4 && m(x - 1, y - 1) ? "j" : ".",
  );
}

/** The 4×4 symbol at ×4 in the middle of 24×24, outlined and lit from the top left, like felt. */
function felt(src: string): string {
  const m = mask(src);
  const big = (x: number, y: number) => {
    const sx = Math.floor((x - 4) / 4);
    const sy = Math.floor((y - 4) / 4);
    return x >= 4 && y >= 4 && sx < 4 && sy < 4 && m(sx, sy);
  };
  return grid(24, 24, (x, y) => {
    if (big(x, y)) return !big(x, y - 1) || !big(x - 1, y) ? "C" : "c";
    const near = [-1, 0, 1].some((dy) => [-1, 0, 1].some((dx) => big(x + dx, y + dy)));
    return near ? "J" : ".";
  });
}

const ui = { group: "ui", origin: [0, 0], anim: {} } as const;

const small: Record<string, string> = {};
const large: Record<string, string> = {};
for (const [name, src] of Object.entries(SHAPES)) {
  small[`bg/${name}`] = flat(src);
  const inside = LARGE[name] as (x: number, y: number) => boolean;
  large[`bg/${name}`] = body(24, 24, inside, fill);
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
