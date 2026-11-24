import { grid, stack } from "../../draw.ts";
import { sprite } from "../../format.ts";
import { UI } from "../../ui-legend.ts";

/**
 * Surfaces. A menu is a page of the 0조 연구노트: cream paper laid on a navy hard cover bound
 * with black tape down the spine, the cover thick at the top where the title goes. Wells are
 * answer boxes ruled into the page.
 */
const ui = { group: "ui", origin: [0, 0], anim: {} } as const;

/** Spine tape, cover rows above the page; the page is the stretched middle. */
function cover(top: number) {
  return stack(
    ".oooooooooooo.",
    "omkkbbbbbbbbno",
    ["omkkbnnnnnnnNo", top - 2],
    ["omkkbnnWWsNnNo", 2],
    "omkkbnnsssNnNo",
    "omkkbnnNNNNnNo",
    "omkkbnnnnnnnNo",
    "omkkNNNNNNNNNo",
    ".oooooooooooo.",
  );
}

/** Main panel: title on the cover's top band, content on the page. */
const panel = sprite({
  ...ui,
  name: "panel",
  size: [14, 24],
  slice: [7, 5, 17, 5],
  palette: UI,
  frames: { idle: cover(17) },
});

/** Dialogue box: the same notebook with a thin cover. */
const dialog = sprite({
  ...ui,
  name: "dialog",
  size: [14, 12],
  slice: [7, 5, 5, 5],
  palette: UI,
  frames: { idle: cover(5) },
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
