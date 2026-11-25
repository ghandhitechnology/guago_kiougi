import type { LightSource, MapSource } from "./format.ts";
import { blob, GREEK_LEGEND, merge, type Placed, px, settle } from "./greek.ts";
import type { Prop, Vec } from "./layers.ts";
import { PlanGrid } from "./plan.ts";
import { place } from "./props.ts";

/**
 * 그림자 동굴, the 위험 구역 off the cave mouth. Outside it is 13:20 and white; three steps in,
 * only the fire. The city keeps the cave: its guards walk the entrance hall and both passages
 * with their lanterns turned the way they look, and anyone they see is put out with 벌점. The
 * passages open into the chamber from the story: a bench of empty shackles facing the back
 * wall, a low wall behind it where cutouts on poles stand ready, the fire behind that, and on
 * the wall the procession going by, horse, jar-carrier, bird, tree, over the round shadows of
 * heads that are not there any more. The shadows are thickest in front of the wall, and that is
 * where they stand up and fight.
 */

const T = 16;
const W = 60;
const H = 46;

const FIRE: Vec = [29, 17];
/** The chamber's floor line under the back wall. */
const WALL_Y = 6;
const GATE: Vec = [30, 43];

function paintPlan(): string {
  const g = new PlanGrid(W, H, "r");
  // The chamber, its back wall straight where the shadows fall.
  g.blob(30, 13, 17, 8.5, "_", { seed: 3, ragged: 0.12 });
  g.rect(19, WALL_Y, 23, 12, "_");
  g.rect(16, 3, 28, WALL_Y - 3, "r");
  // Two passages down either side of the rock between chamber and hall, an alcove off each.
  g.path(
    [
      [19, 18],
      [15, 24],
      [16, 31],
      [20, 35],
    ],
    5,
    "_",
    { seed: 5, ragged: 0.5 },
  );
  g.path(
    [
      [41, 18],
      [45, 24],
      [44, 31],
      [40, 35],
    ],
    5,
    "_",
    { seed: 6, ragged: 0.5 },
  );
  g.blob(9, 26, 4, 3, "_", { seed: 7, ragged: 0.2 });
  g.path(
    [
      [10, 26],
      [15, 26],
    ],
    3,
    "_",
    { seed: 8, ragged: 0.2 },
  );
  g.blob(51, 24, 4, 3, "_", { seed: 9, ragged: 0.2 });
  g.path(
    [
      [45, 25],
      [50, 24],
    ],
    3,
    "_",
    { seed: 10, ragged: 0.2 },
  );
  // The entrance hall, wide and low, pillars of rock to hide behind.
  g.blob(30, 37, 19, 5, "_", { seed: 11, ragged: 0.15 });
  g.blob(23, 37, 1.6, 1.3, "r", { seed: 12, ragged: 0.1 });
  g.blob(37, 37.5, 1.8, 1.3, "r", { seed: 13, ragged: 0.1 });
  g.blob(14, 38, 1.4, 1.2, "r", { seed: 14, ragged: 0.1 });
  // The tunnel out to the noon.
  g.rect(GATE[0] - 3, 40, 6, H - 40, "_");
  settle(g, GATE);
  // Past a rim of rock round every floor, the dark: nothing to see and nothing to reach.
  const near = (x: number, y: number) => {
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) if (g.at(x + dx, y + dy) === "_") return true;
    return false;
  };
  const dark: Vec[] = [];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) if (g.at(x, y) !== "_" && !near(x, y)) dark.push([x, y]);
  for (const [x, y] of dark) g.set(x, y, "x");
  return g.toString();
}

const PLAN = paintPlan();

// The chamber -----------------------------------------------------------------------------------

function chamber(): Partial<Placed> {
  const wallFoot = WALL_Y * T + 1;
  return {
    objects: [
      // The back wall's face, where the procession goes by.
      { prop: "shadow-wall", anim: "pass", play: true, at: [30 * T, wallFoot] },
      // The bench of empty shackles, facing the wall.
      ...[22, 26, 30, 34].map((x) => place("shackle-bench", x, 9)),
      // The low wall, end to end, and the cutouts propped behind it.
      { prop: "low-wall", frame: "w", at: [19 * T, 14 * T - 1] },
      ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(
        (k): Prop => ({ prop: "low-wall", frame: "mid", at: [(19 + k * 2) * T, 14 * T - 1] }),
      ),
      { prop: "low-wall", frame: "e", at: [39 * T, 14 * T - 1] },
      ...(
        [
          ["horse", 22],
          ["man", 26],
          ["jar", 31],
          ["man", 35],
          ["horse", 38],
        ] as const
      ).map(([frame, x]): Prop => ({ prop: "cutout", frame, at: [x * T + 8, 14 * T + 10] })),
      // The fire.
      place("bonfire", FIRE[0], FIRE[1], { anim: "burn", play: true }),
    ],
  };
}

/** Stalagmites: cover in the passages and the hall, and teeth along the chamber's edges. */
const STALAGMITES: readonly [string, number, number][] = [
  ["a", 15, 26],
  ["b", 17, 28],
  ["c", 14, 33],
  ["a", 44, 25],
  ["c", 44, 29],
  ["b", 46, 33],
  ["a", 20, 39],
  ["b", 27, 35],
  ["c", 33, 34],
  ["a", 42, 37],
  ["b", 16, 11],
  ["c", 46, 12],
  ["a", 18, 16],
  ["b", 42, 16],
  ["c", 8, 25],
  ["a", 52, 23],
];

/** Torches on the rock, for the guards. */
const TORCHES: readonly Vec[] = [
  [25, 33],
  [35, 33],
  [13, 35],
  [47, 35],
  [27, 41],
  [33, 41],
];

const lights: LightSource[] = [
  // The fire: everything in the chamber that can be seen is seen by it.
  {
    at: px(FIRE[0], FIRE[1] - 1),
    radius: 260,
    color: "gold.light",
    intensity: 1.1,
    flicker: { amount: 0.12, period: 0.6 },
    paint: {
      bands: ["rift-sun", "rift-warm", "rift-ember"],
      at: [FIRE[0] * T + 8, FIRE[1] * T - 30],
      r: [230, 150],
      ragged: 7,
      pulse: { amount: 0.05, period: 0.6 },
    },
  },
  // The back wall takes the fire whole: the brightest thing anyone in here has seen.
  {
    at: [30 * T, WALL_Y * T - 20],
    radius: 0,
    color: "gold.light",
    intensity: 0,
    paint: {
      bands: ["rift-sun", "rift-warm"],
      at: [30 * T, WALL_Y * T - 24],
      r: [118, 28],
      ragged: 6,
      pulse: { amount: 0.05, period: 0.6 },
    },
  },
  // Noon at the end of the tunnel.
  {
    at: [GATE[0] * T, H * T],
    radius: 140,
    color: "stone.bright",
    intensity: 1,
    paint: {
      bands: ["greece", "rift-sun", "rift-warm"],
      at: [GATE[0] * T, H * T],
      r: [80, 120],
      ragged: 5,
    },
  },
  ...TORCHES.map(
    ([x, y]): LightSource => ({
      at: [x * T + 8, y * T],
      radius: 56,
      color: "gold.light",
      intensity: 0.6,
      flicker: { amount: 0.2, period: 0.5 },
      paint: {
        bands: ["rift-warm", "rift-ember"],
        at: [x * T + 8, y * T + 4],
        r: [34, 22],
        ragged: 4,
      },
    }),
  ),
];

const placed = merge(chamber(), {
  objects: [
    ...STALAGMITES.map(([frame, x, y]) => place("stalagmite", x, y, { frame })),
    ...TORCHES.map(
      ([x, y], i): Prop => ({
        prop: "torch",
        anim: "burn",
        play: true,
        index: i % 3,
        at: [x * T + 8, y * T + 2],
        sort: y * T - 8,
      }),
    ),
    place("boulder", 18, 37),
    place("boulder-big", 30, 38),
    place("amphora", 11, 27),
    { prop: "amphora-tipped", at: [px(50, 25)[0], px(50, 25)[1] + 5] },
  ],
  shadows: [blob(FIRE[0] * T + 16, FIRE[1] * T + 14, 22, 5, 0)],
});

const map: MapSource = {
  id: "p1-shadow-cave",
  name: "그림자 동굴",
  seed: 1320,
  time: { clock: "13:20", phase: "noon", weather: "clear" },
  theme: "field-night",
  sky: "ink.deep",
  ambient: { color: "ink.dark", intensity: 0.35 },
  plan: PLAN,
  legend: { ...GREEK_LEGEND, x: { terrain: null, solid: "#" } },
  details: [
    { decal: "marble-dust/pebbles", at: [420, 560] },
    { decal: "marble-dust/pebbles", at: [600, 300] },
    { prop: "tracks", frame: "h", at: [470, 220] },
  ],
  shadows: placed.shadows,
  objects: placed.objects,
  overhead: placed.overhead,
  lights,
  atmosphere: [
    ...[0, 4, 8].map(
      (index, i): Prop => ({
        prop: "embers",
        anim: "rise",
        play: true,
        index,
        at: [FIRE[0] * T + 8 + (i - 1) * 10, FIRE[1] * T - 20],
      }),
    ),
  ],
  emitters: [
    // Dust turning in the light from the mouth.
    {
      sprite: "mote",
      area: { x: (GATE[0] - 3) * T, y: (H - 6) * T, w: 6 * T, h: 6 * T },
      count: 10,
      life: 6,
      velocity: [2, -6],
    },
  ],
  spawns: {
    main: { tile: GATE, facing: "up" },
    "p1-cave-mouth": { tile: GATE, facing: "up" },
  },
  landmark: { name: "그림자 벽", tile: [30, WALL_Y] },
  // The low wall the cutouts are carried behind.
  blocks: [{ x: 19, y: 13, w: 22, h: 1 }],
  portals: [
    {
      id: "cave-mouth",
      rect: { x: GATE[0] - 2, y: H - 1, w: 4, h: 1 },
      to: "p1-cave-mouth",
      spawn: "p1-shadow-cave",
    },
  ],
  interactables: [
    { id: "wall", kind: "lore", rect: { x: 26, y: WALL_Y, w: 8, h: 1 } },
    { id: "shackles", kind: "lore", rect: { x: 22, y: 9, w: 16, h: 1 } },
    { id: "cutouts", kind: "lore", rect: { x: 22, y: 14, w: 17, h: 1 } },
  ],
  zones: [
    { id: "tunnel", kind: "safe", rect: { x: GATE[0] - 3, y: 42, w: 6, h: 4 } },
    { id: "before-the-wall", kind: "elite", rect: { x: 20, y: 6, w: 20, h: 3 } },
    { id: "alcove-west", kind: "elite", rect: { x: 6, y: 24, w: 6, h: 5 } },
    { id: "alcove-east", kind: "elite", rect: { x: 48, y: 22, w: 6, h: 5 } },
    // At full count about 70: shadows thick in the chamber, thinner down the passages.
    {
      id: "chamber",
      kind: "monsters",
      rect: { x: 13, y: 6, w: 34, h: 14 },
      monster: "cave-shadow",
      density: 6,
    },
    {
      id: "passages",
      kind: "monsters",
      rect: { x: 6, y: 18, w: 48, h: 16 },
      monster: "cave-shadow",
      density: 4,
    },
    {
      id: "hall",
      kind: "monsters",
      rect: { x: 11, y: 32, w: 38, h: 8 },
      monster: "cave-shadow",
      density: 2,
    },
  ],
  marks: {
    fire: FIRE,
    wall: [30, WALL_Y],
    bench: [28, 10],
    exit: GATE,
  },
  npcs: [{ speaker: "guard", tile: [GATE[0] + 2, 41], facing: "down" }],
  patrols: [
    {
      id: "gate",
      walker: "guard",
      route: [
        [21, 40],
        [44, 40],
        [44, 33],
        [16, 33],
        [16, 40],
      ],
      loop: "cycle",
      speed: 1.6,
      pause: 1.5,
      cone: { length: 5, angle: 70 },
    },
    {
      id: "west-pass",
      walker: "guard",
      route: [
        [14, 30],
        [14, 23],
        [17, 19],
      ],
      loop: "pingpong",
      speed: 1.4,
      pause: 2,
      cone: { length: 5, angle: 60 },
    },
    {
      id: "east-pass",
      walker: "guard",
      route: [
        [41, 19],
        [43, 23],
        [43, 30],
      ],
      loop: "pingpong",
      speed: 1.4,
      pause: 2,
      cone: { length: 5, angle: 60 },
    },
    {
      id: "fire-watch",
      walker: "guard",
      route: [
        [17, 19],
        [43, 19],
      ],
      loop: "pingpong",
      speed: 1.2,
      pause: 3,
      cone: { length: 6, angle: 80 },
    },
  ],
};

export default map;
