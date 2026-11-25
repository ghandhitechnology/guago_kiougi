import { type Prop, scene } from "../scene.ts";

/**
 * agora-rift: 23:40, the night the first page tore. The 운동장 is dark, the dorm's corridors
 * lit beyond the fence, and in the middle of the field the world has ripped like a notebook
 * page. Through the hole it is afternoon in another century: a marble terrace, a tortoise that
 * cannot be caught, columns rising against a gold sky over the sea. That daylight is the only
 * light on the field. It warms the sand near the tear and throws the shadows of the goal and
 * the columns that came up through it away into the dark. 오답 pour out of the hole, two
 * students hold the line in the light, and the notebook's pages are pulled in past them.
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
  ...campusColumn(184, 250, "broken"),
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
    { prop: "heave", at: [184, 253] },
    { decal: "marble-dust/shards", at: [282, 170] },
    { decal: "marble-dust/pebbles", at: [356, 160] },
  ],
  edges: [{ overlay: "rift", inside: "dm" }],
  shadows: [
    { prop: "long-shadow", frame: "column", at: [222, 158], flip: true },
    { prop: "long-shadow", frame: "column", at: [184, 250], flip: true },
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
    { prop: "drum", at: [160, 260], flip: true },
    { prop: "rocket", at: [20, 152] },
    { prop: "tortoise-statue", at: [336, 124], raw: true },
    { prop: "olive", at: [398, 128], raw: true },
    { prop: "amphora", at: [282, 140], raw: true },
    { prop: "amphora-tipped", at: [296, 152], raw: true },
    // The pack coming out of the tear into the light: 오답 of both kinds, a 유리수 병사, the
    // tortoise that cannot be caught, a fire and a water spirit. The front of it is already in
    // the fight; the rest is still spilling over the lip.
    { actor: "odap", anim: "hit", shadow: "shadow-s/blob", at: [268, 222] },
    { actor: "odap", anim: "hop", index: 1, play: true, shadow: "shadow-s/blob", at: [292, 230] },
    { actor: "odap-pencil", anim: "idle", play: true, shadow: "shadow-s/blob", at: [300, 252] },
    {
      actor: "rational",
      anim: "walk",
      play: true,
      shadow: "shadow-m/blob",
      at: [304, 206],
      flip: true,
    },
    {
      actor: "tortoise",
      anim: "walk",
      play: true,
      shadow: "shadow-m/blob",
      at: [334, 240],
      flip: true,
    },
    { actor: "element-fire", anim: "idle", play: true, shadow: "shadow-s/blob", at: [322, 188] },
    { actor: "odap", anim: "hop", index: 2, play: true, shadow: "shadow-s/blob", at: [314, 166] },
    { actor: "odap", anim: "idle", index: 3, play: true, shadow: "shadow-s/blob", at: [342, 176] },
    {
      actor: "odap-pencil",
      anim: "hop",
      play: true,
      shadow: "shadow-s/blob",
      at: [292, 184],
      flip: true,
    },
    {
      actor: "element-water",
      anim: "move",
      play: true,
      shadow: "shadow-s/blob",
      at: [352, 206],
      flip: true,
    },
    // Two students holding the line: one mid-swing, one throwing a book.
    { rig: "student", look: "club", dir: "side", anim: "attack", index: 1, at: [242, 222] },
    { rig: "student", look: "curls", dir: "side", anim: "attack", index: 2, at: [204, 198] },
    // What the last one to go down left behind.
    { actor: "pickup-page", anim: "flutter", play: true, shadow: "shadow-s/blob", at: [250, 252] },
    { actor: "pickup-cone", anim: "spin", play: true, shadow: "shadow-s/blob", at: [264, 255] },
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
      rays: { at: [330, 120], count: 9, amount: 0.38 },
      pulse: { amount: 0.04, period: 2.2 },
    },
  ],
  atmosphere: [
    // The fight: a slash landing, a spark on the hit, a thrown book, a pop where one went down.
    { prop: "fx-slash", anim: "swing", index: 1, at: [260, 214], raw: true },
    { prop: "fx-spark", anim: "hit", index: 1, at: [268, 214], raw: true },
    { prop: "fx-book", anim: "spin", play: true, at: [236, 190], raw: true },
    { prop: "fx-pop", anim: "die", index: 2, at: [257, 246], raw: true },
    // Pages of the notebook, pulled in toward the tear: three sizes, each tumbling on its own
    // beat, caught at different points of the way in.
    {
      prop: "page-l",
      anim: "turn",
      play: true,
      at: [30, 140],
      drift: { to: [300, 100], period: 9, phase: 4.05 },
    },
    {
      prop: "page-m",
      anim: "turn",
      play: true,
      index: 1,
      at: [-10, 236],
      drift: { to: [290, 130], period: 11, phase: 3.3 },
    },
    {
      prop: "page-s",
      anim: "turn",
      play: true,
      index: 7,
      at: [40, 280],
      drift: { to: [290, 140], period: 7, phase: 3.5 },
    },
    {
      prop: "page-m",
      anim: "turn",
      play: true,
      index: 4,
      at: [70, 96],
      drift: { to: [282, 84], period: 10, phase: 6.0 },
    },
    {
      prop: "page-s",
      anim: "turn",
      play: true,
      at: [-6, 120],
      drift: { to: [300, 110], period: 12, phase: 3.0 },
    },
    {
      prop: "page-l",
      anim: "turn",
      play: true,
      index: 6,
      at: [480, 150],
      drift: { to: [400, 110], period: 8, phase: 4.0 },
    },
    {
      prop: "page-s",
      anim: "turn",
      play: true,
      index: 3,
      at: [480, 100],
      drift: { to: [420, 120], period: 6, phase: 2.4 },
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
