import { grid, stack } from "../../draw.ts";
import { sprite } from "../../format.ts";
import { UI } from "../../ui-legend.ts";

/**
 * Surfaces. A menu is a page of the 0조 연구노트: cream paper laid on a navy hard cover bound
 * with black tape down the spine, the cover thick at the top where the title goes. Wells are
 * answer boxes ruled into the page.
 */
const ui = { group: "ui", origin: [0, 0], anim: {} } as const;

/** Left inset of a cover: outline, three columns of spine tape, then three of cover. */
const SPINE = 7;

/**
 * A notebook cover with a page on it: spine tape on the left, `top` rows of cover above the
 * page, and the page's bottom-right corner dog-eared by `fold` pixels (0 for none). The page is
 * the stretched middle; the fold sits in the fixed corner, so it never stretches.
 */
function cover(
  top: number,
  fold: number,
): { grid: string; size: [number, number]; slice: [number, number, number, number] } {
  const right = 5 + fold;
  const bottom = 5 + fold;
  const w = SPINE + 2 + right;
  const h = top + 2 + bottom;
  const pageR = w - 5;
  const pageB = h - 5;
  const onPage = (x: number, y: number) => x >= SPINE && x <= pageR && y >= top && y <= pageB;
  const cut = (x: number, y: number) => fold > 0 && pageR - x + (pageB - y) < fold;
  const page = (x: number, y: number) => onPage(x, y) && !cut(x, y);
  const art = grid(w, h, (x, y) => {
    const edgeX = x === 0 || x === w - 1;
    const edgeY = y === 0 || y === h - 1;
    if (edgeX && edgeY) return ".";
    if (edgeX || edgeY) return "o";
    if (x === 1) return "m";
    if (x < 4) return "k";
    if (page(x, y)) {
      const u = pageR - x;
      const v = pageB - y;
      if (fold > 0 && u <= fold && v <= fold) {
        // The folded flap shows the back of the page; its crease and rims are a step darker.
        if (u + v === fold) return "S";
        if (u + v > fold) return u === fold || v === fold ? "s" : "p";
      }
      return u === 0 || v === 0 ? "s" : "W";
    }
    // The page's shadow on the cover, right and below, and under the lifted flap.
    const shadowRight =
      x === pageR + 1 && y >= top && y <= pageB + 1 && page(pageR, Math.min(y, pageB));
    const shadowBelow =
      y === pageB + 1 && x >= SPINE && x <= pageR + 1 && page(Math.min(x, pageR), pageB);
    const underFlap = onPage(x, y) && cut(x, y) && pageR - x + (pageB - y) === fold - 1;
    if (shadowRight || shadowBelow || underFlap) return "N";
    if (y === 1) return x === w - 2 ? "n" : "b";
    if (x === 4) return "b";
    if (x === w - 2 || y === h - 2) return "N";
    return "n";
  });
  return { grid: art, size: [w, h], slice: [SPINE, right, top, bottom] };
}

const PANEL = cover(19, 6);
const DIALOG = cover(5, 0);

/** Main panel: title on the cover's top band, content on the page, its last corner dog-eared. */
const panel = sprite({
  ...ui,
  name: "panel",
  size: PANEL.size,
  slice: PANEL.slice,
  palette: UI,
  frames: { idle: PANEL.grid },
});

/** Dialogue box: the same notebook with a thin cover. */
const dialog = sprite({
  ...ui,
  name: "dialog",
  size: DIALOG.size,
  slice: DIALOG.slice,
  palette: UI,
  frames: { idle: DIALOG.grid },
});

/** The name label stuck on a cover, where a student writes the subject. */
const label = sprite({
  ...ui,
  name: "label",
  size: [7, 15],
  slice: [3, 3, 7, 7],
  palette: UI,
  frames: { idle: stack(".ooooo.", ["oWWWWWo", 12], "opppppo", ".ooooo.") },
});

/** Answer box ruled into the page: recessed, shadow at the top left. */
const inset = sprite({
  ...ui,
  name: "inset",
  size: [7, 7],
  slice: [3, 3, 3, 3],
  palette: UI,
  frames: {
    idle: stack("DDDDDDD", "DsssssD", ["DspppWD", 3], "DsWWWWD", "DDDDDDD"),
  },
});

/**
 * A list row on ruled paper. Hover is a highlighter swipe with chisel-cut ends, selection a
 * red-pen loop. Rows lie on the page, so they have no outline of their own.
 */
const row = sprite({
  ...ui,
  name: "row",
  size: [7, 16],
  slice: [3, 3, 7, 8],
  outline: false,
  palette: UI,
  frames: {
    idle: stack([".......", 15], "sssssss"),
    hover: stack(
      [".......", 2],
      "..yyyyy",
      ".yyyyyy",
      ["yyyyyyy", 8],
      "yyyyyy.",
      "yyyyy..",
      ".......",
      "sssssss",
    ),
    selected: stack(".rrrrr.", ["r.....r", 13], ".rrrrr.", "sssssss"),
  },
});

/** Index tab on the dialogue box: rises from the cover, open at the bottom. */
const nametab = sprite({
  ...ui,
  name: "nametab",
  size: [7, 18],
  slice: [3, 3, 8, 9],
  outline: false,
  palette: UI,
  frames: {
    idle: stack(".ooooo.", "obbbbno", ["obnnnNo", 14], "onnnnno", ".nnnnn."),
  },
});

/** The pink margin line ruled down a notebook page. */
const margin = sprite({
  ...ui,
  name: "margin",
  size: [1, 3],
  slice: [0, 0, 1, 1],
  outline: false,
  palette: UI,
  frames: { idle: stack("P", "P", "P") },
});

/** Where a 48×48 portrait mounts: a recess on the page, held by four photo corners. */
const PORTRAIT = 52;
const portraitSlot = sprite({
  ...ui,
  name: "portrait-slot",
  size: [PORTRAIT, PORTRAIT],
  palette: UI,
  frames: {
    idle: grid(PORTRAIT, PORTRAIT, (x, y) => {
      const e = PORTRAIT - 1;
      if (x === 0 || y === 0 || x === e || y === e) return "D";
      if (x === 1 || y === 1) return "s";
      return "p";
    }),
  },
});

const LEG = 9;
const portraitCorners = sprite({
  ...ui,
  name: "portrait-corners",
  size: [PORTRAIT, PORTRAIT],
  palette: UI,
  frames: {
    idle: grid(PORTRAIT, PORTRAIT, (x, y) => {
      const e = PORTRAIT - 1;
      // Distance into the nearest corner along each axis.
      const cx = x < PORTRAIT / 2 ? x : e - x;
      const cy = y < PORTRAIT / 2 ? y : e - y;
      if (cx + cy > LEG) return ".";
      if (cx === 0 || cy === 0 || cx + cy === LEG) return "o";
      // Light from the top left: edges facing up or left catch it.
      const facesLight = (x < PORTRAIT / 2 && cx === 1) || (y < PORTRAIT / 2 && cy === 1);
      const facesShade = (x >= PORTRAIT / 2 && cx === 1) || (y >= PORTRAIT / 2 && cy === 1);
      if (facesLight && !facesShade) return "b";
      if (facesShade) return "N";
      return "n";
    }),
  },
});

/** The page-turn mark under the last line of dialogue. */
const caret = sprite({
  ...ui,
  name: "caret",
  size: [7, 6],
  palette: UI,
  frames: {
    up: stack("ooooooo", "obbbbNo", ".onnNo.", "..oNo..", "...o...", "......."),
    down: stack(".......", "ooooooo", "obbbbNo", ".onnNo.", "..oNo..", "...o..."),
  },
  anim: { bob: { frames: ["up", "down"], fps: 3 } },
});

/** Tooltip: a sticky note with its corner folded over. */
const tooltip = sprite({
  ...ui,
  name: "tooltip",
  size: [8, 8],
  slice: [3, 4, 3, 4],
  palette: UI,
  frames: {
    idle: stack("uuuuuuuu", ["uyyyyyyu", 3], "uyyyYYYu", "uyyyYYu.", "uyyyYu..", "uuuuu..."),
  },
});

/** Speech bubble over a character, and its tail, drawn over the bubble's bottom edge. */
const bubble = sprite({
  ...ui,
  name: "bubble",
  size: [7, 7],
  slice: [3, 3, 3, 3],
  palette: UI,
  frames: { idle: stack(".ooooo.", ["oWWWWWo", 4], "opppppo", ".ooooo.") },
});

const bubbleTail = sprite({
  ...ui,
  name: "bubble-tail",
  size: [5, 3],
  outline: false,
  palette: UI,
  frames: { idle: stack("opppo", ".opo.", "..o..") },
});

/** Nameplate under a character: a dark card that reads on grass, stone and snow alike. */
const nameplate = sprite({
  ...ui,
  name: "nameplate",
  size: [5, 13],
  slice: [2, 2, 6, 6],
  palette: UI,
  frames: { idle: stack(".ooo.", "ommmo", ["okkko", 10], ".ooo.") },
});

export default [
  panel,
  dialog,
  label,
  inset,
  row,
  nametab,
  margin,
  portraitSlot,
  portraitCorners,
  caret,
  tooltip,
  bubble,
  bubbleTail,
  nameplate,
];
