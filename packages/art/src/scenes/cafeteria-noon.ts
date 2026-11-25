import { type Doll, type Light, type Prop, scene } from "../scene.ts";

/**
 * cafeteria-noon: 12:40, the second lunch wave, every table taken. The queue runs right to
 * left along the 배식대 from the tray stacks past the rice and the soup; behind the glass the
 * cooks ladle, and through the cook's window the big pot steams. Noon comes in through the
 * windows in short bright panes. 도현우 eats alone with the notebook open beside his tray, 권
 * 사감 stands at the tray return checking what people left, and under the last table the cat
 * waits for someone to drop something.
 */

const WALL_Y = 63;
const MOUNT_Y = WALL_Y + 1;
const LINE_Y = 104;

function wallRun(prop: string, x0: number, x1: number, worn: readonly number[] = []): Prop[] {
  const out: Prop[] = [];
  for (let x = x0; x < x1; x += 16) {
    out.push({ prop, frame: worn.includes(x) ? "worn" : "run", at: [x, WALL_Y] });
  }
  return out;
}

/** Noon sun through a window: a short, steep pane on the floor. */
const sun = (cx: number): Light => ({
  bands: ["campus", "campus-lamp"],
  spill: { top: [cx - 14, cx + 14, 66], bottom: [cx - 4, cx + 30, 128] },
  ragged: 2,
});

type Seat = readonly [look: string, flip?: boolean];
/**
 * A table with its benches and who sits at it: up to three across the far side facing us,
 * three on the near bench with their backs to us.
 */
function table(
  cx: number,
  y: number,
  frame: string,
  far: readonly (Seat | null)[],
  near: readonly (Seat | null)[],
) {
  const objects: (Prop | Doll)[] = [{ prop: "long-table", frame, at: [cx, y] }];
  far.forEach((s, i) => {
    if (s)
      objects.push({
        rig: "student",
        look: s[0],
        dir: "down",
        anim: "idle",
        play: true,
        index: i,
        at: [cx - 20 + i * 20, y - 16],
        flip: s[1] ?? false,
      });
  });
  near.forEach((s, i) => {
    if (s)
      objects.push({
        rig: "student",
        look: s[0],
        dir: "up",
        anim: "idle",
        play: true,
        index: i + 1,
        at: [cx - 20 + i * 20, y + 6],
        flip: s[1] ?? false,
      });
  });
  objects.push({ prop: "meal-bench", at: [cx, y + 10] });
  return objects;
}

export default scene({
  name: "cafeteria-noon",
  seed: 1240,
  theme: "campus-dusk",
  sky: "ink.deep",
  legend: {
    "#": { terrain: "tile" },
    t: { terrain: "tile" },
    m: { terrain: "mat" },
  },
  ground: `
    ##############################
    tttttttttttttttttttttttttttttt
    tttttttttttttttttttttttttttttt
    tttttttttttttttttttttttttttttt
    tttttttttttttttttttttttttttttt
    tttttttttttttttttttttttttttttt
    tttttttttttttttttttttttttttttt
    tttttttttttttttttttttttttttttt
    tttttttttttttttttttttttttttttt
    tttttttttttttttttttttttttttttt
    tttttttttttttttttttttttttttttt
    tttttttttttttttttttttttttttttt
    tttttttttttttttttttttttttttttt
    tttttttttttttttttttttttttttttt
    tttttttttttttttttttttttttttttt
    tttttttttttttttttttttttttttttt
    tttttttttttttttttttttttttttttt
  `,
  edges: [{ overlay: "wall-top", inside: "#" }],
  objects: [
    ...wallRun("wall-tiled", 0, 480, [208, 352]),
    { prop: "window", frame: "day", at: [24, MOUNT_Y] },
    { prop: "cook-window", anim: "cook", play: true, at: [124, MOUNT_Y] },
    { prop: "menu-board", at: [214, MOUNT_Y] },
    { prop: "window", frame: "day-curtain", at: [262, MOUNT_Y] },
    { prop: "window", frame: "day", at: [310, MOUNT_Y] },
    { prop: "tray-return", anim: "run", play: true, at: [380, MOUNT_Y] },
    { prop: "door-double", frame: "open", at: [446, MOUNT_Y] },
    // Behind the glass: two cooks with ladles.
    { prop: "cook", anim: "serve", play: true, at: [104, LINE_Y - 20] },
    { prop: "cook", anim: "serve", play: true, index: 1, at: [150, LINE_Y - 20], flip: true },
    // The line, right to left: trays first.
    { prop: "serving-line", frame: "cap-l", at: [45, LINE_Y] },
    { prop: "serving-line", frame: "bulgogi-pickles", at: [48, LINE_Y] },
    { prop: "serving-line", frame: "kimchi-greens", at: [80, LINE_Y] },
    { prop: "serving-line", frame: "rice-soup", at: [112, LINE_Y] },
    { prop: "serving-line", frame: "rice-soup", at: [144, LINE_Y] },
    { prop: "serving-line", frame: "trays", at: [176, LINE_Y] },
    { prop: "serving-line", frame: "cap-r", at: [179, LINE_Y] },
    { prop: "scrap-bin", at: [356, 92] },
    { prop: "water-cooler", at: [16, 98] },
    // The queue.
    {
      rig: "student",
      look: "bedhead",
      dir: "side",
      anim: "idle",
      play: true,
      at: [196, 122],
      flip: true,
    },
    {
      rig: "student",
      look: "summer",
      dir: "side",
      anim: "idle",
      play: true,
      index: 1,
      at: [172, 120],
      flip: true,
    },
    {
      rig: "student",
      look: "blazer",
      dir: "side",
      anim: "walk",
      play: true,
      at: [146, 121],
      flip: true,
    },
    {
      rig: "student",
      look: "curls",
      dir: "side",
      anim: "idle",
      play: true,
      at: [116, 120],
      flip: true,
    },
    { rig: "student", look: "club", dir: "down", anim: "walk", play: true, at: [70, 128] },
    {
      rig: "student",
      look: "reader",
      dir: "side",
      anim: "walk",
      play: true,
      at: [236, 118],
      flip: true,
    },
    // Tables.
    ...table(92, 182, "lunch", [["summer"], ["club", true], null], [["bedhead"], null, ["reader"]]),
    ...table(222, 182, "lunch", [["blazer"], null, ["curls"]], [null, ["summer"], ["club"]]),
    ...table(352, 182, "late", [["reader", true], ["bedhead"], null], [["curls"], null, null]),
    ...table(156, 252, "lunch", [null, ["curls"], ["blazer", true]], []),
    ...table(286, 252, "empty", [null, null, null], []),
    { rig: "hyunwoo", look: "tired", dir: "down", anim: "remember", play: true, at: [404, 236] },
    { prop: "long-table", frame: "lunch", at: [420, 252] },
    { rig: "sagam", look: "duty", dir: "up", anim: "idle", play: true, at: [404, 122] },
    {
      rig: "student",
      look: "summer",
      dir: "up",
      anim: "idle",
      play: true,
      index: 1,
      at: [376, 110],
    },
    // Someone dropped their lunch. The cat is already there.
    { prop: "tray-spill", at: [52, 236] },
    { prop: "entropy", anim: "idle", play: true, at: [80, 238], flip: true },
    { rig: "student", look: "bedhead", dir: "down", anim: "hit", at: [36, 220] },
  ],
  overhead: [
    { prop: "pendant", frame: "on", at: [86, 116] },
    { prop: "pendant", frame: "on", at: [216, 116] },
    { prop: "pendant", frame: "on", at: [346, 116] },
  ],
  atmosphere: [
    { prop: "steam", anim: "rise", play: true, at: [124, 92] },
    { prop: "steam", anim: "rise", play: true, index: 2, at: [156, 92] },
  ],
  lights: [
    sun(24),
    sun(262),
    sun(310),
    { bands: ["campus"], at: [124, 70], r: [40, 14], ragged: 2 },
    ...[92, 222, 352, 156, 286, 420].map(
      (x, i): Light => ({
        bands: ["campus-lamp"],
        at: [x, i < 3 ? 170 : 240],
        r: [52, 22],
        ragged: 3,
      }),
    ),
  ],
});
