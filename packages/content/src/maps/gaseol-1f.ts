import type { LightSource, MapSource, TileRect } from "./format.ts";
import { interiorWalls, mountY } from "./interior.ts";
import type { Light, Prop } from "./layers.ts";

/**
 * 가설관 1층 at 16:40, the hour after classes when this floor works hardest. The sun comes in
 * low and gold through the north windows. In the 메이커실 the 제련기 burns under its hood and
 * the 제본대 is never free; in the 교무실 모 선생님 signs whatever is put in front of him; the
 * 가우스실 door has ten attendance sheets taped to it. Across the corridor the 물음표 서고 is
 * the quietest room in the school, the 보건실 has the softest bed in it, and the storeroom at
 * the end keeps the door to the 전기실 behind its boxes.
 */

const PLAN = `
  ############################################################
  #llllllllllllllll#oooooooooooooooooooo#lllllllll#llllllllll#
  #llllllllllllllll#oooooooooooooooooooo#lllllllll#llllllllll#
  #llllllllllllllll#oooooooooooooooooooo#lllllllll#llllllllll#
  #llllllllllllllll#oooooooooooooooooooo#lllllllll#llllllllll#
  #llllllllllllllll#oooooooooooonnnnnnno#lllllllll#llllllllll#
  #llllllllllllllll#oooooooooooonnnnnnno#lllllllll#llllllllll#
  #llllllllllllllll#oooooooooooonnnnnnno#lllllllll#llllllllll#
  #llllllllllllllll#oooooooooooonnnnnnno#lllllllll#llllllllll#
  #llllllllllllllll#oooonnnnnnnnoooooooo#lllllllll#llllllllll#
  #llllllllllllllll#oooonnnnnnnnoooooooo#lllllllll#llllllllll#
  #llllllllllllllll#oooonnnnnnnnoooooooo#lllllllll#llllllllll#
  #llllllllllllllll#oooonnnnnnnnoooooooo#lllllllll#llllllllll#
  #llllllllllllllll#oooooooooooooooooooo#lllllllll#llllllllll#
  ######DD##################DD##############DD########DD######
  tttttttttttttttttttttttttttttttttttttttttttttttttttttttttttt
  tttttttttttttttttttttttttttttttttttttttttttttttttttttttttttt
  tttttttttttttttttttttttttttttttttttttttttttttttttttttttttttt
  tttttttttttttttttttttttttttttttttttttttttttttttttttttttttttt
  tttttttttttttttttttttttttttttttttttttttttttttttttttttttttttt
  tttttttttttttttttttttttttttttttttttttttttttttttttttttttttttt
  tttttttttttttttttttttttttttttttttttttttttttttttttttttttttttt
  ############DD########################DD###########DD#######
  #oooooooooooooooooooooooooooooo#llllllllllllll#llllllllllll#
  #oooooooooooooooooooooooooooooo#llllllllllllll#llllllllllll#
  #oooooooooooooooooooooooooooooo#llllllllllllll#llllllllllll#
  #oooooooooooooooooooooooooooooo#llllllllllllll#llllllllllll#
  #oooooooooooooooooooooooooooooo#llllllllllllll#llllllllllll#
  #ooooooorrrrrrrrrrrrrrroooooooo#llllllllllllll#llllllllllll#
  #ooooooorrrrrrrrrrrrrrroooooooo#llllllllllllll#llllllllllll#
  #ooooooorrrrrrrrrrrrrrroooooooo#llllllllllllll#llllllllllll#
  #ooooooorrrrrrrrrrrrrrroooooooo#llllllllllllll#llllllllllll#
  #ooooooorrrrrrrrrrrrrrroooooooo#llllllllllllll#llllllllllll#
  #oooooooooooooooooooooooooooooo#llllllllllllll#llllllllllll#
  #oooooooooooooooooooooooooooooo#llllllllllllll#llllllllllll#
  ############################################################
`;

const DOOR = { prop: "door-double", frame: "open" } as const;
const walls = interiorWalls(PLAN, {
  walls: "#",
  faces: { l: "wall-cream", o: "wall-tiled", n: "wall-tiled", t: "wall-corridor", r: "wall-cream" },
  doors: { D: DOOR },
  seed: 1640,
});
const NORTH = mountY(0);
const CORRIDOR = mountY(14);
const SOUTH = mountY(22);

/** Something standing on the floor, with a footprint in tiles. */
const at = (
  prop: string,
  x: number,
  y: number,
  foot?: TileRect,
  extra: Partial<Prop> = {},
): Prop & { foot?: TileRect } => ({
  prop,
  ...extra,
  at: [x, y],
  ...(foot ? { foot } : {}),
});

/** Sun through a north window, falling long across the floor. */
const sun = (x: number): Light => ({
  bands: ["campus-lamp"],
  spill: { top: [x - 13, x + 13, NORTH + 2], bottom: [x + 8, x + 50, NORTH + 96] },
  ragged: 2,
});
const window = (x: number, frame = "gold"): Prop => ({ prop: "window", frame, at: [x, NORTH] });

/** A block of staff desks facing each other: three across, two deep. */
function desks(x0: number, y0: number): Prop[] {
  const out: Prop[] = [];
  const looks = ["books", "open", "none", "books", "none", "open"];
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 3; c++) {
      out.push({
        prop: "desk-chair",
        frame: looks[r * 3 + c] as string,
        at: [x0 + c * 22, y0 + r * 28],
      });
    }
  }
  return out;
}

const FORGE: [number, number] = [560, 78];

const lights: LightSource[] = [
  ...[48, 240, 320, 368, 640, 816, 912].map(
    (x): LightSource => ({
      at: [x + 30, NORTH + 50],
      radius: 60,
      color: "gold.pale",
      intensity: 0.8,
      paint: sun(x),
    }),
  ),
  {
    at: [FORGE[0], FORGE[1] + 16],
    radius: 104,
    color: "clay.light",
    intensity: 1.25,
    flicker: { amount: 0.12, period: 1.3 },
    paint: {
      bands: ["golden-sun", "golden-warm"],
      at: [FORGE[0], FORGE[1] + 18],
      r: [60, 24],
      ragged: 4,
      pulse: { amount: 0.06, period: 1.3 },
    },
  },
  {
    at: [408, 168],
    radius: 60,
    color: "gold.light",
    intensity: 0.6,
    paint: { bands: ["campus-lamp"], at: [408, 180], r: [54, 26], ragged: 3 },
  },
  ...[176, 296].map(
    (x): LightSource => ({
      at: [x, 490],
      radius: 40,
      color: "gold.light",
      intensity: 0.5,
      paint: { bands: ["campus-lamp"], at: [x, 492], r: [40, 18], ragged: 3 },
    }),
  ),
  {
    at: [690, 520],
    radius: 30,
    color: "gold.light",
    intensity: 0.4,
    paint: { bands: ["campus-lamp"], at: [690, 526], r: [26, 12], ragged: 2 },
  },
];

const map: MapSource = {
  id: "gaseol-1f",
  name: "가설관 1층",
  seed: 1640,
  time: { clock: "16:40", phase: "golden", weather: "clear" },
  theme: "campus-dusk",
  sky: "ink.deep",
  ambient: { color: "gold.pale", intensity: 0.68, unlit: "campus" },
  plan: PLAN,
  legend: {
    "#": { terrain: "terrazzo", solid: "#" },
    D: { terrain: "terrazzo" },
    t: { terrain: "terrazzo" },
    l: { terrain: "lino" },
    o: { terrain: "wood" },
    n: { terrain: "mat" },
    r: { terrain: "rug" },
  },
  edges: [{ overlay: "wall-top", inside: "#" }],
  blocks: walls.blocks,
  details: [
    { prop: "floor-marks", frame: "scorch", at: [538, 84] },
    { prop: "floor-marks", frame: "scraps", at: [380, 214] },
    { prop: "floor-marks", frame: "scraps", at: [430, 120] },
    { prop: "floor-marks", frame: "puddle", at: [588, 116] },
  ],
  shadows: walls.shadows,
  objects: [
    ...walls.objects,
    // 교무실: windows, the schedule board, two blocks of desks, the 교감's desk, the copier.
    window(48),
    { prop: "blackboard", frame: "written", at: [144, NORTH] },
    window(240),
    { prop: "wall-clock", anim: "tick", play: true, at: [200, NORTH] },
    at("teacher-desk", 144, 110, { x: 8, y: 6, w: 2, h: 1 }, { frame: "buried" }),
    ...desks(46, 140),
    ...desks(168, 140),
    at("copier", 256, 110, { x: 15, y: 6, w: 2, h: 1 }, { anim: "print", play: true }),
    at("document-tower", 28, 104, { x: 1, y: 6, w: 1, h: 1 }),
    at("document-tower", 28, 222, { x: 1, y: 13, w: 1, h: 1 }),
    at("kettle", 250, 196, undefined, { anim: "steam", play: true }),
    at("sad-plant", 260, 214, { x: 16, y: 13, w: 1, h: 1 }),
    // 메이커실: the 제련기 burning under its hood, anvil, quench, the 제본대 under its pendants.
    window(320),
    window(368, "gold-curtain"),
    { prop: "tool-wall", at: [448, NORTH] },
    { prop: "poster", frame: "safety", at: [496, NORTH] },
    { prop: "poster", frame: "club", at: [600, NORTH] },
    at(
      "forge",
      FORGE[0],
      FORGE[1],
      { x: 33, y: 4, w: 3, h: 1 },
      { anim: "burn", play: true, raw: true },
    ),
    at("anvil", 524, 136, { x: 32, y: 8, w: 1, h: 1 }),
    at("quench", 594, 124, { x: 37, y: 7, w: 1, h: 1 }),
    at("bindery", 408, 184, { x: 23, y: 11, w: 5, h: 1 }),
    at("guillotine", 324, 182, { x: 20, y: 11, w: 1, h: 1 }),
    at("printer-3d", 300, 118, { x: 18, y: 7, w: 1, h: 1 }, { anim: "print", play: true }),
    at("stock-shelf", 304, 80, { x: 18, y: 4, w: 2, h: 1 }),
    at("tool-cart", 500, 196),
    at("scrap-bin", 470, 214),
    at("vise-bench", 582, 222, { x: 36, y: 13, w: 2, h: 1 }),
    at("extinguisher", 600, 160),
    at("textbooks", 444, 200, undefined, { frame: "tall" }),
    // 가우스실 and 오일러실: a table, chairs, the board.
    { prop: "blackboard", frame: "written", at: [696, NORTH] },
    at("long-table", 696, 152, { x: 41, y: 8, w: 4, h: 2 }, { frame: "late" }),
    at("school-chair", 672, 170, undefined, { frame: "back" }),
    at("school-chair", 720, 170, undefined, { frame: "back" }),
    at("school-chair", 672, 126, undefined, { frame: "front" }),
    at("school-chair", 720, 126, undefined, { frame: "front" }),
    { prop: "blackboard", frame: "clean", at: [864, NORTH] },
    window(816),
    window(912),
    at("lectern", 864, 110, { x: 53, y: 6, w: 2, h: 1 }),
    ...[0, 1, 2].flatMap((r) =>
      [0, 1, 2].map(
        (c): Prop => ({
          prop: "school-desk",
          frame: (r + c) % 2 ? "books" : "none",
          at: [824 + c * 40, 140 + r * 30],
        }),
      ),
    ),
    // The corridor: doors, notices, posters, the 가우스실's ten attendance sheets.
    { prop: "exit-sign", at: [16, CORRIDOR] },
    { prop: "notice", frame: "l", at: [32, CORRIDOR] },
    { prop: "notice", frame: "a", at: [48, CORRIDOR] },
    { prop: "notice", frame: "r", at: [64, CORRIDOR] },
    { prop: "poster", frame: "chart", at: [160, CORRIDOR] },
    { prop: "poster", frame: "chart", at: [312, CORRIDOR] },
    { prop: "notice", frame: "l", at: [480, CORRIDOR] },
    { prop: "notice", frame: "c", at: [496, CORRIDOR] },
    { prop: "notice", frame: "b", at: [512, CORRIDOR] },
    { prop: "notice", frame: "r", at: [528, CORRIDOR] },
    ...["a", "b", "c", "a", "b"].map(
      (f, i): Prop => ({ prop: "notice", frame: f, at: [632 + i * 8, CORRIDOR - (i % 2) * 3] }),
    ),
    ...["c", "a", "b", "c", "a"].map(
      (f, i): Prop => ({ prop: "notice", frame: f, at: [712 + i * 8, CORRIDOR - (i % 2) * 3] }),
    ),
    { prop: "poster", frame: "club", at: [912, CORRIDOR] },
    at("extinguisher", 456, 300),
    at("umbrella", 940, 330),
    // 물음표 서고: stacks, the catalogue, ladders, reading tables lit on the rug.
    { prop: "wall-clock", anim: "tick", play: true, at: [112, SOUTH] },
    { prop: "poster", frame: "chart", at: [300, SOUTH] },
    at("tall-shelf", 48, 470, { x: 1, y: 29, w: 3, h: 1 }, { frame: "full" }),
    at("tall-shelf", 48, 558, { x: 1, y: 34, w: 3, h: 1 }, { frame: "gaps" }),
    at("tall-shelf", 120, 470, { x: 6, y: 29, w: 2, h: 1 }, { frame: "gaps" }),
    at("library-ladder", 142, 470),
    at("tall-shelf", 392, 470, { x: 23, y: 29, w: 3, h: 1 }, { frame: "full" }),
    at("tall-shelf", 472, 470, { x: 28, y: 29, w: 3, h: 1 }, { frame: "full" }),
    at("tall-shelf", 392, 558, { x: 23, y: 34, w: 3, h: 1 }, { frame: "gaps" }),
    at("tall-shelf", 472, 558, { x: 28, y: 34, w: 3, h: 1 }, { frame: "full" }),
    at("card-catalogue", 256, 430, { x: 15, y: 26, w: 2, h: 1 }),
    at("reading-table", 176, 500, { x: 9, y: 30, w: 4, h: 1 }, { frame: "lit" }),
    at("reading-table", 296, 500, { x: 16, y: 30, w: 4, h: 1 }, { frame: "lit" }),
    at("school-chair", 160, 512, undefined, { frame: "back" }),
    at("school-chair", 196, 512, undefined, { frame: "back" }),
    at("school-chair", 312, 512, undefined, { frame: "back" }),
    at("textbooks", 360, 520, undefined, { frame: "stack" }),
    at("slippers", 220, 432, undefined, { frame: "pair" }),
    // 보건실: two beds, the screen between them, the medicine cabinet, the nurse's desk.
    { prop: "poster", frame: "safety", at: [560, SOUTH] },
    at("single-bed", 532, 462, { x: 32, y: 28, w: 2, h: 1 }),
    at("single-bed", 532, 526, { x: 32, y: 32, w: 2, h: 1 }),
    at("bed-screen", 600, 494, { x: 36, y: 30, w: 2, h: 1 }),
    at("bottle-cabinet", 720, 430, { x: 44, y: 26, w: 2, h: 1 }),
    at("desk-chair", 690, 558, { x: 42, y: 34, w: 2, h: 1 }, { frame: "open" }),
    at("desk-lamp", 700, 540, undefined, { anim: "glow", play: true }),
    at("sad-plant", 730, 556),
    // The storeroom: boxes, the cleaning things, and behind them the door to the 전기실.
    { prop: "door-steel", at: [912, SOUTH] },
    at("boxes", 848, 430, { x: 52, y: 26, w: 2, h: 1 }),
    at("boxes", 800, 494, { x: 49, y: 30, w: 2, h: 1 }),
    at("cleaning-cupboard", 768, 430, { x: 47, y: 26, w: 2, h: 1 }, { frame: "open" }),
    at("mop-bucket", 824, 470),
    at("lumber", 936, 510, { x: 58, y: 31, w: 1, h: 1 }),
    at("boxes", 864, 558, { x: 53, y: 34, w: 2, h: 1 }),
  ],
  overhead: [
    { prop: "forge-hood", anim: "glow", play: true, at: FORGE },
    { prop: "pendant", frame: "on", at: [384, 146] },
    { prop: "pendant", frame: "on", at: [432, 146] },
    { prop: "entropy", anim: "sleep", play: true, at: [500, 104], raw: true },
  ],
  atmosphere: [{ prop: "sparks", anim: "rise", play: true, at: [524, 120], raw: true }],
  lights,
  emitters: [
    {
      sprite: "mote",
      area: { x: 300, y: 80, w: 640, h: 120 },
      count: 18,
      life: 6,
      velocity: [5, 2],
    },
  ],
  spawns: {
    main: { tile: [20, 19] },
    lobby: { tile: [1, 19], facing: "right" },
    yard: { tile: [58, 19], facing: "left" },
    nurse: { tile: [35, 29], facing: "left" },
  },
  landmark: { name: "제련기", tile: [34, 5] },
  portals: [
    { id: "stairs", rect: { x: 0, y: 18, w: 1, h: 4 }, to: "gaseolgwan-stairs", spawn: "1f" },
    {
      id: "side-door",
      rect: { x: 59, y: 18, w: 1, h: 4 },
      to: "campus-yard",
      spawn: "gaseol-side",
    },
    { id: "electric-room", rect: { x: 56, y: 26, w: 2, h: 1 }, to: "gaseol-b1", spawn: "stairs" },
  ],
  interactables: [
    { id: "bindery", kind: "station", rect: { x: 23, y: 12, w: 5, h: 1 } },
    { id: "forge", kind: "station", rect: { x: 33, y: 4, w: 3, h: 1 } },
    { id: "codex", kind: "codex", rect: { x: 15, y: 26, w: 2, h: 1 } },
    { id: "schedule", kind: "notice", rect: { x: 6, y: 3, w: 6, h: 1 } },
    { id: "attendance", kind: "notice", rect: { x: 40, y: 17, w: 2, h: 1 } },
    { id: "bed", kind: "sit", rect: { x: 33, y: 28, w: 2, h: 1 } },
  ],
  zones: [
    { id: "floor", kind: "safe", rect: { x: 0, y: 0, w: 60, h: 36 } },
    { id: "staff-room", kind: "room", rect: { x: 1, y: 4, w: 16, h: 10 }, name: "교무실" },
    { id: "maker-room", kind: "room", rect: { x: 18, y: 4, w: 20, h: 10 }, name: "메이커실" },
    { id: "gauss-room", kind: "room", rect: { x: 39, y: 4, w: 9, h: 10 }, name: "가우스실" },
    { id: "euler-room", kind: "room", rect: { x: 49, y: 4, w: 10, h: 10 }, name: "오일러실" },
    {
      id: "question-library",
      kind: "room",
      rect: { x: 1, y: 26, w: 30, h: 9 },
      name: "물음표 서고",
    },
    { id: "infirmary", kind: "room", rect: { x: 32, y: 26, w: 14, h: 9 }, name: "보건실" },
    { id: "storeroom", kind: "room", rect: { x: 47, y: 26, w: 12, h: 9 }, name: "창고" },
    { id: "stations", kind: "gather", rect: { x: 21, y: 4, w: 17, h: 10 } },
  ],
  marks: {
    bindery: [25, 11],
    forge: [34, 6],
    "staff-desk": [8, 6],
    "gauss-board": [43, 3],
  },
  npcs: [
    { speaker: "mo", tile: [9, 7] },
    { speaker: "principal", tile: [4, 11], facing: "right" },
    { speaker: "hyunwoo", tile: [25, 10], facing: "down" },
    { speaker: "garam", tile: [31, 9], facing: "left" },
    { speaker: "senior-math", tile: [44, 11], facing: "up" },
    { speaker: "pythagoreans", tile: [42, 6] },
    { speaker: "nurse", tile: [41, 31], facing: "left" },
    { speaker: "aristotle-freed", tile: [14, 29], facing: "up" },
  ],
};

export default map;
