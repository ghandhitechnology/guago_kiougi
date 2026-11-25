import { type Light, type Prop, scene } from "../scene.ts";

/**
 * study-room-night: 가설관 4F, 23:38, the second week of school, two minutes before the page
 * tears. The front tubes are off so the sleepers can sleep; the 졸방대 end of the room is still
 * lit, the carrel lamps make their own small rooms, and by the door the water cooler hums
 * beside the log book you sign to leave your seat. Out of the windows the 운동장 is dark and the
 * city across the water is not. 엔트로피 is on the sill, waiting for something. Out in the
 * corridor 권 사감 is doing her round and the stairs go down into the dark.
 */

const WALL_Y = 63;
const MOUNT_Y = WALL_Y + 1;

/** A run of back wall from x0 to x1, with its corner pieces. */
function wallRun(prop: string, x0: number, x1: number, worn: readonly number[] = []): Prop[] {
  const out: Prop[] = [];
  for (let x = x0; x < x1; x += 16) {
    const frame = x === x0 ? "end-l" : x + 16 >= x1 ? "end-r" : worn.includes(x) ? "worn" : "run";
    out.push({ prop, frame, at: [x, WALL_Y] });
  }
  return out;
}

const TUBE = ["campus", "campus-lamp", "campus-dusk", "campus-glow"];

/** Carrel x positions: eight to a row, 25 apart, sharing outlines. */
const COLS = Array.from({ length: 8 }, (_, i) => 153 + i * 25);
const ROWS = [118, 170, 222];

type Seat = { frame: string; anim?: string; chair?: string; lamp?: boolean };
/** What each carrel holds, row by row. Lit carrels throw a small pool of light. */
const SEATS: readonly (readonly Seat[])[] = [
  [
    { frame: "bare" },
    { frame: "books" },
    { frame: "study", lamp: true, chair: "back" },
    { frame: "notes" },
    { frame: "gone", chair: "recline" },
    { frame: "books" },
    { frame: "bare" },
    { frame: "study", lamp: true, chair: "back" },
  ],
  [
    { frame: "books" },
    { frame: "study", lamp: true, chair: "back" },
    { frame: "bare" },
    { frame: "asleep0", anim: "asleep", lamp: true, chair: "back" },
    { frame: "notes" },
    { frame: "bare" },
    { frame: "gone", chair: "back" },
    { frame: "books" },
  ],
  [
    { frame: "bare" },
    { frame: "notes" },
    { frame: "books" },
    { frame: "study", lamp: true, chair: "back" },
    { frame: "bare" },
    { frame: "study-off" },
    { frame: "bare" },
    { frame: "bare" },
  ],
];

const carrels: Prop[] = [];
const carrelLights: Light[] = [];
SEATS.forEach((row, r) => {
  const y = ROWS[r] as number;
  row.forEach((seat, c) => {
    const x = COLS[c] as number;
    carrels.push(
      seat.anim
        ? { prop: "carrel", anim: seat.anim, play: true, at: [x, y] }
        : { prop: "carrel", frame: seat.frame, at: [x, y] },
    );
    carrels.push({
      prop: "study-chair",
      frame: seat.chair ?? "back",
      at: [x, y + (seat.chair ? 9 : 4)],
    });
    if (seat.lamp)
      carrelLights.push({
        bands: ["campus-lamp", "campus-dusk"],
        at: [x + 1, y - 8],
        r: [13, 15],
        ragged: 2,
      });
  });
});

export default scene({
  name: "study-room-night",
  seed: 238,
  theme: "campus-night",
  sky: "ink.deep",
  legend: {
    "#": { terrain: "lino" },
    "%": { terrain: "terrazzo" },
    w: { terrain: "lino" },
    t: { terrain: "terrazzo" },
    m: { terrain: "mat" },
  },
  ground: `
    %%%%%#########################
    ttttt#wwwwwwwwwwwwwwwwwwwwwwww
    ttttt#wwwwwwwwwwwwwwwwwwwwwwww
    ttttt#wwwwwwwwwwwwwwwwwwwwwwww
    ttttt#wwwwwwwwwwwwwwwwwwwwwwww
    ttttt#wwwwwwwwwwwwwwwwwwwwwwww
    tttttwwwwwwwwwwwwwwwwwwwwwwwww
    tttttwwwwwwwwwwwwwwwwwwwwwwwww
    ttttt#wwwwwwwwwwwwwwwwwwwwwwww
    ttttt#wwwwwwwwwwwwwwwwwwwwwwww
    ttttt#wwwwwwwwwwwwwwwwwwwwwwww
    ttttt#wwwwwwwwwwwwwwwwwwwwwwww
    ttttt#wwwwwwwwwwwwwwwwwwwwwwww
    ttttt#wwwwwwwwwwwwwwwwwwwwwwww
    ttttt#wwwwwwwwwwwwwwwwwwwwwwww
    ttttt#wwwwwwwwwwwwwwwwwwwwwwww
    ttttt#wwwwwwwwwwwwwwwwwwwwwwww
  `,
  details: [{ prop: "stairs", frame: "down", at: [12, 150] }],
  edges: [{ overlay: "wall-top", inside: "#%" }],
  shadows: [
    { prop: "wall-shade", frame: "corner", at: [96, 79] },
    ...[95, 127, 143, 159, 175, 191, 207, 223, 239, 255, 271].map(
      (y): Prop => ({ prop: "wall-shade", frame: "v", at: [96, y] }),
    ),
  ],
  objects: [
    // The corridor wall, its notice strip, the exit sign over the stairs.
    ...wallRun("wall-corridor", 0, 80, [32]),
    { prop: "notice", frame: "l", at: [0, MOUNT_Y] },
    { prop: "notice", frame: "b", at: [16, MOUNT_Y] },
    { prop: "exit-sign", at: [60, MOUNT_Y] },
    // The study room's back wall: windows onto the field, the clock, the ranking.
    ...wallRun("wall-cream", 96, 480, [208, 320, 448]),
    { prop: "ranking-sheet", at: [140, MOUNT_Y] },
    { prop: "window", frame: "night", at: [184, MOUNT_Y] },
    { prop: "window", frame: "night", at: [240, MOUNT_Y] },
    { prop: "wall-clock", anim: "tick", play: true, at: [292, MOUNT_Y] },
    { prop: "window", frame: "night", at: [344, MOUNT_Y] },
    { prop: "window", frame: "night", at: [400, MOUNT_Y] },
    { prop: "window", frame: "night-curtain", at: [456, MOUNT_Y] },
    // By the door: the cooler and the log book.
    { prop: "water-cooler", anim: "glug", play: true, at: [112, 76] },
    { prop: "log-stand", at: [132, 76] },
    ...carrels,
    // What people left: bags by the chairs, a stack of workbooks, 실내화 kicked off under the
    // 졸방대, the umbrella by the door since March, the extinguisher nobody has checked.
    { prop: "bag", frame: "navy", at: [217, 130] },
    { prop: "bag", frame: "slump", at: [192, 183] },
    { prop: "bag", frame: "red", at: [342, 130] },
    { prop: "bag", frame: "green", at: [267, 234] },
    { prop: "textbooks", frame: "tall", at: [142, 183] },
    { prop: "textbooks", frame: "stack", at: [350, 236] },
    { prop: "slippers", frame: "scattered", at: [452, 236] },
    { prop: "slippers", frame: "pair", at: [376, 160] },
    { prop: "umbrella", at: [74, 96] },
    { prop: "extinguisher", at: [74, 210] },
    { prop: "poster", frame: "safety", at: [36, MOUNT_Y] },
    // The 졸방대 at the lit end.
    { prop: "jolbangdae", at: [420, 150] },
    { prop: "jolbangdae", at: [420, 220] },
    // Who is up: one leaning on the 졸방대, one behind it fighting a yawn, the player on the way
    // to the cooler, and in the corridor 권 사감 on her round.
    { rig: "student", look: "club", dir: "up", anim: "idle", play: true, at: [402, 160] },
    { rig: "student", look: "bedhead", dir: "down", anim: "yawn", play: true, at: [440, 139] },
    { rig: "student", look: "reader", dir: "up", anim: "idle", play: true, at: [228, 230] },
    { rig: "student", look: "blazer", dir: "up", anim: "walk", play: true, at: [126, 120] },
    { rig: "sagam", look: "duty", dir: "side", anim: "idle", play: true, at: [44, 124] },
  ],
  overhead: [
    // On the desks: the cup noodles of whoever went to the cooler for hot water, tumblers on the
    // 졸방대.
    { prop: "cup-noodles", anim: "steam", play: true, at: [255, 101] },
    { prop: "tumbler", at: [400, 133] },
    { prop: "tumbler", at: [446, 203] },
    { prop: "entropy", anim: "sleep", play: true, at: [400, 49], raw: true },
    { prop: "tube-light", anim: "flicker", play: true, at: [130, 80] },
    { prop: "tube-light", frame: "off", at: [222, 80] },
    { prop: "tube-light", frame: "off", at: [316, 80] },
    { prop: "tube-light", frame: "on", at: [404, 80] },
  ],
  lights: [
    { bands: TUBE, at: [420, 114], r: [74, 40], ragged: 4 },
    { bands: TUBE, at: [420, 210], r: [74, 40], ragged: 4 },
    {
      bands: ["campus-dusk", "campus-glow"],
      at: [140, 100],
      r: [60, 44],
      ragged: 4,
      pulse: { amount: 0.05, period: 0.7 },
    },
    ...carrelLights,
    // Moonlight, barely, under each window.
    ...[184, 240, 344].map(
      (x): Light => ({
        bands: ["campus-glow"],
        spill: { top: [x - 12, x + 12, 66], bottom: [x - 2, x + 30, 104] },
        ragged: 2,
      }),
    ),
    // The doorway lets the room's light into the corridor.
    {
      bands: ["campus-glow"],
      spill: { top: [80, 96, 96], bottom: [0, 96, 190] },
      ragged: 3,
    },
    { bands: ["campus-glow"], at: [64, 44], r: [26, 16], ragged: 2 },
  ],
});
