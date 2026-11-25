import { stack } from "../../draw.ts";
import { sprite } from "../../format.ts";
import { UI } from "../../ui-legend.ts";

/**
 * Controls on the page. Buttons are keycaps of paper or ink with a two-pixel depth that
 * disappears when pressed; hover is a highlighter pass; a ticked box carries the red pen.
 */
const ui = { group: "ui", origin: [0, 0], anim: {} } as const;

/** A keycap: `hi` top edge, `face`, `side` right edge, `low` bottom edge, `depth` below. */
function cap(hi: string, face: string, side: string, low: string, depth: string): string {
  return stack(
    ".ooooo.",
    `o${hi}${hi}${hi}${hi}${hi}o`,
    [`o${hi}${face}${face}${face}${side}o`, 13],
    `o${low}${low}${low}${low}${low}o`,
    `o${depth}${depth}${depth}${depth}${depth}o`,
    `o${depth}${depth}${depth}${depth}${depth}o`,
    ".ooooo.",
  );
}

/** Pressed: the cap sinks two pixels and its depth is gone. */
function sunk(shade: string, face: string): string {
  return stack(
    ".......",
    ".......",
    ".ooooo.",
    `o${shade}${shade}${shade}${shade}${shade}o`,
    [`o${shade}${face}${face}${face}${face}o`, 14],
    ".ooooo.",
  );
}

/** Text sits on the cap's face; pressed frames move it down by two. */
const btn = sprite({
  ...ui,
  name: "btn",
  size: [7, 19],
  slice: [3, 3, 8, 10],
  palette: UI,
  frames: {
    idle: cap("W", "p", "s", "s", "d"),
    hover: cap("W", "y", "Y", "Y", "d"),
    pressed: sunk("s", "p"),
    disabled: cap("p", "s", "s", "S", "S"),
  },
});

const btnInk = sprite({
  ...ui,
  name: "btn-ink",
  size: [7, 19],
  slice: [3, 3, 8, 10],
  palette: UI,
  frames: {
    idle: cap("b", "n", "N", "N", "k"),
    hover: cap("B", "b", "n", "n", "k"),
    pressed: sunk("N", "n"),
    disabled: cap("p", "s", "s", "S", "S"),
  },
});

/** Close: a chunky cross on the cover band. Hover inks it in red pen. */
function cross(fill: string): string {
  const f = fill;
  return stack(
    ".oo.....oo.",
    `o${f}${f}o...o${f}${f}o`,
    `o${f}${f}${f}o.o${f}${f}${f}o`,
    `.o${f}${f}${f}o${f}${f}${f}o.`,
    `..o${f}${f}${f}${f}${f}o..`,
    `...o${f}${f}${f}o...`,
    `..o${f}${f}${f}${f}${f}o..`,
    `.o${f}${f}${f}o${f}${f}${f}o.`,
    `o${f}${f}${f}o.o${f}${f}${f}o`,
    `o${f}${f}o...o${f}${f}o`,
    ".oo.....oo.",
  );
}

const close = sprite({
  ...ui,
  name: "close",
  size: [11, 11],
  palette: UI,
  frames: { idle: cross("W"), hover: cross("R"), pressed: cross("s") },
});

/**
 * Index tabs standing on a well. The open tab is the well's own paper and swallows the well's
 * top edge; closed tabs sit behind it, shorter and darker. They overlap the well's first two
 * rows, so they carry no outline of their own at the bottom.
 */
const tab = sprite({
  ...ui,
  name: "tab",
  size: [7, 17],
  slice: [3, 3, 8, 8],
  outline: false,
  palette: UI,
  frames: {
    idle: stack(".......", ".......", ".DDDDD.", "DpppppD", ["DpsssSD", 11], "DDDDDDD", "......."),
    hover: stack(".......", ".......", ".DDDDD.", "DWWWWWD", ["DWyyyYD", 11], "DDDDDDD", "......."),
    open: stack(".DDDDD.", "DWWWWWD", ["DWppppD", 13], "DpppppD", ".ppppp."),
  },
});

/** Answer box. Ticked in red pen, the tick running past the box as a teacher's does. */
const check = sprite({
  ...ui,
  name: "check",
  size: [12, 12],
  lone: "r",
  palette: UI,
  frames: {
    off: stack(
      "............",
      "............",
      "............",
      "DDDDDDDDDD..",
      "DssssssssD..",
      ["DsWWWWWWWD..", 6],
      "DDDDDDDDDD..",
    ),
    on: stack(
      "...........r",
      "..........rr",
      ".........rr.",
      "DDDDDDDDrr..",
      "DssssssrrD..",
      "DsWWWWrrWD..",
      "DrrWWrrWWD..",
      "DsrrrrWWWD..",
      "DsWrrWWWWD..",
      "DsWWWWWWWD..",
      "DsWWWWWWWD..",
      "DDDDDDDDDD..",
    ),
  },
});

/** Slider: a groove, a navy fill, and a paper knob with a grip line. */
const sliderTrack = sprite({
  ...ui,
  name: "slider-track",
  size: [7, 5],
  slice: [3, 3, 2, 2],
  palette: UI,
  frames: { idle: stack(".DDDDD.", "DsssssD", "DpppppD", "DpppppD", ".DDDDD.") },
});

const sliderFill = sprite({
  ...ui,
  name: "slider-fill",
  size: [3, 3],
  slice: [1, 1, 1, 1],
  outline: false,
  palette: UI,
  frames: { idle: stack("bbb", "nnn", "NNN") },
});

const sliderKnob = sprite({
  ...ui,
  name: "slider-knob",
  size: [7, 11],
  palette: UI,
  frames: {
    idle: stack(
      ".ooooo.",
      "oWWWWWo",
      "oWpppso",
      "oWpppso",
      "oWdddso",
      "oWpppso",
      "oWpppso",
      "ossssso",
      "odddddo",
      ".ooooo.",
      ".......",
    ),
    held: stack(
      ".......",
      ".ooooo.",
      "oWWWWWo",
      "oWyyyYo",
      "oWyyyYo",
      "oWdddYo",
      "oWyyyYo",
      "oWyyyYo",
      "oYYYYYo",
      ".ooooo.",
      ".......",
    ),
  },
});

/** Scrollbar: a groove, and an eraser for a thumb, white rubber at both ends of a navy sleeve. */
const scrollTrack = sprite({
  ...ui,
  name: "scroll-track",
  size: [5, 7],
  slice: [2, 2, 3, 3],
  palette: UI,
  frames: { idle: stack(".DDD.", ["DsppD", 5], ".DDD.") },
});

const scrollThumb = sprite({
  ...ui,
  name: "scroll-thumb",
  size: [5, 14],
  slice: [2, 2, 5, 8],
  palette: UI,
  frames: {
    idle: stack(
      ".ooo.",
      "oWWWo",
      "opppo",
      "ooooo",
      "obnNo",
      "obnNo",
      "obnNo",
      "oNNNo",
      "ooooo",
      "oWWWo",
      "oWWWo",
      "opppo",
      "ossso",
      ".ooo.",
    ),
  },
});

export default [
  btn,
  btnInk,
  close,
  tab,
  check,
  sliderTrack,
  sliderFill,
  sliderKnob,
  scrollTrack,
  scrollThumb,
];
