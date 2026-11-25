import { type Prop, scene } from "../scene.ts";

/**
 * agora-rift: 23:40, the night the first page tore. The 운동장 is dark, the dorm's corridors
 * lit beyond the fence, and in the middle of the field the world has ripped like a notebook
 * page. Through the hole it is afternoon in another century: a marble terrace, a tortoise that
 * cannot be caught, columns rising against a gold sky over the sea. That daylight is the only
 * light on the field. It warms the sand near the tear and throws the shadows of the goal and
 * the columns that came up through it away into the dark. 오답 pour out of the hole; one
 * student stands in the light to meet them, and the notebook's pages are pulled in past her.
 */

const RIFT = ["rift-sun", "rift-warm", "rift-ember"];

/** A chalk line, its pieces alternating fresh and worn so it never reads as a stamp. */
function chalk(axis: "h" | "v", x: number, y: number, pieces: readonly number[]): Prop[] {
  return pieces.map((wear, i) => ({
    prop: axis === "h" ? "chalk-h" : "chalk-v",
    frame: `${axis}${wear}`,
    at: axis === "h" ? [x + i * 16, y] : [x, y + i * 16],
  }));
}

/** A campus-side column, flipped so its lit side faces the tear. */
const campusColumn = (x: number, y: number, frame: "whole" | "broken"): Prop[] => [
  { prop: "column", frame, at: [x, y], flip: true },
  ...(frame === "whole" ? [{ prop: "column-capital", at: [x, y], flip: true } as Prop] : []),
];

/** A column on the era's terrace, in that world's own daylight. */
const eraColumn = (x: number, y: number, frame: "whole" | "broken"): Prop[] => [
  { prop: "column", frame, at: [x, y], raw: true },
  ...(frame === "whole" ? [{ prop: "column-capital", at: [x, y], raw: true } as Prop] : []),
];

const columns = [
  ...campusColumn(222, 158, "whole"),
  ...campusColumn(262, 236, "broken"),
  ...eraColumn(304, 104, "whole"),
  ...eraColumn(368, 104, "whole"),
  ...eraColumn(338, 98, "broken"),
];
const sorted = (list: Prop[]) => list.filter((c) => c.prop !== "column-capital");
const tops = (list: Prop[]) => list.filter((c) => c.prop === "column-capital");

export default scene({
  name: "agora-rift",
  seed: 23,
  theme: "field-night",
  sky: "ink.deep",
  legend: {
    "~": { terrain: null },
    g: { terrain: "grass" },
    s: { terrain: "sand" },
    d: { terrain: "dirt", theme: "greece" },
    m: { terrain: "marble", theme: "greece" },
  },
  ground: `
    ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    gggggggggggggggdddmmmmmmddgggg
    ggsssssssssssssdddmmmmmmddssgg
    ggssssssssssssssddmmmmmmddssgg
    ggssssssssssssssdddddddddsssgg
    ggsssssssssssssssddddddddsssgg
    ggsssssssssssssssdddddddssssgg
    ggssssssssssssssssddddddssssgg
    ggsssssssssssssssssddddsssssgg
    ggssssssssssssssssssddssssssgg
    ggssssssssssssssssssssssssssgg
    ggggssssssssssssssssssssssgggg
    gggggsssssssssssssssssssgggggg
  `,
  backdrop: [
    { prop: "night-stars", anim: "twinkle", play: true, at: [0, 0], repeat: 3, raw: true },
    { prop: "night-dorm", at: [0, 80], raw: true },
    { prop: "night-dorm", at: [416, 80], raw: true },
    { prop: "sky-tear", at: [228, 0], raw: true },
  ],
  details: [
    // The goal mouth worn bare, the box in front of it, the halfway line.
    { prop: "worn", at: [146, 120] },
    ...chalk("h", 124, 146, [0, 1, 3, 2, 0, 1]),
    ...chalk("v", 124, 98, [3, 0, 1]),
    ...chalk("v", 218, 98, [1, 2, 0]),
    ...chalk("h", 32, 206, [2, 0, 3, 1, 0, 0, 2, 3, 1, 0, 3, 0, 1, 2, 0, 3, 1]),
    // Weeds where the sand meets the lawn, drag marks across the field.
    { prop: "weeds", at: [34, 104] },
    { prop: "weeds", at: [33, 176] },
    { prop: "weeds", at: [439, 146] },
    { prop: "weeds", at: [436, 218] },
    { prop: "weeds", at: [86, 238] },
    { prop: "drag", at: [58, 162] },
    { prop: "drag", at: [104, 222] },
    { prop: "drag", at: [176, 186] },
    // Where columns came up through the field.
    { prop: "heave", at: [222, 161] },
    { prop: "heave", at: [262, 239] },
    { decal: "marble-dust/shards", at: [282, 170] },
    { decal: "marble-dust/pebbles", at: [356, 160] },
  ],
  edges: [{ overlay: "rift", inside: "dm" }],
  shadows: [
    { prop: "long-shadow", frame: "column", at: [222, 158], flip: true },
    { prop: "long-shadow", frame: "column", at: [262, 236], flip: true },
    { prop: "long-shadow", frame: "tree", at: [190, 122], flip: true },
  ],
  objects: [
    // The field's far edge: lawn, the sea wall and its fence, cut by the tear.
    { prop: "seawall", frame: "run", at: [0, 93], repeat: 15 },
    { prop: "seawall", frame: "run", at: [416, 93], repeat: 4 },
    { prop: "fence", frame: "run", at: [0, 82], repeat: 15 },
    { prop: "fence", frame: "run", at: [416, 82], repeat: 4 },
    { prop: "fence", frame: "post", at: [64, 82] },
    { prop: "fence", frame: "post", at: [160, 82] },
    { prop: "fence", frame: "post", at: [448, 82] },
    // The era's terrace, edged with a balustrade where its ground drops to the sea.
    { prop: "terrace", frame: "run", at: [240, 89], repeat: 11, raw: true },
    // The goal the column took with it, and the columns that followed.
    { prop: "goal-column", at: [170, 122], flip: true },
    ...sorted(columns),
    { prop: "drum", at: [240, 246], flip: true },
    { prop: "rocket", at: [20, 152] },
    { prop: "tortoise-statue", at: [336, 124], raw: true },
    { prop: "olive", at: [398, 128], raw: true },
    { prop: "amphora", at: [282, 140], raw: true },
    { prop: "amphora-tipped", at: [296, 152], raw: true },
    // The pack, pouring out of the tear into the light.
    { actor: "odap", anim: "hit", shadow: "blob/s", at: [272, 224] },
    { actor: "odap", anim: "hop", index: 1, play: true, shadow: "blob/s", at: [296, 208] },
    { actor: "odap", anim: "idle", play: true, shadow: "blob/s", at: [316, 194] },
    { actor: "odap", anim: "hop", index: 3, play: true, shadow: "blob/s", at: [306, 226] },
    { actor: "odap-pencil", anim: "hop", index: 2, play: true, shadow: "blob/s", at: [288, 242] },
    { actor: "odap", anim: "idle", index: 1, play: true, shadow: "blob/s", at: [330, 214] },
    // The one holding the line, and a friend behind her.
    { rig: "student", look: "varsity", dir: "side", anim: "attack", index: 1, at: [246, 222] },
    { rig: "student", look: "blazer", dir: "side", anim: "idle", play: true, at: [204, 238] },
  ],
  overhead: [
    ...tops(columns),
    { prop: "olive-crown", anim: "stir", play: true, at: [398, 128], raw: true },
  ],
  lights: [
    {
      bands: RIFT,
      region: "dm",
      reach: [18, 46, 84],
      ragged: 7,
      pulse: { amount: 0.04, period: 2.2 },
    },
  ],
  atmosphere: [
    // Pages of the notebook, pulled in toward the tear.
    {
      prop: "page-big",
      anim: "turn",
      play: true,
      at: [52, 150],
      drift: { to: [300, 100], period: 9 },
    },
    {
      prop: "page-big",
      anim: "turn",
      play: true,
      index: 1,
      at: [20, 232],
      drift: { to: [292, 126], period: 11, phase: 5 },
    },
    {
      prop: "page-big",
      anim: "turn",
      play: true,
      index: 3,
      at: [140, 262],
      drift: { to: [318, 136], period: 8, phase: 3 },
    },
    {
      prop: "page-big",
      anim: "turn",
      play: true,
      at: [96, 104],
      drift: { to: [284, 84], period: 10, phase: 7 },
    },
    // Scraps of the field lifting off at the lip.
    {
      prop: "scrap",
      anim: "tumble",
      play: true,
      at: [262, 118],
      drift: { to: [292, 66], period: 4 },
    },
    {
      prop: "scrap",
      anim: "tumble",
      play: true,
      index: 2,
      at: [252, 180],
      drift: { to: [286, 128], period: 5, phase: 2 },
    },
    {
      prop: "scrap",
      anim: "tumble",
      play: true,
      index: 1,
      at: [302, 240],
      drift: { to: [320, 192], period: 4.5, phase: 1 },
    },
    { prop: "embers", anim: "rise", play: true, at: [262, 214] },
    { prop: "embers", anim: "rise", play: true, index: 6, at: [320, 170] },
    { prop: "embers", anim: "rise", play: true, index: 11, at: [244, 150] },
  ],
});
