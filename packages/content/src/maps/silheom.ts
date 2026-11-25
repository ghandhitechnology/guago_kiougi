import type { LightSource, MapSource } from "./format.ts";
import { backWall, mount, mountY, sideShade } from "./interior.ts";
import type { Prop } from "./layers.ts";
import { place } from "./props.ts";

/**
 * 실험동 at 09:40 on a hazy morning, every floor of it in one map: the stairwell on the west
 * side climbs past each floor's door. The first floor is empty, so empty that the dust still
 * holds the shape of the club's electric car, pushed outside at last. 화학 on the second
 * smells of the fume hoods and keeps its goggles under purple light. 물리 on the third has
 * 0조's interferometer on its bench in the middle of the room, a door whose lock beeps every
 * time, and a Van de Graaff that bites. 생명 on the top floor is jars and seedlings and the
 * skeleton by the window. These are the rooms later Pages
 * will tear open; each already looks like its subject.
 */

const T = 16;
/** Cap rows of each floor, top to bottom: 4F, 3F, 2F, 1F. */
const F4 = 0;
const F3 = 12;
const F2 = 24;
const F1 = 36;
/** The floor area, east of the stairwell's wall. */
const X0 = 6;
const X1 = 33;

/** Morning sun through a window onto the floor below it. */
const sun = (cx: number, cap: number): LightSource => ({
  at: [cx + 14, mountY(cap) + 40],
  radius: 60,
  color: "gold.pale",
  intensity: 0.7,
  paint: {
    bands: ["campus-lamp"],
    spill: {
      top: [cx - 13, cx + 13, mountY(cap) + 2],
      bottom: [cx + 4, cx + 44, mountY(cap) + 84],
    },
    ragged: 2,
  },
});

/** Two flights up between floors, laid over the stairwell's stair rows. */
const flights = (cap: number): Prop[] => [
  { prop: "stairs", frame: "up", at: [16, cap * T + 8] },
  { prop: "stairs", frame: "up", at: [48, cap * T + 8] },
];

/** The stairwell's shadow and each floor's, cast by the wall on their west. */
const shades: Prop[] = [
  ...sideShade(1, 4, 48),
  ...[F4, F3, F2, F1].flatMap((cap) => sideShade(X0, cap + 4, cap + 12)),
];

const map: MapSource = {
  id: "silheom",
  name: "실험동",
  seed: 940,
  time: { clock: "09:40", phase: "morning", weather: "haze" },
  theme: "campus",
  sky: "ink.deep",
  ambient: { color: "stone.bright", intensity: 0.78, unlit: "campus" },
  plan: `
    ##################################
    #vvvv#|||||||||||||||||||||||||||#
    #vvvv#|||||||||||||||||||||||||||#
    #vvvv#|||||||||||||||||||||||||||#
    #hhhh#___________________________#
    #hhhh#___________________________#
    #hhhh____________________________#
    #hhhh____________________________#
    #hhhh#___________________________#
    #hhhh#___________________________#
    #hhhh#___________________________#
    #hhhh#___________________________#
    #ssss#############################
    #ssss#|||||||||||||||||||||||||||#
    #ssss#|||||||||||||||||||||||||||#
    #ssss#|||||||||||||||||||||||||||#
    #hhhh#___________________________#
    #hhhh#___________________________#
    #hhhh____________________________#
    #hhhh____________________________#
    #hhhh#___________________________#
    #hhhh#___________________________#
    #hhhh#___________________________#
    #hhhh#___________________________#
    #ssss#############################
    #ssss#|||||||||||||||||||||||||||#
    #ssss#|||||||||||||||||||||||||||#
    #ssss#|||||||||||||||||||||||||||#
    #hhhh#___________________________#
    #hhhh#___________________________#
    #hhhh____________________________#
    #hhhh____________________________#
    #hhhh#___________________________#
    #hhhh#___________________________#
    #hhhh#___________________________#
    #hhhh#___________________________#
    #ssss#############################
    #ssss#|||||||||||||||||||||||||||#
    #ssss#|||||||||||||||||||||||||||#
    #ssss#|||||||||||||||||||||||||||#
    #hhhh#ttttttttttttttttttttttttttt#
    #hhhh#ttttttttttttttttttttttttttt#
    #hhhhtttttttttttttttttttttttttttt#
    #hhhhtttttttttttttttttttttttttttt#
    #hhhh#ttttttttttttttttttttttttttt#
    #hhhh#ttttttttttttttttttttttttttt#
    #hhhh#tttttttttttmmmmtttttttttttt#
    #hhhh#tttttttttttmmmmtttttttttttt#
    #################tttt#############
  `,
  legend: {
    "#": { terrain: "lino", solid: "#" },
    "|": { terrain: "lino", solid: "#" },
    v: { terrain: "terrazzo", solid: "#" },
    _: { terrain: "lino" },
    h: { terrain: "terrazzo" },
    s: { terrain: "terrazzo" },
    t: { terrain: "terrazzo" },
    m: { terrain: "mat" },
  },
  edges: [{ overlay: "wall-top", inside: "#" }],
  details: [
    ...flights(F3),
    ...flights(F2),
    ...flights(F1),
    { prop: "floor-marks", frame: "scorch", at: [180, 486] },
    { prop: "floor-marks", frame: "puddle", at: [496, 438] },
    { prop: "floor-marks", frame: "scraps", at: [290, 700] },
    { prop: "ev-ghost", at: [296, 676] },
    { prop: "charge-cable", at: [304, 642] },
  ],
  shadows: shades,
  objects: [
    // The stairwell's own back wall at the top.
    ...backWall("wall-corridor", 1, 5, F4),
    // 4F 생명: jars and seedlings on the wall side, benches with microscopes, the aquarium,
    // the skeleton in the corner by the window.
    ...backWall("wall-tiled", X0, X1, F4, { worn: [14] }),
    mount("window", 200, F4, { frame: "day" }),
    mount("poster", 248, F4, { frame: "chart" }),
    mount("window", 400, F4, { frame: "day-curtain" }),
    mount("wall-clock", 344, F4, { anim: "tick", play: true }),
    place("specimen-shelf", 6, 4),
    place("grow-rack", 8, 4, { anim: "hum", play: true }),
    place("fish-tank", 16, 4, { anim: "swim", play: true }),
    place("monstera", 31, 4),
    place("skeleton", 32, 4),
    place("lab-bench", 10, 6),
    place("lab-bench", 19, 6),
    place("lab-bench", 10, 9),
    place("lab-bench", 19, 9),
    ...[7, 10].flatMap((y) =>
      [11, 13, 20, 22].map((x): Prop => ({ prop: "stool", at: [x * T + 8, (y + 1) * T - 4] })),
    ),

    // 3F 물리: the beeping door, the scope and the generator, the air track, and in the
    // middle of the room 0조's interferometer.
    ...backWall("wall-cream", X0, X1, F3, { worn: [18, 27] }),
    mount("beep-door", 118, F3, { anim: "blink", play: true }),
    mount("poster", 280, F3, { frame: "chart" }),
    mount("window", 328, F3, { frame: "day" }),
    mount("window", 456, F3, { frame: "day" }),
    mount("blackboard", 200, F3, { frame: "written" }),
    place("scope-cart", 26, 16, { anim: "trace", play: true }),
    place("van-de-graaff", 32, 16, { anim: "spark", play: true }),
    place("air-track", 6, 18),
    place("interferometer", 19, 18, { anim: "shift", play: true }),
    // 0조's things, left where they were: the report drafts, a bag, the logbook stand.
    { prop: "textbooks", frame: "tall", at: [392, 300] },
    { prop: "textbooks", frame: "stack", at: [292, 316] },
    { prop: "bag", frame: "slump", at: [408, 330] },
    place("log-stand", 18, 18),
    ...[19, 23].map((x): Prop => ({ prop: "stool", at: [x * T + 8, 20 * T - 4] })),
    place("lab-bench", 9, 21),
    place("lab-bench", 24, 21),
    ...[10, 12, 25, 27].map((x): Prop => ({ prop: "stool", at: [x * T + 8, 23 * T - 4] })),

    // 2F 화학: two fume hoods, the goggles under their lamp, the periodic table, the door to
    // the chemical store, the bottle cabinet and the green shower.
    ...backWall("wall-tiled", X0, X1, F2, { outlet: [12] }),
    mount("goggles-cabinet", 184, F2),
    mount("periodic-table", 264, F2),
    mount("door-slide", 344, F2, { frame: "shut" }),
    mount("window", 456, F2, { frame: "day" }),
    place("fume-hood", 6, 28, { frame: "on" }),
    place("fume-hood", 8, 28, { frame: "off" }),
    place("bottle-cabinet", 26, 28),
    place("safety-shower", 32, 28),
    place("lab-bench", 10, 30),
    place("lab-bench", 19, 30),
    place("lab-bench", 10, 33),
    place("lab-bench", 19, 33),
    ...[31, 34].flatMap((y) =>
      [11, 13, 20, 22].map((x): Prop => ({ prop: "stool", at: [x * T + 8, (y + 1) * T - 4] })),
    ),

    // 1F: empty. Science fair posters on the wall, the car, chairs stacked, a tarp.
    ...backWall("wall-corridor", X0, X1, F1, { worn: [11, 22] }),
    mount("poster", 136, F1, { frame: "chart" }),
    mount("poster", 176, F1, { frame: "club" }),
    mount("notice", 224, F1, { frame: "l" }),
    mount("notice", 240, F1, { frame: "a" }),
    mount("notice", 256, F1, { frame: "c" }),
    mount("notice", 272, F1, { frame: "r" }),
    mount("window", 416, F1, { frame: "day" }),
    mount("window", 480, F1, { frame: "day" }),
    place("stacked-chairs", 6, 40),
    // Where the club's car stood until it was pushed outside: the dust round its shape, the
    // charger still on the wall, its cable to nowhere, a cone guarding the empty space.
    mount("ev-charger", 312, F1),
    { prop: "traffic-cone", at: [348, 704] },
    place("tarp", 29, 40),
    place("extinguisher", 6, 47),
  ],
  overhead: [
    // On the benches: microscopes on 4F, a beaker rack on 2F.
    { prop: "microscope", at: [184, 92] },
    { prop: "microscope", at: [216, 92] },
    { prop: "microscope", at: [328, 92] },
    { prop: "microscope", at: [184, 140] },
    { prop: "microscope", at: [344, 140] },
    // One tube still hanging on the empty floor, flickering.
    { prop: "tube-light", anim: "flicker", play: true, at: [432, 650] },
  ],
  lights: [
    sun(200, F4),
    sun(400, F4),
    sun(328, F3),
    sun(456, F3),
    sun(456, F2),
    sun(416, F1),
    sun(480, F1),
    // The grow lights' violet and the fume hood's lamp.
    {
      at: [144, 80],
      radius: 30,
      color: "plum.pale",
      intensity: 0.35,
      paint: { bands: ["campus-lamp"], at: [144, 86], r: [26, 10], ragged: 2 },
    },
    // The laser on the interferometer.
    {
      at: [344, 284],
      radius: 18,
      color: "red.light",
      intensity: 0.25,
    },
  ],
  emitters: [
    {
      sprite: "mote",
      area: { x: 380, y: 660, w: 150, h: 90 },
      count: 12,
      life: 7,
      velocity: [4, -2],
    },
  ],
  spawns: {
    main: { tile: [18, 46], facing: "up" },
    yard: { tile: [18, 46], facing: "up" },
    "2f": { tile: [3, 30], facing: "right" },
    "3f": { tile: [3, 18], facing: "right" },
    "4f": { tile: [3, 6], facing: "right" },
  },
  landmark: { name: "간섭계", tile: [21, 18] },
  portals: [
    { id: "yard", rect: { x: 17, y: 48, w: 4, h: 1 }, to: "campus-yard", spawn: "silheom" },
  ],
  interactables: [
    { id: "interferometer", kind: "lore", rect: { x: 19, y: 18, w: 5, h: 1 } },
    { id: "beep-door", kind: "lore", rect: { x: 7, y: 15, w: 2, h: 1 } },
    { id: "parking-spot", kind: "lore", rect: { x: 19, y: 43, w: 2, h: 1 } },
    { id: "skeleton", kind: "lore", rect: { x: 32, y: 4, w: 1, h: 1 } },
    { id: "periodic-table", kind: "notice", rect: { x: 15, y: 27, w: 3, h: 1 } },
    { id: "chem-store", kind: "locked", rect: { x: 21, y: 27, w: 1, h: 1 } },
    { id: "science-fair", kind: "notice", rect: { x: 8, y: 39, w: 4, h: 1 } },
  ],
  zones: [
    { id: "silheom", kind: "safe", rect: { x: 0, y: 0, w: 34, h: 49 } },
    { id: "bio", kind: "gather", rect: { x: 6, y: 4, w: 27, h: 8 } },
    { id: "physics", kind: "gather", rect: { x: 6, y: 16, w: 27, h: 8 } },
    { id: "chem", kind: "gather", rect: { x: 6, y: 28, w: 27, h: 8 } },
    { id: "ground", kind: "gather", rect: { x: 6, y: 40, w: 27, h: 8 } },
    { id: "bio-lab", kind: "room", name: "4층 생명과학실", rect: { x: 6, y: 4, w: 27, h: 8 } },
    { id: "physics-lab", kind: "room", name: "3층 물리실", rect: { x: 6, y: 16, w: 27, h: 8 } },
    { id: "chem-lab", kind: "room", name: "2층 화학실", rect: { x: 6, y: 28, w: 27, h: 8 } },
    { id: "silheom-1f", kind: "room", name: "실험동 1층", rect: { x: 6, y: 40, w: 27, h: 8 } },
  ],
  npcs: [
    { speaker: "senior-bio", tile: [25, 8] },
    { speaker: "senior-physics", tile: [15, 19] },
    { speaker: "senior-chem", tile: [25, 32] },
  ],
};

export default map;
