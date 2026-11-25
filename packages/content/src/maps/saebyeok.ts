import type { LightSource, MapSource, Thing } from "./format.ts";
import { backWall, mount, mountY, sideShade } from "./interior.ts";
import type { Prop } from "./layers.ts";
import { place } from "./props.ts";

/**
 * 새벽관 at 23:55, thirty-five minutes to 점호. You come in from the covered walk past the
 * 사감실's lit window, the whistle on its hook beside it, the 신발장 with one pair never put
 * away. The old wing's corridor runs east: a bunk room, a two-person room that has given up on
 * tidiness, the laundry with one machine still going. Then the corridor opens into the 신관's
 * galleries, which ring the courtyard everyone calls the 콜로세움: a square of pavers under the
 * night sky with lines painted on it, where duels happen and the galleries lean on the rail to
 * watch. The whole building counts as bed: log out anywhere here and you wake rested.
 */

const T = 16;
const TOP = 0;
/** The rooms' back walls: the corridor's south wall, its cap on row 7. */
const ROOMS = 7;
/** The courtyard and its railing ring. */
const COURT = { x0: 27, y0: 7, x1: 48, y1: 20 };
const GAPS_X = [37, 38];
const GAPS_Y = [13, 14];

/** The railing round the courtyard, piece by piece, posts either side of each gap. */
function railing(): Thing[] {
  const out: Thing[] = [];
  const { x0, y0, x1, y1 } = COURT;
  const at = (x: number, y: number): readonly [number, number] => [x * T, y * T + 15];
  for (let x = x0; x <= x1; x++) {
    for (const y of [y0, y1]) {
      const corner = x === x0 || x === x1;
      const gap = GAPS_X.includes(x);
      if (gap) continue;
      const nextToGap = GAPS_X.includes(x - 1) || GAPS_X.includes(x + 1);
      out.push({ prop: "rail", frame: corner || nextToGap ? "post" : "h", at: at(x, y) });
    }
  }
  for (let y = y0 + 1; y < y1; y++) {
    for (const x of [x0, x1]) {
      if (GAPS_Y.includes(y)) continue;
      const nextToGap = GAPS_Y.includes(y - 1) || GAPS_Y.includes(y + 1);
      out.push({ prop: "rail", frame: nextToGap ? "post" : "v", at: at(x, y) });
    }
  }
  return out;
}

/** Dorm room doors along a back wall: a number plate each, some with this week's green card. */
function doors(xs: readonly number[]): Prop[] {
  return xs.map((x, i) => mount("door-dorm", x, TOP, { frame: i % 3 === 1 ? "shut" : "card" }));
}

/** A ceiling light's pool along a corridor. */
const tube = (x: number, y: number, rx = 44, ry = 22): LightSource => ({
  at: [x, y],
  radius: rx,
  color: "stone.bright",
  intensity: 0.34,
  paint: { bands: ["campus-dusk", "campus-glow"], at: [x, y], r: [rx, ry], ragged: 3 },
});

const lights: LightSource[] = [
  // The 사감실's window, warm; the corridor's lights.
  {
    at: [120, 84],
    radius: 56,
    color: "gold.light",
    intensity: 1.1,
    paint: {
      bands: ["campus-lamp", "campus-dusk", "campus-glow"],
      spill: { top: [96, 144, 66], bottom: [80, 168, 112] },
      ragged: 3,
    },
  },
  tube(232, 86),
  tube(360, 86),
  tube(520, 86),
  tube(680, 86),
  tube(800, 86),
  // Rooms: desk lamps in the bunk room, the messy room's one bulb, the laundry's tube.
  tube(40, 236, 30, 18),
  tube(200, 260, 34, 22),
  tube(312, 220, 40, 30),
  // The galleries round the courtyard, and the courtyard under the moon.
  { ...tube(408, 240, 36, 60), color: "gold.light", intensity: 0.75 },
  { ...tube(808, 240, 36, 60), color: "gold.light", intensity: 0.75 },
  { ...tube(600, 350, 120, 16), color: "gold.light", intensity: 0.55 },
  {
    at: [600, 220],
    radius: 170,
    color: "navy.pale",
    intensity: 0.3,
    paint: { bands: ["campus-glow"], at: [600, 220], r: [168, 96], ragged: 6 },
  },
];

const map: MapSource = {
  id: "saebyeok",
  name: "새벽관",
  seed: 2355,
  time: { clock: "23:55", phase: "night", weather: "sea-wind" },
  theme: "campus-night",
  sky: "ink.deep",
  ambient: { color: "navy.dark", intensity: 0.28, unlit: "campus" },
  plan: `
    #####################################################
    #|||||||||||||||||||||||||||||||||||||||||||||||||||#
    #|||||||||||||||||||||||||||||||||||||||||||||||||||#
    #|||||||||||||||||||||||||||||||||||||||||||||||||||#
    #ttttttttttttttttttttttttttttttttttttttttttttttttttt#
    #ttttttttttttttttttttttttttttttttttttttttttttttttttt#
    #ttttttttttttttttttttttttttttttttttttttttttttttttttt#
    ####vv######vv#######ll#tttRRRRRRRRRRwwRRRRRRRRRRttt#
    #|||vv|||#||vv||#||||ll#tttRwwwwwwwwwwwwwwwwwwwwRttt#
    #|||vv|||#||vv||#||||ll#tttRwwwwwwwwwwwwwwwwwwwwRttt#
    #|||vv|||#||vv||#||||ll#tttRwwwwwwwwwwwwwwwwwwwwRttt#
    #vvvvvvvv#vvvvvv#llllll#tttRwwwwwwwwwwwwwwwwwwwwRttt#
    #vvvvvvvv#vvvvvv#llllll#tttRwwwwwwwwwwwwwwwwwwwwRttt#
    #vvvvvvvv#vvvvvv#llllll#tttwwwwwwwwwwwwwwwwwwwwwwttt#
    #vvvvvvvv#vvvvvv#llllll#tttwwwwwwwwwwwwwwwwwwwwwwttt#
    #vvvvvvvv#vvvvvv#llllll#tttRwwwwwwwwwwwwwwwwwwwwRttt#
    #vvvvvvvv#vvvvvv#llllll#tttRwwwwwwwwwwwwwwwwwwwwRttt#
    #vvvvvvvv#vvvvvv#llllll#tttRwwwwwwwwwwwwwwwwwwwwRttt#
    #vvvvvvvv#vvvvvv#llllll#tttRwwwwwwwwwwwwwwwwwwwwRttt#
    #vvvvvvvv#vvvvvv#llllll#tttRwwwwwwwwwwwwwwwwwwwwRttt#
    #vvvvvvvv#vvvvvv#llllll#tttRRRRRRRRRRwwRRRRRRRRRRttt#
    #vvvvvvvv#vvvvvv#llllll#tttttttttttttttttttttttttttt#
    #vvvvvvvv#vvvvvv#llllll#tttttttttttttttttttttttttttt#
    #####################################################
  `,
  legend: {
    "#": { terrain: "terrazzo", solid: "#" },
    "|": { terrain: "terrazzo", solid: "#" },
    t: { terrain: "terrazzo" },
    v: { terrain: "vinyl" },
    l: { terrain: "lino" },
    R: { terrain: "walk", solid: "#" },
    w: { terrain: "walk" },
  },
  edges: [{ overlay: "wall-top", inside: "#" }],
  details: [{ prop: "arena-lines", at: [28 * T, 8 * T] }],
  shadows: [
    ...sideShade(1, 4, 7),
    ...sideShade(1, 11, 23),
    ...sideShade(10, 11, 23),
    ...sideShade(17, 11, 23),
    ...sideShade(24, 7, 23),
  ],
  objects: [
    // The long back wall: the entrance, the 사감실, shoes, the notices, then a door every few
    // steps all the way along the gallery.
    ...backWall("wall-dorm", 1, 52, TOP, { worn: [14, 33], outlet: [20] }),
    mount("door-double", 48, TOP, { frame: "open" }),
    mount("sagam-window", 120, TOP, { frame: "lit" }),
    mount("whistle-hook", 152, TOP),
    mount("notice", 200, TOP, { frame: "l" }),
    mount("notice", 216, TOP, { frame: "b" }),
    mount("ranking-sheet", 236, TOP),
    mount("notice", 248, TOP, { frame: "r" }),
    ...doors([296, 344, 424, 488, 552, 616, 680, 744, 808]),
    place("shoe-cabinet", 10, 4),
    place("log-stand", 9, 4),
    place("water-cooler", 17, 4, { anim: "glug", play: true }),
    place("extinguisher", 22, 4),
    { prop: "slipper-pile", at: [300, 104] },
    { prop: "slipper-pile", at: [492, 104] },
    { prop: "slipper-pile", at: [748, 104] },

    // The rooms' back walls, cut by their doorways.
    ...backWall("wall-dorm", 1, 4, ROOMS, { ends: "left" }),
    ...backWall("wall-dorm", 6, 9, ROOMS, { ends: "right" }),
    ...backWall("wall-dorm", 10, 12, ROOMS, { ends: "left" }),
    ...backWall("wall-dorm", 14, 16, ROOMS, { ends: "right" }),
    ...backWall("wall-tiled", 17, 21, ROOMS, { ends: "left" }),

    // The bunk room: two bunks, desks, wardrobes, a rack of drying laundry.
    place("bunk-bed", 1, 11),
    place("bunk-bed", 6, 11),
    place("dorm-desk", 1, 14),
    place("dorm-desk", 7, 14),
    place("wardrobe", 1, 17, { frame: "open" }),
    place("wardrobe", 7, 17),
    place("drying-rack", 3, 20),
    { prop: "slipper-pile", at: [72, 196] },
    { prop: "bag", frame: "navy", at: [104, 300] },

    // The two-person room: unmade beds, clothes everywhere, the forbidden cup noodles.
    place("single-bed", 10, 11),
    place("single-bed", 14, 11),
    place("dorm-desk", 10, 15),
    place("dorm-desk", 14, 15),
    { prop: "clothes-pile", at: [200, 312] },
    { prop: "clothes-pile", at: [232, 360], flip: true },
    { prop: "laundry-basket", at: [184, 360] },
    { prop: "textbooks", frame: "tall", at: [244, 290] },

    // The laundry: washers on the wall, racks, baskets.
    place("washers", 17, 11, { anim: "spin", play: true }),
    place("drying-rack", 17, 15),
    place("drying-rack", 21, 18),
    { prop: "laundry-basket", at: [296, 240] },
    { prop: "mop-bucket", at: [348, 352] },

    // The courtyard: its railing, a bench in each gallery corner for the onlookers.
    ...railing(),
    place("bench", 24, 22),
    place("bench", 50, 22),
  ],
  overhead: [
    // The lintels over the rooms' doorways: you pass under them going in.
    { prop: "lintel", frame: "dorm", at: [4 * T, mountY(ROOMS) - 1] },
    { prop: "lintel", frame: "dorm", at: [12 * T, mountY(ROOMS) - 1] },
    { prop: "lintel", frame: "cream", at: [21 * T, mountY(ROOMS) - 1] },
    // On the desk in the bunk room: the noodles someone is not supposed to have.
    { prop: "cup-noodles", anim: "steam", play: true, at: [24, 218] },
    { prop: "desk-lamp", anim: "glow", play: true, at: [128, 214] },
    // 엔트로피 on the rail, watching the courtyard like everyone else.
    { prop: "entropy", anim: "idle", play: true, at: [456, 125], raw: true },
  ],
  lights,
  emitters: [
    {
      sprite: "mote",
      area: { x: 448, y: 128, w: 320, h: 192 },
      count: 8,
      life: 9,
      velocity: [-6, 2],
    },
  ],
  spawns: {
    main: { tile: [4, 6], facing: "down" },
    walkway: { tile: [4, 6], facing: "down" },
    colosseum: { tile: [37, 21], facing: "up" },
  },
  landmark: { name: "콜로세움", tile: [37, 13] },
  portals: [
    { id: "walkway", rect: { x: 2, y: 4, w: 2, h: 1 }, to: "campus-yard", spawn: "saebyeok" },
  ],
  interactables: [
    { id: "sagam-window", kind: "lore", rect: { x: 6, y: 3, w: 3, h: 1 } },
    { id: "whistle", kind: "lore", rect: { x: 9, y: 3, w: 1, h: 1 } },
    { id: "sign-out", kind: "notice", rect: { x: 9, y: 4, w: 1, h: 1 } },
    { id: "ranking", kind: "board", rect: { x: 12, y: 3, w: 4, h: 1 } },
    { id: "shoe-cabinet", kind: "lore", rect: { x: 10, y: 4, w: 3, h: 1 } },
    { id: "washers", kind: "lore", rect: { x: 17, y: 11, w: 3, h: 1 } },
    { id: "bunk-w", kind: "sit", rect: { x: 1, y: 11, w: 3, h: 1 } },
    { id: "bunk-e", kind: "sit", rect: { x: 6, y: 11, w: 3, h: 1 } },
    { id: "bed-w", kind: "sit", rect: { x: 10, y: 11, w: 2, h: 1 } },
    { id: "bed-e", kind: "sit", rect: { x: 14, y: 11, w: 2, h: 1 } },
    { id: "room-door", kind: "locked", rect: { x: 26, y: 3, w: 1, h: 1 } },
  ],
  zones: [
    { id: "dorm", kind: "logout", bonus: "sleep", rect: { x: 0, y: 0, w: 53, h: 24 } },
    { id: "old-wing", kind: "safe", rect: { x: 0, y: 0, w: 24, h: 24 } },
    { id: "gallery-n", kind: "safe", rect: { x: 24, y: 0, w: 29, h: 7 } },
    { id: "gallery-w", kind: "safe", rect: { x: 24, y: 7, w: 3, h: 14 } },
    { id: "gallery-e", kind: "safe", rect: { x: 49, y: 7, w: 4, h: 14 } },
    { id: "gallery-s", kind: "safe", rect: { x: 24, y: 21, w: 29, h: 3 } },
    { id: "lobby", kind: "gather", rect: { x: 1, y: 4, w: 12, h: 3 } },
    { id: "rail-n", kind: "gather", rect: { x: 27, y: 4, w: 22, h: 3 } },
    { id: "rail-s", kind: "gather", rect: { x: 27, y: 21, w: 22, h: 2 } },
    { id: "rail-w", kind: "gather", rect: { x: 24, y: 8, w: 3, h: 12 } },
    { id: "rail-e", kind: "gather", rect: { x: 49, y: 8, w: 3, h: 12 } },
    { id: "colosseum", kind: "room", name: "콜로세움", rect: { x: 28, y: 8, w: 20, h: 12 } },
    { id: "bunk-room", kind: "room", name: "4인실", rect: { x: 1, y: 11, w: 8, h: 12 } },
    { id: "double-room", kind: "room", name: "2인실", rect: { x: 10, y: 11, w: 6, h: 12 } },
    { id: "laundry", kind: "room", name: "세탁실", rect: { x: 17, y: 11, w: 6, h: 12 } },
  ],
  arenas: [{ id: "colosseum-floor", rect: { x: 28, y: 8, w: 20, h: 12 }, modes: ["1v1", "3v3"] }],
  npcs: [
    { speaker: "sagam", tile: [7, 5] },
    { speaker: "garam", tile: [20, 5] },
    { speaker: "senior-earth", tile: [50, 12], facing: "left" },
  ],
};

export default map;
