import type { LightSource, MapSource } from "./format.ts";
import { blob, GREEK_LEGEND, merge, type Placed, settle } from "./greek.ts";
import type { Prop, ShadowShape, Vec } from "./layers.ts";
import { PlanGrid } from "./plan.ts";
import { place } from "./props.ts";

/**
 * 리케이온, 16:50, the same gold as the school the students left, because it is laid out like it:
 * the lecture hall where the 본관 stands, its columns each with a syllabus pinned on; the library
 * hall beside it where the second building is; a timber tower where the flagpole would be; a
 * plane tree in a ring of benches where the 해솔 grows at home; lawns crossed by walks; and in
 * front of the canteen's place, the bath's pool frozen into a sheet of ice. 아리스토텔레스
 * lectures from the head of the lawn all day and all night. The four elements wait at the lawn's
 * corners for their 논제, the four thesis steles stand round him in sight of everyone, the yard
 * under the tower is where things are dropped, and the gate at the south is wide enough for a
 * whole class to come back through at once.
 */

const T = 16;
const W = 76;
const H = 56;

const HALL = { x: 4, bays: 15, steps: 9 };
const LIBRARY = { x: 40, bays: 11, steps: 9 };
const BOSS: Vec = [48, 16];
const TOWER: Vec = [6, 12];
const PLANE: Vec = [19, 29];
/** The lawn the fight takes, its element corners and the steles round the lectern. */
const FLOOR = { x: 26, y: 12, w: 46, h: 32 };
const ZONES = {
  air: [32, 21],
  fire: [64, 21],
  earth: [32, 37],
  water: [64, 37],
} as const satisfies Record<string, Vec>;
const STELES: readonly Vec[] = [
  [41, 25],
  [55, 25],
  [41, 33],
  [55, 33],
];
/** The frozen pool: its top-left tile and size in ice slabs (two tiles each). */
const ICE = { x: 34, y: 46, cols: 14, rows: 2 };
const GATE = { x: 8, w: 12 };

function paintPlan(): string {
  const g = new PlanGrid(W, H, ",");
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (y < 4) g.set(x, y, "~");
      else if (y < 9) g.set(x, y, "%");
    }
  // Hedged edges all round, past walking, but for the gate.
  for (let y = 4; y < H; y++)
    for (let x = 0; x < W; x++) {
      const edge = x < 2 || x > W - 3 || y > H - 3;
      if (edge && !(y > H - 3 && x >= GATE.x && x < GATE.x + GATE.w)) g.set(x, y, "%");
    }
  // Paving: along both halls, down from the gate, round the fall yard, the ring round the plane,
  // the walk across the lawn's head, and the pool's edge.
  g.rect(2, 9, W - 4, 3, "m");
  g.rect(GATE.x, 12, GATE.w, H - 12, "m");
  g.rect(4, 12, 22, 11, "m");
  g.blob(PLANE[0] + 0.5, PLANE[1] + 0.5, 6, 4.5, "m", { seed: 3, ragged: 0.08 });
  g.rect(ICE.x - 2, ICE.y - 2, ICE.cols * 2 + 4, ICE.rows * 2 + 4, "m");
  g.rect(GATE.x + GATE.w, ICE.y, ICE.x - GATE.x - GATE.w, 4, "m");
  // Walks worn across the lawn, the way students actually go.
  g.path(
    [
      [20, 23],
      [BOSS[0], BOSS[1] + 3],
    ],
    2,
    "_",
    { seed: 5, ragged: 0.3 },
  );
  g.path(
    [
      [BOSS[0], BOSS[1] + 3],
      [BOSS[0], ICE.y - 2],
    ],
    2,
    "_",
    { seed: 6, ragged: 0.3 },
  );
  g.path(
    [
      [FLOOR.x, 29],
      [FLOOR.x + FLOOR.w, 29],
    ],
    2,
    "_",
    { seed: 7, ragged: 0.3 },
  );
  // The lectern's round of paving.
  g.blob(BOSS[0] + 0.5, BOSS[1] + 1, 5, 3, "m", { seed: 8, ragged: 0.1 });
  return settle(g, [GATE.x + GATE.w / 2, H - 2]).toString();
}

const PLAN = paintPlan();

// The halls ----------------------------------------------------------------------------------

/** The lecture hall's middle, in tiles: its face is its columns, a syllabus on every one. */
const LECTURE_X = 21;
/** The library's middle. */
const LIBRARY_X = 50.5;

/** Long shadows east, the sun being low in the west. */
function east(x: number, y: number, len: number, w = 6): ShadowShape {
  return {
    poly: [
      [x - 3, y - w / 2],
      [x - 3, y + w / 2],
      [x + len, y + w / 2 + 3],
      [x + len + 6, y - w / 2 + 2],
    ],
  };
}

const lights: LightSource[] = [];

const BENCHES: readonly [number, number, boolean][] = [
  [PLANE[0] - 6, PLANE[1] - 3, false],
  [PLANE[0] + 4, PLANE[1] - 3, false],
  [PLANE[0] - 6, PLANE[1] + 3, true],
  [PLANE[0] + 4, PLANE[1] + 3, true],
];

/** Things left on the lawn by students who went to look at something. */
const LEFT: readonly [string, number, number][] = [
  ["tablet", 36, 15],
  ["sandal", 52, 20],
  ["scroll", 44, 39],
  ["satchel", 59, 28],
  ["apple", 38, 31],
  ["tablet", 68, 31],
  ["scroll", 29, 28],
  ["sandal", 47, 42],
];

/** The element places, larger than their rings: where a crowd can fight round each. */
const PLACES: Readonly<Record<keyof typeof ZONES, readonly [string, string, number, number][]>> = {
  fire: [
    ["scorch", "a", -4, -2],
    ["scorch", "b", 3, -2],
    ["scorch", "c", -4, 2],
    ["scorch", "a", 3, 2],
    ["scorch", "b", 0, 0],
  ],
  water: [
    ["wet-hollow", "a", -4, -2],
    ["wet-hollow", "b", 3, -1],
    ["wet-hollow", "a", -2, 2],
    ["wet-hollow", "b", 3, 2],
  ],
  air: [
    ["combed", "a", -4, -2],
    ["combed", "b", 3, -2],
    ["combed", "c", -4, 2],
    ["combed", "a", 3, 2],
    ["combed", "b", 0, 0],
  ],
  earth: [
    ["outcrop", "a", -4, -2],
    ["outcrop", "b", 3, -2],
    ["outcrop", "c", -3, 2],
    ["outcrop", "a", 4, 2],
  ],
};

const placed = merge({
  objects: [
    { prop: "lecture-hall", at: [LECTURE_X * T, (HALL.steps + 1) * T - 1], sort: HALL.steps * T },
    { prop: "library", at: [LIBRARY_X * T, (LIBRARY.steps + 1) * T - 1], sort: LIBRARY.steps * T },
    // Trees on the bank behind the halls.
    place("cypress", 4, 7),
    place("cypress", 34, 6),
    place("olive", 64, 7),
    // Streamers round the air's corner, reeds round the water's.
    ...(
      [
        [-6, -3],
        [4, -4],
        [5, 3],
        [-7, 2],
      ] as const
    ).map(
      ([dx, dy], i): Prop => ({
        prop: "streamer",
        anim: "fly",
        play: true,
        index: i % 3,
        at: [(ZONES.air[0] + dx) * T + 8, (ZONES.air[1] + dy) * T + 12],
      }),
    ),
    ...(
      [
        [-5, -2],
        [4, -2],
        [5, 2],
        [-4, 3],
        [0, 4],
      ] as const
    ).map(
      ([dx, dy], i): Prop => ({
        prop: "hollow-reeds",
        anim: "bend",
        play: true,
        index: i % 2,
        at: [(ZONES.water[0] + dx) * T + 8, (ZONES.water[1] + dy) * T + 12],
      }),
    ),
    // Benches and racks at the lawn's edges, for those who only watch.
    ...(
      [
        [28, 12],
        [44, 12],
        [60, 12],
        [72, 24],
        [72, 34],
      ] as const
    ).map(([x, y]): Prop => ({ prop: "marble-bench", at: [x * T, y * T + 12] })),
    { prop: "scroll-rack", at: [70 * T, 18 * T + 14] },
    // The tower over the fall yard, its basket of stones and sack of feathers up top.
    place("drop-tower", TOWER[0] - 1, TOWER[1]),
    // The plane in its ring of benches.
    place("plane", PLANE[0], PLANE[1]),
    ...BENCHES.map(([x, y, flip]) => place("marble-bench", x, y, { flip })),
    // Scroll racks either side of the library's middle door, out in the light to be read.
    place("scroll-rack", LIBRARY.x + 7, LIBRARY.steps + 2),
    place("scroll-rack", LIBRARY.x + 13, LIBRARY.steps + 2),
    // The gate: columns either side of a wide opening, herms on guard.
    place("column", GATE.x - 1, H - 3, { frame: "whole" }),
    place("column", GATE.x + GATE.w, H - 3, { frame: "whole" }),
    place("herm", GATE.x - 2, H - 3),
    place("herm", GATE.x + GATE.w + 1, H - 3),
    // Statues along the walk from the gate, and the fountain at the pool's head.
    place("statue", GATE.x - 2, 40),
    place("statue", GATE.x + GATE.w + 1, 34, { flip: true }),
    place("krene", ICE.x + ICE.cols * 2 + 3, ICE.y - 1, { anim: "run", play: true }),
    // Cypresses and olives along the hedges.
    place("cypress", 2, 26),
    place("cypress", 2, 36),
    place("cypress", W - 3, 14),
    place("cypress", W - 3, 46),
    place("olive", 70, 6),
    place("olive", 37, 6),
    place("pithos", 4, 47),
    place("handcart", 22, 50),
  ],
  overhead: [
    {
      prop: "drop-tower-top",
      anim: "flap",
      play: true,
      at: place("drop-tower", TOWER[0] - 1, TOWER[1]).at,
    },
    { prop: "cypress-crown", anim: "sway", play: true, at: place("cypress", 4, 7).at },
    { prop: "cypress-crown", anim: "sway", play: true, index: 1, at: place("cypress", 34, 6).at },
    { prop: "olive-crown", anim: "stir", play: true, at: place("olive", 64, 7).at },
    { prop: "plane-crown", anim: "sway", play: true, at: place("plane", PLANE[0], PLANE[1]).at },
    { prop: "column-capital", at: place("column", GATE.x - 1, H - 3).at },
    { prop: "column-capital", at: place("column", GATE.x + GATE.w, H - 3).at },
    { prop: "cypress-crown", anim: "sway", play: true, at: place("cypress", 2, 26).at },
    { prop: "cypress-crown", anim: "sway", play: true, index: 1, at: place("cypress", 2, 36).at },
    { prop: "cypress-crown", anim: "sway", play: true, at: place("cypress", W - 3, 14).at },
    {
      prop: "cypress-crown",
      anim: "sway",
      play: true,
      index: 1,
      at: place("cypress", W - 3, 46).at,
    },
    { prop: "olive-crown", anim: "stir", play: true, at: place("olive", 70, 6).at },
    { prop: "olive-crown", anim: "stir", play: true, index: 1, at: place("olive", 37, 6).at },
  ],
  shadows: [
    east(TOWER[0] * T + 8, (TOWER[1] + 1) * T - 2, 260, 22),
    east((LECTURE_X + 9.5) * T, (HALL.steps + 1) * T - 20, 50, 40),
    east((LIBRARY_X + 11.5) * T, (LIBRARY.steps + 1) * T - 20, 40, 36),
    east(PLANE[0] * T + 8, (PLANE[1] + 1) * T - 2, 90, 40),
    blob(PLANE[0] * T + 40, (PLANE[1] + 1) * T, 40, 12, 4),
    east((GATE.x - 1) * T + 8, (H - 2) * T - 2, 60, 6),
    east((GATE.x + GATE.w) * T + 8, (H - 2) * T - 2, 60, 6),
  ],
});

/** Mowing stripes over the lawn: every other pair of columns, laid the other way. */
function stripes(): Prop[] {
  const rows = PLAN.split("\n");
  const out: Prop[] = [];
  for (let y = FLOOR.y; y < FLOOR.y + FLOOR.h; y += 2)
    for (let x = FLOOR.x; x < FLOOR.x + FLOOR.w; x += 2) {
      if ((x - FLOOR.x) % 4 !== 0) continue;
      if (rows[y]?.[x] !== "," || rows[y + 1]?.[x + 1] !== ",") continue;
      out.push({ prop: "mown", at: [x * T, y * T] });
    }
  return out;
}

const around = ([x, y]: Vec, dx: number, dy: number): Vec => [(x + dx) * T + 8, (y + dy) * T + 8];

const zoneRect = ([x, y]: Vec) => ({ x: x - 2, y: y - 1, w: 5, h: 3 });

const map: MapSource = {
  id: "p1-lyceum",
  name: "리케이온",
  seed: 1650,
  time: { clock: "16:50", phase: "golden", weather: "clear" },
  theme: "campus-golden",
  shade: "golden-shade",
  sky: "gold.pale",
  ambient: { color: "gold.light", intensity: 0.96, sun: { dir: [0.55, 0.14], color: "gold.pale" } },
  plan: PLAN,
  legend: GREEK_LEGEND,
  backdrop: [
    { prop: "golden-sky", at: [0, 0], repeat: 6, raw: true },
    { prop: "golden-sun", at: [140, 30], raw: true },
    { prop: "attica", at: [-300, 64], repeat: 2, raw: true },
  ],
  details: [
    ...stripes(),
    // Rings worn into the lawn where pairs practise.
    { prop: "duel-ring", at: [38 * T, 18 * T] },
    { prop: "duel-ring", at: [57 * T, 41 * T] },
    { prop: "duel-ring", at: [48 * T, 29 * T + 8] },
    // The elements' places, wider than their rings.
    ...Object.entries(PLACES).flatMap(([name, list]) =>
      list.map(
        ([prop, frame, dx, dy]): Prop => ({
          prop,
          frame,
          at: around(ZONES[name as keyof typeof ZONES], dx, dy),
        }),
      ),
    ),
    // The fall yard: targets chalked on the paving, dents where things landed.
    { prop: "drop-target", at: [10 * T, 16 * T] },
    { prop: "drop-target", at: [18 * T, 19 * T] },
    ...(
      [
        [9, 14],
        [13, 18],
        [20, 15],
        [16, 21],
        [7, 20],
      ] as const
    ).map(([x, y]): Prop => ({ prop: "dent", at: [x * T, y * T] })),
    ...LEFT.map(([frame, x, y]): Prop => ({ prop: "left-behind", frame, at: [x * T, y * T + 10] })),
    // The frozen pool, and frost creeping out from it over the paving.
    { prop: "ice-sheet", at: [ICE.x * T - 7, ICE.y * T - 7], raw: true },
    ...[0, 1, 2, 3, 4, 5, 6, 7].flatMap((k): Prop[] => [
      {
        prop: "frost",
        frame: ["a", "b", "c"][k % 3] as string,
        at: [(ICE.x + 1 + k * 3.4) * T, ICE.y * T - 8],
        raw: true,
      },
      {
        prop: "frost",
        frame: ["c", "a", "b"][k % 3] as string,
        at: [(ICE.x + 2 + k * 3.4) * T, (ICE.y + ICE.rows * 2) * T + 26],
        raw: true,
      },
    ]),
    // The element corners, dormant until the second 논제.
    ...Object.entries(ZONES).map(
      ([name, [x, y]]): Prop => ({
        prop: `p1-zone-${name}`,
        frame: "dormant",
        at: [x * T + 8, y * T + 8],
        raw: true,
      }),
    ),
  ],
  shadows: placed.shadows,
  objects: placed.objects,
  overhead: placed.overhead,
  lights,
  atmosphere: [
    ...[0, 1, 2, 3, 4, 5].map(
      (k): Prop => ({
        prop: "ice-mist",
        anim: "drift",
        play: true,
        index: k % 4,
        at: [(ICE.x + 2 + k * 4.4) * T, (ICE.y + 1 + (k % 2) * 2) * T],
        raw: true,
      }),
    ),
    ...[0, 1, 2].map(
      (k): Prop => ({
        prop: "embers",
        anim: "rise",
        play: true,
        index: k * 4,
        at: around(ZONES.fire, (k - 1) * 3, k % 2),
      }),
    ),
  ],
  emitters: [
    {
      sprite: "mote",
      area: { x: 64, y: 160, w: 1100, h: 640 },
      count: 36,
      life: 7,
      velocity: [10, -3],
    },
  ],
  spawns: {
    main: { tile: [GATE.x + GATE.w / 2, H - 4], facing: "up" },
    "p1-agora-edge": { tile: [GATE.x + GATE.w / 2, H - 4], facing: "up" },
    // Students knocked out in the fight come back here, at the gate.
    respawn: { tile: [GATE.x + GATE.w / 2, H - 6], facing: "up" },
  },
  landmark: { name: "강의 계획서 주랑", tile: [HALL.x + HALL.bays, HALL.steps - 2] },
  blocks: [
    { x: HALL.x - 1, y: HALL.steps - 4, w: HALL.bays * 2 + 2, h: 4 },
    { x: LIBRARY.x - 1, y: LIBRARY.steps - 4, w: LIBRARY.bays * 2 + 2, h: 4 },
  ],
  portals: [
    {
      id: "gate",
      rect: { x: GATE.x, y: H - 1, w: GATE.w, h: 1 },
      to: "p1-agora-edge",
      spawn: "p1-lyceum",
    },
  ],
  interactables: [
    { id: "syllabus", kind: "notice", rect: { x: HALL.x, y: HALL.steps, w: HALL.bays * 2, h: 1 } },
    { id: "scrolls", kind: "lore", rect: { x: LIBRARY.x + 7, y: LIBRARY.steps + 2, w: 9, h: 1 } },
    { id: "plane-ring", kind: "sit", rect: { x: PLANE[0] - 6, y: PLANE[1] - 3, w: 13, h: 7 } },
    { id: "tower", kind: "lore", rect: { x: TOWER[0] - 1, y: TOWER[1], w: 3, h: 1 } },
  ],
  zones: [
    { id: "gate-yard", kind: "safe", rect: { x: GATE.x, y: H - 8, w: GATE.w, h: 8 } },
    { id: "plane-shade", kind: "gather", rect: { x: PLANE[0] - 7, y: PLANE[1] - 4, w: 15, h: 9 } },
  ],
  arenas: [
    // The fight: the whole lawn, and the special floors it uses phase by phase.
    { id: "lawn", rect: FLOOR, modes: [] },
    { id: "fall-yard", rect: { x: 4, y: 13, w: 21, h: 9 }, modes: [] },
    { id: "ice", rect: { x: ICE.x, y: ICE.y, w: ICE.cols * 2, h: ICE.rows * 2 }, modes: [] },
    ...Object.entries(ZONES).map(([name, at]) => ({
      id: `zone-${name}`,
      rect: zoneRect(at),
      modes: [],
    })),
  ],
  marks: {
    boss: BOSS,
    lectern: BOSS,
    ...Object.fromEntries(STELES.map((at, i) => [`stele-${i + 1}`, at])),
    ...Object.fromEntries(Object.entries(ZONES).map(([name, at]) => [`zone-${name}`, at])),
    fall: [14, 17],
    // The tower, where the two stones are let go.
    column: [TOWER[0], TOWER[1] + 1],
    ice: [ICE.x + ICE.cols, ICE.y + ICE.rows],
    "block-start": [ICE.x, ICE.y + ICE.rows],
    "far-edge": [ICE.x + ICE.cols * 2 - 1, ICE.y + ICE.rows],
    respawn: [GATE.x + GATE.w / 2, H - 6],
    scribe: [LIBRARY.x + 11, LIBRARY.steps + 1],
  },
};

export default map;
