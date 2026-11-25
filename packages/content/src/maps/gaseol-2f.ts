import type { LightSource, MapSource, TileRect } from "./format.ts";
import { interiorWalls, mountY } from "./interior.ts";
import type { Light, Prop } from "./layers.ts";

/**
 * 가설관 2층 and 3층 at 10:10, the break after second period. Morning light comes in cold and
 * white; the classrooms are half empty, bags on the chairs, a curtain out of an open window. On
 * 2층 everyone is crowded at the 수행평가 board, because that is where the day starts. Upstairs
 * the 2학년 rooms, and the 동아리실 corridor: a row of doors with posters, each a club's room.
 * The two floors join by the east stair; the stair core opens off both west ends, the skybridge
 * to 증명관 off 2층's east end, and the outside stair down to the yard.
 */

const T = 16;

const PLAN = `
  ########################################################
  #lllllllllllllllll#lllllllllllllllll####################
  #lllllllllllllllll#lllllllllllllllll####################
  #lllllllllllllllll#lllllllllllllllll####################
  #lllllllllllllllll#lllllllllllllllll####################
  #lllllllllllllllll#lllllllllllllllll####################
  #lllllllllllllllll#lllllllllllllllll####################
  #lllllllllllllllll#lllllllllllllllll####################
  #lllllllllllllllll#lllllllllllllllll####################
  #lllllllllllllllll#lllllllllllllllll####################
  #lllllllllllllllll#lllllllllllllllll####################
  #lllllllllllllllll#lllllllllllllllll####################
  #lllllllllllllllll#lllllllllllllllll####################
  ###DD########DD######DD########DD#######################
  ttttttttttttttttttttttttttttttttttttttttttttttttttttttt#
  ttttttttttttttttttttttttttttttttttttttttttttttttttttttt#
  ttttttttttttttttttttttttttttttttttttttttttttttttttttttt#
  ttttttttttttttttttttttttttttttttttttttttttttttttttttttt#
  ttttttttttttttttttttttttttttttttttttttttttttttttttttttt#
  ttttttttttttttttttttttttttttttttttttttttttttttttttttttt#
  ttttttttttttttttttttttttttttttttttttttttttttttttttttttt#
  ##################################################ssss##
  #lllllllllllllllll#lllllllllllllllll##############ssss##
  #lllllllllllllllll#lllllllllllllllll##############ssss##
  #lllllllllllllllll#lllllllllllllllll##############ssss##
  #lllllllllllllllll#lllllllllllllllll##############ssss##
  #lllllllllllllllll#lllllllllllllllll##############ssss##
  #lllllllllllllllll#lllllllllllllllll##############ssss##
  #lllllllllllllllll#lllllllllllllllll#tttttttttttt#ssss##
  #lllllllllllllllll#lllllllllllllllll#tttttttttttt#ssss##
  #lllllllllllllllll#lllllllllllllllll#tttttttttttt#ssss##
  #lllllllllllllllll#lllllllllllllllll#tttttttttttt#ssss##
  #lllllllllllllllll#lllllllllllllllll#tttttttttttt#ssss##
  #lllllllllllllllll#lllllllllllllllll#tttttttttttt#ssss##
  ###DD########DD######DD########DD####tttttttttttt#ssss##
  ttttttttttttttttttttttttttttttttttttttttttttttttttttttt#
  ttttttttttttttttttttttttttttttttttttttttttttttttttttttt#
  ttttttttttttttttttttttttttttttttttttttttttttttttttttttt#
  tttttttttttttttttttttttttttttttttttttttttttttttttttttttt
  tttttttttttttttttttttttttttttttttttttttttttttttttttttttt
  tttttttttttttttttttttttttttttttttttttttttttttttttttttttt
  tttttttttttttttttttttttttttttttttttttttttttttttttttttttt
  ########tt##############################################
`;

const DOOR = { prop: "door-double", frame: "open" } as const;
const walls = interiorWalls(PLAN, {
  walls: "#",
  faces: { l: "wall-cream", t: "wall-corridor", s: "wall-corridor" },
  doors: { D: DOOR },
  seed: 1010,
});

/** A classroom: board, windows, the teacher's desk, desks in rows, 사물함 at the back. */
function classroom(x0: number, wallRow: number, look: number): (Prop & { foot?: TileRect })[] {
  const px = x0 * T;
  const wall = mountY(wallRow);
  const floor0 = wallRow + 4;
  const out: (Prop & { foot?: TileRect })[] = [
    { prop: "window", frame: look % 2 ? "day-curtain" : "day", at: [px + 24, wall] },
    { prop: "blackboard", frame: look % 3 ? "written" : "clean", at: [px + 136, wall] },
    { prop: "window", frame: "day", at: [px + 248, wall] },
    { prop: "wall-clock", anim: "tick", play: true, at: [px + 208, wall] },
    {
      prop: "teacher-desk",
      frame: look % 2 ? "tidy" : "buried",
      at: [px + 136, (floor0 + 3) * T - 2],
      foot: { x: x0 + 7, y: floor0 + 2, w: 3, h: 1 },
    },
  ];
  const items = ["books", "open", "none", "books", "none", "open", "none", "books", "open", "none"];
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 5; c++) {
      const i = (r * 5 + c + look) % items.length;
      const x = px + 48 + c * 44;
      const y = (floor0 + 5 + r * 2) * T - 4;
      out.push({ prop: "school-desk", frame: items[i] as string, at: [x, y] });
      if ((i + r) % 4 !== 1) out.push({ prop: "school-chair", frame: "back", at: [x, y + 10] });
      if ((i + c) % 5 === 2)
        out.push({
          prop: "bag",
          frame: ["navy", "red", "green", "slump"][(i + r) % 4] as string,
          at: [x + 10, y + 12],
        });
    }
  }
  out.push(
    {
      prop: "lockers",
      frame: look % 2 ? "open" : "shut",
      at: [px + 120, (floor0 + 9) * T - 2],
      foot: { x: x0 + 6, y: floor0 + 8, w: 3, h: 1 },
    },
    {
      prop: "lockers",
      frame: "shut",
      at: [px + 170, (floor0 + 9) * T - 2],
      foot: { x: x0 + 9, y: floor0 + 8, w: 3, h: 1 },
    },
  );
  return out;
}

/** Morning sun through a window, short and white. */
const sun = (x: number, row: number): Light => ({
  bands: ["campus"],
  spill: { top: [x - 13, x + 13, mountY(row) + 2], bottom: [x - 30, x + 6, mountY(row) + 70] },
  ragged: 2,
});
const sunSource = (x: number, row: number): LightSource => ({
  at: [x - 10, mountY(row) + 40],
  radius: 60,
  color: "stone.bright",
  intensity: 0.4,
  paint: sun(x, row),
});

const CLUBS = [600, 648, 696, 744, 792, 840];
const BOARD: [number, number] = [688, mountY(27)];

const map: MapSource = {
  id: "gaseol-2f",
  name: "가설관 2층·3층",
  seed: 1010,
  time: { clock: "10:10", phase: "morning", weather: "clear" },
  theme: "campus-dusk",
  sky: "ink.deep",
  ambient: { color: "stone.bright", intensity: 0.82 },
  plan: PLAN,
  legend: {
    "#": { terrain: "terrazzo", solid: "#" },
    D: { terrain: "terrazzo" },
    t: { terrain: "terrazzo" },
    s: { terrain: "terrazzo" },
    l: { terrain: "lino" },
  },
  edges: [{ overlay: "wall-top", inside: "#" }],
  blocks: walls.blocks,
  details: [
    // The east stair, rising from 2층 to 3층.
    ...[22, 25, 28, 31].flatMap((row): Prop[] => [
      { prop: "stairs", frame: "up", at: [800, row * T] },
      { prop: "stairs", frame: "up", at: [832, row * T] },
    ]),
    { prop: "floor-marks", frame: "scraps", at: [660, 560] },
    { prop: "floor-marks", frame: "puddle", at: [200, 300] },
  ],
  shadows: walls.shadows,
  objects: [
    ...walls.objects,
    // 3층: two 2학년 classrooms, the club doors.
    ...classroom(1, 0, 1),
    ...classroom(19, 0, 2),
    ...CLUBS.flatMap((x, i): Prop[] => [
      { prop: "door-slide", frame: "shut", at: [x, mountY(13)] },
      { prop: "poster", frame: i % 2 ? "club" : "chart", at: [x + 20, mountY(13)] },
    ]),
    { prop: "exit-sign", at: [16, mountY(13)] },
    { prop: "notice", frame: "l", at: [80, mountY(13)] },
    { prop: "notice", frame: "b", at: [96, mountY(13)] },
    { prop: "notice", frame: "r", at: [112, mountY(13)] },
    { prop: "notice", frame: "l", at: [368, mountY(13)] },
    { prop: "notice", frame: "c", at: [384, mountY(13)] },
    { prop: "notice", frame: "r", at: [400, mountY(13)] },
    { prop: "extinguisher", at: [552, 334], foot: { x: 34, y: 20, w: 1, h: 1 } },
    { prop: "umbrella", at: [12, 330] },
    // 2층: two 1학년 classrooms, the board hall.
    ...classroom(1, 21, 3),
    ...classroom(19, 21, 4),
    { prop: "quest-board", at: BOARD },
    { prop: "notice", frame: "l", at: [616, mountY(27)] },
    { prop: "notice", frame: "a", at: [632, mountY(27)] },
    { prop: "notice", frame: "r", at: [648, mountY(27)] },
    { prop: "ranking-sheet", at: [752, mountY(27)] },
    { prop: "poster", frame: "chart", at: [776, mountY(27)] },
    { prop: "exit-sign", at: [16, mountY(34)] },
    { prop: "notice", frame: "l", at: [80, mountY(34)] },
    { prop: "notice", frame: "c", at: [96, mountY(34)] },
    { prop: "notice", frame: "r", at: [112, mountY(34)] },
    { prop: "poster", frame: "safety", at: [400, mountY(34)] },
    { prop: "sad-plant", at: [600, 510], foot: { x: 37, y: 31, w: 1, h: 1 } },
    { prop: "sad-plant", at: [776, 510], foot: { x: 48, y: 31, w: 1, h: 1 } },
    { prop: "mop-bucket", at: [24, 660] },
    { prop: "extinguisher", at: [880, 590] },
  ],
  overhead: [
    { prop: "entropy", anim: "sleep", play: true, at: [24 + 304, mountY(21) - 15], raw: true },
  ],
  lights: [
    ...[24, 248, 312, 536].map((x) => sunSource(x + 16, 0)),
    ...[24, 248, 312, 536].map((x) => sunSource(x + 16, 21)),
  ],
  emitters: [
    {
      sprite: "mote",
      area: { x: 16, y: 80, w: 560, h: 520 },
      count: 20,
      life: 6,
      velocity: [-4, 3],
    },
  ],
  spawns: {
    main: { tile: [42, 38], facing: "up" },
    "stairs-2f": { tile: [1, 39], facing: "right" },
    "stairs-3f": { tile: [1, 18], facing: "right" },
    yard: { tile: [8, 40], facing: "up" },
    skybridge: { tile: [54, 39], facing: "left" },
  },
  landmark: { name: "수행평가 게시판", tile: [43, 30] },
  portals: [
    { id: "stairs-3f", rect: { x: 0, y: 17, w: 1, h: 4 }, to: "gaseolgwan-stairs", spawn: "3f" },
    { id: "stairs-2f", rect: { x: 0, y: 38, w: 1, h: 4 }, to: "gaseolgwan-stairs", spawn: "2f" },
    {
      id: "outside-stair",
      rect: { x: 8, y: 42, w: 2, h: 1 },
      to: "campus-yard",
      spawn: "gaseol-2f",
    },
    { id: "skybridge", rect: { x: 55, y: 38, w: 1, h: 4 }, to: "jeungmyeong", spawn: "skybridge" },
    ...CLUBS.map((x, i) => ({
      id: `club-${i + 1}`,
      rect: { x: Math.floor(x / T) - 1, y: 17, w: 2, h: 1 },
      to: `club-${i + 1}`,
      spawn: "door",
    })),
  ],
  interactables: [
    { id: "quest-board", kind: "quests", rect: { x: 40, y: 30, w: 6, h: 1 } },
    { id: "ranking", kind: "notice", rect: { x: 46, y: 30, w: 2, h: 1 } },
  ],
  zones: [
    { id: "floors", kind: "safe", rect: { x: 0, y: 0, w: 56, h: 43 } },
    { id: "gaseolgwan-3f", kind: "room", rect: { x: 0, y: 0, w: 56, h: 21 }, name: "가설관 3층" },
    { id: "gaseolgwan-2f", kind: "room", rect: { x: 0, y: 21, w: 56, h: 22 }, name: "가설관 2층" },
    { id: "board-hall", kind: "gather", rect: { x: 37, y: 31, w: 12, h: 10 } },
  ],
  marks: { board: [43, 30], "club-corridor": [44, 18] },
  npcs: [
    { speaker: "hyunwoo", tile: [40, 33], facing: "up" },
    { speaker: "garam", tile: [46, 34], facing: "left" },
    { speaker: "senior-physics", tile: [30, 18] },
    { speaker: "senior-bio", tile: [14, 39] },
  ],
};

export default map;
