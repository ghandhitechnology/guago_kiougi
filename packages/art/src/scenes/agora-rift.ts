import { type Prop, scene } from "../scene.ts";

/**
 * agora-rift: a sports field being overwritten by antiquity. The first rift opened on the
 * 운동장 and the agora is coming up through it: columns heave the field's crust, one has taken
 * the goal with it, and the chalk lines run on under the era's dust. Behind the tear the sky is
 * another century's. A pack of 오답 pours out of the light, and one student holds the line.
 */

/**
 * A column: its shaft in the sorted layer, its capital overhead. Columns on the era's ground
 * are `raw`, lit by that world's sun rather than the campus's late light.
 */
const column = (x: number, y: number, frame: "whole" | "broken", raw: boolean): Prop[] => [
  { prop: "column", frame, at: [x, y], raw },
  ...(frame === "whole" ? [{ prop: "column-capital", at: [x, y], raw } as Prop] : []),
];

const columns = [
  ...column(232, 150, "whole", false),
  ...column(206, 204, "broken", false),
  ...column(150, 176, "broken", false),
  ...column(338, 160, "whole", true),
  ...column(370, 160, "whole", true),
  ...column(402, 160, "whole", true),
];

/** The long shadow of everything tall, toward the east. */
const longShadows: Prop[] = [
  ...[
    [232, 150],
    [338, 160],
    [370, 160],
    [402, 160],
    [206, 204],
    [150, 176],
    [104, 100],
  ].map(
    ([x, y]) => ({ prop: "long-shadow", frame: "column", at: [x as number, y as number] }) as Prop,
  ),
  { prop: "long-shadow", frame: "tree", at: [456, 104] },
];

export default scene({
  name: "agora-rift",
  seed: 12,
  theme: "campus-eve",
  sky: "navy.pale",
  legend: {
    "~": { terrain: null },
    g: { terrain: "grass" },
    s: { terrain: "sand" },
    G: { terrain: "grass", theme: "greece" },
    d: { terrain: "dirt", theme: "greece" },
    m: { terrain: "marble", theme: "greece" },
  },
  ground: `
    ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    gggggggggggggggg~~~~~~~~~~~~~~
    ggsssssssssssssssdddddddGGGGGG
    ggssssssssssssssddddddddddddGG
    ggssssssssssssssddddmmmmmmmddd
    ggsssssssssssssdddddmmmmmmmddd
    ggsssssssssssssdddddmmmmmmmddd
    ggssssssssssssssddddmmmmmmmddd
    ggsssssssssssssssdddmmmmmmdddd
    ggssssssssssssssssdddmmmmmdddd
    ggssssssssssssssssssdddddddGGG
    ggggssssssssssssssssssddddGGGG
    ggggggsssssssssssssssssssddGGG
    gggggggssssssssssssssssssssddd
  `,
  backdrop: [
    { prop: "agora-clouds", at: [14, 10], raw: true },
    { prop: "agora-clouds", at: [150, 22], raw: true, flip: true },
    { prop: "agora-edge", at: [0, 64], raw: true },
    { prop: "greek-sky", at: [256, 0], raw: true },
  ],
  details: [
    // The goal area, in front of the goal at the field's far end.
    { prop: "chalk-h", at: [72, 128], repeat: 6, raw: true },
    { prop: "chalk-v", at: [72, 98], raw: true },
    { prop: "chalk-v", at: [72, 112], raw: true },
    { prop: "chalk-v", at: [166, 98], raw: true },
    { prop: "chalk-v", at: [166, 112], raw: true },
    { prop: "chalk-spot", at: [119, 150], raw: true },
    // The halfway line, running on under the tear and the era's dust until the paving stops it.
    { prop: "chalk-h", at: [32, 190], repeat: 18, raw: true },
    // Where columns came up through the field.
    { prop: "heave", at: [232, 153] },
    { prop: "heave", at: [206, 207] },
    { prop: "heave", at: [150, 179] },
    { decal: "marble-dust/shards", at: [292, 212] },
    { decal: "marble-dust/shards", at: [446, 168] },
    { decal: "marble-dust/pebbles", at: [262, 118] },
    { decal: "marble-dust/pebbles", at: [300, 150] },
    // The tear in the sky, coming down to the ground.
    { prop: "rift-seam", anim: "pulse", play: true, at: [258, 0], raw: true },
  ],
  edges: [{ overlay: ["rift", "rift-pulse"], fps: 3, inside: "Gdm" }],
  shadows: longShadows,
  objects: [
    { prop: "goal-column", at: [120, 100] },
    { prop: "rocket", at: [22, 126] },
    ...columns.filter((c) => c.prop === "column"),
    { prop: "drum", at: [226, 216] },
    { prop: "drum", at: [172, 184], flip: true },
    { prop: "column", frame: "broken", at: [424, 160], raw: true },
    { prop: "olive", at: [456, 104], raw: true },
    { prop: "tortoise", at: [376, 202], raw: true },
    { prop: "amphora", at: [442, 232], raw: true },
    { prop: "amphora-tipped", at: [462, 244], raw: true },
    // The pack, pouring out of the tear.
    { actor: "odap", anim: "hit", shadow: "blob/s", at: [228, 232] },
    { actor: "odap", anim: "hop", index: 1, play: true, shadow: "blob/s", at: [252, 218] },
    { actor: "odap", anim: "hop", index: 3, play: true, shadow: "blob/s", at: [268, 240] },
    { actor: "odap", anim: "idle", play: true, shadow: "blob/s", at: [290, 224] },
    { actor: "odap-pencil", anim: "hop", index: 2, play: true, shadow: "blob/s", at: [282, 252] },
    { actor: "odap", anim: "idle", index: 1, play: true, shadow: "blob/s", at: [312, 246] },
    // The one holding the line, and a friend behind.
    { rig: "student", look: "varsity", dir: "side", anim: "attack", index: 1, at: [206, 236] },
    { rig: "student", look: "blazer", dir: "side", anim: "idle", play: true, at: [168, 250] },
  ],
  overhead: [
    ...columns.filter((c) => c.prop === "column-capital"),
    { prop: "olive-crown", anim: "stir", play: true, at: [456, 104], raw: true },
  ],
  atmosphere: [
    { prop: "motes", anim: "drift", play: true, at: [222, 96] },
    { prop: "motes", anim: "drift", play: true, index: 4, at: [226, 150] },
    { prop: "motes", anim: "drift", play: true, index: 7, at: [244, 196] },
    { prop: "page", anim: "turn", play: true, at: [176, 126] },
    { prop: "page", anim: "turn", play: true, index: 2, at: [214, 168] },
    { prop: "page", anim: "turn", play: true, index: 1, at: [120, 214] },
    { prop: "page", anim: "turn", play: true, index: 3, at: [240, 128] },
  ],
});
