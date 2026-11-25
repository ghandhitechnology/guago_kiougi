import { sprite } from "../../format.ts";
import { Pic } from "../../paint.ts";
import { FACE_LONE, faceLegend, hair, mirrored, portraitFrames } from "../../portrait.ts";

/**
 * 권 사감 in dialogue. Neutral is the face that ends conversations: a tight perm in a few big
 * curls, brow-line glasses, a mouth that has never once smiled at curfew, the plum tracksuit
 * zipped to the chin. The whistle face is the one that ends a rift.
 */

/** The perm: a ring of big curls, each with one highlight. */
const CURLS = [
  [14, 9],
  [20, 6],
  [27, 6],
  [33, 9],
  [37, 15],
  [38, 22],
  [10, 15],
  [9.5, 22],
  [17, 12],
  [24, 10],
  [31, 13],
] as const;
const perm = hair({
  mass: [{ x: 24, y: 15, rx: 15, ry: 10 }, ...CURLS.map(([x, y]) => ({ x, y, rx: 4.6, ry: 4.2 }))],
  fringe: [
    [4, 28],
    [8, 28],
    [9.5, 24],
    [12, 19],
    [14.5, 21],
    [17, 18],
    [20, 20],
    [23, 17.5],
    [26, 20],
    [29, 17.5],
    [32, 20],
    [34.5, 18.5],
    [37, 21],
    [38.5, 24],
    [40, 28],
    [44, 28],
  ],
  strands: [
    [
      [18, 9],
      [18, 11],
    ],
    [
      [25, 7],
      [25, 9],
    ],
    [
      [32, 10],
      [32, 12],
    ],
    [
      [13, 15],
      [13, 17],
    ],
  ],
  shine: [
    [12, 7, "HY"],
    [18, 4, "YY"],
    [25, 4, "HY"],
    [8, 13, "HH"],
    [15, 10, "YH"],
    [22, 8, "HH"],
  ],
});

/** Brow-line glasses: a heavy top bar, a thin rim below. */
const glasses = Pic.of(`
  QQQQQQQQQ......QQQQQQQQQ
  QQ.....QQQQQQQQQQ.....QQ
  q.......q......q.......q
  q.......q......q.......q
  qq.....qq......qq.....qq
  .qqqqqqq........qqqqqqq.
`);

/** The plum tracksuit, zipped to the chin, white piping on the shoulders. */
const tracksuit = mirrored(
  `
    ........................
    ................PPPPPPPP
    ...........PPPPPUuuuuuuG
    ........PPPwwUUUuuuuuuGw
    .....PPPwwwUUUUUuuuuuuGw
    ...PPwwwUUUUUUuuuuuuuuGw
    ..PwwUUUUUUuuuuuuuuuuuGw
    .PwUUUUUUuuuuuuuuuuuuuGw
    PwUUUUUuuuuuuuuuuuuuuuGw
    PUUUUuuuuuuuuuuuuuuuuuGw
    PPPPPPPPPPPPPPPPPPPPPPPP
  `,
  { U: "u", u: "d", w: "q", G: "G" },
  37,
);

/** The whistle on its red cord, hanging. */
const hanging = Pic.of(`
  R.....R
  .R...R.
  ..RRR..
  .GGGG..
  GqwwqG.
  GqqqqGG
  .GGGG..
`);
/** Blowing: the whistle at the mouth, cheeks out, the cord pulled tight. */
const blowing = Pic.of(`
  .GGGGGGG.
  GwwqqqqqGG
  GqqqqqqqGq
  .GGGGGGGG.
`);
const cord = Pic.of(`
  R.......
  .R......
  .R......
  ..R.....
  ..R.....
`);

export default sprite({
  name: "portrait-sagam",
  group: "portraits",
  size: [48, 48],
  palette: {
    ...faceLegend("warm", ["ink.dark", "plum.mid"]),
    X: "ink.deep",
    x: "ink.dark",
    h: "ink.mid",
    H: "ink.light",
    Y: "stone.mid",
    Q: "ink.dark",
    q: "stone.light",
    P: "plum.deep",
    d: "plum.dark",
    u: "plum.mid",
    U: "plum.light",
    w: "stone.bright",
    G: "stone.deep",
    R: "red.deep",
  },
  lone: FACE_LONE,
  frames: portraitFrames({
    head: "adult",
    front: [perm],
    clothes: [tracksuit],
    over: [[glasses, 12, 23]],
    faces: {
      neutral: {
        eyes: "sharp",
        brows: "stern",
        mouth: "frown",
        over: [[hanging, 30, 39]],
      },
      whistle: {
        eyes: "sharp",
        brows: "stern",
        mouth: "line",
        blush: true,
        over: [
          [blowing, 20, 32],
          [cord, 28, 35],
        ],
      },
    },
  }),
  anim: {
    neutral: { frames: ["neutral"], fps: 1 },
    whistle: { frames: ["whistle"], fps: 1 },
  },
});
