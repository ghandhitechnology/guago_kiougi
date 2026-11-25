import { stack } from "../../draw.ts";
import { sprite } from "../../format.ts";
import { UI } from "../../ui-legend.ts";

/**
 * What the fight draws over the field itself: the thin fills for the bars over heads (inside the
 * kit's `bar-thin` groove) and the aim reticle. Health is red, elites and bosses plum like the
 * boss bar, allies green.
 */
const ui = { group: "ui", origin: [0, 0], anim: {} } as const;

const OVER = {
  ...UI,
  "6": "plum.deep",
  "7": "plum.dark",
  "8": "plum.mid",
  "9": "plum.light",
  "0": "plum.pale",
  "1": "grass.deep",
  "2": "grass.dark",
  "3": "grass.mid",
  "4": "grass.light",
  "5": "grass.pale",
} as const;

/** Lit from the top, a bright leading edge at the right, like the HUD's own fills. */
const fillTiny = sprite({
  ...ui,
  name: "fill-tiny",
  size: [3, 3],
  slice: [1, 1, 1, 1],
  outline: false,
  palette: OVER,
  frames: {
    hp: stack("RRR", "rrR", "xxr"),
    /** The chunk just lost, trailing the fill before it drains. */
    lag: stack("eee", "RRe", "rrR"),
    elite: stack("000", "990", "889"),
    ally: stack("555", "445", "334"),
  },
});

/**
 * The aim reticle: four chalk corners with an ink rim, open in the middle so the target shows
 * through. `ready` turns the corners gold when the book in hand can be cast.
 */
const corners = (c: string) =>
  stack(
    "ooo...ooo",
    `o${c}${c}...${c}${c}o`,
    `o${c}.....${c}o`,
    ".........",
    ".........",
    ".........",
    `o${c}.....${c}o`,
    `o${c}${c}...${c}${c}o`,
    "ooo...ooo",
  );

const reticle = sprite({
  ...ui,
  name: "reticle",
  size: [9, 9],
  origin: [4, 4],
  outline: false,
  palette: OVER,
  frames: { idle: corners("W"), ready: corners("Y") },
});

export default [fillTiny, reticle];
