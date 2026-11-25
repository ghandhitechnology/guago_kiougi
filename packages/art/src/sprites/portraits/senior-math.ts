import { sprite } from "../../format.ts";
import { Pic } from "../../paint.ts";
import { FACE_LONE, faceLegend, hair, portraitFrames, varsity } from "../../portrait.ts";

/**
 * 석지안, 3학년 수학, in dialogue. Says what is optimal and stops talking: blue-black hair cut
 * to a side parting you could measure, thin square frames, the navy 과잠 of the 수학 class and a
 * set square over the shoulder like a blade.
 */

const parted = hair({
  mass: [
    { x: 24, y: 15, rx: 15, ry: 10 },
    { x: 11.5, y: 19, rx: 3, ry: 5 },
    { x: 36.5, y: 19, rx: 3, ry: 5 },
  ],
  fringe: [
    [6, 25],
    [10.5, 25],
    [11, 19],
    [13, 17],
    [16, 16],
    [17.5, 14],
    [19.5, 16],
    [23, 18],
    [27, 19],
    [31, 19.5],
    [34, 20],
    [36.5, 21],
    [37.5, 25],
    [42, 25],
  ],
  strands: [
    [
      [17, 7],
      [17, 14],
    ],
    [
      [26, 12],
      [31, 17],
    ],
  ],
  shine: [
    [12, 11, "HH"],
    [14, 9, "YH"],
    [21, 9, "HYY"],
    [26, 9, "HH"],
  ],
  reach: { light: 1, dark: 2 },
});

/** Thin square frames, the inside corners filled so they hug the eye. */
const frames = Pic.of(`
  QQQQQQQQQ......QQQQQQQQQ
  QQ.....QQ......QQ.....QQ
  Q.......QQQQQQQQ.......Q
  Q.......Q......Q.......Q
  QQ.....QQ......QQ.....QQ
  QQQQQQQQQ......QQQQQQQQQ
`);

/** A clear set square over the shoulder. */
const square = Pic.of(`
  T...........
  TT..........
  TAT.........
  TAAT........
  TAAAT.......
  TAATAT......
  TAATTAT.....
  TAAT.TAT....
  TAAT..TAT...
  TBAT...TAT..
  TBATTTTTTAT.
  TBBAAAAAAAAT
  TTTTTTTTTTTT
`);

export default sprite({
  name: "portrait-senior-math",
  group: "portraits",
  size: [48, 48],
  palette: {
    ...faceLegend("fair", ["ink.dark", "navy.mid"]),
    X: "ink.deep",
    x: "navy.deep",
    h: "navy.dark",
    H: "navy.mid",
    Y: "navy.light",
    Q: "ink.dark",
    J: "navy.deep",
    j: "navy.dark",
    c: "navy.mid",
    C: "navy.light",
    G: "stone.deep",
    q: "stone.light",
    p: "stone.pale",
    w: "stone.bright",
    R: "red.deep",
    T: "sea.deep",
    B: "sea.light",
    A: "sea.pale",
  },
  lone: FACE_LONE,
  frames: portraitFrames({
    head: "student",
    front: [parted],
    mend: "Gw",
    clothes: [varsity()],
    items: [[square, 36, 31]],
    over: [[frames, 12, 23]],
    faces: {
      neutral: { eyes: "calm", brows: "flat", mouth: "line" },
      blink: { eyes: "closed", brows: "flat", mouth: "line" },
    },
  }),
  anim: {
    neutral: { frames: ["neutral", "neutral", "neutral", "neutral", "neutral", "blink"], fps: 2 },
  },
});
