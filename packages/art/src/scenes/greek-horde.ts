import { type Actor, type Doll, type Prop, scene } from "../scene.ts";

/**
 * greek-horde: the review screen for Page 1 at full volume. Afternoon in 아고라 외곽, the last
 * hunting field, during a surge: about eighty monsters in the mix the field spawns, mostly 오답
 * and packs of pencil 오답, with every other archetype caught in the middle of what it does. Two
 * students hold the middle. It answers one question: inside a real horde, can you find the
 * charger winding up, the healer, the bomber about to burst and the elite within a second?
 */

/** A small seeded generator, so the crowd is the same every render. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Where the students stand; everything faces them. */
const HOLD: readonly [number, number] = [226, 168];
const taken: [number, number, number][] = [];

/** A free spot in a box, at least `gap` from everything placed so far and clear of the students. */
function spot(r: () => number, box: readonly [number, number, number, number], gap: number) {
  for (let tries = 0; tries < 200; tries++) {
    const x = Math.round(box[0] + r() * (box[2] - box[0]));
    const y = Math.round(box[1] + r() * (box[3] - box[1]));
    if (Math.hypot(x - HOLD[0], (y - HOLD[1]) * 1.4) < 46) continue;
    if (taken.some(([tx, ty, tg]) => Math.hypot(x - tx, (y - ty) * 1.3) < Math.max(gap, tg)))
      continue;
    taken.push([x, y, gap]);
    return [x, y] as const;
  }
  throw new Error("greek-horde: no room left");
}

/** One monster at a spot, facing the students, its animation started at a random point. */
function mob(
  r: () => number,
  actor: string,
  anim: string,
  at: readonly [number, number],
  shadow: string,
  extra: Partial<Actor> = {},
): Actor {
  taken.push([at[0], at[1], 10]);
  return {
    actor,
    anim,
    play: true,
    index: Math.floor(r() * 8),
    shadow,
    at,
    flip: at[0] > HOLD[0],
    ...extra,
  };
}

function crowd(): Actor[] {
  const r = rng(1207);
  const out: Actor[] = [];
  // The behaviours the screen is judged on, placed by hand.
  const set = (actor: string, anim: string, at: readonly [number, number], extra = {}) =>
    out.push(mob(r, actor, anim, at, "shadow-s/blob", { index: 0, ...extra }));
  set("element-air", "windup", [306, 132], { index: 1 });
  set("element-air", "charge", [150, 230], { flip: false });
  set("element-fire", "fuse", [262, 196], { index: 5 });
  set("element-fire", "rush", [126, 128], { flip: false });
  set("element-water", "cast", [372, 98], { index: 2 });
  set("element-water", "idle", [88, 206], { flip: false });
  set("element-water", "move", [420, 210]);
  set("rational", "guard", [282, 164], { shadow: "shadow-m/blob" });
  set("rational", "block", [178, 132], { flip: false, shadow: "shadow-m/blob" });
  set("rational", "move", [354, 236], { shadow: "shadow-m/blob" });
  set("rational", "move", [96, 160], { flip: false, shadow: "shadow-m/blob" });
  set("cave-shadow", "fire", [404, 152]);
  set("cave-shadow", "windup", [60, 110], { flip: false });
  set("cave-shadow", "move", [444, 112]);
  set("cave-shadow", "idle", [330, 70]);
  set("element-earth", "die", [318, 236], { index: 2 });
  set("element-earth", "move", [204, 246], { flip: false });
  set("element-earth", "idle", [430, 254]);
  set("element-earth-pebble", "move", [300, 250]);
  set("element-earth-pebble", "move", [336, 254]);
  set("element-fire", "move", [388, 186]);
  set("element-fire", "move", [52, 250], { flip: false });
  set("element-air", "move", [268, 104]);
  set("tortoise", "walk", [460, 176], { shadow: "shadow-m/blob" });
  // The elite: a 심화 오답 at twice the size, pushing through the front of the pack.
  set("odap-elite", "move", [296, 214], { scale: 2, shadow: "shadow-m/blob" });

  // Packs of pencil 오답 swarming in from three sides.
  const pack = (cx: number, cy: number, n: number) => {
    for (let k = 0; k < n; k++) {
      const at = spot(r, [cx - 26, cy - 16, cx + 26, cy + 16], 9);
      out.push(mob(r, "odap-pencil", "move", at, "shadow-s/blob"));
    }
  };
  pack(352, 160, 9);
  pack(150, 196, 8);
  pack(250, 116, 8);

  // The bulk: 오답 everywhere, thickest on the side the surge comes from.
  const boxes: readonly (readonly [number, number, number, number])[] = [
    [250, 80, 470, 262],
    [250, 80, 470, 262],
    [20, 90, 230, 262],
  ];
  for (let k = 0; k < 32; k++) {
    const at = spot(r, boxes[k % boxes.length] as [number, number, number, number], 15);
    out.push(mob(r, "odap", "move", at, "shadow-s/blob"));
  }
  return out;
}

const monsters = crowd();

const students: Doll[] = [
  { rig: "student", look: "club", dir: "side", anim: "attack", play: true, at: [238, 170] },
  {
    rig: "student",
    look: "curls",
    dir: "side",
    anim: "attack",
    play: true,
    index: 2,
    flip: true,
    at: [212, 164],
  },
];

const ruins: Prop[] = [
  { prop: "column", frame: "whole", at: [64, 62] },
  { prop: "column", frame: "broken", at: [104, 66] },
  { prop: "column", frame: "whole", at: [404, 60] },
  { prop: "drum", at: [130, 74] },
  { prop: "amphora", at: [452, 82] },
  { prop: "olive", at: [20, 74] },
];

export default scene({
  name: "greek-horde",
  seed: 77,
  theme: "greece",
  sky: "gold.pale",
  legend: {
    g: { terrain: "grass" },
    d: { terrain: "dirt" },
    m: { terrain: "marble" },
  },
  ground: `
    ggggggmmmmmmmmggggggggmmmmmmmm
    ggggggmmmmmmmmggggggggmmmmmmmm
    gggggmmmmmmmmmmggggggmmmmmmmmm
    ggggddddddddddddddddddddddmmmm
    ggdddddddddddddddddddddddddddg
    gddddddddddddddddddddddddddddg
    gddddddddddddddddddddddddddddd
    dddddddddddddddddddddddddddddd
    dddddddddddddddddddddddddddddd
    dddddddddddddddddddddddddddddd
    dddddddddddddddddddddddddddddd
    gddddddddddddddddddddddddddddd
    gddddddddddddddddddddddddddddg
    ggdddddddddddddddddddddddddddg
    gggddddddddddddddddddddddddggg
    ggggddddddddddddddddddddgggggg
    gggggggddddddddddddggggggggggg
  `,
  details: [
    { decal: "marble-dust/shards", at: [150, 52] },
    { decal: "marble-dust/pebbles", at: [380, 70] },
  ],
  objects: [
    ...ruins,
    ...monsters,
    ...students,
    // Two shadow birds in flight at the students.
    { actor: "proj-shadow", anim: "fly", play: true, at: [360, 158], flip: true },
    { actor: "proj-shadow", anim: "fly", play: true, index: 2, at: [100, 118] },
  ],
  overhead: [
    { prop: "column-capital", at: [64, 62] },
    { prop: "column-capital", at: [404, 60] },
    { prop: "olive-crown", anim: "stir", play: true, at: [20, 74] },
  ],
  atmosphere: [
    { prop: "fx-slash", anim: "swing", index: 1, at: [252, 162], raw: true },
    { prop: "fx-spark", anim: "hit", index: 1, at: [258, 160], raw: true },
    { prop: "fx-pop", anim: "die", index: 1, at: [196, 178], raw: true },
  ],
});
