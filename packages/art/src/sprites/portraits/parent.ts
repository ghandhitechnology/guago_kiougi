import { sprite } from "../../format.ts";
import { Pic } from "../../paint.ts";
import { FACE_LONE, faceLegend, hair, mirrored, portraitFrames } from "../../portrait.ts";

/**
 * 엄마 in dialogue. Worry comes out as food: auburn hair twisted up in a claw clip with two
 * strands that got away, a soft cardigan, a smile pulled a little crooked by the 벌점 she has
 * not mentioned yet, and the 보자기 bundle of 반찬 already packed.
 */

const updo = hair({
  mass: [
    { x: 24, y: 15, rx: 15, ry: 10 },
    { x: 29, y: 6, rx: 7, ry: 4.5 },
  ],
  add: [
    // Two strands that got away, framing the face.
    [
      [10, 18],
      [13, 18],
      [12.5, 33],
      [10.5, 34],
    ],
    [
      [35, 18],
      [38, 18],
      [37.5, 34],
      [35.5, 33],
    ],
  ],
  fringe: [
    [5, 35],
    [9.5, 35],
    [10.5, 24],
    [13, 20],
    [17, 17.5],
    [21, 16.5],
    [24, 15],
    [27, 16.5],
    [31, 17.5],
    [35, 20],
    [37.5, 24],
    [38.5, 35],
    [43, 35],
  ],
  strands: [
    [
      [24, 10],
      [24, 15],
    ],
    [
      [18, 11],
      [16, 16],
    ],
    [
      [30, 11],
      [32, 16],
    ],
  ],
  shine: [
    [14, 11, "HH"],
    [16, 9, "YY"],
    [20, 8, "YH"],
    [26, 4, "YY"],
  ],
});

/** The claw clip across the twist. */
const clip = Pic.of(`
  .DDDDDDDD.
  DQQrrQQrrD
  DrrDrrDrrD
  .D..D..D..
`);

/** A rose cardigan over a cream top. */
const cardigan = mirrored(
  `
    ........................
    ........................
    ...........EEEEGGGGGGGGG
    ........EEEAAAAEGwwwwwww
    .....EEEAAAAAaaEGpwwwwww
    ...EEAAAAAAAaaaEGpwwwwww
    ..EAAAAAAaaaaaaEGppwwwww
    .EAAAAAaaaaaaaaEGppwwwww
    EAAAAaaaaaaaaaaaEGppwwww
    EAAAaaaaaaaaaaaaEGppwwww
    EEEEEEEEEEEEEEEEEGGGGGGG
  `,
  { A: "a", a: "d", w: "p", p: "q" },
  37,
);

/** The 보자기: lunch boxes knotted in yellow cloth, the knot's ears up. */
const bundle = Pic.of(`
  ...DD....DD...
  ..DQgD..DggD..
  ...DQgDDggD...
  .DDDDggggDDDD.
  DQQggggggggggD
  DQgggggggggcgD
  DggggggggggccD
  DgggggggggcccD
  DDDDDDDDDDDDDD
`);

export default sprite({
  name: "portrait-parent",
  group: "portraits",
  size: [48, 48],
  palette: {
    ...faceLegend("warm", ["wood.dark", "wood.mid"]),
    X: "wood.deep",
    x: "wood.dark",
    h: "clay.dark",
    H: "clay.mid",
    Y: "clay.light",
    D: "gold.deep",
    c: "gold.dark",
    g: "gold.mid",
    r: "red.mid",
    Q: "gold.light",
    E: "rose.deep",
    d: "rose.dark",
    a: "rose.mid",
    A: "rose.light",
    G: "stone.deep",
    q: "stone.light",
    p: "stone.pale",
    w: "stone.bright",
  },
  lone: FACE_LONE,
  frames: portraitFrames({
    head: "adult",
    front: [updo],
    mend: "EAad",
    clothes: [cardigan],
    items: [
      [clip, 24, 3],
      [bundle, 2, 39],
    ],
    faces: {
      neutral: { eyes: "calm", brows: "worried", mouth: "soft", mouthX: 1, blush: true },
      blink: { eyes: "closed", brows: "worried", mouth: "soft", mouthX: 1, blush: true },
    },
  }),
  anim: {
    neutral: { frames: ["neutral", "neutral", "neutral", "neutral", "neutral", "blink"], fps: 2 },
  },
});
