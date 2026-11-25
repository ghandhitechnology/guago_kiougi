import { grid, over, stack } from "../../draw.ts";
import { sprite } from "../../format.ts";
import { UI } from "../../ui-legend.ts";

/**
 * Item slots and books. A slot is a well in the page with a frame in the book's grade colour
 * (PLAN §8): 교과서 gray, 참고서 green, 심화서 blue, 전공서 purple, 원서 gold. Higher grades
 * earn metal corners, the way a good book is bound. The selected slot is circled in red pen.
 */
const ui = { group: "ui", origin: [0, 0], anim: {} } as const;

const LEGEND = {
  ...UI,
  // Sea, plum and grass, for grade rings and book covers.
  "1": "sea.deep",
  "2": "sea.dark",
  "3": "sea.mid",
  "4": "sea.light",
  "6": "plum.deep",
  "7": "plum.dark",
  "8": "plum.mid",
  "9": "plum.light",
  "0": "plum.pale",
  F: "grass.deep",
  f: "grass.dark",
  h: "grass.mid",
  H: "grass.light",
  j: "grass.pale",
  // Sea pale, gold deep and wood, for the newer covers.
  "5": "sea.pale",
  v: "gold.deep",
  a: "wood.deep",
  c: "wood.dark",
  C: "wood.mid",
  E: "wood.light",
  // Lone details: glints, symbols and pips on covers.
  "*": "stone.bright",
  w: "stone.bright",
  q: "ink.dark",
  t: "gold.pale",
} as const;

const SLOT = 24;

interface Grade {
  /** Ring light (top and left), ring shade (bottom and right), the line inside the ring. */
  readonly light: string;
  readonly shade: string;
  readonly line: string;
  /** Metal on the four corners, if any: light then shade. */
  readonly corner?: readonly [string, string];
  readonly glint?: boolean;
}

function slot(g: Grade): string {
  const e = SLOT - 1;
  return grid(SLOT, SLOT, (x, y) => {
    const edge = Math.min(x, y, e - x, e - y);
    const corner = (x < 4 || x > e - 4) && (y < 4 || y > e - 4);
    if (edge === 0) return (x === 0 || x === e) && (y === 0 || y === e) ? "." : "o";
    if (g.glint && ((x === 2 && y === 2) || (x === e - 3 && y === e - 3))) return "*";
    if (edge <= 2) {
      if (corner && g.corner) return x + y < e ? g.corner[0] : g.corner[1];
      const lit = (y === edge && x < e - edge) || (x === edge && y < e - edge);
      return lit ? g.light : g.shade;
    }
    if (edge === 3) return corner && g.corner ? g.corner[x + y < e ? 0 : 1] : g.line;
    const lit = y === 4 || x === 4;
    return lit ? "s" : "p";
  });
}

const item = sprite({
  ...ui,
  name: "item",
  size: [SLOT, SLOT],
  palette: LEGEND,
  lone: "*",
  frames: {
    textbook: slot({ light: "s", shade: "S", line: "D" }),
    reference: slot({ light: "H", shade: "h", line: "F" }),
    advanced: slot({ light: "b", shade: "n", line: "k", corner: ["B", "b"] }),
    major: slot({ light: "9", shade: "8", line: "6", corner: ["Y", "g"] }),
    original: slot({ light: "Y", shade: "g", line: "u", corner: ["y", "Y"], glint: true }),
  },
});

/**
 * An empty slot is only a cell pressed into the well, so a bag of empties stays quiet. It is
 * ruling on the well, not a shape of its own, so it has no outline.
 */
const itemEmpty = sprite({
  ...ui,
  name: "item-empty",
  size: [SLOT, SLOT],
  outline: false,
  palette: LEGEND,
  frames: {
    idle: grid(SLOT, SLOT, (x, y) => {
      const e = SLOT - 1;
      if (x === 0 || y === 0) return x === e || y === e ? "." : "s";
      if (x === e || y === e) return "W";
      return ".";
    }),
  },
});

/**
 * The red-pen circle around a selected slot: a two-pixel loop that runs past where it
 * closes, top right, the way a pen does.
 */
const SEL = 32;
const itemSelect = sprite({
  ...ui,
  name: "item-select",
  size: [SEL, SEL],
  outline: false,
  palette: LEGEND,
  frames: {
    idle: over(
      grid(SEL, SEL, (x, y) => {
        const r = 7;
        const lo = 2 + r;
        const hi = SEL - 3 - r;
        const dx = Math.max(lo - x - 0.5, 0, x + 0.5 - hi);
        const dy = Math.max(lo - y - 0.5, 0, y + 0.5 - hi);
        const d = Math.hypot(dx, dy) - r;
        if (d > -1.6 && d <= 0.4) return x + y < SEL - 4 ? "R" : "r";
        return ".";
      }),
      stack("....RR", "..RR..", "RR...."),
      SEL - 11,
      0,
    ),
  },
});

export default [item, itemEmpty, itemSelect];
