import { sprite } from "../../format.ts";
import { Pic } from "../../paint.ts";
import { FACE_LONE, faceLegend, hair, portraitFrames, varsity } from "../../portrait.ts";

/**
 * 배도윤, 2학년 물리, in dialogue. Delighted by every collision and never stands still: spiky
 * brown hair over a red sweatband, eyes wide for the next impact, a plaster on the cheek, the
 * red 과잠 of the 물리 class and a stopwatch on a cord.
 */

const spikes = hair({
  mass: [
    { x: 24, y: 15, rx: 15, ry: 10 },
    { x: 11.5, y: 19, rx: 3.5, ry: 5 },
    { x: 36.5, y: 19, rx: 3.5, ry: 5 },
  ],
  add: [
    [
      [9, 12],
      [5, 6],
      [13, 8],
    ],
    [
      [12, 8],
      [12, 0],
      [18, 5],
    ],
    [
      [17, 6],
      [21, -1],
      [24, 5],
    ],
    [
      [23, 5],
      [29, 0],
      [30, 6],
    ],
    [
      [29, 6],
      [37, 2],
      [36, 9],
    ],
    [
      [35, 9],
      [43, 8],
      [39, 14],
    ],
  ],
  fringe: [
    [6, 26],
    [10, 26],
    [11, 20],
    [13.5, 22],
    [15.5, 19],
    [18, 21.5],
    [20, 19],
    [23, 21],
    [25.5, 19],
    [28, 21.5],
    [30.5, 19],
    [33, 21.5],
    [35.5, 19.5],
    [37.5, 26],
    [42, 26],
  ],
  strands: [
    [
      [15, 5],
      [16, 10],
    ],
    [
      [26, 4],
      [25, 9],
    ],
  ],
  shine: [
    [11, 9, "HY"],
    [14, 5, "YY"],
    [19, 4, "YH"],
  ],
});

/** The sweatband, drawn over the hair across the forehead. */
const band = Pic.blank(48, 48);
for (let x = 10; x <= 37; x++) {
  const dip = Math.round(((x - 23.5) / 14) ** 2 * 2);
  band.set(x, 14 + dip, "R");
  band.set(x, 15 + dip, x < 30 ? "m" : "r");
  band.set(x, 16 + dip, x < 30 ? "r" : "r");
  band.set(x, 17 + dip, "R");
}

/** A plaster on the cheek. */
const plaster = Pic.of(`
  GGGG
  GppG
  GGGG
`);

/** A stopwatch on a cord, hanging over the shirt. */
const watch = Pic.of(`
  ..z..z..
  ...zz...
  ..GGGG..
  .GwwpqG.
  GwpzzpqG
  GwpzpqqG
  .GqqqqG.
  ..GGGG..
`);

export default sprite({
  name: "portrait-senior-physics",
  group: "portraits",
  size: [48, 48],
  palette: {
    ...faceLegend("warm", ["wood.dark", "wood.light"]),
    X: "wood.deep",
    x: "wood.dark",
    h: "wood.mid",
    H: "wood.light",
    Y: "wood.pale",
    J: "red.deep",
    j: "red.dark",
    c: "red.mid",
    C: "red.light",
    R: "red.deep",
    r: "red.dark",
    m: "red.mid",
    G: "stone.deep",
    q: "stone.light",
    p: "stone.pale",
    w: "stone.bright",
    z: "ink.dark",
  },
  lone: FACE_LONE,
  frames: portraitFrames({
    head: "student",
    front: [spikes, band],
    casters: "XxR",
    clothes: [varsity()],
    items: [
      [watch, 20, 37],
      [plaster, 31, 30],
    ],
    faces: {
      neutral: { eyes: "wide", brows: "up", mouth: "beam", blush: true },
      blink: { eyes: "closed", brows: "up", mouth: "beam", blush: true },
    },
  }),
  anim: {
    neutral: { frames: ["neutral", "neutral", "neutral", "neutral", "blink"], fps: 2 },
  },
});
