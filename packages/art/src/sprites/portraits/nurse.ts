import { sprite } from "../../format.ts";
import { Pic } from "../../paint.ts";
import { FACE_LONE, faceLegend, hair, mirrored, portraitFrames } from "../../portrait.ts";

/**
 * 보건 선생님 in dialogue. Has seen everything twice and will not panic for a third: a neat
 * bob held back with two pins, eyes at half-mast, the mask pulled down under the chin and a
 * stethoscope round the neck over the white gown.
 */

const bob = hair({
  mass: [
    { x: 24, y: 17, rx: 16, ry: 12.5 },
    { x: 11.5, y: 29, rx: 4, ry: 7 },
    { x: 36.5, y: 29, rx: 4, ry: 7 },
  ],
  fringe: [
    [5, 37],
    [9, 37],
    [12, 35],
    [13, 27],
    [13.5, 20],
    [16, 17],
    [20, 16],
    [24, 15],
    [26, 13],
    [29, 16],
    [33, 17.5],
    [35, 20],
    [35.5, 27],
    [36.5, 35],
    [39, 37],
    [43, 37],
  ],
  strands: [
    [
      [26, 9],
      [26, 13],
    ],
    [
      [12, 28],
      [12, 34],
    ],
    [
      [36, 28],
      [37, 34],
    ],
  ],
  shine: [
    [13, 12, "HH"],
    [15, 10, "YY"],
    [19, 9, "YH"],
    [11, 18, "H"],
    [11, 19, "H"],
  ],
});

/** Two hair pins above the near temple. */
const pins = Pic.of(`
  aa..
  .aa.
  ..aa
  aa..
  .aa.
  ..aa
`);

/** The white gown over mint scrubs. */
const gown = mirrored(
  `
    ........................
    ...............GGGG.....
    ...........GGGGjLLj.....
    ........GGGwwwGjLLLj....
    .....GGGwwwwwpGjLLLLj...
    ...GGwwwwwwwppGjLLLLLj..
    ..GwwwwwwpppppGjjLLLLLj.
    .GwwwwwpppppppGGjjLLLLLj
    GwwwwpppppppppppGjjLLLLL
    GwwwppppppppppppGjjjLLLL
    GGGGGGGGGGGGGGGGGGjjjjjj
  `,
  { w: "p", p: "q", L: "l" },
  37,
);

/** A surgical mask pulled down under the chin. */
const mask = Pic.of(`
  .TTTTTTTTTTTT.
  TBBAAAAAAAABBT
  TBAAAAAAAAAABT
  .TBBBBBBBBBBT.
  ..TTTTTTTTTT..
`);

/** The stethoscope draped over the gown, the chest piece hanging on the right. */
const scope = Pic.blank(48, 48);
for (const [x, y] of [
  [17, 37],
  [16, 38],
  [15, 39],
  [14, 40],
  [14, 41],
  [13, 42],
  [13, 43],
  [13, 44],
  [13, 45],
  [13, 46],
  [30, 37],
  [31, 38],
  [32, 39],
  [33, 40],
  [33, 41],
  [34, 42],
  [34, 43],
] as const) {
  scope.set(x, y, "z");
}
scope.put(
  `
    .GG.
    GqqG
    GqqG
    .GG.
  `,
  33,
  44,
);

/** The mask's ear loops, back up to the ears. */
const loops = Pic.blank(48, 48);
for (const [x, y] of [
  [12, 30],
  [13, 31],
  [14, 32],
  [15, 33],
  [16, 34],
  [17, 35],
  [35, 30],
  [34, 31],
  [33, 32],
  [32, 33],
  [31, 34],
  [30, 35],
] as const) {
  loops.set(x, y, "T");
}

export default sprite({
  name: "portrait-nurse",
  group: "portraits",
  size: [48, 48],
  palette: {
    ...faceLegend("fair", ["wood.deep", "wood.mid"]),
    X: "wood.deep",
    x: "wood.dark",
    h: "wood.mid",
    H: "wood.light",
    Y: "wood.pale",
    a: "stone.mid",
    G: "stone.deep",
    q: "stone.light",
    p: "stone.pale",
    w: "stone.bright",
    j: "board.deep",
    l: "board.light",
    L: "grass.pale",
    T: "sea.deep",
    B: "sea.light",
    A: "sea.pale",
    z: "ink.mid",
  },
  lone: FACE_LONE,
  frames: portraitFrames({
    head: "adult",
    front: [bob],
    clothes: [gown],
    items: [scope, loops, [mask, 17, 36], [pins, 32, 14]],
    faces: {
      neutral: { eyes: "lidded", brows: "flat", mouth: "soft" },
      blink: { eyes: "closed", brows: "flat", mouth: "soft" },
    },
  }),
  anim: {
    neutral: { frames: ["neutral", "neutral", "neutral", "neutral", "neutral", "blink"], fps: 2 },
  },
});
