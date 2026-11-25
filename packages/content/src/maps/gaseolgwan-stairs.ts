import type { LightSource, MapSource } from "./format.ts";
import { interiorWalls, mountY } from "./interior.ts";
import type { Light, Prop } from "./layers.ts";

/**
 * 가설관 중앙 계단, the stair core, at 23:41: a minute after the page tore. The lights went out
 * with the hum, so the stairs are lit only by the green exit signs and by the rift's afternoon
 * coming in through the landing windows over the field. This is the way down the opening takes,
 * four landings with a senior holding each one, and the way everyone goes between floors after:
 * every floor's corridor opens onto a landing, and at the bottom the lobby's 신발장 and the
 * front doors to the yard.
 */

const T = 16;

const PLAN = `
  ##########################
  #tttttttttttttttttttttttt#
  #tttttttttttttttttttttttt#
  #tttttttttttttttttttttttt#
  #tttttttttttttttttttttttt#
  #tttttttttttttttttttttttt#
  #tttttttttttttttttttttttt#
  #tttttttttttttttttttttttt#
  #tttttttttttttttttttttttt#
  #tttttttttttttttttttttttt#
  ###########tttt###########
  #tttttttttttttttttttttttt#
  #tttttttttttttttttttttttt#
  #tttttttttttttttttttttttt#
  #tttttttttttttttttttttttt#
  #tttttttttttttttttttttttt#
  #tttttttttttttttttttttttt#
  #tttttttttttttttttttttttt#
  #tttttttttttttttttttttttt#
  #tttttttttttttttttttttttt#
  ###########tttt###########
  #tttttttttttttttttttttttt#
  #tttttttttttttttttttttttt#
  #tttttttttttttttttttttttt#
  #tttttttttttttttttttttttt#
  #tttttttttttttttttttttttt#
  #tttttttttttttttttttttttt#
  #tttttttttttttttttttttttt#
  #tttttttttttttttttttttttt#
  #tttttttttttttttttttttttt#
  ###########tttt###########
  #tttttttttttttttttttttttt#
  #tttttttttttttttttttttttt#
  #tttttttttttttttttttttttt#
  #tttttttttttttttttttttttt#
  #tttttttttttttttttttttttt#
  #tttttttttttttttttttttttt#
  #tttttttttttttttttttttttt#
  #tttttttttttttttttttttttt#
  #tttttttttttttttttttttttt#
  #tttttttttttttttttttttttt#
  #tttttttttttttttttttttttt#
  #tttttttttttttttttttttttt#
  #tttttttttmmmmmmttttttttt#
  #tttttttttmmmmmmttttttttt#
  #tttttttttmmmmmmttttttttt#
  ##########tttttt##########
`;

/** The wall row each landing's back wall stands on. */
const LANDING = { "4f": 0, "3f": 10, "2f": 20, "1f": 30 } as const;

const walls = interiorWalls(PLAN, {
  walls: "#",
  faces: { t: "wall-corridor", m: "wall-corridor" },
});

/** The rift's afternoon through a landing window, lying across the floor below it. */
const riftSpill = (x: number, row: number): Light => ({
  bands: ["rift-warm", "rift-ember"],
  spill: { top: [x - 11, x + 11, mountY(row) + 2], bottom: [x - 2, x + 34, mountY(row) + 50] },
  ragged: 3,
});

const glow = (x: number, y: number): LightSource => ({
  at: [x, y],
  radius: 28,
  color: "grass.pale",
  intensity: 0.35,
  paint: { bands: ["campus-glow"], at: [x, y + 10], r: [26, 14], ragged: 2 },
});

const lights: LightSource[] = [
  ...[
    [272, 0],
    [144, 0],
    [304, 10],
    [144, 10],
    [304, 20],
    [336, 30],
  ].map(
    ([x, row]): LightSource => ({
      at: [x as number, mountY(row as number) + 30],
      radius: 70,
      color: "clay.dust",
      intensity: 0.7,
      flicker: { amount: 0.05, period: 2.2 },
      paint: riftSpill(x as number, row as number),
    }),
  ),
  // Exit signs over every door, green in the dark.
  glow(64, mountY(0) - 40),
  glow(64, mountY(10) - 40),
  glow(64, mountY(20) - 40),
  glow(64, mountY(30) - 40),
  glow(208, mountY(30) + 200),
];

const window = (x: number, row: number, frame = "rift"): Prop => ({
  prop: "window",
  frame,
  at: [x, mountY(row)],
});
const door = (x: number, row: number, frame = "open"): Prop => ({
  prop: "door-double",
  frame,
  at: [x, mountY(row)],
});
const exit = (x: number, row: number): Prop => ({ prop: "exit-sign", at: [x, mountY(row)] });

const map: MapSource = {
  id: "gaseolgwan-stairs",
  name: "가설관 중앙 계단",
  seed: 2341,
  time: { clock: "23:41", phase: "night", weather: "clear" },
  theme: "campus-night",
  sky: "ink.deep",
  ambient: { color: "navy.dark", intensity: 0.26, unlit: "campus" },
  plan: PLAN,
  legend: {
    "#": { terrain: "terrazzo", solid: "#" },
    t: { terrain: "terrazzo" },
    m: { terrain: "mat" },
  },
  edges: [{ overlay: "wall-top", inside: "#" }],
  blocks: walls.blocks,
  details: [
    // The flights, two treads wide each, rising north to the landing above.
    ...[11, 21, 31].flatMap((row): Prop[] => [
      { prop: "stairs", frame: "up", at: [176, row * T] },
      { prop: "stairs", frame: "up", at: [208, row * T] },
    ]),
    // Worksheets dropped in the rush, a scorch where the first 오답 came up.
    { prop: "floor-marks", frame: "scraps", at: [120, 100] },
    { prop: "floor-marks", frame: "scraps", at: [300, 268] },
    { prop: "floor-marks", frame: "scorch", at: [180, 140] },
    { prop: "floor-marks", frame: "scraps", at: [96, 420] },
    { prop: "floor-marks", frame: "puddle", at: [320, 600] },
  ],
  shadows: walls.shadows,
  objects: [
    ...walls.objects,
    // 4F landing: the door to the 자습실 corridor, the windows over the field, the roof door.
    door(64, LANDING["4f"]),
    exit(64, LANDING["4f"]),
    window(144, LANDING["4f"]),
    window(272, LANDING["4f"], "rift-curtain"),
    { prop: "door-steel", at: [352, mountY(0)] },
    { prop: "notice", frame: "l", at: [192, mountY(0)] },
    { prop: "notice", frame: "a", at: [208, mountY(0)] },
    { prop: "notice", frame: "r", at: [224, mountY(0)] },
    { prop: "extinguisher", at: [380, 150] },
    { prop: "bag", frame: "slump", at: [120, 140] },
    // 3F landing.
    door(64, LANDING["3f"]),
    exit(64, LANDING["3f"]),
    window(144, LANDING["3f"]),
    window(304, LANDING["3f"]),
    { prop: "poster", frame: "chart", at: [360, mountY(10)] },
    { prop: "slippers", frame: "scattered", at: [260, 296] },
    { prop: "textbooks", frame: "stack", at: [96, 300] },
    // 2F landing.
    door(64, LANDING["2f"]),
    exit(64, LANDING["2f"]),
    window(304, LANDING["2f"]),
    { prop: "poster", frame: "club", at: [136, mountY(20)] },
    { prop: "poster", frame: "safety", at: [360, mountY(20)] },
    { prop: "mop-bucket", at: [380, 460] },
    { prop: "umbrella", at: [28, 460] },
    // The lobby: the door to the 1F wing, the trophy case, the 신발장 down both sides, the
    // pile of 실내화 by the door, a plant that has seen things.
    door(64, LANDING["1f"]),
    exit(64, LANDING["1f"]),
    window(336, LANDING["1f"]),
    { prop: "wall-clock", frame: "s3", at: [272, mountY(30)] },
    { prop: "notice", frame: "l", at: [128, mountY(30)] },
    { prop: "notice", frame: "c", at: [144, mountY(30)] },
    { prop: "notice", frame: "r", at: [160, mountY(30)] },
    { prop: "trophy-case", at: [352, 590] },
    { prop: "shoe-lockers", at: [44, 620] },
    { prop: "shoe-lockers", at: [44, 676] },
    { prop: "shoe-lockers", at: [372, 676] },
    { prop: "slipper-pile", at: [120, 708] },
    { prop: "sad-plant", at: [290, 590] },
    { prop: "umbrella", at: [152, 712] },
  ],
  lights,
  emitters: [
    {
      sprite: "mote",
      area: { x: 120, y: 60, w: 240, h: 600 },
      count: 22,
      life: 6,
      velocity: [3, -4],
    },
  ],
  spawns: {
    main: { tile: [12, 41], facing: "up" },
    "front-door": { tile: [12, 44], facing: "up" },
    "4f": { tile: [4, 5] },
    "3f": { tile: [4, 15] },
    "2f": { tile: [4, 25] },
    "1f": { tile: [4, 35] },
    roof: { tile: [22, 5] },
  },
  landmark: { name: "중앙 계단", tile: [12, 14] },
  portals: [
    { id: "4f", rect: { x: 3, y: 4, w: 2, h: 1 }, to: "gaseol-4f", spawn: "stairs" },
    { id: "3f", rect: { x: 3, y: 14, w: 2, h: 1 }, to: "gaseol-2f", spawn: "stairs-3f" },
    { id: "2f", rect: { x: 3, y: 24, w: 2, h: 1 }, to: "gaseol-2f", spawn: "stairs-2f" },
    { id: "1f", rect: { x: 3, y: 34, w: 2, h: 1 }, to: "gaseol-1f", spawn: "lobby" },
    { id: "roof", rect: { x: 21, y: 4, w: 2, h: 1 }, to: "gaseol-roof", spawn: "stairs" },
    { id: "front-door", rect: { x: 10, y: 46, w: 6, h: 1 }, to: "campus-yard", spawn: "gaseol-1f" },
  ],
  interactables: [
    { id: "trophy-case", kind: "lore", rect: { x: 21, y: 36, w: 3, h: 1 } },
    { id: "lobby-notices", kind: "notice", rect: { x: 8, y: 34, w: 3, h: 1 } },
  ],
  zones: [
    { id: "core", kind: "safe", rect: { x: 0, y: 0, w: 26, h: 47 } },
    {
      id: "gaseolgwan-stairs",
      kind: "room",
      rect: { x: 0, y: 0, w: 26, h: 47 },
      name: "가설관 중앙 계단",
    },
    { id: "lobby", kind: "gather", rect: { x: 1, y: 34, w: 24, h: 8 } },
  ],
  marks: {
    "landing-4f": [12, 7],
    "landing-3f": [12, 17],
    "landing-2f": [12, 27],
    "lobby-1f": [12, 38],
    "front-door": [12, 45],
  },
  npcs: [
    { speaker: "senior-earth", tile: [16, 7] },
    { speaker: "senior-physics", tile: [8, 17] },
    { speaker: "senior-chem", tile: [17, 27] },
    { speaker: "senior-math", tile: [8, 39] },
    { speaker: "senior-bio", tile: [17, 43], facing: "up" },
    { speaker: "sagam", tile: [20, 40], facing: "left" },
  ],
};

export default map;
