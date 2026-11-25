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
 * 윤서하 in dialogue, 0조's leader. Trusts a measurement over anyone's confidence: long black
 * hair tucked behind one ear to keep it off the eyepiece, a mechanical pencil parked there, a
 * level look that is already checking your numbers.
 */

/** Long hair falling behind the shoulders. */
const back = hair({
  mass: [{ x: 24, y: 19, rx: 16.5, ry: 13 }],
  add: [
    [
      [8, 19],
      [17, 22],
      [16, 47],
      [6, 47],
    ],
    [
      [31, 22],
      [40, 19],
      [42, 47],
      [32, 47],
    ],
  ],
  strands: [
    [
      [10, 30],
      [9, 44],
    ],
    [
      [39, 30],
      [40, 44],
    ],
  ],
  reach: { light: 2, dark: 3 },
});

/** Side-swept fringe parted on her left, the near side long over the cheek, the far side tucked. */
const front = hair({
  mass: [
    { x: 24, y: 16, rx: 15.5, ry: 11 },
    { x: 11, y: 27, rx: 3.5, ry: 11 },
  ],
  fringe: [
    [5, 48],
    [8.5, 48],
    [10, 40],
    [13.5, 35],
    [13.5, 24],
    [15.5, 20.5],
    [17, 22],
    [19.5, 18],
    [21.5, 20],
    [24, 16.5],
    [26.5, 17.5],
    [29, 14],
    [31, 15.5],
    [34, 18.5],
    [36.5, 22],
    [37.5, 23.5],
    [42, 23.5],
  ],
  strands: [
    [
      [28, 9],
      [29, 14],
    ],
    [
      [18, 14],
      [16, 19],
    ],
    [
      [12, 24],
      [12, 33],
    ],
  ],
  shine: [
    [14, 10, "HH"],
    [16, 8, "HYY"],
    [20, 7, "YYH"],
    [11, 13, "HH"],
  ],
});

/** A mechanical pencil behind the right ear, and a plain hair clip on the left. */
const pencil = Pic.of(`
  .....gg
  ....gAg
  ...gAag
  ..gAag.
  .gAag..
  .gag...
  .zz....
  .z.....
`);
const clip = Pic.of(`
  DDDD
  DaaD
  .DD.
`);

/** The near lock falls in front of the shoulder. */
const lock = hair({
  mass: [{ x: 10, y: 40, rx: 3.5, ry: 8 }],
  add: [
    [
      [7, 33],
      [13, 33],
      [13, 47],
      [7, 47],
    ],
  ],
  strands: [
    [
      [10, 35],
      [10, 46],
    ],
  ],
  shine: [[8, 36, "HH"]],
});

export default sprite({
  name: "portrait-seoha",
  group: "portraits",
  size: [48, 48],
  palette: {
    ...faceLegend("fair", ["navy.dark", "navy.mid"]),
    ...UNIFORM_LEGEND,
    X: "ink.deep",
    x: "ink.dark",
    h: "ink.mid",
    H: "ink.light",
    Y: "navy.mid",
    z: "ink.dark",
    g: "gold.deep",
    a: "gold.mid",
    A: "gold.light",
    D: "stone.deep",
  },
  lone: FACE_LONE,
  frames: portraitFrames({
    head: "student",
    back: [back],
    front: [front],
    clothes: [uniform()],
    items: [lock, [pencil, 37, 15], [clip, 15, 17]],
    faces: {
      neutral: { eyes: "open", brows: "flat", mouth: "line" },
      blink: { eyes: "closed", brows: "flat", mouth: "line" },
    },
  }),
  anim: {
    neutral: { frames: ["neutral", "neutral", "neutral", "neutral", "neutral", "blink"], fps: 2 },
  },
});
