import { type Light, type Prop, scene } from "../scene.ts";

/**
 * maker-room: 가설관 1F, late afternoon, the hour after classes when the 메이커실 fills up. The
 * sun comes in low through the west windows and lies across the floor in long gold panes. On
 * the right the 제련기 burns under its hood, the one light in the room that is not the sun, and
 * the cat has found the warm spot in front of it. In the middle the 제본대 under its two
 * pendants: 도현우 rebinding what is left of the 0조 notebook. Someone at the anvil, someone
 * watching the printer print the same bracket for the fourth time.
 */

const WALL_Y = 63;
const MOUNT_Y = WALL_Y + 1;

function wallRun(prop: string, x0: number, x1: number, worn: readonly number[] = []): Prop[] {
  const out: Prop[] = [];
  for (let x = x0; x < x1; x += 16) {
    const frame = x === x0 ? "end-l" : x + 16 >= x1 ? "end-r" : worn.includes(x) ? "worn" : "run";
    out.push({ prop, frame, at: [x, WALL_Y] });
  }
  return out;
}

/** Sun through a window, falling long and to the right across the floor. */
const sun = (cx: number): Light => ({
  bands: ["campus-lamp"],
  spill: { top: [cx - 13, cx + 13, 66], bottom: [cx + 8, cx + 52, 176] },
  ragged: 2,
});

const FORGE = { x: 352, y: 78 };

export default scene({
  name: "maker-room",
  seed: 81,
  theme: "campus-dusk",
  sky: "ink.deep",
  legend: {
    "#": { terrain: "wood" },
    t: { terrain: "wood" },
    m: { terrain: "mat" },
  },
  ground: `
    ##############################
    #tttttttttttttttttttttttttttt#
    #tttttttttttttttttttttttttttt#
    #tttttttttttttttttttttttttttt#
    #tttttttttttttttttttttttttttt#
    #tttttttttttttttttttttttttttt#
    #tttttttttttttttttttttttttttt#
    #tttttttttttttttttttttttttttt#
    #tttttttttttttttttttttttttttt#
    #tttttttttttttttttttttttttttt#
    #tttttttttttttttttttttttttttt#
    #tttttttttttttttttttttttttttt#
    #ttttttttmmmmmmtttttttttttttt#
    #tttttttttttttttttttttttttttt#
    #tttttttttttttttttttttttttttt#
    #tttttttttttttttttttttttttttt#
    ##############tt##############
  `,
  edges: [{ overlay: "wall-top", inside: "#" }],
  details: [
    { prop: "floor-marks", frame: "scorch", at: [330, 82] },
    { prop: "floor-marks", frame: "puddle", at: [410, 108] },
    { prop: "floor-marks", frame: "scraps", at: [140, 176] },
    { prop: "floor-marks", frame: "scraps", at: [200, 190] },
    { prop: "floor-marks", frame: "scraps", at: [236, 238] },
  ],
  shadows: [
    { prop: "wall-shade", frame: "corner", at: [16, 79] },
    ...[95, 111, 127, 143, 159, 175, 191, 207, 223, 239, 255].map(
      (y): Prop => ({ prop: "wall-shade", frame: "v", at: [16, y] }),
    ),
  ],
  objects: [
    ...wallRun("wall-tiled", 16, 464, [96, 288, 400]),
    { prop: "window", frame: "gold", at: [56, MOUNT_Y] },
    { prop: "window", frame: "gold", at: [104, MOUNT_Y] },
    { prop: "window", frame: "gold-curtain", at: [152, MOUNT_Y] },
    { prop: "tool-wall", at: [236, MOUNT_Y] },
    { prop: "poster", frame: "safety", at: [278, MOUNT_Y] },
    // 제련기 and everything around it.
    { prop: "forge", anim: "burn", play: true, at: [FORGE.x, FORGE.y], raw: true },
    { prop: "anvil", at: [404, 124] },
    { prop: "quench", at: [430, 112] },
    { prop: "stock-shelf", at: [440, 80] },
    { prop: "extinguisher", at: [306, 80] },
    // 제본대 in the middle of the room.
    { prop: "bindery", at: [176, 178] },
    { prop: "guillotine", at: [104, 172] },
    { prop: "textbooks", frame: "tall", at: [228, 178] },
    // The printer by the windows, lumber against the wall, the big worktable, the vise bench.
    { prop: "printer-3d", anim: "print", play: true, at: [40, 104] },
    { prop: "lumber", at: [30, 196] },
    { prop: "worktable", at: [276, 236] },
    { prop: "stool", at: [252, 252] },
    { prop: "stool", at: [306, 250] },
    { prop: "stool", at: [222, 200] },
    { prop: "vise-bench", at: [420, 230] },
    { prop: "tool-cart", at: [372, 196] },
    { prop: "bag", frame: "green", at: [90, 116] },
    { prop: "bag", frame: "slump", at: [118, 236] },
    { prop: "sawhorses", at: [100, 262] },
    { prop: "boxes", at: [446, 160] },
    { prop: "poster", frame: "club", at: [300, MOUNT_Y] },
    // People.
    {
      rig: "student",
      look: "club",
      dir: "side",
      anim: "attack",
      index: 1,
      at: [426, 132],
      flip: true,
    },
    { rig: "hyunwoo", look: "tired", dir: "down", anim: "remember", play: true, at: [154, 150] },
    { rig: "student", look: "summer", dir: "up", anim: "idle", play: true, at: [52, 132] },
    { rig: "student", look: "curls", dir: "up", anim: "idle", play: true, at: [196, 206] },
  ],
  overhead: [
    { prop: "forge-hood", anim: "glow", play: true, at: [FORGE.x, FORGE.y] },
    { prop: "entropy", anim: "sleep", play: true, at: [318, 98], raw: true },
    { prop: "pendant", frame: "on", at: [150, 122] },
    { prop: "pendant", frame: "on", at: [202, 122] },
  ],
  lights: [
    sun(56),
    sun(104),
    sun(152),
    {
      bands: ["golden-sun", "golden-warm"],
      at: [FORGE.x, FORGE.y + 16],
      r: [64, 24],
      ragged: 4,
      pulse: { amount: 0.06, period: 1.3 },
    },
    { bands: ["campus-lamp"], at: [176, 166], r: [60, 30], ragged: 3 },
    // The open mouth throws its own light out across the floor in front of it.
    {
      bands: ["golden-sun", "golden-warm"],
      spill: {
        top: [FORGE.x - 10, FORGE.x + 10, FORGE.y + 2],
        bottom: [FORGE.x - 34, FORGE.x + 34, FORGE.y + 44],
      },
      ragged: 3,
      pulse: { amount: 0.08, period: 0.9 },
    },
  ],
  atmosphere: [
    { prop: "sparks", anim: "rise", play: true, at: [FORGE.x - 2, FORGE.y - 36] },
    {
      prop: "sparks",
      anim: "rise",
      play: true,
      index: 3,
      at: [FORGE.x + 8, FORGE.y - 40],
      flip: true,
    },
  ],
});
