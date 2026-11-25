import { cells, grid, mask, stack } from "../../draw.ts";
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
 * - The editor, the club page and lists draw the large and small sets in `emblems.ts`; the
 *   worn crest's symbols are that file's small ones redrawn at 4×4, so the jacket matches.
 *
 * Frames: `shape/<id>`, `symbol/<id>`.
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

/** A small shape: flat, lit from the top left, no outline, so the colour carries it. */
function flat(src: string): string {
  const m = mask(src);
  return grid(6, 6, (x, y) => (m(x, y) ? (x + y < 6 ? "L" : "M") : "."));
}

// Symbols -----------------------------------------------------------------------------------
// Masks up to 6×6, most 4×4, centred on the panel. The first fourteen are the content's ids;
// the rest are drawn ready for the list to grow.

const SYMBOLS: Readonly<Record<string, string>> = {
  // The content's fourteen, redrawn at 4×4 from the editor's 5×5 small symbols (`MINI` in
  // `emblems.ts`), so the jacket matches the editor and a pixel of shape shows all round.
  pi: stack("####", ".#.#", ".#.#", "#..#"),
  atom: stack("#..#", ".##.", ".##.", "#..#"),
  flask: stack(".##.", ".##.", "####", "####"),
  leaf: stack(".###", "####", "##.#", "#..."),
  planet: stack("..##", "####", "####", "##.."),
  pencil: stack("..##", ".##.", "##..", "#..."),
  book: stack("#..#", "#..#", "####", ".##."),
  gear: stack(".##.", "#..#", "#..#", ".##."),
  dna: stack("#..#", ".##.", "#..#", ".##."),
  magnet: stack(".##.", "#..#", "#..#", "#..#"),
  comet: stack("..##", ".###", "##..", "#..."),
  pinecone: stack(".##.", "####", "####", ".##."),
  infinity: stack("##.##", "#.#.#", "##.##"),
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

const ui = { group: "ui", origin: [0, 0], anim: {} } as const;

const small: Record<string, string> = {};
for (const [name, src] of Object.entries(SHAPES)) small[`shape/${name}`] = flat(src);
for (const [name, src] of Object.entries(SYMBOLS)) small[`symbol/${name}`] = centred(src);

const crest = sprite({
  ...ui,
  name: "crest",
  size: [6, 6],
  palette: legend,
  lone: LONE,
  outline: false,
  frames: small,
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

export default [crest, clubTag];
