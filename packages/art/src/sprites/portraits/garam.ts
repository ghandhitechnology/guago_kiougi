import { sprite } from "../../format.ts";
import { Pic } from "../../paint.ts";
import {
  FACE_LONE,
  faceLegend,
  hair,
  portraitFrames,
  UNIFORM_LEGEND,
  uniform,
} from "../../portrait.ts";

/**
 * 민가람 in dialogue. Built the laser rig and never stops talking: chestnut hair shoved back
 * by the orange laser goggles that never come off the forehead, a screwdriver in the blazer
 * pocket, the mouth always mid-sentence. The grin is the one that fills a silence before it
 * can start.
 */

const mop = hair({
  mass: [
    { x: 24, y: 14, rx: 15.5, ry: 11.5 },
    { x: 11.5, y: 18, rx: 4.5, ry: 7 },
    { x: 36.5, y: 18, rx: 4.5, ry: 7 },
  ],
  add: [
    // Shoved back and up by the goggle strap: the tips flick up and to the right.
    [
      [13, 9],
      [15, 1],
      [19, 5],
    ],
    [
      [19, 5],
      [23, 0],
      [26, 4],
    ],
    [
      [26, 4],
      [31, 1],
      [32, 6],
    ],
    [
      [32, 6],
      [38, 4],
      [36, 10],
    ],
  ],
  fringe: [
    [6, 27],
    [9.5, 27],
    [10.5, 20],
    [12, 18],
    [13.5, 20.5],
    [16, 17],
    [18, 19.5],
    [20, 16],
    [27, 16],
    [29.5, 19.5],
    [32, 16.5],
    [34.5, 20.5],
    [36.5, 18],
    [37.5, 27],
    [42, 27],
  ],
  strands: [
    [
      [15, 16],
      [13, 20],
    ],
    [
      [33, 16],
      [34, 19],
    ],
    [
      [20, 4],
      [18, 8],
    ],
    [
      [27, 4],
      [26, 8],
    ],
  ],
  shine: [
    [13, 6, "HY"],
    [15, 4, "YY"],
    [20, 3, "HYY"],
    [12, 8, "H"],
  ],
});

/** Laser safety goggles, pushed up: two orange lenses on a black strap. */
const LENS = Pic.of(`
  .eeeeee.
  eoLLLlle
  eLLLllle
  eLllljje
  .eeeeee.
`);
const goggles = Pic.blank(48, 48);
for (const [x0, x1] of [
  [9, 13],
  [20, 28],
  [35, 39],
] as const) {
  for (let x = x0; x < x1; x++) {
    goggles.set(x, 13, "e");
    goggles.set(x, 14, x < 24 ? "z" : "e");
  }
}
goggles.put(LENS, 12, 11).put(LENS, 28, 11);

/** A screwdriver clipped in the breast pocket, yellow handle up. */
const pocket = Pic.of(`
  .DD.
  DAaD
  DAaD
  .zz.
  .zz.
  NbbN
`);

const legend = {
  ...faceLegend("warm", ["wood.dark", "wood.light"]),
  X: "clay.deep",
  x: "clay.dark",
  h: "clay.mid",
  H: "clay.light",
  Y: "clay.pale",
  z: "ink.dark",
  L: "sea.light",
  l: "sea.mid",
  j: "sea.dark",
  ...UNIFORM_LEGEND,
  D: "gold.deep",
  a: "gold.mid",
  A: "gold.light",
} as const;

export default sprite({
  name: "portrait-garam",
  group: "portraits",
  size: [48, 48],
  palette: legend,
  lone: FACE_LONE,
  frames: portraitFrames({
    head: "student",
    front: [mop],
    items: [goggles, [pocket, 35, 41]],
    clothes: [uniform()],
    faces: {
      neutral: { eyes: "open", brows: "up", mouth: "talk", blush: true },
      blink: { eyes: "closed", brows: "up", mouth: "talk", blush: true },
      grin: { eyes: "shut", brows: "up", mouth: "grin", blush: true },
    },
  }),
  anim: {
    neutral: { frames: ["neutral", "neutral", "neutral", "neutral", "blink"], fps: 2 },
    grin: { frames: ["grin"], fps: 1 },
  },
});
