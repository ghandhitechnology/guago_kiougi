import { sprite } from "../../format.ts";
import { Pic } from "../../paint.ts";
import { FACE_LONE, faceLegend, hair, portraitFrames, varsity } from "../../portrait.ts";

/**
 * 오여름, 2학년 생명, in dialogue. Gentle, and on the side of anything alive: a green bucket hat
 * pulled low for the 생태공원, a short bob under it, round eyes that are counting something
 * behind you, the green 과잠 of the 생명 class and a magnifier at the ready.
 */

const bob = hair({
  mass: [
    { x: 24, y: 18, rx: 15.5, ry: 11 },
    { x: 12, y: 28, rx: 3.5, ry: 7 },
    { x: 36, y: 28, rx: 3.5, ry: 7 },
  ],
  fringe: [
    [5, 35],
    [9.5, 35],
    [12, 33],
    [13, 26],
    [14, 22],
    [16.5, 24],
    [19, 21.5],
    [22, 23],
    [26, 21.5],
    [29, 23],
    [32, 21.5],
    [34, 22],
    [35, 26],
    [36, 33],
    [38.5, 35],
    [43, 35],
  ],
  strands: [
    [
      [12, 27],
      [12, 33],
    ],
    [
      [36, 27],
      [36, 33],
    ],
  ],
});

/** The bucket hat, painted green over the hair builder: crown, band, a drooping brim. */
const hat = hair({
  mass: [
    { x: 24, y: 11, rx: 12.5, ry: 8 },
    { x: 24, y: 18, rx: 19, ry: 3.5 },
  ],
  add: [
    [
      [6, 18],
      [42, 18],
      [40, 21],
      [8, 21],
    ],
  ],
  strands: [
    [
      [12, 17],
      [36, 17],
    ],
  ],
  shine: [
    [16, 6, "YY"],
    [19, 5, "YYH"],
    [13, 9, "HH"],
    [9, 16, "HH"],
  ],
  reach: { light: 2, dark: 2 },
}).swap("XxhHY", "FfuUl");

/** A cream band round the crown with a sprout tucked in it. */
const band = Pic.blank(48, 48);
for (let x = 13; x <= 35; x++) {
  band.set(x, 14, x < 30 ? "p" : "q");
  band.set(x, 15, "G");
}
band.put(
  `
    .ll.
    lUUl
    .lUl
    ..f.
    ..f.
  `,
  30,
  10,
);

/** A magnifier, rim and lens. */
const magnifier = Pic.of(`
  ..DDDDD...
  .DAaaaaD..
  DAwwLLLaD.
  DawLLLLaD.
  DaLLLLLaD.
  DaLLLLLaD.
  .DaaaaaD..
  ..DDDDDW..
  ......WPW.
  .......WPW
  ........WP
  .........W
`);

export default sprite({
  name: "portrait-senior-bio",
  group: "portraits",
  size: [48, 48],
  palette: {
    ...faceLegend("warm", ["grass.dark", "grass.mid"]),
    X: "wood.deep",
    x: "wood.dark",
    h: "gold.dark",
    H: "gold.mid",
    Y: "gold.light",
    F: "grass.deep",
    f: "grass.dark",
    u: "grass.mid",
    U: "grass.light",
    l: "grass.pale",
    J: "grass.deep",
    j: "grass.dark",
    c: "grass.mid",
    C: "grass.light",
    G: "stone.deep",
    q: "stone.light",
    p: "stone.pale",
    w: "stone.bright",
    R: "red.deep",
    D: "gold.deep",
    a: "gold.mid",
    A: "gold.light",
    L: "sea.pale",
    W: "wood.deep",
    P: "wood.mid",
  },
  lone: FACE_LONE,
  frames: portraitFrames({
    head: "student",
    front: [bob, hat, band],
    casters: "XxFf",
    mend: "FfuUlGw",
    clothes: [varsity()],
    items: [[magnifier, 1, 33]],
    faces: {
      neutral: { eyes: "open", brows: "soft", mouth: "soft", blush: true },
      blink: { eyes: "closed", brows: "soft", mouth: "soft", blush: true },
    },
  }),
  anim: {
    neutral: { frames: ["neutral", "neutral", "neutral", "neutral", "neutral", "blink"], fps: 2 },
  },
});
