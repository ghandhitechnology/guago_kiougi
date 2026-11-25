import { disc, lit, stack } from "../../draw.ts";
import { sprite } from "../../format.ts";
import { UI } from "../../ui-legend.ts";

/** Phone controls (PLAN §6 "Input"): a joystick on the left, round buttons on the right. */
const ui = { group: "ui", origin: [0, 0], anim: {} } as const;

const TOUCH = { ...UI, w: "stone.bright" } as const;

/** Joystick base: a ring of dark card with an open middle, so the field shows through. */
const stickBase = sprite({
  ...ui,
  name: "stick-base",
  size: [48, 48],
  palette: TOUCH,
  frames: {
    idle: disc(
      48,
      [
        [1, "o"],
        [3, lit("m", "k", "o")],
        [1, "o"],
      ],
      ".",
    ),
  },
});

/** Joystick thumb: a paper disc. */
const stickKnob = sprite({
  ...ui,
  name: "stick-knob",
  size: [20, 20],
  palette: TOUCH,
  frames: {
    idle: disc(
      20,
      [
        [1, "o"],
        [2, lit("W", "p", "s")],
      ],
      "p",
    ),
    held: disc(
      20,
      [
        [1, "o"],
        [2, lit("y", "y", "Y")],
      ],
      "y",
    ),
  },
});

/** A round touch button; its glyph is drawn on top at (7, 7), or (7, 8) when pressed. */
const touchBtn = sprite({
  ...ui,
  name: "touch-btn",
  size: [28, 28],
  palette: TOUCH,
  frames: {
    idle: disc(
      28,
      [
        [1, "o"],
        [2, lit("l", "m", "k")],
        [1, "o"],
      ],
      "k",
    ),
    pressed: disc(
      28,
      [
        [1, "o"],
        [2, lit("o", "k", "m")],
        [1, "o"],
      ],
      "k",
    ),
  },
});

/** The dodge: the button the right thumb rests on, so the largest of the cluster. */
const touchMain = sprite({
  ...ui,
  name: "touch-main",
  size: [34, 34],
  palette: TOUCH,
  frames: {
    idle: disc(
      34,
      [
        [1, "o"],
        [1, lit("B", "b", "N")],
        [2, lit("l", "m", "k")],
        [1, "o"],
      ],
      "k",
    ),
    pressed: disc(
      34,
      [
        [1, "o"],
        [1, lit("N", "n", "b")],
        [2, lit("o", "k", "m")],
        [1, "o"],
      ],
      "k",
    ),
  },
});

const touchIcon = sprite({
  ...ui,
  name: "touch-icon",
  size: [14, 14],
  palette: TOUCH,
  lone: "w",
  outline: false,
  frames: {
    /** Dodge roll: a double chevron. */
    dodge: stack(
      "..............",
      "..............",
      "..............",
      "..ww....ww....",
      "...ww....ww...",
      "....ww....ww..",
      ".....ww....ww.",
      "....ww....ww..",
      "...ww....ww...",
      "..ww....ww....",
      "..............",
      "..............",
      "..............",
      "..............",
    ),
    /** Interact: an open hand. */
    interact: stack(
      "..............",
      "......w.......",
      "....w.w.w.....",
      "....w.w.w.w...",
      "....w.w.w.w...",
      "....wwwwwww...",
      "..w.wwwwwww...",
      "..wwwwwwwww...",
      "...wwwwwwww...",
      "....wwwwww....",
      "....wwwwww....",
      "..............",
      "..............",
      "..............",
    ),
  },
});

export default [stickBase, stickKnob, touchBtn, touchMain, touchIcon];
