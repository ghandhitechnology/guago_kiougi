import { type Legend, sprite } from "../../format.ts";
import { Pic } from "../../paint.ts";
import { FACE_LONE, faceLegend, hair, mirrored, portraitFrames } from "../../portrait.ts";

/**
 * Page 1's people in dialogue, on the campus cast's portrait kit so the two worlds share one
 * hand: the Athenian guard and the three helpers players walk out on escort notices.
 *
 * - `portrait-guard`: a bronze crested helmet, a black beard in its opening, eyes that are
 *   already checking your face against the list. `neutral`, and `alert` for the moment he sees
 *   you.
 * - `portrait-pythagorean-junior`: the order's youngest, white fillet, eager and a little
 *   frightened of everything. `neutral`, `scared`.
 * - `portrait-lyceum-scribe`: the wax tablet up and the stylus going. `neutral`, `scared`.
 * - `portrait-survey-helper`: a straw hat, the measuring stick, a grin. `neutral`, `scared`.
 */

/** A chiton's shoulders with a himation drape over the left one, from the lit half. */
function chiton(drape: boolean): Pic {
  return mirrored(
    drape
      ? `
          ........................
          ................VVVVVVVV
          ...........VVVVVCccccccc
          ........VVVCCCCccccccccc
          .....VVVCJJJCCcccccccccc
          ...VVCCCJBBJJCcccccccccc
          ..VCCCCCJBBBJJCccccccccc
          .VCCCCCccJBBBJJCcccccccc
          VCCCCcccccJBBBJJCccccccc
          VCCCcccccccJBBBJJCcccccc
          VVVVVVVVVVVVVVVVVVVVVVVV
        `
      : `
          ........................
          ................VVVVVVVV
          ...........VVVVVCccccccc
          ........VVVCCCCccccccccc
          .....VVVCCCCCccccccccccc
          ...VVCCCCCCCcccccccccccc
          ..VCCCCCCccccccccccccccc
          .VCCCCCccccccccccccccccc
          VCCCCccccccccccccccccccc
          VCCCcccccccccccccccccccc
          VVVVVVVVVVVVVVVVVVVVVVVV
        `,
    { C: "c", B: "j" },
    37,
  );
}

/** Cloth letters: `V v c C` the chiton, `J B j` the drape. */
const cloth = (
  main: readonly [string, string, string, string],
  drape?: readonly [string, string, string],
): Legend =>
  ({
    V: main[0],
    v: main[1],
    c: main[2],
    C: main[3],
    ...(drape ? { J: drape[0], j: drape[1], B: drape[2] } : {}),
  }) as Legend;

// The guard ---------------------------------------------------------------------------------------

/** The Corinthian helmet, painted bronze over the hair builder: dome, cheek guards, nose guard. */
const helmet = hair({
  mass: [
    { x: 24, y: 15, rx: 16, ry: 12 },
    { x: 11, y: 26, rx: 4, ry: 10 },
    { x: 37, y: 26, rx: 4, ry: 10 },
  ],
  cut: [
    // The T of the opening: across the eyes, down past the mouth.
    [
      [13, 21],
      [35, 21],
      [35, 28],
      [30, 28],
      [30, 40],
      [18, 40],
      [18, 28],
      [13, 28],
    ],
  ],
  fringe: [
    [4, 38],
    [44, 38],
  ],
  strands: [
    [
      [24, 21],
      [24, 30],
    ],
  ],
  shine: [
    [13, 9, "YY"],
    [16, 6, "YYH"],
    [11, 13, "HH"],
  ],
  reach: { light: 2, dark: 2 },
}).swap("XxhHY", "TguUy");

/** The red horsehair crest, front to back over the dome. */
const crest = Pic.of(`
  .....RRRRRR.....
  ...RRLLLmmmRR...
  ..RLLLmmmmmmrR..
  .RLLmmmmmmmmrrR.
  RLLmmmmmmmmmmrrR
  RLmmmmmmmmmmmrrR
  RmmmmmmmmmmmmrrR
`);

/** The black beard that fills the helmet's opening below the nose. */
const beard = Pic.of(`
  .XXXXXXXXXX.
  XxhhhhhhhhxX
  XhhhhhhhhhxX
  XhhhhhhhhxxX
  .XhhhhhhhxX.
  ..XXxxxxXX..
  ....XXXX....
`);

const guard = sprite({
  name: "portrait-guard",
  group: "portraits",
  size: [48, 48],
  palette: {
    ...faceLegend("warm", ["wood.dark", "wood.mid"]),
    ...cloth(["red.deep", "red.dark", "red.mid", "red.light"]),
    T: "clay.deep",
    g: "clay.dark",
    u: "clay.mid",
    U: "clay.light",
    y: "clay.pale",
    R: "red.deep",
    r: "red.dark",
    m: "red.mid",
    L: "red.light",
    X: "ink.deep",
    x: "ink.dark",
    h: "ink.mid",
  },
  lone: FACE_LONE,
  frames: portraitFrames({
    head: "adult",
    front: [helmet, [crest, 16, 0]],
    casters: "Tg",
    mend: "TguUyRrmLVvcC",
    clothes: [chiton(false)],
    items: [[beard, 18, 32]],
    faces: {
      neutral: { eyes: "sharp", brows: "stern", mouth: "line", nose: false },
      blink: { eyes: "closed", brows: "stern", mouth: "line", nose: false },
      alert: { eyes: "wide", brows: "up", mouth: "line", nose: false },
    },
  }),
  anim: {
    neutral: { frames: ["neutral", "neutral", "neutral", "neutral", "neutral", "blink"], fps: 2 },
    alert: { frames: ["alert"], fps: 1 },
  },
});

// The helpers ----------------------------------------------------------------------------------

const curlyTop = (fringeY: number) =>
  hair({
    mass: [
      { x: 24, y: 15, rx: 15.5, ry: 10.5 },
      { x: 12, y: 20, rx: 3.5, ry: 5 },
      { x: 36, y: 20, rx: 3.5, ry: 5 },
      ...[19, 24, 29].map((x, i) => ({ x, y: 6 + (i % 2), rx: 3.5, ry: 2.5 })),
    ],
    fringe: [
      [6, 25],
      [10, 25],
      [11.5, fringeY - 1],
      [14, fringeY + 1],
      [17, fringeY - 2],
      [20, fringeY],
      [23, fringeY - 2],
      [26, fringeY],
      [29, fringeY - 2],
      [32, fringeY + 1],
      [35, fringeY - 1],
      [37, 25],
      [42, 25],
    ],
    strands: [
      [
        [16, 9],
        [16, 12],
      ],
      [
        [27, 8],
        [27, 11],
      ],
    ],
    shine: [
      [13, 9, "HY"],
      [18, 5, "YY"],
      [24, 5, "HY"],
    ],
  });

const fillet = Pic.blank(48, 48);
for (let x = 10; x <= 37; x++) {
  const dip = Math.round(((x - 23.5) / 14) ** 2 * 2);
  fillet.set(x, 15 + dip, "G");
  fillet.set(x, 16 + dip, x < 30 ? "w" : "q");
  fillet.set(x, 17 + dip, "G");
}

const junior = sprite({
  name: "portrait-pythagorean-junior",
  group: "portraits",
  size: [48, 48],
  palette: {
    ...faceLegend("warm", ["ink.dark", "wood.mid"]),
    ...cloth(["stone.deep", "stone.light", "stone.pale", "stone.bright"]),
    X: "ink.deep",
    x: "ink.dark",
    h: "ink.mid",
    H: "ink.light",
    Y: "navy.mid",
    G: "stone.deep",
    q: "stone.light",
    w: "stone.bright",
  },
  lone: FACE_LONE,
  frames: portraitFrames({
    head: "student",
    front: [curlyTop(19), fillet],
    mend: "VvcC",
    clothes: [chiton(false)],
    faces: {
      neutral: { eyes: "wide", brows: "soft", mouth: "soft", blush: true },
      blink: { eyes: "closed", brows: "soft", mouth: "soft", blush: true },
      scared: { eyes: "wide", brows: "worried", mouth: "o", blush: true },
    },
  }),
  anim: {
    neutral: { frames: ["neutral", "neutral", "neutral", "neutral", "blink"], fps: 2 },
    scared: { frames: ["scared"], fps: 1 },
  },
});

/** The wax tablet held up in front, the stylus in the other hand. */
const tablet = Pic.of(`
  .WWWWWWWWWWWWWW..
  WbbbbbbbbbbbbbbW.
  WbOOOOOOOOOOOObW.
  WbOggggggggggObW.
  WbOgddgdddgggObW.
  WbOggggggggggObW.
  WbOgdddgddggzObW.
  WbOggggggggzzzbW.
  WbbbbbbbbbbzzbbW.
  WWWWWWWWWWWzzWW..
`);

const scribe = sprite({
  name: "portrait-lyceum-scribe",
  group: "portraits",
  size: [48, 48],
  palette: {
    ...faceLegend("fair", ["wood.dark", "wood.mid"]),
    ...cloth(
      ["stone.deep", "stone.light", "stone.pale", "stone.bright"],
      ["plum.deep", "plum.dark", "plum.mid"],
    ),
    X: "wood.deep",
    x: "wood.dark",
    h: "wood.mid",
    H: "wood.light",
    Y: "wood.pale",
    W: "wood.deep",
    b: "wood.mid",
    O: "olive.deep",
    g: "olive.light",
    d: "olive.dark",
    z: "ink.mid",
  },
  lone: FACE_LONE,
  frames: portraitFrames({
    head: "student",
    front: [curlyTop(20)],
    mend: "VvcCJjB",
    clothes: [chiton(true)],
    items: [[tablet, 15, 38]],
    faces: {
      neutral: { eyes: "lidded", brows: "flat", mouth: "line" },
      blink: { eyes: "closed", brows: "flat", mouth: "line" },
      scared: { eyes: "wide", brows: "worried", mouth: "o" },
    },
  }),
  anim: {
    neutral: { frames: ["neutral", "neutral", "neutral", "neutral", "neutral", "blink"], fps: 2 },
    scared: { frames: ["scared"], fps: 1 },
  },
});

/** A straw hat with a wide brim. */
const strawHat = hair({
  mass: [
    { x: 24, y: 10, rx: 15, ry: 8 },
    { x: 24, y: 17, rx: 21, ry: 3.5 },
  ],
  strands: [
    [
      [8, 17],
      [40, 17],
    ],
  ],
  shine: [
    [16, 6, "YY"],
    [20, 5, "YYH"],
    [8, 15, "HH"],
  ],
}).swap("XxhHY", "DEaAy");

const stick = Pic.of(`
  .WW.
  WbbW
  WppW
  WbbW
  WppW
  WbbW
  WppW
  WbbW
  WppW
  WbbW
  WppW
  WbbW
  WppW
  WbbW
  WWWW
`);

const surveyor = sprite({
  name: "portrait-survey-helper",
  group: "portraits",
  size: [48, 48],
  palette: {
    ...faceLegend("deep", ["ink.dark", "wood.mid"]),
    ...cloth(["clay.deep", "clay.dark", "clay.mid", "clay.light"]),
    X: "ink.deep",
    x: "ink.dark",
    h: "ink.mid",
    H: "ink.light",
    D: "gold.deep",
    E: "gold.dark",
    a: "gold.mid",
    A: "gold.light",
    y: "gold.pale",
    W: "wood.deep",
    b: "wood.light",
    p: "clay.mid",
  },
  lone: FACE_LONE,
  frames: portraitFrames({
    head: "student",
    front: [curlyTop(21), strawHat],
    casters: "XxDE",
    mend: "DEaAyVvcC",
    clothes: [chiton(false)],
    items: [[stick, 40, 30]],
    faces: {
      neutral: { eyes: "open", brows: "up", mouth: "smile", blush: true },
      blink: { eyes: "closed", brows: "up", mouth: "smile", blush: true },
      scared: { eyes: "wide", brows: "worried", mouth: "o", blush: true },
    },
  }),
  anim: {
    neutral: { frames: ["neutral", "neutral", "neutral", "neutral", "blink"], fps: 2 },
    scared: { frames: ["scared"], fps: 1 },
  },
});

export default [guard, junior, scribe, surveyor];
