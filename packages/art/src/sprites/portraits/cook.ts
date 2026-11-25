import { sprite } from "../../format.ts";
import { Pic } from "../../paint.ts";
import { FACE_LONE, faceLegend, hair, mirrored, portraitFrames } from "../../portrait.ts";

/**
 * 조리사님 in dialogue. Keeper of buffs, keeper of the tunnel's secret: a puffed white kitchen
 * cap with grey curls escaping at the temples, a warm smile that already knows you skipped
 * breakfast, and the steel ladle held up like a sceptre.
 */

/** The puffed cap, drawn with the hair builder and painted white. */
const cap = hair({
  mass: [
    { x: 24, y: 12, rx: 17, ry: 10 },
    { x: 12, y: 15, rx: 6, ry: 6 },
    { x: 36, y: 15, rx: 6, ry: 6 },
  ],
  fringe: [
    [5, 23],
    [8, 23],
    [9, 20],
    [12, 19],
    [24, 18.5],
    [36, 19],
    [39, 20],
    [40, 23],
    [43, 23],
  ],
  // The gathers of the elastic band and two soft folds in the crown.
  strands: [
    [
      [11, 18],
      [37, 18],
    ],
    [
      [19, 6],
      [17, 11],
    ],
    [
      [30, 5],
      [31, 10],
    ],
  ],
  shine: [
    [12, 9, "YY"],
    [15, 6, "YYY"],
    [20, 4, "YY"],
  ],
  reach: { light: 3, dark: 2 },
}).swap("XxhHY", "GgqpW");

/** Grey curls escaping under the cap. */
const curls = hair({
  mass: [
    { x: 10.5, y: 22, rx: 2.5, ry: 3 },
    { x: 37.5, y: 22, rx: 2.5, ry: 3 },
    { x: 15, y: 20, rx: 2, ry: 1.6 },
  ],
});

/** The white jacket under a rose apron, its straps over the shoulders. */
const jacket = mirrored(
  `
    ........................
    ...............GGGG.....
    ...........GGGGGppG.....
    ........GGGWWEaEGpppG...
    .....GGGWWWWWEaEGpppGGEE
    ...GGWWWWWWppEaEGppGGEaa
    ..GWWWWWpppppEaEGGGEEaaa
    .GWWWWppppppppEaEEEaaaaA
    GWWWWpppppppppEaaaaaaaAA
    GWWWppppppppppEaaaaaaaAA
    GGGGGGGGGGGGGGEEEEEEEEEE
  `,
  { W: "p", p: "q", A: "a", a: "d" },
  37,
);

/** The ladle, held up beside her face. */
const ladle = Pic.of(`
  ..GGGGGG..
  .GWWppqqG.
  GpppppqqgG
  GqqqqqqggG
  .GgqqgggG.
  ..GGGGGG..
  ....GqG...
  ....GqG...
  .....GqG..
  .....GqG..
  .....GqG..
  .....GqG..
  .....GqG..
  .....GqG..
  .....GqG..
  .....GqG..
  .....GqG..
  .....GqG..
  .....GGG..
`);

export default sprite({
  name: "portrait-cook",
  group: "portraits",
  size: [48, 48],
  palette: {
    ...faceLegend("warm", ["wood.dark", "wood.mid"]),
    X: "ink.mid",
    x: "stone.dark",
    h: "stone.mid",
    H: "stone.light",
    Y: "stone.pale",
    G: "stone.deep",
    g: "stone.mid",
    q: "stone.light",
    p: "stone.pale",
    W: "stone.bright",
    E: "rose.deep",
    d: "rose.dark",
    a: "rose.mid",
    A: "rose.light",
  },
  lone: FACE_LONE,
  frames: portraitFrames({
    head: "broad",
    back: [curls],
    front: [cap, curls],
    casters: "Gg",
    mend: "GgqpW",
    clothes: [jacket],
    items: [[ladle, 37, 22]],
    faces: {
      neutral: { eyes: "calm", brows: "soft", mouth: "smile", blush: true },
      blink: { eyes: "closed", brows: "soft", mouth: "smile", blush: true },
    },
  }),
  anim: {
    neutral: { frames: ["neutral", "neutral", "neutral", "neutral", "neutral", "blink"], fps: 2 },
  },
});
