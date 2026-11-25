import { sprite } from "../../format.ts";
import { Pic } from "../../paint.ts";
import { FACE_LONE, faceLegend, hair, mirrored, portraitFrames } from "../../portrait.ts";

/**
 * 한소율, 3학년 화학, in dialogue. Polite to everyone, first-years included, which frightens
 * them: a blunt fringe, a long tail over one shoulder, safety goggles worn where they belong,
 * over the eyes, and a white lab coat with the 화학 class's sea-green trim.
 */

const back = hair({
  mass: [{ x: 24, y: 18, rx: 16, ry: 13 }],
  add: [
    [
      [8, 18],
      [16, 22],
      [15, 40],
      [8, 40],
    ],
    [
      [32, 22],
      [40, 18],
      [40, 40],
      [33, 40],
    ],
  ],
  reach: { light: 2, dark: 3 },
});

const blunt = hair({
  mass: [
    { x: 24, y: 16, rx: 15.5, ry: 11 },
    { x: 11, y: 27, rx: 3, ry: 9 },
    { x: 37, y: 27, rx: 3, ry: 9 },
  ],
  fringe: [
    [5, 40],
    [9, 40],
    [10, 34],
    [12.5, 28],
    [13, 21],
    [35, 21],
    [35.5, 28],
    [38, 34],
    [39, 40],
    [43, 40],
  ],
  strands: [
    [
      [18, 14],
      [17, 20],
    ],
    [
      [24, 14],
      [24, 20],
    ],
    [
      [30, 14],
      [31, 20],
    ],
  ],
  shine: [
    [13, 12, "HH"],
    [15, 10, "YY"],
    [19, 9, "YYH"],
  ],
});

/** The tail, tied low and brought forward over the left shoulder. */
const tail = hair({
  mass: [{ x: 38, y: 41, rx: 3.5, ry: 7 }],
  add: [
    [
      [35, 33],
      [40, 33],
      [41, 47],
      [35, 47],
    ],
  ],
  strands: [
    [
      [38, 35],
      [38, 46],
    ],
  ],
  shine: [[36, 36, "HH"]],
});
const tie = Pic.of(`
  TTTT
  TBBT
  TTTT
`);

/** Safety goggles over the eyes: one wide clear lens, a nose notch, a strap. */
const goggles = Pic.of(`
  ...........................
  .TTTTTTTTTTTTTTTTTTTTTTTTT.
  TAAAAAAAAAAAAAAAAAAAAAAAAAT
  TA.ww...................BTT
  TA..ww..................BTT
  TA......................BTT
  TA......................BTT
  TA..........BTTB........BTT
  .TBBBBBBBBBBT..TBBBBBBBBBT.
  ..TTTTTTTTTT....TTTTTTTTTT.
`);

/** A white lab coat over the shirt and tie, sea-green piping on the lapel. */
const coat = mirrored(
  `
    ........................
    ...............GGGG.....
    ...........GGGGGwwG.....
    ........GGGwwwGBwwwwG...
    .....GGGwwwwwpGBGwwwwGRm
    ...GGwwwwwwwppGBGpwwwGRm
    ..GwwwwwwpppppGBGpwwwGRm
    .GwwwwwpppppppGBGpwwwGRm
    GwwwwpppppppppGBGppwwGRm
    GwwwppppppppppGBGppwwGRm
    GGGGGGGGGGGGGGGGGGGGGRRR
  `,
  { w: "p", p: "q", B: "T", m: "r" },
  37,
);

export default sprite({
  name: "portrait-senior-chem",
  group: "portraits",
  size: [48, 48],
  palette: {
    ...faceLegend("fair", ["plum.dark", "plum.light"]),
    X: "ink.deep",
    x: "plum.deep",
    h: "plum.dark",
    H: "plum.mid",
    Y: "plum.light",
    T: "sea.deep",
    B: "sea.mid",
    A: "sea.light",
    G: "stone.deep",
    q: "stone.light",
    p: "stone.pale",
    w: "stone.bright",
    R: "red.deep",
    r: "red.dark",
    m: "red.mid",
  },
  lone: FACE_LONE,
  frames: portraitFrames({
    head: "student",
    back: [back],
    front: [blunt],
    mend: "pw",
    clothes: [coat],
    items: [tail, [tie, 36, 33]],
    over: [[goggles, 10, 20]],
    faces: {
      neutral: { eyes: "open", brows: "soft", mouth: "soft" },
      blink: { eyes: "closed", brows: "soft", mouth: "soft" },
    },
  }),
  anim: {
    neutral: { frames: ["neutral", "neutral", "neutral", "neutral", "neutral", "blink"], fps: 2 },
  },
});
