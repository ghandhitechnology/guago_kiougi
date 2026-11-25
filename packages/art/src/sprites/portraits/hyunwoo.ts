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
 * 도현우 in dialogue, the 0조 notebook held up in both hands where you can see it. Neutral is
 * tired but kind: a brown mop that has not seen a comb since the rift, heavy lids. The second
 * face is the one he makes when a piece of that night almost comes back.
 */

const mop = hair({
  mass: [
    { x: 24, y: 15, rx: 15.5, ry: 11 },
    { x: 11.5, y: 20, rx: 3.5, ry: 6 },
    { x: 36.5, y: 20, rx: 3.5, ry: 6 },
  ],
  add: [
    [
      [14, 7],
      [13, 1],
      [19, 5],
    ],
    [
      [22, 5],
      [25, 0],
      [27, 5],
    ],
    [
      [30, 6],
      [36, 3],
      [35, 9],
    ],
  ],
  fringe: [
    [6, 27],
    [10, 27],
    [11, 20],
    [13, 22.5],
    [15.5, 19],
    [18, 22],
    [20.5, 18.5],
    [23.5, 21.5],
    [26, 18],
    [28.5, 21.5],
    [31, 18.5],
    [33.5, 21],
    [36, 19],
    [37.5, 27],
    [42, 27],
  ],
  strands: [
    [
      [17, 13],
      [15, 19],
    ],
    [
      [24, 12],
      [23, 18],
    ],
    [
      [30, 12],
      [31, 18],
    ],
  ],
  shine: [
    [13, 9, "HY"],
    [16, 7, "YY"],
    [21, 6, "YH"],
    [11, 12, "HH"],
  ],
});

/** The notebook held up in both hands: sea-green cover, a white label, torn stubs at the top. */
const notebook = Pic.of(`
  ..Z.Z.Z.Z.Z.Z.Z.Z..
  .ZZZZZZZZZZZZZZZZZ.
  ZLLLLLLLLLLLLLLLLjZ
  ZLLwwwwwwwwwwwwLljZ
  ZLLwqqqqqqqqqqwLljZ
  ZLLwwwwwwwwwwwwLljZ
  ZLllllllllllllljjjZ
  ZZZZZZZZZZZZZZZZZZZ
`);
/** A hand gripping the notebook's edge, thumb over the front. */
const hand = Pic.of(`
  .KKK..
  KfffK.
  KffSfK
  KfSfSK
  KfffSK
  .KSSsK
  .KKKK.
`);

export default sprite({
  name: "portrait-hyunwoo",
  group: "portraits",
  size: [48, 48],
  palette: {
    ...faceLegend("fair", ["wood.dark", "wood.light"]),
    ...UNIFORM_LEGEND,
    X: "wood.deep",
    x: "wood.dark",
    h: "wood.mid",
    H: "wood.light",
    Y: "wood.pale",
    Z: "sea.deep",
    j: "sea.dark",
    l: "sea.mid",
    L: "sea.light",
    B: "sea.pale",
  },
  lone: FACE_LONE,
  frames: portraitFrames({
    head: "student",
    front: [mop],
    mend: "wGvbVNp",
    clothes: [uniform()],
    items: [
      [notebook, 14, 40],
      [hand, 10, 41],
      [hand.flipX().swap("fS", "Ss"), 32, 41],
    ],
    faces: {
      neutral: { eyes: "lidded", brows: "soft", mouth: "soft" },
      blink: { eyes: "closed", brows: "soft", mouth: "soft" },
      lost: {
        eyes: "wide",
        brows: "worried",
        mouth: "o",
        over: [
          [
            `
              .j.
              jBj
              jBj
              .j.
            `,
            36,
            24,
          ],
        ],
      },
    },
  }),
  anim: {
    neutral: { frames: ["neutral", "neutral", "neutral", "neutral", "neutral", "blink"], fps: 2 },
    lost: { frames: ["lost"], fps: 1 },
  },
});
