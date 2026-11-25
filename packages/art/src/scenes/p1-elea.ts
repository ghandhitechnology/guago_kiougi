import { type Doll, type Prop, scene } from "../scene.ts";

/**
 * p1-elea-track: 엘레아 경주로, week six. A racetrack under a stone colonnade, the start sill on
 * the left, 제논 hovering at the far end with the arrow hanging beside him. Every dash at him has
 * covered half the distance and no more; his afterimages hang where he stepped back from. So the
 * class stands in the limit circles instead: the half is full, a student holds the quarter, the
 * eighth is still open. Along the lower lane the arrow is frozen at every instant of its flight,
 * and the tortoise, who started first, is still ahead of everyone.
 */

const TRACK_Y = 150;
const LANE2 = 200;

const student = (
  look: string,
  at: readonly [number, number],
  anim: string,
  dir: "down" | "up" | "side" = "side",
  flip = false,
  index = 0,
): Doll => ({ rig: "student", look, dir, anim, play: true, index, at, flip });

const lines: Prop[] = [];
for (let x = 48; x < 448; x += 32) {
  for (const y of [118, 176, 226])
    lines.push({ prop: "p1-track", frame: "line", at: [x, y], raw: true });
}

const column = (x: number, y: number): Prop[] => [
  { prop: "column", frame: "whole", at: [x, y] },
  { prop: "column-capital", at: [x, y] },
];
const stoa = [24, 72, 120, 168, 216, 264, 312, 360, 408, 456].flatMap((x) => column(x, 70));

export default scene({
  name: "p1-elea-track",
  seed: 12,
  theme: "greece",
  legend: {
    m: { terrain: "marble" },
    d: { terrain: "dirt" },
    g: { terrain: "grass" },
  },
  ground: `
    mmmmmmmmmmmmmmmmmmmmmmmmmmmmmm
    mmmmmmmmmmmmmmmmmmmmmmmmmmmmmm
    mmmmmmmmmmmmmmmmmmmmmmmmmmmmmm
    mmmmmmmmmmmmmmmmmmmmmmmmmmmmmm
    mmmmmmmmmmmmmmmmmmmmmmmmmmmmmm
    gggggggggggggggggggggggggggggg
    gggddddddddddddddddddddddddggg
    ggddddddddddddddddddddddddddgg
    gddddddddddddddddddddddddddddg
    gddddddddddddddddddddddddddddg
    gddddddddddddddddddddddddddddg
    gddddddddddddddddddddddddddddg
    gddddddddddddddddddddddddddddg
    gddddddddddddddddddddddddddddg
    ggddddddddddddddddddddddddddgg
    gggggggggggggggggggggggggggggg
    gggggggggggggggggggggggggggggg
  `,
  details: [
    ...lines,
    { prop: "p1-track", frame: "start", at: [48, 122], raw: true },
    { prop: "p1-track", frame: "start", at: [48, 180], raw: true },
    // Half, quarter, eighth of what is left, painted where each dash stopped.
    { prop: "p1-mark", frame: "half", at: [224, 160], raw: true },
    { prop: "p1-mark", frame: "quarter", at: [304, 160], raw: true },
    { prop: "p1-mark", frame: "eighth", at: [344, 160], raw: true },
    // The limit circles: the half full, the quarter held, the eighth waiting.
    { prop: "p1-limit-96", frame: "full", at: [240, TRACK_Y], raw: true },
    { prop: "p1-limit-48", anim: "held", play: true, at: [320, TRACK_Y], raw: true },
    { prop: "p1-limit-24", frame: "open", at: [360, TRACK_Y], raw: true },
    // The arrow, frozen at every instant along the lower lane.
    ...[0, 1, 2, 3, 4, 5, 6, 7, 8].map(
      (k): Prop => ({
        prop: "p1-arrow-path",
        anim: "warn",
        play: true,
        index: k % 2,
        at: [370 - (k + 1) * 32, LANE2],
        flip: true,
        raw: true,
      }),
    ),
  ],
  objects: [
    ...stoa.filter((c) => c.prop === "column"),
    { prop: "drum", at: [452, 112] },
    { prop: "amphora", at: [16, 100] },
    // Where he stood a moment ago, and the moment before that.
    { actor: "boss-zeno-ghost", frame: "fade2", at: [340, TRACK_Y + 10] },
    { actor: "boss-zeno-ghost", frame: "fade1", at: [372, TRACK_Y + 10] },
    { actor: "boss-zeno", anim: "idle", play: true, at: [404, TRACK_Y + 10], flip: true },
    { actor: "tortoise", anim: "walk", play: true, shadow: "shadow-m/blob", at: [300, 128] },
    // In the circles.
    student("club", [236, 156], "idle", "side"),
    student("reader", [318, 154], "idle", "side"),
    // Dashing, and about to find out it was half.
    student("bedhead", [162, 150], "walk", "side"),
    // At the start sill, and on the lower lane out of the arrow's way.
    student("summer", [70, 132], "idle", "side"),
    student("curls", [66, 168], "idle", "side", false, 1),
    student("blazer", [146, 222], "walk", "up"),
    student("club", [210, 186], "walk", "down", false, 2),
    student("reader", [104, 240], "idle", "side"),
    student("summer", [290, 244], "idle", "up"),
    student("bedhead", [430, 244], "attack", "up", false, 1),
  ],
  overhead: stoa.filter((c) => c.prop === "column-capital"),
});
