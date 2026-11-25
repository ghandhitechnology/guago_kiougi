import { building, FLOOR_TILES } from "./buildings.ts";
import type { LightSource, MapSource, Thing } from "./format.ts";
import type { Prop, ShadowShape, Vec } from "./layers.ts";
import { place } from "./props.ts";

/**
 * 본관 앞마당, the heart of the campus, at 16:50: classes are over, 청소 당번 left their mop by the
 * door, and the sun sits low over 가설관's roof. Time stopped here at golden hour. Everything
 * faces the 해솔 in its ring of benches, where everybody waits for everybody; the 급식실's
 * plaza, with the vending machines and the 매점 that is a corkboard, is where the money moves;
 * the lookout past 증명관 is where people go to say nothing at the sea.
 */

const T = 16;
/** Where the low sun throws a shadow, per pixel of height: right and a little down. */
const SUN: Vec = [0.55, 0.14];

/** The ground shadow of a box `h` pixels tall standing on ground x0..x1, yN..yS. */
function boxShadow(x0: number, x1: number, yN: number, yS: number, h: number): ShadowShape {
  const dx = Math.round(SUN[0] * h);
  const dy = Math.round(SUN[1] * h);
  return {
    poly: [
      [x0, yN],
      [x1, yN],
      [x1 + dx, yN + dy],
      [x1 + dx, yS + dy],
      [x0 + dx, yS + dy],
      [x0, yS],
    ],
  };
}

/** A soft oval shadow cast by a crown or a figure, thrown to the right of its foot. */
function blob(x: number, y: number, rx: number, ry: number, lean = 0): ShadowShape {
  const poly: Vec[] = [];
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    poly.push([
      Math.round(x + Math.cos(a) * rx + Math.sin(a) * lean),
      Math.round(y + Math.sin(a) * ry),
    ]);
  }
  return { poly };
}

/** A tree's long shadow: a trunk line and a crown blob further out. */
function treeShadow(x: number, y: number, height: number, crown: number): ShadowShape[] {
  const tx = x + SUN[0] * height;
  const ty = y + SUN[1] * height;
  return [
    {
      poly: [
        [x - 3, y - 1],
        [x + 3, y - 1],
        [Math.round(tx), Math.round(ty) + 1],
        [Math.round(tx) - 4, Math.round(ty) + 2],
      ],
    },
    blob(Math.round(tx + crown * 0.3), Math.round(ty), crown, Math.round(crown * 0.34), 4),
  ];
}

/**
 * A trodden shortcut across the lawn from one pixel to another: worn pieces every ten pixels,
 * leaning the way the path runs.
 */
function trodden(from: Vec, to: Vec): Prop[] {
  const [x0, y0] = from;
  const [x1, y1] = to;
  const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / 10));
  return Array.from(
    { length: n + 1 },
    (_, k): Prop => ({
      prop: "trodden",
      frame: `t${k % 4}`,
      at: [Math.round(x0 + ((x1 - x0) * k) / n) - 10, Math.round(y0 + ((y1 - y0) * k) / n) - 6],
      ...(x1 < x0 ? { flip: true } : {}),
    }),
  );
}

/** A clipped hedge along a row of tiles, ends rounded. */
function hedgeRow(x0: number, x1: number, ty: number): Thing[] {
  const out: Thing[] = [];
  for (let x = x0; x <= x1; x++) {
    const frame = x === x0 ? "l" : x === x1 ? "r" : "run";
    out.push({ prop: "hedge", frame, at: [x * T, ty * T + T - 1], foot: { x, y: ty, w: 1, h: 1 } });
  }
  return out;
}

// Buildings -----------------------------------------------------------------------------------

/** 가설관, the old main building: four floors of cream concrete, the 자습실 on top. */
const GASEOL = building({
  name: "gaseol",
  material: "bld-cream",
  roof: "roof-green",
  roofRows: 4,
  floors: [
    "<WBWW|WfWB|WW####WW|WBWo|WWBW>",
    "<WWBW|WWWW|WWPWWWWW|WWpW|WBWW>",
    "<WoWW|WdWW|WWWWWBWW|WWWW|WWxW>",
    "<WWWW|WWWW|WW#[]#WW|LLWW|WWdW>",
  ],
  extras: (ox, oy, base) => ({
    objects: [
      // On the roof: the water tank, the stair house, a row of condensers, the dome.
      { prop: "water-tank", at: [ox + 56, oy + 54], sort: base },
      { prop: "roof-stairs", at: [ox + 176, oy + 58], sort: base },
      { prop: "ac-unit", at: [ox + 248, oy + 58], sort: base },
      { prop: "ac-unit", at: [ox + 264, oy + 58], sort: base },
      { prop: "ac-unit", at: [ox + 280, oy + 58], sort: base },
      { prop: "dome", at: [ox + 392, oy + 56], sort: base },
      // The clock over the doors, stopped at ten to five, and the name plate.
      { prop: "clock-golden", at: [ox + 240, oy + 142], sort: base },
      { prop: "sign", at: [ox + 240, base - 52], sort: base },
      // The outside stair to the second floor and the fire escape up to the 자습실.
      { prop: "stair-2f", at: [ox + 120, base + 46], sort: base + 46 },
      { prop: "fire-escape", at: [ox - 17, base - 1], sort: base },
      // The doors' potted shrubs and the mop 청소 당번 forgot.
      { prop: "pot", at: [ox + 214, base + 9] },
      { prop: "pot", at: [ox + 266, base + 9] },
      { prop: "mop", at: [ox + 446, base + 8] },
    ],
    overhead: [{ prop: "canopy", at: [ox + 240, base - 27] }],
    details: [{ prop: "steps", at: [ox + 240, base + 9] }],
  }),
});

/** 증명관, the newer block: grey concrete, a glass lobby, solar panels on the roof. */
const JEUNGMYEONG = building({
  name: "jeungmyeong",
  material: "bld-grey",
  roof: "roof-grey",
  roofRows: 3,
  side: true,
  floors: ["<WWBW|WWCCCCWW|WoWW>", "<WpWW|WWCCCCWW|WWWB>", "<WxWW|WWC[]CWW|WWdW>"],
  extras: (ox, oy, base) => ({
    objects: [
      { prop: "solar", at: [ox + 64, oy + 30], sort: base },
      { prop: "solar", at: [ox + 64, oy + 44], sort: base },
      { prop: "solar", at: [ox + 208, oy + 30], sort: base },
      { prop: "solar", at: [ox + 208, oy + 44], sort: base },
      { prop: "sign", at: [ox + 160, base - 52], sort: base },
    ],
    overhead: [{ prop: "canopy", at: [ox + 160, base - 27] }],
    details: [{ prop: "steps", at: [ox + 160, base + 9] }],
  }),
});

/** 실험동: red brick, labs on three floors, research posters in the ground floor's windows. */
const SILHEOM = building({
  name: "silheom",
  material: "bld-brick",
  roof: "roof-green",
  roofRows: 3,
  side: true,
  floors: ["<WBW|WWWW|WoW>", "<WWW|WWWW|WWW>", "<WpW|WWWW|BWW>", "<PxP|#[]#|PxP>"],
  extras: (ox, oy, base) => ({
    objects: [
      { prop: "ac-unit", at: [ox + 40, oy + 26], sort: base },
      { prop: "ac-unit", at: [ox + 56, oy + 26], sort: base },
      { prop: "exhaust", at: [ox + 160, oy + 30], sort: base },
      { prop: "exhaust", at: [ox + 184, oy + 30], sort: base },
      { prop: "sign", at: [ox + 112, base - 52], sort: base },
    ],
    overhead: [{ prop: "canopy", at: [ox + 112, base - 27] }],
    details: [{ prop: "steps", at: [ox + 112, base + 9] }],
  }),
});

/** 급식실: one tall floor of yellow render, every light on in the kitchen, a sheet-metal roof. */
const CANTEEN = building({
  name: "canteen",
  material: "bld-canteen",
  roof: "roof-metal",
  pitched: true,
  roofRows: 3,
  floors: ["<LLLLL[]LLLLL|LLLLLdL>"],
  extras: (ox, oy, base) => ({
    objects: [
      { prop: "exhaust", at: [ox + 264, oy + 22], sort: base },
      { prop: "exhaust", at: [ox + 296, oy + 22], sort: base },
      { prop: "sign", at: [ox + 96, base - 40], sort: base },
    ],
    details: [{ prop: "steps", at: [ox + 96, base + 9] }],
  }),
});

/** 쉼표 라운지: a glass box against the 급식실, the piano nobody plays visible inside. */
const LOUNGE = building({
  name: "lounge",
  material: "bld-grey",
  roof: "roof-grey",
  roofRows: 2,
  floors: ["<C[]C>"],
});

/** 역사관: the oldest building, small, brick under a tiled roof. Its door opens on the yearbooks. */
const HISTORY = building({
  name: "history",
  material: "bld-brick",
  roof: "roof-tile",
  pitched: true,
  roofRows: 4,
  floors: ["<WW|[]|WW>"],
  extras: (ox, _oy, base) => ({
    objects: [{ prop: "sign", at: [ox + 80, base - 40], sort: base }],
    details: [{ prop: "steps", at: [ox + 80, base + 9] }],
  }),
});

// Places, in tiles --------------------------------------------------------------------------------

const GASEOL_AT: Vec = [3, 3];
const BASE_Y = (3 + 4 + 4 * FLOOR_TILES) * T; // 가설관 and 증명관 share a front line.
const PINE: Vec = [20, 29];
const PINE_FEET: Vec = [PINE[0] * T + 8, (PINE[1] + 1) * T - 2];

const trees: [number, number][] = [
  [40, 33],
  [53, 34],
  [66, 25],
  [71, 33],
  [73, 16],
  [10, 50],
  [41, 52],
  [62, 52],
  [26, 39],
];

const lights: LightSource[] = [
  // The kitchen's lights through the 급식실's windows, and the vending machines' panels.
  {
    at: [880, 720],
    radius: 90,
    color: "gold.light",
    intensity: 0.4,
    flicker: { amount: 0.04, period: 3 },
  },
  {
    at: [768, 712],
    radius: 40,
    color: "sea.pale",
    intensity: 0.5,
    flicker: { amount: 0.08, period: 2.5 },
  },
];

const map: MapSource = {
  id: "campus-yard",
  name: "본관 앞마당",
  seed: 1650,
  time: { clock: "16:50", phase: "golden", weather: "clear" },
  theme: "campus-golden",
  shade: "golden-shade",
  sky: "gold.pale",
  ambient: { color: "gold.pale", intensity: 0.92 },
  plan: `
    ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    %%%==============================~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    %%%=========================================================================
    %%%=========================================================================
    %%%=========================================================================
    %%%======================================================================%%%
    %%%======================================================================%%%
    %%%======================================================================%%%
    %%%======================================================================%%%
    %%%==========================================================,========,,,%%%
    %%%==========================================================,==========%%%%
    %%%==========================================================,==========%%%%
    %%%==========================================================,==========%%%%
    =============================================================,==========%%%%
    =============================================================,==========%%%%
    =============================================================,==========%%%%
    =============================================================,==========%%%%
    ==========================================================================%%
    ==========================================================================%%
    ==========================================================================%%
    %,,,,,,,,,,,==========,,,,,,,====,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,%
    %,,,,,,,,,,,==========,,,,,,,====,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,%
    %,,,,,,,,,,,,,,,,,,====,,,,,,====,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,%
    %,,,,,,,,,,,,,,,==========,,,====,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,%
    %,,,,,,,,,,,,,,============,,====,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,%
    %,,,,,,,,,,,,,==============================================================
    %,,,,,,,,,,,,,==============================================================
    %===========================================================================
    %===========================,====,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,%
    %===========================,====,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,%
    %===========================,====,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,%
    %==========================,,====,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,%
    %=========================,,,====,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,%
    %===============,,,====,,,,,,====,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,%
    %===============,,,,,,,,,,,,,====,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,%
    %===============,,,,,,,,,,,,,====,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,%
    %===============,,,,,,,,,,,,,====,,,,,,,,,,,,======================,,,,,,,,%
    %===============,,,,,,,,,,,,,====,,,,,,============================,,,,,,,,%
    %===============,,,,,,,,,,,,,====,,,,,,==================================,,%
    %===============,,,,,,,,,,,,,====,,,,,,==================================,,%
    %===============,,,,,,,,,,,,,====,,,,,,==================================,,%
    %===============,,,,,,,,,,,,,====,,,,,,==================================,,%
    %======================================================================,,,,%
    %======================================================================,,,,%
    %===================,,===,,,,,,,,======================================,,,,%
    %,,,,,,,,,,,,,,,,,,,,,===,,,,,,,,======================================,,,,%
    %,,,,,,,,,,,,,,,,,,,,,===,,,,,,,,======================================,,,,%
    %,,,,,,,,,,,,,,,,,,,,,===,,,,,,,,======================================,,,,%
    %,,,,,,,,,,,,,,,,,,,,,===,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,%
    %,,,,,,,,,,,,,,,,,,,,,===,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,%
    %,,,,,,,,,,,,,,,,,,,,,===,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,%
    %,,,,,,,,,,,,,,,,,,,,,===,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,%
    %,,,,,,,,,,,,,,,,,,,,,===,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,%
    %%%%%%%%%%%%%%%%%%%%%%===%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
  `,
  legend: {
    "~": { terrain: null },
    ",": { terrain: "grass" },
    "%": { terrain: "grass", solid: "#" },
    "=": { terrain: "walk" },
    ":": { terrain: "dirt" },
  },
  stamps: [
    { stamp: GASEOL, at: GASEOL_AT },
    { stamp: JEUNGMYEONG, at: [37, 7] },
    { stamp: SILHEOM, at: [1, 29] },
    { stamp: CANTEEN, at: [45, 38] },
    { stamp: LOUNGE, at: [39, 39] },
    { stamp: HISTORY, at: [62, 12] },
  ],
  blocks: [
    { x: 33, y: 4, w: 43, h: 1 },
    { x: 0, y: 15, w: 3, h: 4 },
    { x: 9, y: 19, w: 3, h: 3 },
    { x: 18, y: 28, w: 5, h: 2 },
  ],
  backdrop: [
    { prop: "golden-sky", at: [0, 0], repeat: 6, raw: true },
    { prop: "golden-sun", at: [452, 32], raw: true },
    { prop: "golden-sea", at: [0, 40], repeat: 20, raw: true },
    { prop: "golden-city", at: [-60, 46], repeat: 6, raw: true },
  ],
  details: [
    // Shortcuts worn into the lawn: the corner to the 급식실, the bikes to the field path, the
    // lab's door to the walk to the dorm.
    ...trodden([716, 362], [540, 540]),
    ...trodden([930, 366], [992, 430]),
    ...trodden([306, 748], [352, 790]),
    { prop: "hatch", at: [1086, 726] },
    { prop: "flashlight", at: [1112, 740] },
  ],
  shadows: [
    boxShadow(48, 528, BASE_Y - 64, BASE_Y, 230),
    boxShadow(592, 928, BASE_Y - 48, BASE_Y, 170),
    boxShadow(992, 1152, BASE_Y - 64, BASE_Y, 112),
    boxShadow(16, 256, 656, 704, 222),
    boxShadow(624, 1072, 656, 704, 96),
    // The skybridge's band across the passage.
    {
      poly: [
        [555, 270],
        [619, 270],
        [640, 300],
        [576, 300],
      ],
    },
    // The flag and its pole.
    {
      poly: [
        [214, 365],
        [218, 365],
        [272, 352],
        [268, 353],
      ],
    },
    blob(282, 348, 12, 4),
    // The covered walk's roof, its shadow beside it on the lawn.
    {
      poly: [
        [372, 736],
        [404, 736],
        [418, 896],
        [386, 896],
      ],
    },
    // The pergola's dappled shade.
    blob(772, 546, 44, 12, 6),
    ...treeShadow(PINE_FEET[0], PINE_FEET[1], 96, 34),
    ...trees.flatMap(([x, y]) => treeShadow(x * T + 8, (y + 1) * T - 2, 90, 30)),
  ],
  objects: [
    // The sea wall and its fence.
    { prop: "seawall", frame: "run", at: [536, 79], repeat: 43 },
    { prop: "fence", frame: "run", at: [536, 68], repeat: 43 },
    ...[600, 728, 856, 984, 1112].map((x): Prop => ({ prop: "fence", frame: "post", at: [x, 68] })),
    // The promenade and the lookout.
    place("binocular", 66, 5),
    place("lamp", 58, 8),
    place("bench", 61, 8),
    place("bench", 69, 8),
    place("pot", 60, 9),
    place("pot", 72, 9),
    // The skybridge's piers in the passage.
    // The flag before 가설관.
    place("flagpole", 13, 22, { anim: "wave", play: true }),
    // The 해솔 and its bench ring.
    place("pine", PINE[0], PINE[1]),
    { prop: "ring-bench", frame: "back", at: PINE_FEET, sort: PINE_FEET[1] - 1 },
    { prop: "ring-bench", frame: "front", at: PINE_FEET, sort: PINE_FEET[1] + 1 },
    place("lamp", 14, 26),
    place("lamp", 27, 26),
    place("lamp", 27, 34),
    place("bench", 13, 33),
    // 등나무 쉼터: wisteria over a pergola, benches in its shade.
    { prop: "pergola-post", at: [712, 548] },
    { prop: "pergola-post", at: [776, 548] },
    { prop: "pergola-post", at: [712, 516] },
    { prop: "pergola-post", at: [776, 516] },
    place("bench", 44, 32),
    place("bench", 46, 32, { flip: true }),
    // Shrubs at the corners where buildings meet the ground.
    { prop: "shrub", at: [44, 324] },
    { prop: "shrub", at: [540, 324], flip: true },
    { prop: "shrub", at: [940, 324] },
    { prop: "shrub", at: [1160, 324], flip: true },
    { prop: "shrub", at: [262, 714] },
    { prop: "shrub", at: [1090, 714], flip: true },
    { prop: "planter", at: [200, 382] },
    { prop: "planter", at: [344, 382] },
    // The east lawn: zelkovas, the bikes, the notice case, benches in the shade.
    ...trees.map(([x, y]) => place("zelkova", x, y)),
    place("bikes", 50, 22),
    place("notice-case", 33, 23),
    place("bench", 37, 35),
    place("bench", 56, 31),
    place("bench", 67, 30),
    ...hedgeRow(60, 72, 22),
    ...hedgeRow(34, 40, 22),
    // 실험동's front: the car the club built and the recycling.
    place("ev", 16, 44),
    place("bins", 3, 44),
    // The 급식실's plaza: vending machines, the corkboard 매점, the menu, tables.
    place("vending", 47, 44, { anim: "glow", play: true }),
    place("vending", 48, 44, { anim: "glow", play: true, index: 2 }),
    place("corkboard", 54, 44),
    place("menu-stand", 49, 46),
    place("picnic", 36, 47),
    place("picnic", 43, 47),
    place("picnic", 58, 47),
    place("picnic", 65, 47),
    place("bins", 69, 41),
    // The bottom lawn.
    place("bench", 14, 49),
    place("bench", 30, 50),
    place("bench", 50, 51),
    ...hedgeRow(1, 21, 55),
    ...hedgeRow(25, 74, 55),
    // The covered walk to 새벽관: posts down both sides.
    ...[46, 49, 52, 55].flatMap((ty): Prop[] => [
      { prop: "walkway-post", at: [361, ty * T + 14] },
      { prop: "walkway-post", at: [391, ty * T + 14] },
    ]),
  ],
  overhead: [
    { prop: "pine-crown", anim: "sway", play: true, at: PINE_FEET },
    ...trees.map(
      ([x, y], i): Prop => ({
        prop: "zelkova-crown",
        anim: "sway",
        play: true,
        index: i % 3,
        at: [x * T + 8, (y + 1) * T - 2],
      }),
    ),
    // The wisteria over the pergola.
    { prop: "pergola", at: [744, 514] },
    // The skybridge at the second floor, between 가설관 and 증명관.
    { prop: "skybridge", frame: "run", at: [528, BASE_Y - 50], repeat: 4 },
    // 엔트로피, asleep on the warm top of the vending machine.
    { prop: "entropy", anim: "sleep", play: true, at: [758, 689], raw: true },
    // The walkway's roof, a little above head height.
    ...Array.from(
      { length: 10 },
      (_, k): Prop => ({ prop: "walkway", frame: "run", at: [360, (46 + k) * T + 15 - 26] }),
    ),
    ...[56 * T + 15 - 26].map((y): Prop => ({ prop: "walkway", frame: "run", at: [360, y] })),
    { prop: "parasol", at: [600, 766] },
    { prop: "parasol", at: [712, 766] },
    { prop: "parasol", at: [952, 766] },
    { prop: "parasol", at: [1064, 766] },
  ],
  lights,
  emitters: [
    {
      sprite: "mote",
      area: { x: 160, y: 340, w: 900, h: 420 },
      count: 46,
      life: 7,
      velocity: [5, -3],
    },
    {
      sprite: "needle",
      anim: "fall",
      area: { x: 280, y: 370, w: 90, h: 40 },
      count: 7,
      life: 3.5,
      velocity: [-12, 22],
    },
    {
      sprite: "gull",
      anim: "glide",
      area: { x: -40, y: 6, w: 1100, h: 26 },
      count: 3,
      life: 36,
      velocity: [34, 1],
    },
  ],
  spawns: {
    main: { tile: [17, 21] },
    "gaseol-1f": { tile: [18, 20] },
    "gaseol-side": { tile: [30, 20] },
    "gaseol-2f": { tile: [10, 22] },
    "gaseol-4f": { tile: [2, 20] },
    jeungmyeong: { tile: [47, 20] },
    silheom: { tile: [7, 45] },
    cafeteria: { tile: [52, 45] },
    lounge: { tile: [41, 45] },
    saebyeok: { tile: [23, 54], facing: "up" },
    field: { tile: [74, 28], facing: "left" },
  },
  landmark: { name: "해솔", tile: PINE },
  portals: [
    { id: "gaseol-front", rect: "gaseol:door", to: "gaseolgwan-stairs", spawn: "front-door" },
    { id: "gaseol-side", rect: "gaseol:side-door", to: "gaseol-1f", spawn: "yard" },
    { id: "gaseol-2f", rect: { x: 9, y: 22, w: 3, h: 1 }, to: "gaseol-2f", spawn: "yard" },
    { id: "gaseol-4f", rect: { x: 1, y: 19, w: 2, h: 1 }, to: "gaseol-4f", spawn: "fire-escape" },
    { id: "jeungmyeong", rect: "jeungmyeong:door", to: "jeungmyeong", spawn: "yard" },
    { id: "silheom", rect: "silheom:door", to: "silheom", spawn: "yard" },
    { id: "cafeteria", rect: "canteen:door", to: "cafeteria", spawn: "yard" },
    { id: "lounge", rect: "lounge:door", to: "lounge", spawn: "yard" },
    { id: "saebyeok", rect: { x: 22, y: 55, w: 3, h: 1 }, to: "saebyeok", spawn: "walkway" },
    { id: "field", rect: { x: 75, y: 27, w: 1, h: 3 }, to: "campus-field", spawn: "yard" },
  ],
  interactables: [
    { id: "vending", kind: "shop", rect: { x: 47, y: 44, w: 2, h: 1 } },
    { id: "corkboard", kind: "board", rect: { x: 54, y: 44, w: 2, h: 1 } },
    { id: "menu", kind: "notice", rect: { x: 49, y: 46, w: 1, h: 1 } },
    { id: "history", kind: "hall-of-fame", rect: "history:door" },
    { id: "hatch", kind: "locked", rect: { x: 67, y: 45, w: 2, h: 1 } },
    { id: "haesol", kind: "sit", rect: { x: 18, y: 28, w: 5, h: 2 } },
    { id: "notice", kind: "notice", rect: { x: 33, y: 23, w: 2, h: 1 } },
    { id: "binocular", kind: "lore", rect: { x: 66, y: 5, w: 1, h: 1 } },
    { id: "ev", kind: "lore", rect: { x: 16, y: 44, w: 2, h: 1 } },
  ],
  zones: [
    { id: "campus", kind: "safe", rect: { x: 0, y: 0, w: 76, h: 56 } },
    { id: "haesol-ring", kind: "gather", rect: { x: 15, y: 25, w: 12, h: 9 } },
    { id: "canteen-plaza", kind: "gather", rect: { x: 34, y: 44, w: 36, h: 6 } },
    { id: "lookout", kind: "gather", rect: { x: 58, y: 5, w: 16, h: 6 } },
  ],
};

export default map;
