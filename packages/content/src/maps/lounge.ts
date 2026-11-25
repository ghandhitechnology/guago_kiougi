import type { LightSource, MapSource } from "./format.ts";
import { backWall, mount, sideShade } from "./indoor.ts";
import type { Prop } from "./layers.ts";
import { place } from "./props.ts";

/**
 * 쉼표 라운지 at 19:20, after dinner, in the rain. Time stopped on the evening everybody stayed
 * in: rain runs down the windows, the floor lamps are on, the fairy lights somebody strung for
 * 해솔제 never came down. The grand piano on the little stage is the room's centre and nobody
 * plays it; the sofas round the rug are where people actually are, the 대자보 is where they read
 * what everybody else thinks, and the vending corner hums.
 */

const WALL = 0;
/** A lamp's warm pool, for the engine and painted for the sheet. */
const pool = (x: number, y: number, rx: number, ry: number, intensity = 0.5): LightSource => ({
  at: [x, y],
  radius: rx,
  color: "gold.light",
  intensity,
  flicker: { amount: 0.03, period: 2.4 },
  paint: { bands: ["campus", "campus-lamp"], at: [x, y], r: [rx, ry], ragged: 3 },
});

const lights: LightSource[] = [
  // The stage, lit from the floor lamp beside the piano.
  pool(88, 104, 70, 38, 0.6),
  // Sofas under two lamps, the reading nook, the pool table's lamp.
  pool(212, 150, 54, 30),
  pool(356, 150, 54, 30),
  pool(70, 250, 46, 28),
  pool(418, 262, 56, 26, 0.4),
  // The vending machines' cold panels.
  {
    at: [440, 84],
    radius: 40,
    color: "sea.pale",
    intensity: 0.45,
    flicker: { amount: 0.06, period: 2.5 },
    paint: { bands: ["campus"], at: [440, 90], r: [40, 16], ragged: 2 },
  },
  // The fish tank's blue.
  {
    at: [456, 152],
    radius: 26,
    color: "sea.light",
    intensity: 0.3,
    paint: { bands: ["campus"], at: [456, 160], r: [24, 10], ragged: 2 },
  },
];

/** The fairy lights, strung wall to wall at three depths. */
const strings: Prop[] = [
  { prop: "string-lights", anim: "twinkle", play: true, at: [64, 110] },
  { prop: "string-lights", anim: "twinkle", play: true, index: 1, at: [160, 120] },
  { prop: "string-lights", anim: "twinkle", play: true, index: 2, at: [256, 118] },
  { prop: "string-lights", anim: "twinkle", play: true, at: [352, 112] },
  { prop: "string-lights", anim: "twinkle", play: true, index: 1, at: [96, 210] },
  { prop: "string-lights", anim: "twinkle", play: true, index: 2, at: [192, 216] },
  { prop: "string-lights", anim: "twinkle", play: true, at: [288, 212] },
  { prop: "string-lights", anim: "twinkle", play: true, index: 1, at: [384, 206] },
];

const map: MapSource = {
  id: "lounge",
  name: "쉼표 라운지",
  seed: 1920,
  time: { clock: "19:20", phase: "dusk", weather: "drizzle" },
  theme: "campus-dusk",
  sky: "ink.deep",
  ambient: { color: "clay.dust", intensity: 0.62 },
  plan: `
    ################################
    #||||||||||||||||||||||||||||||#
    #||||||||||||||||||||||||||||||#
    #||||||||||||||||||||||||||||||#
    #_SSSSSSSSS____________________#
    #_SSSSSSSSS____________________#
    #_SSSSSSSSS____________________#
    #_SSSSSSSSS_rrrrrrrrrrr________#
    #_SSSSSSSSS_rrrrrrrrrrr________#
    #___________rrrrrrrrrrr________#
    #___________rrrrrrrrrrr________#
    #___________rrrrrrrrrrr________#
    #___________rrrrrrrrrrr________#
    #___________rrrrrrrrrrr________#
    #___________rrrrrrrrrrr________#
    #______________________________#
    #_______________________________
    #_______________________________
    #_____________mmmm_____________#
    #_____________mmmm_____________#
    ##############____##############
  `,
  legend: {
    "#": { terrain: "wood", solid: "#" },
    "|": { terrain: "wood", solid: "#" },
    _: { terrain: "wood" },
    S: { terrain: "stage" },
    r: { terrain: "rug" },
    m: { terrain: "mat" },
  },
  edges: [{ overlay: "wall-top", inside: "#" }],
  shadows: [...sideShade(1, 4, 20)],
  objects: [
    // The back wall: rain at the windows above the stage and the sofas, the clock, the 대자보,
    // the club photos.
    ...backWall("wall-dorm", 1, 31, WALL, { worn: [24], outlet: [12] }),
    mount("window", 56, WALL, { anim: "rain-curtain", play: true }),
    mount("window", 128, WALL, { anim: "rain", play: true, index: 1 }),
    mount("wall-clock", 184, WALL, { anim: "tick", play: true }),
    mount("window", 232, WALL, { anim: "rain", play: true, index: 2 }),
    mount("daejabo", 336, WALL),
    mount("photo-wall", 444, WALL),
    // The stage: the piano, its bench, the karaoke machine under its sheet, a lamp.
    place("piano", 3, 4),
    { prop: "piano-bench", at: [72, 112] },
    place("karaoke", 9, 4),
    place("floor-lamp", 6, 4, { anim: "glow", play: true }),
    // The sofas round the rug, a lamp at each end, the low table with its game of 오목.
    place("sofa", 14, 7, { frame: "front" }),
    place("sofa", 17, 7, { frame: "front" }),
    { prop: "side-table", at: [212, 126] },
    { prop: "side-table", at: [348, 126] },
    place("armchair", 12, 10),
    place("armchair", 22, 10),
    place("low-table", 16, 10),
    place("sofa", 15, 13, { frame: "back" }),
    { prop: "bean-bag", frame: "plum", at: [214, 236] },
    { prop: "bean-bag", frame: "red", at: [330, 230] },
    // The vending corner.
    place("vending", 27, 4, { anim: "glow", play: true }),
    place("vending", 28, 4, { anim: "glow", play: true, index: 3 }),
    place("snack-vending", 29, 4, { anim: "glow", play: true }),
    place("water-cooler", 30, 4),
    place("fish-tank", 29, 9, { anim: "swim", play: true }),
    place("monstera", 30, 12),
    // The reading nook: games and manga, a chair, a lamp.
    place("game-shelf", 1, 15),
    place("armchair", 6, 15),
    place("floor-lamp", 7, 15, { anim: "glow", play: true, index: 2 }),
    { prop: "textbooks", frame: "tall", at: [94, 244] },
    // The pool table, the coat rack by the door.
    place("pool-table", 23, 15),
    place("coat-rack", 12, 19),
    place("monstera", 1, 19),
    { prop: "slippers", frame: "scattered", at: [296, 300] },
  ],
  overhead: [
    ...strings,
    // 엔트로피 asleep on the sofa's back, where the lamp is warm.
    { prop: "entropy", anim: "sleep", play: true, at: [300, 118], raw: true },
  ],
  lights,
  emitters: [
    {
      sprite: "mote",
      area: { x: 40, y: 64, w: 120, h: 70 },
      count: 10,
      life: 6,
      velocity: [3, -2],
    },
  ],
  spawns: {
    main: { tile: [15, 18], facing: "up" },
    yard: { tile: [15, 18], facing: "up" },
    cafeteria: { tile: [29, 16], facing: "left" },
  },
  landmark: { name: "피아노", tile: [4, 4] },
  portals: [
    { id: "yard", rect: { x: 14, y: 20, w: 4, h: 1 }, to: "campus-yard", spawn: "lounge" },
    { id: "cafeteria", rect: { x: 31, y: 16, w: 1, h: 2 }, to: "cafeteria", spawn: "lounge" },
  ],
  interactables: [
    { id: "piano", kind: "lore", rect: { x: 3, y: 4, w: 3, h: 2 } },
    { id: "piano-bench", kind: "sit", rect: { x: 4, y: 6, w: 1, h: 1 } },
    { id: "daejabo", kind: "board", rect: { x: 19, y: 3, w: 4, h: 1 } },
    { id: "vending", kind: "shop", rect: { x: 27, y: 4, w: 3, h: 1 } },
    { id: "sofa-n", kind: "sit", rect: { x: 14, y: 7, w: 6, h: 1 } },
    { id: "sofa-s", kind: "sit", rect: { x: 15, y: 13, w: 3, h: 1 } },
    { id: "armchair-w", kind: "sit", rect: { x: 12, y: 10, w: 1, h: 1 } },
    { id: "armchair-e", kind: "sit", rect: { x: 22, y: 10, w: 1, h: 1 } },
    { id: "armchair-nook", kind: "sit", rect: { x: 6, y: 15, w: 1, h: 1 } },
    { id: "omok", kind: "lore", rect: { x: 16, y: 10, w: 2, h: 1 } },
    { id: "game-shelf", kind: "lore", rect: { x: 1, y: 15, w: 3, h: 1 } },
    { id: "karaoke", kind: "lore", rect: { x: 9, y: 4, w: 1, h: 1 } },
    { id: "fish-tank", kind: "lore", rect: { x: 29, y: 9, w: 2, h: 1 } },
  ],
  zones: [
    { id: "lounge", kind: "safe", rect: { x: 0, y: 0, w: 32, h: 21 } },
    { id: "stage", kind: "gather", rect: { x: 2, y: 4, w: 9, h: 5 } },
    { id: "sofas", kind: "gather", rect: { x: 12, y: 7, w: 11, h: 8 } },
    { id: "vending-corner", kind: "gather", rect: { x: 24, y: 5, w: 7, h: 3 } },
  ],
  npcs: [
    { speaker: "garam", tile: [25, 6] },
    { speaker: "hyunwoo", tile: [21, 4], facing: "up" },
  ],
};

export default map;
