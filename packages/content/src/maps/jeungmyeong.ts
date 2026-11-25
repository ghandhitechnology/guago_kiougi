import type { LightSource, MapSource, TileRect } from "./format.ts";
import { interiorWalls, mountY } from "./interior.ts";
import type { Light, Prop } from "./layers.ts";

/**
 * 증명관 at 08:40 on the morning after: assembly. The 체육관 fills the top floor, morning sun
 * through its high windows, the stage and its red curtain, wall bars either side, chairs not yet
 * put out because everyone stands. Below it the corridor where the skybridge comes in from
 * 가설관, and the 풍동실 with the most expensive fan in the school running for nobody. On the
 * ground floor the 시청각실's screen is stopped on the night the page tore, and the lobby opens
 * onto the yard.
 */

const T = 16;

const PLAN = `
  ################################################
  #oooooooooooooooooooooooooooooooooooooooooooooo#
  #oooooooooooooooooooooooooooooooooooooooooooooo#
  #oooooooooooooooooooooooooooooooooooooooooooooo#
  #oooooooooooooooooooooooooooooooooooooooooooooo#
  #oooooooooooooooooooooooooooooooooooooooooooooo#
  #oooooooooooooooooooooooooooooooooooooooooooooo#
  #oooooooooooooooooooooooooooooooooooooooooooooo#
  #oooooooooooooooooooooooooooooooooooooooooooooo#
  #oooooooooooooooooooooooooooooooooooooooooooooo#
  #oooooooooooooooooooooooooooooooooooooooooooooo#
  #oooooooooooooooooooooooooooooooooooooooooooooo#
  #oooooooooooooooooooooooooooooooooooooooooooooo#
  #oooooooooooooooooooooooooooooooooooooooooooooo#
  #oooooooooooooooooooooooooooooooooooooooooooooo#
  #oooooooooooooooooooooooooooooooooooooooooooooo#
  #oooooooooooooooooooooooooooooooooooooooooooooo#
  #oooooooooooooooooooooooooooooooooooooooooooooo#
  #oooooooooooooooooooooooooooooooooooooooooooooo#
  #oooooooooooooooooooooooooooooooooooooooooooooo#
  #oooooooooooooooooooooooooooooooooooooooooooooo#
  #oooooooooooooooooooooooooooooooooooooooooooooo#
  #oooooooooooooooooooooooooooooooooooooooooooooo#
  #oooooooooooooooooooooooooooooooooooooooooooooo#
  #oooooooooooooooooooooooooooooooooooooooooooooo#
  #oooooooooooooooooooooooooooooooooooooooooooooo#
  #oooooooooooooooooooooooooooooooooooooooooooooo#
  #oooooooooooooooooooooooooooooooooooooooooooooo#
  #oooooooooooooooooooooooooooooooooooooooooooooo#
  #oooooooooooooooooooooooooooooooooooooooooooooo#
  #oooooooooooooooooooooooooooooooooooooooooooooo#
  ########DD############################DD########
  vvvvvvvvvvttttttttttttttttttttttttttttttttttttt#
  vvvvvvvvvvttttttttttttttttttttttttttttttttttttt#
  vvvvvvvvvvttttttttttttttttttttttttttttttttttttt#
  vvvvvvvvvvttttttttttttttttttttttttttttttttttttt#
  vvvvvvvvvvttttttttttttttttttttttttttttttttttttt#
  vvvvvvvvvvttttttttttttttttttttttttttttttttttttt#
  vvvvvvvvvvttttttttttttttttttttttttttttttttttttt#
  ######################DD################ssss####
  #llllllllllllllllllllllllllllllllllll###ssss####
  #llllllllllllllllllllllllllllllllllll###ssss####
  #llllllllllllllllllllllllllllllllllll###ssss####
  #llllllllllllllllllllllllllllllllllll###ssss####
  #llllllllllllllllllllllllllllllllllll###ssss####
  #llllllllllllllllllllllllllllllllllll###ssss####
  #llllllllllllllllllllllllllllllllllll###ssss####
  #llllllllllllllllllllllllllllllllllll###ssss####
  #llllllllllllllllllllllllllllllllllll###ssss####
  ########################################ssss####
  #vvvvvvvvvvvvvvvvvvvvvvvvvvvvvv#ttttttttttttttt#
  #vvvvvvvvvvvvvvvvvvvvvvvvvvvvvv#ttttttttttttttt#
  #vvvvvvvvvvvvvvvvvvvvvvvvvvvvvv#ttttttttttttttt#
  #vvvvvvvvvvvvvvvvvvvvvvvvvvvvvv#ttttttttttttttt#
  #vvvvvvvvvvvvvvvvvvvvvvvvvvvvvv#ttttttttttttttt#
  #vvvvvvvvvvvvvvvvvvvvvvvvvvvvvvtttttttttttttttt#
  #vvvvvvvvvvvvvvvvvvvvvvvvvvvvvvtttttttttttttttt#
  #vvvvvvvvvvvvvvvvvvvvvvvvvvvvvv#ttttttttttttttt#
  #vvvvvvvvvvvvvvvvvvvvvvvvvvvvvv#ttttttttttttttt#
  #vvvvvvvvvvvvvvvvvvvvvvvvvvvvvv#ttttttttttttttt#
  ####################################tttt########
`;

const DOOR = { prop: "door-double", frame: "open" } as const;
const walls = interiorWalls(PLAN, {
  walls: "#",
  faces: {
    o: "wall-tiled",
    t: "wall-corridor",
    v: "wall-cream",
    l: "wall-cream",
    s: "wall-corridor",
  },
  doors: { D: DOOR },
  seed: 840,
});
const GYM = mountY(0);

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

/** The stage across the gym's north wall, its front face one row deep, steps up at both ends. */
const STAGE = { x0: 12, x1: 35, row: 7 };
const stage: Prop[] = [STAGE.row - 2, STAGE.row].flatMap((row) =>
  Array.from(
    { length: STAGE.x1 - STAGE.x0 + 1 },
    (_, i): Prop => ({
      prop: "stage",
      frame: i === 0 ? "l" : i === STAGE.x1 - STAGE.x0 ? "r" : "m",
      at: [(STAGE.x0 + i) * T, (row + 1) * T - 1],
    }),
  ),
);
const curtain: Prop[] = Array.from(
  { length: STAGE.x1 - STAGE.x0 + 1 },
  (_, i): Prop => ({
    prop: "stage-curtain",
    frame: i === 0 ? "l" : i === STAGE.x1 - STAGE.x0 ? "r" : "m",
    at: [(STAGE.x0 + i) * T, GYM],
  }),
);

/** Court lines on the boards: the outline and the halfway line. */
function lines(): Prop[] {
  const out: Prop[] = [];
  for (let x = 4; x < 44; x++) {
    out.push({ prop: "chalk-h", frame: `h${x % 3 === 0 ? 3 : 0}`, at: [x * T, 11 * T + 7] });
    out.push({ prop: "chalk-h", frame: `h${x % 4 === 0 ? 3 : 0}`, at: [x * T, 29 * T + 7] });
  }
  for (let y = 11; y < 30; y++) {
    out.push({ prop: "chalk-v", frame: `v${y % 3 === 0 ? 3 : 0}`, at: [4 * T + 7, y * T] });
    out.push({ prop: "chalk-v", frame: `v${y % 4 === 1 ? 3 : 0}`, at: [43 * T + 7, y * T] });
    out.push({ prop: "chalk-v", frame: `v${y % 5 === 2 ? 3 : 0}`, at: [23 * T + 15, y * T] });
  }
  return out;
}

/** Morning sun through a high window, falling short and white. */
const sun = (x: number, wall: number, reach = 80): Light => ({
  bands: ["campus"],
  spill: { top: [x - 13, x + 13, wall + 2], bottom: [x - 26, x + 12, wall + reach] },
  ragged: 2,
});
const sunAt = (x: number, wall: number, reach?: number): LightSource => ({
  at: [x - 8, wall + 40],
  radius: 70,
  color: "gold.pale",
  intensity: 0.7,
  paint: sun(x, wall, reach),
});

const GYM_WINDOWS = [56, 120, 600, 664];
const AV = mountY(49);

const map: MapSource = {
  id: "jeungmyeong",
  name: "증명관",
  seed: 840,
  time: { clock: "08:40", phase: "morning", weather: "clear" },
  theme: "campus-dusk",
  sky: "ink.deep",
  ambient: { color: "stone.bright", intensity: 0.78, unlit: "campus" },
  plan: PLAN,
  legend: {
    "#": { terrain: "terrazzo", solid: "#" },
    D: { terrain: "terrazzo" },
    o: { terrain: "wood" },
    t: { terrain: "terrazzo" },
    s: { terrain: "terrazzo" },
    v: { terrain: "vinyl" },
    l: { terrain: "lino" },
  },
  edges: [{ overlay: "wall-top", inside: "#" }],
  blocks: [...walls.blocks, { x: STAGE.x0, y: STAGE.row, w: STAGE.x1 - STAGE.x0 + 1, h: 1 }],
  details: [
    ...lines(),
    // The stair down to the lobby.
    ...[40, 43, 46].flatMap((row): Prop[] => [
      { prop: "stairs", frame: "up", at: [640, row * T] },
      { prop: "stairs", frame: "up", at: [672, row * T] },
    ]),
    { prop: "floor-marks", frame: "scraps", at: [200, 700] },
  ],
  shadows: walls.shadows,
  objects: [
    ...walls.objects,
    // 체육관: high windows, wall bars, the curtain and the stage, a lectern on it, a board.
    ...GYM_WINDOWS.map((x): Prop => ({ prop: "window", frame: "day", at: [x, GYM - 10] })),
    { prop: "wall-bars", at: [168, GYM] },
    { prop: "wall-bars", at: [600 - 24, GYM] },
    ...curtain,
    ...stage,
    at("lectern", 376, 102, undefined, { sort: 128 }),
    { prop: "quest-board", at: [680, GYM] },
    { prop: "wall-clock", anim: "tick", play: true, at: [376, GYM - 60] },
    at("hoop", 24, 300, { x: 1, y: 18, w: 1, h: 1 }, { frame: "front" }),
    at("hoop", 744, 300, { x: 46, y: 18, w: 1, h: 1 }, { frame: "front" }),
    // The piano for the anthem, chairs stacked against the wall for the day they are needed.
    at("piano", 632, 152, { x: 38, y: 8, w: 3, h: 1 }),
    at("piano-bench", 632, 170),
    ...[0, 1, 2].map((k) => at("school-chair", 40 + k * 14, 100, undefined, { frame: "front" })),
    ...[0, 1, 2].map((k) => at("school-chair", 40 + k * 14, 106, undefined, { frame: "front" })),
    at("ball", 300, 380),
    at("ball", 520, 420),
    at("boxes", 40, 462, { x: 1, y: 28, w: 2, h: 1 }),
    at("mop-bucket", 720, 470),
    // The corridor and the skybridge.
    { prop: "window", frame: "day", at: [32, mountY(31)] },
    { prop: "window", frame: "day", at: [96, mountY(31)] },
    { prop: "exit-sign", at: [168, mountY(31)] },
    { prop: "notice", frame: "l", at: [224, mountY(31)] },
    { prop: "notice", frame: "a", at: [240, mountY(31)] },
    { prop: "notice", frame: "r", at: [256, mountY(31)] },
    { prop: "poster", frame: "club", at: [480, mountY(31)] },
    { prop: "poster", frame: "chart", at: [520, mountY(31)] },
    at("extinguisher", 720, 610),
    // 풍동실: the wind tunnel, its desk and screen, the camera, posters of results.
    at("wind-tunnel", 304, 750, { x: 15, y: 45, w: 8, h: 2 }, { anim: "spin", play: true }),
    { prop: "poster", frame: "chart", at: [120, mountY(39)] },
    { prop: "poster", frame: "chart", at: [520, mountY(39)] },
    { prop: "tool-wall", at: [460, mountY(39)] },
    at("desk-chair", 96, 734, { x: 5, y: 45, w: 2, h: 1 }, { frame: "open" }),
    at("desk-lamp", 104, 716, undefined, { anim: "glow", play: true }),
    at("copier", 520, 734, { x: 31, y: 45, w: 2, h: 1 }),
    at("boxes", 576, 782, { x: 35, y: 48, w: 2, h: 1 }),
    at("stool", 380, 780),
    // 시청각실: the screen, seats in rows from behind, the booth's light.
    { prop: "screen", frame: "lit", at: [240, AV] },
    ...[55, 59].flatMap((row) =>
      [48, 112, 176, 304, 368, 432].map((x): Prop & { foot?: TileRect } =>
        at("av-seats", x, (row + 1) * T - 2, { x: x / T - 2, y: row, w: 4, h: 1 }),
      ),
    ),
    // The lobby: a sofa, the snack machine, notices, the plant.
    { prop: "notice", frame: "l", at: [528, AV] },
    { prop: "notice", frame: "b", at: [544, AV] },
    { prop: "notice", frame: "r", at: [560, AV] },
    { prop: "exit-sign", at: [704, AV] },
    at("snack-vending", 744, 862, { x: 46, y: 53, w: 1, h: 1 }, { anim: "glow", play: true }),
    at("sofa", 568, 926, { x: 34, y: 57, w: 3, h: 1 }, { frame: "front" }),
    at("sad-plant", 524, 862, { x: 32, y: 53, w: 1, h: 1 }),
    at("umbrella", 680, 940),
  ],
  overhead: [{ prop: "entropy", anim: "sleep", play: true, at: [168 - 4, GYM - 20], raw: true }],
  lights: [
    ...GYM_WINDOWS.map((x) => sunAt(x, GYM - 10, 96)),
    sunAt(32, mountY(31), 56),
    sunAt(96, mountY(31), 56),
    {
      at: [240, AV + 20],
      radius: 120,
      color: "gold.pale",
      intensity: 0.6,
      paint: { bands: ["campus-lamp", "campus-glow"], at: [240, AV + 14], r: [96, 22], ragged: 4 },
    },
    {
      at: [744, 840],
      radius: 30,
      color: "sea.pale",
      intensity: 0.4,
      flicker: { amount: 0.06, period: 2.5 },
    },
  ],
  emitters: [
    {
      sprite: "mote",
      area: { x: 32, y: 60, w: 700, h: 360 },
      count: 30,
      life: 7,
      velocity: [-4, 4],
    },
  ],
  spawns: {
    main: { tile: [38, 57], facing: "up" },
    yard: { tile: [37, 59], facing: "up" },
    skybridge: { tile: [1, 36], facing: "right" },
    assembly: { tile: [23, 20], facing: "up" },
  },
  landmark: { name: "체육관 무대", tile: [23, 6] },
  portals: [
    {
      id: "front-doors",
      rect: { x: 36, y: 60, w: 4, h: 1 },
      to: "campus-yard",
      spawn: "jeungmyeong",
    },
    { id: "skybridge", rect: { x: 0, y: 35, w: 1, h: 4 }, to: "gaseol-2f", spawn: "skybridge" },
  ],
  interactables: [
    { id: "screen", kind: "replay", rect: { x: 8, y: 53, w: 14, h: 1 } },
    { id: "wind-tunnel", kind: "lore", rect: { x: 15, y: 45, w: 8, h: 2 } },
    { id: "gym-board", kind: "notice", rect: { x: 40, y: 4, w: 5, h: 1 } },
    { id: "snack-vending", kind: "shop", rect: { x: 46, y: 53, w: 1, h: 1 } },
  ],
  zones: [
    { id: "building", kind: "safe", rect: { x: 0, y: 0, w: 48, h: 61 } },
    { id: "gym", kind: "room", rect: { x: 1, y: 4, w: 46, h: 27 }, name: "체육관" },
    { id: "bridge-hall", kind: "room", rect: { x: 0, y: 35, w: 10, h: 4 }, name: "구름다리" },
    { id: "wind-tunnel-room", kind: "room", rect: { x: 1, y: 43, w: 36, h: 6 }, name: "풍동실" },
    { id: "av-room", kind: "room", rect: { x: 1, y: 53, w: 30, h: 7 }, name: "시청각실" },
    {
      id: "jeungmyeong-lobby",
      kind: "room",
      rect: { x: 32, y: 53, w: 15, h: 7 },
      name: "증명관 로비",
    },
    { id: "assembly", kind: "gather", rect: { x: 5, y: 12, w: 38, h: 17 } },
  ],
  marks: { stage: [23, 5], rows: [23, 18], board: [42, 4] },
  npcs: [
    { speaker: "principal", tile: [22, 5] },
    { speaker: "sagam", tile: [10, 8], facing: "right" },
    { speaker: "mo", tile: [36, 6], facing: "left" },
    { speaker: "hyunwoo", tile: [20, 22], facing: "up" },
    { speaker: "garam", tile: [26, 22], facing: "up" },
    { speaker: "senior-physics", tile: [24, 47], facing: "up" },
    { speaker: "broadcast", tile: [25, 58], facing: "up" },
  ],
};

export default map;
