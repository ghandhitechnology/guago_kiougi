import { sprite } from "../../format.ts";
import { boxShadow, finish, frames, hline, IL, ovalShadow, rect, vline } from "../../interior.ts";
import { Pic } from "../../paint.ts";

/**
 * 실험동: black-topped benches with a sink and brass gas taps, the fume hood, the bottle
 * cabinet, a microscope, the skeleton everyone names, the telescope under the rooftop dome, and
 * the optical bench: 0조's interferometer, the beam split in two and brought back together.
 */

/** Lab bench: black epoxy top, sink and gooseneck tap, two gas taps, white cupboards below. */
const labBench = (() => {
  const W = 64;
  const p = Pic.blank(W, 34);
  rect(p, 1, 6, W - 2, 13, "I");
  hline(p, 1, 6, W - 2, "i");
  vline(p, 1, 6, 13, "i");
  // Sink.
  rect(p, 8, 9, 14, 8, "M");
  rect(p, 9, 10, 12, 6, "S");
  hline(p, 9, 10, 12, "I");
  rect(p, 14, 13, 2, 1, "I");
  // Gooseneck tap.
  vline(p, 14, 2, 8, "K");
  hline(p, 14, 1, 5, "K");
  vline(p, 18, 2, 3, "K");
  p.set(15, 2, "k");
  // Gas taps, brass, and a beaker and a flask set down.
  for (const x of [30, 36]) {
    rect(p, x, 8, 3, 2, "o");
    hline(p, x, 8, 3, "y");
  }
  rect(p, 44, 9, 5, 6, "~");
  hline(p, 44, 9, 5, "w");
  rect(p, 45, 12, 3, 3, "c");
  rect(p, 52, 11, 6, 5, "~");
  rect(p, 54, 7, 2, 4, "~");
  rect(p, 53, 13, 4, 3, "+");
  // Cupboards.
  rect(p, 1, 19, W - 2, 14, "k");
  hline(p, 1, 19, W - 2, "I");
  vline(p, W - 2, 19, 14, "K");
  for (let x = 3; x < W - 4; x += 15) {
    rect(p, x, 21, 13, 10, "w");
    vline(p, x + 12, 21, 10, "K");
    rect(p, x + 5, 25, 3, 1, "M");
  }
  hline(p, 1, 32, W - 2, "M");
  return finish(p, "y");
})();

/** The fume hood: a glass sash half up, the light inside, a flask under it, baffles. */
function fumeHood(on: boolean): Pic {
  const p = Pic.blank(40, 56);
  rect(p, 1, 1, 38, 6, "k");
  hline(p, 1, 1, 38, "w");
  rect(p, 4, 3, 14, 2, "M");
  // Cabinet body.
  rect(p, 1, 7, 38, 47, "K");
  vline(p, 38, 7, 47, "M");
  // Chamber: lit or dark, a rack and flasks.
  rect(p, 4, 9, 32, 26, on ? "w" : "M");
  hline(p, 4, 9, 32, on ? "Y" : "S");
  for (const y of [14, 19, 24]) hline(p, 5, y, 30, on ? "k" : "S");
  rect(p, 10, 27, 6, 7, "c");
  rect(p, 12, 24, 2, 3, "~");
  rect(p, 22, 29, 8, 5, "x");
  hline(p, 22, 29, 8, "%");
  // Sash: frame, glass glint, pulled halfway.
  rect(p, 3, 8, 34, 2, "S");
  rect(p, 3, 20, 34, 2, "M");
  hline(p, 3, 20, 34, "K");
  for (let i = 0; i < 6; i++) p.set(8 + i, 19 - i, "w").set(9 + i, 19 - i, "w");
  // Work surface lip and the cupboard below.
  rect(p, 2, 35, 36, 3, "I");
  hline(p, 2, 35, 36, "i");
  rect(p, 3, 39, 16, 13, "k");
  rect(p, 21, 39, 16, 13, "k");
  rect(p, 16, 44, 2, 3, "M");
  rect(p, 22, 44, 2, 3, "M");
  hline(p, 1, 53, 38, "M");
  return finish(p, "Y");
}

/** The bottle cabinet: glass doors, brown and clear bottles with white labels. */
const bottleCabinet = (() => {
  const p = Pic.blank(38, 50);
  rect(p, 1, 1, 36, 4, "W");
  hline(p, 1, 1, 36, "P");
  rect(p, 1, 5, 36, 44, "u");
  vline(p, 36, 5, 44, "U");
  rect(p, 3, 7, 32, 36, "j");
  for (const y of [18, 30, 42]) hline(p, 3, y, 32, "W");
  const bottles: [number, number, string][] = [
    [5, 11, "T"],
    [10, 13, "~"],
    [14, 10, "T"],
    [19, 12, "c"],
    [24, 11, "T"],
    [29, 13, "~"],
    [5, 23, "~"],
    [9, 24, "T"],
    [14, 22, "+"],
    [20, 24, "T"],
    [26, 23, "o"],
    [30, 24, "T"],
    [6, 35, "T"],
    [12, 36, "c"],
    [18, 34, "T"],
    [25, 36, "~"],
  ];
  for (const [x, y, c] of bottles) {
    const shelf = y < 18 ? 18 : y < 30 ? 30 : 42;
    rect(p, x, y, 4, shelf - y, c);
    rect(p, x + 1, y - 2, 2, 2, c === "T" ? "C" : "K");
    rect(p, x, y + 2, 4, 2, "w");
  }
  // Door frames and glass glint.
  vline(p, 18, 7, 36, "u");
  vline(p, 19, 7, 36, "U");
  for (let i = 0; i < 8; i++) p.set(6 + i, 16 - i, "k").set(22 + i, 28 - i, "k");
  rect(p, 16, 25, 2, 3, "K");
  rect(p, 20, 25, 2, 3, "K");
  hline(p, 1, 48, 36, "U");
  return finish(p);
})();

/** A microscope, its arm, the stage and a slide. */
const microscope = (() => {
  const p = Pic.blank(14, 18);
  rect(p, 2, 14, 10, 3, "w");
  hline(p, 2, 14, 10, "k");
  rect(p, 8, 4, 3, 10, "k");
  vline(p, 10, 4, 10, "K");
  rect(p, 3, 1, 4, 3, "I");
  rect(p, 4, 4, 3, 6, "i");
  rect(p, 2, 10, 8, 2, "I");
  rect(p, 3, 9, 5, 1, "~");
  rect(p, 10, 7, 3, 2, "M");
  return finish(p);
})();

/** The skeleton model on its stand, a hand raised as if it knows the answer. */
const skeleton = (() => {
  const p = Pic.blank(20, 40);
  // Skull.
  rect(p, 7, 1, 7, 7, "w");
  hline(p, 8, 0, 5, "w");
  vline(p, 13, 2, 6, "k");
  rect(p, 8, 4, 2, 2, "M");
  rect(p, 11, 4, 2, 2, "M");
  hline(p, 9, 7, 3, "K");
  // Spine and ribs.
  vline(p, 10, 8, 16, "k");
  for (let y = 10; y < 19; y += 2) {
    hline(p, 6, y, 9, "w");
    p.set(6, y + 1, "k").set(14, y + 1, "k");
  }
  // Pelvis.
  rect(p, 7, 22, 7, 3, "w");
  // Arms: one down, one up.
  vline(p, 5, 10, 10, "w");
  vline(p, 4, 20, 3, "w");
  vline(p, 15, 3, 8, "w");
  p.set(16, 2, "w").set(16, 1, "w");
  // Legs.
  vline(p, 8, 25, 10, "w");
  vline(p, 12, 25, 10, "w");
  // Stand.
  vline(p, 17, 6, 30, "M");
  hline(p, 15, 6, 3, "M");
  rect(p, 4, 35, 13, 3, "I");
  hline(p, 4, 35, 13, "i");
  return finish(p);
})();

/**
 * The interferometer on its optical table: the laser box, a beam splitter, two arms to their
 * mirrors and back, and the screen where the fringes show. `on` draws the beam; `fringes` lights
 * the screen in bands, the way 0조 saw them move before the laser was switched on.
 */
function interferometer(state: "off" | "on" | "fringes"): Pic {
  const W = 76;
  const p = Pic.blank(W, 32);
  // Table top: black breadboard with its hole grid.
  rect(p, 1, 1, W - 2, 20, "I");
  hline(p, 1, 1, W - 2, "i");
  for (let y = 4; y < 20; y += 4) for (let x = 4; x < W - 3; x += 4) rect(p, x, y, 1, 1, "J");
  // Legs.
  rect(p, 1, 21, W - 2, 3, "j");
  for (const x of [3, W - 7]) rect(p, x, 24, 4, 7, "j");
  hline(p, 7, 28, W - 14, "I");
  // Laser box.
  rect(p, 4, 9, 14, 6, "R");
  hline(p, 4, 9, 14, "r");
  rect(p, 18, 11, 2, 2, "M");
  // Beam splitter, two mirrors, screen.
  const post = (x: number, y: number, face: string) => {
    rect(p, x, y, 3, 4, "K");
    hline(p, x, y, 3, face);
  };
  post(36, 10, "~");
  post(64, 10, "w");
  post(36, 2, "w");
  rect(p, 30, 15, 14, 5, "j");
  rect(p, 31, 16, 12, 3, state === "fringes" ? "y" : state === "on" ? "r" : "S");
  if (state === "fringes") for (let x = 32; x < 43; x += 3) vline(p, x, 16, 3, "R");
  if (state !== "off") {
    hline(p, 20, 11, 16, "r");
    hline(p, 39, 11, 25, "r");
    vline(p, 37, 6, 4, "r");
    vline(p, 37, 14, 1, "r");
  }
  return finish(p, "J");
}

/** The telescope on its pier, tube raised toward the slot in the dome. */
const telescope = (() => {
  const p = Pic.blank(34, 44);
  // Tube, angled up and to the left in steps.
  for (let i = 0; i < 20; i++) {
    const x = 26 - i;
    const y = 22 - Math.floor(i * 0.9);
    rect(p, x, y, 2, 6, i < 2 ? "I" : "w");
    p.set(x, y, i < 2 ? "i" : "k");
    p.set(x, y + 5, "K");
  }
  rect(p, 4, 2, 4, 7, "I");
  // Finder scope and focuser.
  rect(p, 22, 14, 3, 2, "K");
  rect(p, 26, 26, 3, 3, "I");
  // Mount and counterweight.
  rect(p, 15, 24, 6, 5, "N");
  hline(p, 15, 24, 6, "n");
  vline(p, 21, 27, 7, "M");
  rect(p, 20, 33, 4, 3, "I");
  // Pier and feet.
  rect(p, 16, 29, 4, 11, "M");
  vline(p, 16, 29, 11, "K");
  hline(p, 10, 40, 16, "S");
  rect(p, 10, 41, 3, 2, "S");
  rect(p, 23, 41, 3, 2, "S");
  return finish(p);
})();

const interferometerSprite = sprite({
  name: "interferometer",
  group: "interior",
  size: [76, 32],
  palette: IL,
  lone: "J",
  shadow: boxShadow(76, 32, 1, 22, 74, 31, 3, 0),
  frames: {
    off: interferometer("off").toString(),
    on: interferometer("on").toString(),
    fringes: interferometer("fringes").toString(),
  },
  anim: {
    idle: { frames: ["off"], fps: 1 },
    shift: { frames: ["on", "fringes", "on", "fringes", "fringes"], fps: 3, jump: 0.5 },
  },
});

export default [
  frames(
    "lab-bench",
    { still: labBench },
    { lone: "y", shadow: boxShadow(64, 34, 1, 19, 62, 33, 3, 0) },
  ),
  frames(
    "fume-hood",
    { on: fumeHood(true), off: fumeHood(false) },
    { lone: "Y", shadow: boxShadow(40, 56, 1, 48, 38, 55, 2, 0) },
  ),
  frames(
    "bottle-cabinet",
    { still: bottleCabinet },
    { shadow: boxShadow(38, 50, 1, 44, 36, 49, 2, 0) },
  ),
  frames("microscope", { still: microscope }, { shadow: ovalShadow(14, 18, 8, 17, 5, 1.2) }),
  frames("skeleton", { still: skeleton }, { shadow: ovalShadow(20, 40, 11, 37.5, 7, 1.6) }),
  interferometerSprite,
  frames("telescope", { still: telescope }, { shadow: ovalShadow(34, 44, 19, 42, 10, 2) }),
];
