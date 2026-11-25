import { sprite } from "../../format.ts";
import { Pic } from "../../paint.ts";
import { FACE_LONE, faceLegend, hair, portraitFrames, varsity } from "../../portrait.ts";

/**
 * 우태산, 3학년 지구과학, in dialogue. Slow, few words, never moves first, and asleep on his
 * feet more often than not: the hood of the mustard 지구과학 과잠 pulled up, a heavy fringe over
 * heavy lids, a cloud patch on the chest. Asleep he insists he is awake.
 */

/** The hood behind the head, painted mustard. */
const hood = hair({
  mass: [{ x: 24, y: 21, rx: 19.5, ry: 18 }],
  add: [
    [
      [5, 30],
      [43, 30],
      [40, 42],
      [8, 42],
    ],
  ],
  reach: { light: 2, dark: 2 },
}).swap("XxhHY", "JjcCP");

/** The hood's rim, framing the face over the hair. */
const rim = hair({
  mass: [{ x: 24, y: 21, rx: 19.5, ry: 18 }],
  cut: [
    [
      [9, 40],
      [9, 22],
      [12, 14],
      [17, 9.5],
      [24, 8],
      [31, 9.5],
      [36, 14],
      [39, 22],
      [39, 40],
    ],
  ],
  fringe: [
    [4, 40],
    [44, 40],
  ],
  shine: [
    [11, 12, "HH"],
    [14, 8, "HYY"],
    [19, 5, "YY"],
  ],
}).swap("XxhHY", "JjcCP");

const fringe = hair({
  mass: [{ x: 24, y: 16, rx: 15, ry: 10 }],
  fringe: [
    [8, 24],
    [11, 24],
    [12.5, 21],
    [14.5, 24.5],
    [17, 20],
    [20, 23.5],
    [23, 19.5],
    [26, 23],
    [29, 20],
    [32, 24],
    [34.5, 20.5],
    [36, 23],
    [37, 24],
    [40, 24],
  ],
  strands: [
    [
      [17, 14],
      [16, 19],
    ],
    [
      [29, 14],
      [30, 19],
    ],
  ],
  shine: [[16, 12, "HH"]],
});

/** A cloud patch sewn on the chest. */
const cloud = Pic.of(`
  ...GGG....
  .GGwwwGGG.
  GwwwwwwwqG
  GqqqqqqqqG
  .GGGGGGGG.
`);

/** Three z's, for the face that is definitely awake. */
const zzz = Pic.of(`
  ZZZ.....
  ..Z.....
  .Z......
  ZZZ.ZZ..
  .....Z..
  ....ZZ..
`);

export default sprite({
  name: "portrait-senior-earth",
  group: "portraits",
  size: [48, 48],
  palette: {
    ...faceLegend("deep", ["ink.dark", "wood.mid"]),
    X: "ink.deep",
    x: "ink.dark",
    h: "ink.mid",
    H: "stone.dark",
    Y: "stone.mid",
    J: "gold.deep",
    j: "gold.dark",
    c: "gold.mid",
    C: "gold.light",
    P: "gold.pale",
    G: "stone.deep",
    q: "stone.light",
    p: "stone.pale",
    w: "stone.bright",
    R: "red.deep",
    Z: "stone.bright",
  },
  lone: `${FACE_LONE}Z`,
  frames: portraitFrames({
    head: "student",
    back: [hood],
    front: [fringe, rim],
    casters: "XxJj",
    mend: "JjcCP",
    clothes: [varsity()],
    items: [[cloud, 30, 41]],
    faces: {
      neutral: { eyes: "lidded", brows: "flat", mouth: "line" },
      asleep: { eyes: "closed", brows: "flat", mouth: "slack", over: [[zzz, 38, 3]] },
    },
  }),
  anim: {
    neutral: { frames: ["neutral"], fps: 1 },
    asleep: { frames: ["asleep"], fps: 1 },
  },
});
