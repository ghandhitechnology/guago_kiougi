import { sprite } from "../../format.ts";
import { Pic } from "../../paint.ts";
import { FACE_LONE, faceLegend, hair, mirrored, portraitFrames } from "../../portrait.ts";

/**
 * 모 선생님 in dialogue. Signs every form without reading it, kindly: salt-and-pepper hair
 * flattened where it met the desk, one strand that never lies down, half-moon reading glasses
 * he looks over and never through. Signing, he beams with his eyes shut, pen already moving.
 */

const tousled = hair({
  mass: [
    { x: 24, y: 15, rx: 14.5, ry: 8.5 },
    { x: 12, y: 18, rx: 3.5, ry: 5 },
    { x: 36, y: 18, rx: 3.5, ry: 5 },
  ],
  add: [
    // The strand the desk never flattened.
    [
      [26, 8],
      [31, 1],
      [33, 2],
      [30, 8],
    ],
  ],
  fringe: [
    [6, 25],
    [10.5, 25],
    [11.5, 19],
    [14, 17.5],
    [17, 18.5],
    [20, 16],
    [23, 17.5],
    [27, 15.5],
    [31, 17],
    [34, 16.5],
    [36.5, 19],
    [37.5, 25],
    [42, 25],
  ],
  strands: [
    [
      [17, 11],
      [15, 16],
    ],
    [
      [23, 10],
      [22, 15],
    ],
    [
      [32, 11],
      [33, 15],
    ],
  ],
  shine: [
    [13, 11, "HY"],
    [16, 9, "YY"],
    [20, 8, "YH"],
    [28, 4, "HH"],
  ],
});

/** Half-moon reading glasses low on the nose: a flat top, a curved bottom, nothing inside. */
const glasses = Pic.of(`
  DDDDDDDDDDDDDDDDDDDD
  D.....D......D.....D
  .DDDDD........DDDDD.
`);

/** A knit cardigan over a white shirt, the navy tie forgotten at half-mast. */
const cardigan = mirrored(
  `
    ........................
    ...............GGGG.....
    ...........BBBBGwwG.....
    ........BBBUUUBGwwwwG...
    .....BBBUUUUUuBGwwwwwGzZ
    ...BBUUUUUUUuuBGpwwwwGzZ
    ..BUUUUUUuuuuuuBGpwwwGzZ
    .BUUUUUuuuuuuuuBGpwwwGzZ
    BUUUUuuuuuuuuuuuBGpwwGzZ
    BUUUuuuuuuuuuuuuBGpwwGzZ
    BBBBBBBBBBBBBBBBBBBBBzzz
  `,
  { U: "u", u: "g", w: "p", p: "q", Z: "z" },
  37,
);
/** Signing: the hand comes up from below with a ballpoint, nib first. */
const hand = Pic.of(`
  .yy.......
  .ywy......
  ..ywy.....
  ...ywKKK..
  ..KKfffSK.
  .KfffKfSsK
  .KffffffsK
  KfffffSssK
  KSfffSsssK
  KKKKKKKKK.
`);

export default sprite({
  name: "portrait-mo",
  group: "portraits",
  size: [48, 48],
  palette: {
    ...faceLegend("warm", ["wood.dark", "wood.mid"]),
    X: "ink.deep",
    x: "ink.dark",
    h: "ink.mid",
    H: "stone.dark",
    Y: "stone.mid",
    D: "gold.deep",
    a: "gold.mid",
    B: "olive.deep",
    g: "olive.dark",
    u: "olive.mid",
    U: "olive.light",
    G: "stone.deep",
    q: "stone.light",
    p: "stone.pale",
    w: "stone.bright",
    z: "navy.deep",
    Z: "navy.mid",
    y: "ink.dark",
  },
  lone: FACE_LONE,
  frames: portraitFrames({
    head: "adult",
    front: [tousled],
    mend: "B",
    clothes: [cardigan],
    over: [[glasses, 14, 28]],
    faces: {
      neutral: { eyes: "calm", brows: "up", mouth: "soft" },
      blink: { eyes: "closed", brows: "up", mouth: "soft" },
      signing: { eyes: "shut", brows: "up", mouth: "talk", over: [[hand, 35, 38]] },
    },
  }),
  anim: {
    neutral: { frames: ["neutral", "neutral", "neutral", "neutral", "blink"], fps: 2 },
    signing: { frames: ["signing"], fps: 1 },
  },
});
