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

const LAMP = ["campus-lamp", "campus-dusk"];

/** Light falling from a lit ground-floor window onto the walkway, widening as it falls. */
const spill = (col: number): Light => ({
  bands: ["campus-dusk"],
  spill: { top: [col * 16 + 2, col * 16 + 14, 144], bottom: [col * 16 - 3, col * 16 + 19, 160] },
  ragged: 2,
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
    ...floor(
      47,
      ["up-end-l", UD, UW, UW, UD, "up-wall", "up-wall", UD, UW, UC, UW, UD, UW, UD, "up-end-r"],
      [8],
    ),
    ...floor(
      95,
      ["up-end-l", UW, UC, UD, UD, UW, UW, UD, UW, "up-studying", UD, UD, UW, UW, "up-end-r"],
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
    // The east face in shadow and a drainpipe at the corner.
    { prop: "facade-side", frame: "up", at: [240, 47] },
    { prop: "facade-side", frame: "up", at: [240, 95] },
    { prop: "facade-side", frame: "ground", at: [240, 143] },
    { prop: "drainpipe", frame: "run", at: [231, 47] },
    { prop: "drainpipe", frame: "run", at: [231, 95] },
    { prop: "drainpipe", frame: "foot", at: [231, 143] },
    { prop: "steps", at: [96, 153] },
    { prop: "planter", at: [40, 157] },
    { prop: "shrub", at: [26, 152] },
    { prop: "shrub", at: [52, 153], flip: true },
    // The sea wall and its fence, with the city behind.
    { prop: "seawall", frame: "run", at: [250, 109], repeat: 15 },
    { prop: "fence", frame: "run", at: [250, 98], repeat: 15 },
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
    // Who is still up: one at the vending machine, one yawning out of the doors, one reading
    // under the lamp, 도현우 at the corkboard with the notebook, 권 사감 coming up the path.
    { rig: "student", look: "summer", dir: "up", anim: "idle", play: true, at: [218, 174] },
    { rig: "student", look: "bedhead", dir: "down", anim: "yawn", play: true, at: [126, 170] },
    { rig: "student", look: "reader", dir: "down", anim: "page", play: true, at: [338, 190] },
    { rig: "hyunwoo", look: "tired", dir: "up", anim: "remember", play: true, at: [268, 180] },
    {
      rig: "sagam",
      look: "duty",
      dir: "side",
      anim: "whistle",
      play: true,
      at: [298, 232],
      flip: true,
    },
  ],
  overhead: [
    // 엔트로피 asleep on the warm top of the vending machine.
    { prop: "entropy", anim: "sleep", play: true, at: [216, 127], raw: true },
    // Fixed to the wall above everyone's heads: the clock and the name plate.
    { prop: "clock", at: [96, 36] },
    { prop: "sign", at: [96, 91] },
    { prop: "pine-crown", anim: "sway", play: true, at: [428, 175] },
    { prop: "canopy", at: [96, 116] },
  ],
  lights: [
    { bands: LAMP, at: [332, 172], r: [74, 36], ragged: 5 },
    // The vending machine's panel lights the pavement cold and white, not like the lamp.
    { bands: ["campus"], at: [218, 162], r: [24, 11], pulse: { amount: 0.08, period: 2.5 } },
    { bands: LAMP, spill: { top: [80, 112, 144], bottom: [64, 128, 172] }, ragged: 3 },
    spill(1),
    spill(2),
    spill(8),
    spill(10),
  ],
  atmosphere: [
    { prop: "moths", anim: "fly", play: true, at: [330, 132] },
    { prop: "needles-drift", anim: "fall", play: true, at: [380, 116] },
    { prop: "needles-drift", anim: "fall", play: true, index: 4, at: [444, 124], flip: true },
  ],
});
