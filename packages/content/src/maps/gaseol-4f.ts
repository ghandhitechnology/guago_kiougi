import type { LightSource, MapSource, TileRect } from "./format.ts";
import { interiorWalls, mountY } from "./interior.ts";
import type { Light, Prop } from "./layers.ts";

/**
 * 가설관 4층, the 자습실, at 23:38 on the Thursday it happened: two minutes before. The front
 * tubes are off for the sleepers, the 졸방대 end is lit, carrel lamps make small rooms of their
 * own, the cooler hums by the door beside the log book you sign to leave your seat. The windows
 * look out over the dark 운동장, and the cat is on the sill, waiting. Out in the corridor 권
 * 사감 is at her desk with the whistle on its hook. The game opens here, at your seat.
 */

const T = 16;

const PLAN = `
  ############################################
  #ttttt#llllllllllllllllllllllllllllllllllll#
  #ttttt#llllllllllllllllllllllllllllllllllll#
  #ttttt#llllllllllllllllllllllllllllllllllll#
  #ttttt#llllllllllllllllllllllllllllllllllll#
  #ttttt#llllllllllllllllllllllllllllllllllll#
  #ttttttllllllllllllllllllllllllllllllllllll#
  #ttttttllllllllllllllllllllllllllllllllllll#
  #ttttt#llllllllllllllllllllllllllllllllllll#
  #ttttt#llllllllllllllllllllllllllllllllllll#
  #ttttt#lllllllllllllllllllllllllllmmmmmmlll#
  #ttttt#lllllllllllllllllllllllllllmmmmmmlll#
  #ttttt#lllllllllllllllllllllllllllmmmmmmlll#
  #ttttt#llllllllllllllllllllllllllllllllllll#
  #ttttt#llllllllllllllllllllllllllllllllllll#
  #ttttt#llllllllllllllllllllllllllllllllllll#
  #ttttt#lllllllllllllllllllllllllllmmmmmmlll#
  #ttttt#lllllllllllllllllllllllllllmmmmmmlll#
  #ttttt#lllllllllllllllllllllllllllmmmmmmlll#
  #ttttttllllllllllllllllllllllllllllllllllll#
  #ttttttllllllllllllllllllllllllllllllllllll#
  #ttttt#llllllllllllllllllllllllllllllllllll#
  #ttttt#llllllllllllllllllllllllllllllllllll#
  #ttttt#llllllllllllllllllllllllllllllllllll#
  #ttttt#llllllllllllllllllllllllllllllllllll#
  ##tt########################################
`;

const walls = interiorWalls(PLAN, {
  walls: "#",
  faces: { t: "wall-corridor", l: "wall-cream", m: "wall-cream" },
});
const WALL = mountY(0);

/** What each carrel holds, bank by bank, row by row. */
type Seat = { frame: string; anim?: string; chair?: string; lamp?: boolean };
const SEATS: readonly (readonly Seat[])[] = [
  [
    { frame: "notes", chair: "back" },
    { frame: "study", lamp: true, chair: "back" },
    { frame: "books" },
    { frame: "bare" },
    { frame: "gone", chair: "recline" },
    { frame: "books" },
    { frame: "study", lamp: true, chair: "back" },
    { frame: "bare" },
    { frame: "notes" },
    { frame: "study-off" },
  ],
  [
    { frame: "books" },
    { frame: "bare" },
    { frame: "asleep0", anim: "asleep", lamp: true, chair: "back" },
    { frame: "notes" },
    { frame: "bare" },
    { frame: "study", lamp: true, chair: "back" },
    { frame: "books" },
    { frame: "gone", chair: "back" },
    { frame: "bare" },
    { frame: "study", lamp: true, chair: "back" },
  ],
  [
    { frame: "bare" },
    { frame: "notes" },
    { frame: "books" },
    { frame: "study", lamp: true, chair: "back" },
    { frame: "bare" },
    { frame: "bare" },
    { frame: "study-off" },
    { frame: "notes" },
    { frame: "asleep0", anim: "asleep", lamp: true, chair: "back" },
    { frame: "bare" },
  ],
];
/** Carrel centres: two banks of five, 25 pixels apart so neighbours share an outline. */
const COLS = [157, 182, 207, 232, 257, 317, 342, 367, 392, 417];
const ROWS = [9, 14, 19];

const carrels: Prop[] = [];
const carrelLights: LightSource[] = [];
const carrelBlocks: TileRect[] = [];
SEATS.forEach((row, r) => {
  const ty = ROWS[r] as number;
  const y = (ty + 1) * T - 2;
  carrelBlocks.push({ x: 9, y: ty, w: 8, h: 1 }, { x: 19, y: ty, w: 8, h: 1 });
  row.forEach((seat, c) => {
    const x = COLS[c] as number;
    carrels.push(
      seat.anim
        ? { prop: "carrel", anim: seat.anim, play: true, index: c % 2, at: [x, y] }
        : { prop: "carrel", frame: seat.frame, at: [x, y] },
    );
    carrels.push({
      prop: "study-chair",
      frame: seat.chair ?? "back",
      at: [x, y + (seat.chair ? 9 : 4)],
    });
    if (seat.lamp)
      carrelLights.push({
        at: [x + 1, y - 8],
        radius: 18,
        color: "gold.light",
        intensity: 0.5,
        paint: {
          bands: ["campus-lamp", "campus-dusk"],
          at: [x + 1, y - 8],
          r: [13, 15],
          ragged: 2,
        },
      });
  });
});

const TUBE = ["campus", "campus-lamp", "campus-dusk", "campus-glow"];
const tube = (x: number, y: number, rx: number, ry: number): LightSource => ({
  at: [x, y],
  radius: rx + 10,
  color: "stone.bright",
  intensity: 0.85,
  paint: { bands: TUBE, at: [x, y], r: [rx, ry], ragged: 4 },
});
const moon = (x: number): Light => ({
  bands: ["campus-glow"],
  spill: { top: [x - 12, x + 12, WALL + 2], bottom: [x - 4, x + 24, WALL + 26] },
  ragged: 2,
});

const lights: LightSource[] = [
  tube(592, 182, 62, 30),
  tube(592, 280, 62, 30),
  {
    at: [130, 100],
    radius: 60,
    color: "stone.bright",
    intensity: 0.5,
    flicker: { amount: 0.4, period: 0.7 },
    paint: {
      bands: ["campus-dusk", "campus-glow"],
      at: [130, 100],
      r: [56, 40],
      ragged: 4,
      pulse: { amount: 0.05, period: 0.7 },
    },
  },
  {
    at: [56, 224],
    radius: 30,
    color: "gold.light",
    intensity: 0.45,
    paint: { bands: ["campus-dusk", "campus-glow"], at: [52, 236], r: [30, 18], ragged: 3 },
  },
  {
    at: [120, 70],
    radius: 26,
    color: "sea.pale",
    intensity: 0.4,
    flicker: { amount: 0.06, period: 2.5 },
  },
  ...carrelLights,
  ...[176, 240, 352, 416, 608].map(
    (x): LightSource => ({
      at: [x, WALL + 20],
      radius: 30,
      color: "navy.pale",
      intensity: 0.15,
      paint: moon(x),
    }),
  ),
];

const map: MapSource = {
  id: "gaseol-4f",
  name: "가설관 4층 자습실",
  seed: 2338,
  time: { clock: "23:38", phase: "night", weather: "clear" },
  theme: "campus-night",
  sky: "ink.deep",
  ambient: { color: "navy.light", intensity: 0.3, unlit: "campus" },
  plan: PLAN,
  legend: {
    "#": { terrain: "lino", solid: "#" },
    t: { terrain: "terrazzo" },
    l: { terrain: "lino" },
    m: { terrain: "mat" },
  },
  edges: [{ overlay: "wall-top", inside: "#" }],
  blocks: [...walls.blocks, ...carrelBlocks],
  details: [
    { prop: "floor-marks", frame: "scraps", at: [300, 190] },
    { prop: "floor-marks", frame: "puddle", at: [116, 92] },
  ],
  shadows: walls.shadows,
  objects: [
    ...walls.objects,
    // The corridor: the door to the stairs, the notices, the whistle on its hook, 권 사감's desk.
    { prop: "door-double", frame: "open", at: [48, WALL] },
    { prop: "exit-sign", at: [48, WALL] },
    { prop: "whistle-hook", at: [84, WALL] },
    { prop: "poster", frame: "safety", at: [16, WALL] },
    { prop: "sagam-desk", at: [44, 238], foot: { x: 1, y: 14, w: 3, h: 1 } },
    { prop: "desk-lamp", anim: "glow", play: true, at: [56, 224] },
    { prop: "extinguisher", at: [80, 340] },
    { prop: "umbrella", at: [14, 380] },
    { prop: "mop-bucket", at: [74, 120] },
    // The 자습실's wall: the ranking sheet, windows over the field, the clock, notices.
    { prop: "ranking-sheet", at: [136, WALL] },
    { prop: "window", frame: "night", at: [176, WALL] },
    { prop: "window", frame: "night", at: [240, WALL] },
    { prop: "wall-clock", anim: "tick", play: true, at: [296, WALL] },
    { prop: "window", frame: "night", at: [352, WALL] },
    { prop: "window", frame: "night", at: [416, WALL] },
    { prop: "notice", frame: "l", at: [448, WALL] },
    { prop: "notice", frame: "b", at: [464, WALL] },
    { prop: "notice", frame: "a", at: [480, WALL] },
    { prop: "notice", frame: "r", at: [496, WALL] },
    { prop: "window", frame: "night-curtain", at: [544, WALL] },
    { prop: "window", frame: "night", at: [608, WALL] },
    { prop: "window", frame: "night-curtain", at: [664, WALL] },
    // By the door: the cooler and the log book.
    {
      prop: "water-cooler",
      anim: "glug",
      play: true,
      at: [120, 78],
      foot: { x: 7, y: 4, w: 1, h: 1 },
    },
    { prop: "log-stand", at: [140, 78], foot: { x: 8, y: 4, w: 1, h: 1 } },
    ...carrels,
    // The 졸방대 at the lit end, where you stand to stay awake.
    { prop: "jolbangdae", at: [592, 190], foot: { x: 35, y: 11, w: 4, h: 1 } },
    { prop: "jolbangdae", at: [592, 286], foot: { x: 35, y: 17, w: 4, h: 1 } },
    // What people left: bags, workbooks, 실내화 kicked off, cup noodles going cold.
    { prop: "bag", frame: "navy", at: [192, 172] },
    { prop: "bag", frame: "slump", at: [354, 252] },
    { prop: "bag", frame: "red", at: [222, 332] },
    { prop: "bag", frame: "green", at: [424, 172] },
    { prop: "textbooks", frame: "tall", at: [140, 250] },
    { prop: "textbooks", frame: "stack", at: [450, 330] },
    { prop: "slippers", frame: "scattered", at: [620, 320] },
    { prop: "slippers", frame: "pair", at: [520, 210] },
    { prop: "tumbler", at: [560, 170] },
    { prop: "bag", frame: "slump", at: [660, 220] },
    // Along the back: 사물함, a shelf of workbooks, the plant nobody waters, the cleaning cupboard.
    { prop: "lockers", frame: "shut", at: [176, 398], foot: { x: 9, y: 24, w: 3, h: 1 } },
    { prop: "lockers", frame: "open", at: [226, 398], foot: { x: 12, y: 24, w: 3, h: 1 } },
    { prop: "lockers", frame: "shut", at: [336, 398], foot: { x: 19, y: 24, w: 3, h: 1 } },
    { prop: "lockers", frame: "shut", at: [386, 398], foot: { x: 22, y: 24, w: 3, h: 1 } },
    { prop: "tall-shelf", frame: "gaps", at: [656, 398], foot: { x: 40, y: 24, w: 3, h: 1 } },
    { prop: "sad-plant", at: [500, 396] },
    { prop: "cleaning-cupboard", frame: "shut", at: [124, 398], foot: { x: 7, y: 24, w: 2, h: 1 } },
  ],
  overhead: [
    { prop: "cup-noodles", anim: "steam", play: true, at: [233, 141] },
    { prop: "tumbler", at: [570, 173] },
    { prop: "tumbler", at: [618, 269] },
    { prop: "entropy", anim: "sleep", play: true, at: [608, WALL - 15], raw: true },
    { prop: "tube-light", anim: "flicker", play: true, at: [130, 80] },
    { prop: "tube-light", frame: "off", at: [240, 80] },
    { prop: "tube-light", frame: "off", at: [360, 80] },
    { prop: "tube-light", frame: "off", at: [480, 80] },
    { prop: "tube-light", frame: "on", at: [592, 80] },
    { prop: "tube-light", frame: "on", at: [592, 200] },
    { prop: "tube-light", frame: "dim", at: [48, 160] },
  ],
  lights,
  spawns: {
    main: { tile: [12, 10], facing: "up" },
    stairs: { tile: [3, 5] },
    "fire-escape": { tile: [2, 23], facing: "up" },
  },
  landmark: { name: "졸방대", tile: [37, 11] },
  portals: [
    { id: "stairs", rect: { x: 2, y: 4, w: 2, h: 1 }, to: "gaseolgwan-stairs", spawn: "4f" },
    { id: "fire-escape", rect: { x: 2, y: 25, w: 2, h: 1 }, to: "campus-yard", spawn: "gaseol-4f" },
  ],
  interactables: [
    { id: "logbook", kind: "notice", rect: { x: 8, y: 4, w: 1, h: 1 } },
    { id: "cooler", kind: "lore", rect: { x: 7, y: 4, w: 1, h: 1 } },
    { id: "standing-desk", kind: "sit", rect: { x: 35, y: 11, w: 4, h: 1 } },
    { id: "standing-desk-2", kind: "sit", rect: { x: 35, y: 17, w: 4, h: 1 } },
    { id: "ranking", kind: "notice", rect: { x: 8, y: 3, w: 1, h: 1 } },
    { id: "sagam-desk", kind: "lore", rect: { x: 1, y: 14, w: 3, h: 1 } },
  ],
  zones: [
    { id: "floor", kind: "safe", rect: { x: 0, y: 0, w: 44, h: 26 } },
    { id: "study-hall", kind: "room", rect: { x: 7, y: 4, w: 36, h: 21 }, name: "4층 자습실" },
    { id: "study-logout", kind: "logout", rect: { x: 7, y: 4, w: 36, h: 21 }, bonus: "study" },
    { id: "jolbangdae", kind: "gather", rect: { x: 33, y: 9, w: 9, h: 12 } },
  ],
  marks: {
    seat: [12, 10],
    clock: [18, 1],
    cooler: [7, 4],
    logbook: [8, 4],
    "standing-desk": [37, 12],
    window: [34, 2],
    field: [34, 0],
    sill: [38, 3],
    stairs: [3, 4],
  },
  npcs: [
    { speaker: "senior-earth", tile: [37, 12], facing: "up" },
    { speaker: "sagam", tile: [4, 15], facing: "left" },
    { speaker: "entropy", tile: [38, 5] },
  ],
};

export default map;
