import { sprite } from "../../format.ts";
import { Pic } from "../../paint.ts";
import { FACE_LONE, faceLegend, hair, mirrored, portraitFrames } from "../../portrait.ts";

/**
 * 교장 선생님 in dialogue. Turns a tear in spacetime into a programme by first period: silver
 * hair combed straight back off a high forehead, a clipped moustache over a pleased, practised smile,
 * and the 명찰 he makes everyone wear pinned square on his own lapel.
 */

const combed = hair({
  mass: [
    { x: 24, y: 15, rx: 15.5, ry: 9.5 },
    { x: 10.5, y: 22, rx: 3, ry: 6 },
    { x: 37.5, y: 22, rx: 3, ry: 6 },
  ],
  fringe: [
    [5, 28],
    [9, 28],
    [9.5, 24],
    [11, 18],
    [14, 14],
    [18, 12.5],
    [21, 13.5],
    [24, 12.5],
    [27, 13.5],
    [30, 12.5],
    [34, 14],
    [37, 18],
    [38.5, 24],
    [39, 28],
    [43, 28],
  ],
  // Comb lines sweeping straight back.
  strands: [
    [
      [15, 13],
      [17, 8],
    ],
    [
      [21, 12],
      [22, 7],
    ],
    [
      [27, 12],
      [27, 7],
    ],
    [
      [33, 13],
      [31, 8],
    ],
    [
      [11, 20],
      [11, 25],
    ],
  ],
  shine: [
    [13, 11, "YY"],
    [16, 8, "YY"],
    [19, 7, "HY"],
  ],
});

const moustache = Pic.of(`
  .XXXXXXXX.
  XhHHhhhhxX
  .XX....XX.
`);

/** A charcoal suit, white shirt, red tie with a gold pin. */
const suit = mirrored(
  `
    ........................
    ...............GGGG.....
    ...........eeeeGwwG.....
    ........eeecccePwwwwG...
    .....eeecccccZePwwwwwGRm
    ...eecccccccZZePwwwwwGRm
    ..ecccccZZZZZZZePwwwwGRm
    .eccccZZZZZZZZZePwwwwGRm
    ecccZZZZZZZZZZZZePwwwGRm
    eccZZZZZZZZZZZZZePwwwGRm
    eeeeeeeeeeeeeeeeeeeeeRRR
  `,
  { c: "Z", Z: "z", w: "p", P: "q", m: "r" },
  37,
);
const tiePin = Pic.of(`
  DDDD
  DAAD
`);
/** The 명찰: white plastic, the school's navy stripe, his name in small black type. */
const badge = Pic.of(`
  GGGGGGG
  GbbbbbG
  GwwwwwG
  GweeewG
  GwwwwwG
  GGGGGGG
`);

export default sprite({
  name: "portrait-principal",
  group: "portraits",
  size: [48, 48],
  palette: {
    ...faceLegend("fair", ["wood.dark", "wood.mid"]),
    X: "stone.deep",
    x: "stone.dark",
    h: "stone.mid",
    H: "stone.light",
    Y: "stone.pale",
    c: "ink.light",
    Z: "ink.mid",
    z: "ink.dark",
    G: "stone.deep",
    P: "stone.pale",
    p: "stone.pale",
    q: "stone.light",
    R: "red.deep",
    r: "red.dark",
    m: "red.mid",
    D: "gold.deep",
    A: "gold.light",
    b: "navy.mid",
  },
  lone: FACE_LONE,
  frames: portraitFrames({
    head: "broad",
    front: [combed],
    clothes: [suit],
    items: [
      [tiePin, 22, 43],
      [badge, 8, 40],
    ],
    faces: {
      neutral: {
        eyes: "calm",
        brows: "up",
        mouth: "smile",
        mouthY: 34,
        under: [[moustache, 19, 31]],
      },
    },
  }),
  anim: { neutral: { frames: ["neutral"], fps: 1 } },
});
