import { type Light, type Prop, scene } from "../scene.ts";

/**
 * campus-night: a school that never sleeps. 23:38, second week of the year. Fluorescent rooms
 * burn on every floor of 가설관, the 해솔 leans away from the sea wind, and past the sea wall the
 * city across the water is still awake. The one warm corner is the 매점 that is a corkboard,
 * the vending machine glowing beside it, and a lamp over an empty bench where the cat sits.
 */

/** One floor of the facade, left to right, from frame names. */
function floor(y: number, frames: readonly string[], play: readonly number[] = []): Prop[] {
  return frames.map((frame, i) =>
    play.includes(i)
      ? { prop: "facade", anim: "flicker", play: true, index: i, at: [i * 16, y] }
      : { prop: "facade", frame, at: [i * 16, y] },
  );
}

const W = "window";
const D = "window-dark";
const UW = "up-window";
const UD = "up-window-dark";
const UC = "up-curtain";

/** Light spilling from a lit ground-floor window onto the walkway. */
const spill = (col: number): Light => ({
  theme: "campus-dusk",
  at: [col * 16 + 8, 149],
  r: [9, 6],
});

export default scene({
  name: "campus-night",
  seed: 41,
  theme: "campus-night",
  sky: "ink.deep",
  legend: {
    "~": { terrain: null },
    g: { terrain: "grass" },
    "=": { terrain: "walk" },
    ":": { terrain: "dirt" },
  },
  ground: `
    ===============~~~~~~~~~~~~~~~
    ===============~~~~~~~~~~~~~~~
    ===============~~~~~~~~~~~~~~~
    ===============~~~~~~~~~~~~~~~
    ===============~~~~~~~~~~~~~~~
    ===============~~~~~~~~~~~~~~~
    ===============ggggggggggggggg
    ===============ggggggggggggggg
    ===============ggggggggggggggg
    =======================ggggggg
    =======================ggggggg
    ggggggg:::ggggggg===gggggggggg
    gggggg:::gggggggg===gggggggggg
    gggggg:::gggggggg===gggggggggg
    ggggg:::ggggggggg===gggggggggg
    gggg:::gggggggggg===gggggggggg
    gggg:::gggggggggg===gggggggggg
  `,
  backdrop: [
    { prop: "night-stars", anim: "twinkle", play: true, at: [240, 0], repeat: 2, raw: true },
    { prop: "night-moon", at: [452, 9], raw: true },
    { prop: "night-city", at: [232, 64], repeat: 2, raw: true },
    { prop: "night-sea", anim: "ripple", play: true, at: [240, 64], repeat: 4, raw: true },
  ],
  details: [
    { decal: "lawn-path/needles", at: [400, 160] },
    { decal: "lawn-path/needles", at: [422, 170] },
    { decal: "lawn-path/cone", at: [448, 176] },
    { decal: "lawn-path/needles", at: [384, 176] },
    { decal: "lawn-path/needles", at: [440, 186] },
  ],
  objects: [
    // 가설관: three floors of the south face, running off the top of the screen.
    ...floor(47, ["up-end-l", UD, UW, UW, UD, UC, UW, UD, UW, UW, UW, UD, UW, UD, "up-end-r"], [9]),
    ...floor(
      95,
      ["up-end-l", UW, UC, UD, UD, UW, UW, UD, UW, UW, UD, UD, UW, UW, "up-end-r"],
      [12],
    ),
    ...floor(143, [
      "end-l",
      W,
      W,
      D,
      "wall",
      "door-l",
      "door-r",
      "wall",
      W,
      D,
      W,
      D,
      "wall",
      "wall",
      "end-r",
    ]),
    { prop: "steps", at: [96, 153] },
    { prop: "planter", at: [40, 157] },
    { prop: "shrub", at: [26, 152] },
    { prop: "shrub", at: [52, 153], flip: true },
    // The sea wall and its fence, with the city behind.
    { prop: "seawall", frame: "run", at: [240, 109], repeat: 15 },
    { prop: "fence", frame: "run", at: [240, 98], repeat: 15 },
    { prop: "fence", frame: "post", at: [288, 98] },
    { prop: "fence", frame: "post", at: [352, 98] },
    { prop: "fence", frame: "post", at: [416, 98] },
    // The warm corner: vending machine, corkboard, lamp and the cat's bench.
    { prop: "vending", anim: "glow", play: true, at: [218, 156] },
    { prop: "corkboard", at: [262, 159] },
    { prop: "lamp", at: [330, 179] },
    { prop: "bench", at: [362, 173] },
    // 해솔.
    { prop: "pine", at: [428, 175] },
    { prop: "shrub", at: [472, 186] },
    // The lawn going down to the dorm, and the club car nobody moved.
    { prop: "ev", at: [134, 250] },
    { prop: "shrub", at: [22, 214] },
    { prop: "shrub", at: [226, 266], flip: true },
    { prop: "shrub", at: [456, 252] },
    // Students.
    { rig: "student", look: "blazer", dir: "up", anim: "idle", play: true, at: [218, 174] },
    {
      rig: "student",
      look: "varsity",
      dir: "up",
      anim: "idle",
      index: 1,
      play: true,
      at: [266, 178],
    },
    {
      rig: "student",
      look: "blazer",
      dir: "side",
      anim: "walk",
      play: true,
      at: [150, 167],
      flip: true,
    },
  ],
  overhead: [
    { prop: "pine-crown", anim: "sway", play: true, at: [428, 175] },
    { prop: "canopy", at: [96, 116] },
  ],
  lights: [
    { theme: "campus-lamp", ring: "campus-dusk", at: [332, 174], r: [68, 33], core: 0.48 },
    {
      theme: "campus-dusk",
      at: [220, 160],
      r: [26, 13],
      pulse: { amount: 0.08, period: 2.5 },
    },
    { theme: "campus-lamp", ring: "campus-dusk", at: [96, 151], r: [26, 11], core: 0.5 },
    spill(8),
    spill(10),
  ],
  atmosphere: [
    { prop: "moths", anim: "fly", play: true, at: [330, 132] },
    { prop: "needles-drift", anim: "fall", play: true, at: [380, 116] },
    { prop: "needles-drift", anim: "fall", play: true, index: 4, at: [444, 124], flip: true },
  ],
});
