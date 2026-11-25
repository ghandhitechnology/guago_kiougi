import { type Actor, type Doll, type Prop, scene } from "../scene.ts";
import { laid } from "./fight.ts";

/**
 * combat: one question, asked of every effect at once. Five students on a sunlit Greek field,
 * one per class, each mid-attack with both of the class's launch books, against a horde of 오답
 * and the era's 오개념. Statuses, a red warning on the ground, an elite, drops, deaths. If the
 * fight cannot be read at ×1 here, the effects change, not this scene.
 */

/** An effect is light or matter that keeps its own colours: never themed. */
const fx = (prop: string, x: number, y: number, more: Partial<Prop> = {}): Prop => ({
  prop,
  at: [x, y],
  raw: true,
  ...more,
});

const SHADOW: Record<string, string> = {
  odap: "shadow-s/blob",
  "odap-pencil": "shadow-s/blob",
  "element-fire": "shadow-s/blob",
  "element-water": "shadow-s/blob",
  "element-air": "shadow-s/blob",
  "element-earth": "shadow-s/blob",
  rational: "shadow-m/blob",
  tortoise: "shadow-m/blob",
};

/** A monster facing the students (left), walking or hopping on its own beat. */
const mob = (
  actor: string,
  x: number,
  y: number,
  anim = "idle",
  index = 0,
  play = true,
): Actor => ({
  actor,
  at: [x, y],
  anim,
  index,
  play,
  flip: actor === "rational" || actor === "tortoise",
  ...(SHADOW[actor] ? { shadow: SHADOW[actor] } : {}),
});

const student = (look: string, x: number, y: number, index = 1): Doll => ({
  rig: "student",
  look,
  dir: "side",
  anim: "attack",
  index,
  at: [x, y],
});

// The five. 수학 holds the middle with the beam, 물리 and 화학 the bottom, 생명 the top, and
// 지구과학 forecasts from the back.
const MATH: [number, number] = [92, 134];
const PHYS: [number, number] = [138, 214];
const CHEM: [number, number] = [56, 236];
const BIO: [number, number] = [184, 92];
const EARTH: [number, number] = [52, 66];

/** The horde: 오답 in front, pencil 오답 behind them, 유리수 병사, tortoises, spirits. */
const HORDE: Actor[] = [
  // In the beam's path.
  mob("odap", 232, 140, "hit", 0, false),
  mob("odap-pencil", 262, 132, "hop", 1),
  mob("odap", 292, 142, "hit", 0, false),
  mob("rational", 322, 136, "walk", 2),
  // Around the tome's landing.
  mob("odap", 244, 214, "hit", 0, false),
  mob("odap", 274, 222, "hop", 2),
  mob("odap-pencil", 228, 228, "hit", 0, false),
  // In the chain.
  mob("element-water", 210, 250, "hit", 0, false),
  mob("odap", 246, 258, "hit", 0, false),
  mob("element-air", 284, 250, "hit", 0, false),
  // In the acid.
  mob("odap", 318, 236, "idle", 2),
  mob("odap-pencil", 344, 248, "hop", 3),
  mob("tortoise", 372, 236, "walk", 1),
  // The burning pair.
  mob("odap", 330, 190, "hit", 0, false),
  mob("element-fire", 356, 184, "move", 1),
  // On the fault.
  mob("rational", 300, 110, "walk", 0),
  mob("odap", 352, 116, "hit", 0, false),
  mob("odap-pencil", 386, 104, "hop", 2),
  // Cut by the scalpel and nipped by cells.
  mob("odap", 232, 86, "hit", 0, false),
  mob("odap", 252, 100, "hit", 0, false),
  mob("odap-pencil", 270, 80, "idle", 1),
  // Hit by stones.
  mob("element-earth", 236, 56, "hit", 0, false),
  mob("odap", 270, 48, "hop", 1),
  mob("tortoise", 310, 60, "walk", 3),
  // The pack still coming.
  mob("odap", 400, 150, "hop", 0),
  mob("odap", 418, 132, "hop", 2),
  mob("odap-pencil", 436, 162, "idle", 3),
  mob("rational", 448, 186, "idle", 1),
  mob("element-water", 420, 210, "move", 2),
  mob("odap", 446, 230, "hop", 1),
  mob("odap", 404, 258, "hop", 3),
  mob("element-fire", 456, 120, "idle", 2),
  mob("odap-pencil", 460, 86, "hop", 0),
  mob("odap", 428, 68, "idle", 1),
  mob("tortoise", 456, 256, "walk", 2),
  mob("element-air", 380, 48, "move", 3),
  // Flankers that got round the line.
  mob("odap", 24, 196, "hop", 1),
  mob("odap-pencil", 96, 254, "hop", 2),
  mob("odap", 120, 34, "hop", 3),
  mob("element-air", 22, 140, "move", 0),
  mob("odap", 160, 268, "hop", 0),
  // The elite, walking up behind its aura.
  mob("element-earth", 396, 214, "move", 0),
];

/**
 * The rest of the pack, filling the right of the field: a jittered grid, each spot a hashed
 * pick of monster and beat, kept clear of the named fights so those still read.
 */
const KINDS = [
  "odap",
  "odap",
  "odap",
  "odap-pencil",
  "odap-pencil",
  "element-fire",
  "element-water",
  "element-air",
  "element-earth",
  "rational",
  "tortoise",
] as const;
const hash = (x: number, y: number) => {
  let h = (x * 374761393 + y * 668265263) ^ 0x5bd1e995;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const KEEP_CLEAR: readonly [number, number, number][] = [
  [258, 224, 22],
  [212, 250, 20],
  [342, 242, 24],
  [344, 192, 22],
  [336, 116, 20],
  [262, 128, 16],
  [236, 92, 20],
  [372, 180, 18],
  [396, 214, 14],
];
const PACK: Actor[] = [];
for (let gy = 0; gy < 12; gy++) {
  for (let gx = 0; gx < 11; gx++) {
    const x = Math.round(292 + gx * 17 + (hash(gx, gy) - 0.5) * 10);
    const y = Math.round(40 + gy * 19 + (hash(gy, gx + 7) - 0.5) * 8);
    if (x > 470 || hash(gx + 3, gy + 5) < 0.42) continue;
    if (KEEP_CLEAR.some(([cx, cy, r]) => Math.hypot(x - cx, (y - cy) * 1.4) < r)) continue;
    if (HORDE.some((m) => Math.abs(m.at[0] - x) < 13 && Math.abs(m.at[1] - y) < 10)) continue;
    const kind = KINDS[Math.floor(hash(gx + 11, gy + 13) * KINDS.length)] as string;
    const anim = kind.startsWith("odap") ? "hop" : kind.startsWith("element") ? "move" : "walk";
    PACK.push(mob(kind, x, y, anim, Math.floor(hash(gx, gy + 2) * 4)));
  }
}

/** Bolt segments, from the physics student's book along the chain. */
const CHAIN: Prop[] = [
  fx("fx-bolt-diag", 152, 206, { anim: "a", play: true }),
  fx("fx-bolt", 176, 230, { anim: "b", play: true, index: 1 }),
  fx("fx-bolt-diag", 208, 230, { anim: "c", play: true }),
  fx("fx-bolt", 214, 250, { anim: "a", play: true, index: 1 }),
  fx("fx-bolt", 246, 252, { anim: "c", play: true }),
  fx("fx-bolt-node", 210, 244, { anim: "hold", play: true }),
  fx("fx-bolt-node", 246, 252, { anim: "hold", play: true, index: 1 }),
  fx("fx-bolt-node", 278, 246, { anim: "hold", play: true, index: 2 }),
];

/** The sine beam: origin at the book, segments over graph paper, the plotted point at its tip. */
const BEAM_Y = 124;
const BEAM: Prop[] = [
  ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i) =>
    fx("fx-graph-beam", 106 + i * 16, BEAM_Y, { anim: "travel", play: true }),
  ),
  fx("fx-graph-origin", 104, BEAM_Y, { anim: "hold", play: true }),
  fx("fx-graph-head", 298, BEAM_Y, { anim: "pulse", play: true }),
];
const TICKS: Prop[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i) =>
  fx("fx-graph-ticks", 106 + i * 16, BEAM_Y, { frame: "ticks0" }),
);

/** Hexagons orbiting the 수학 student. */
const ORBIT: Prop[] = [0, 1, 2, 3].map((k) => {
  const a = (k / 4) * Math.PI * 2 + 0.5;
  return fx(
    "fx-wangdo",
    MATH[0] + Math.round(Math.cos(a) * 24),
    MATH[1] - 10 + Math.round(Math.sin(a) * 14),
    {
      anim: "hexa",
      play: true,
      index: k,
    },
  );
});

export default scene({
  name: "combat",
  seed: 61,
  theme: "greece",
  legend: {
    g: { terrain: "grass" },
    d: { terrain: "dirt" },
    m: { terrain: "marble" },
  },
  ground: `
    gggggggggggggggdddddmmmmmmmmmm
    ggggggggddddddddddddddmmmmmmmm
    gggggddddddddddddddddddmmmmmmm
    gggdddddddddddddddddddddddmmmm
    ggdddddddddddddddddddddddddddm
    gddddddddddddddddddddddddddddd
    gddddddddddddddddddddddddddddd
    dddddddddddddddddddddddddddddd
    dddddddddddddddddddddddddddddd
    dddddddddddddddddddddddddddddd
    dddddddddddddddddddddddddddddd
    dddddddddddddddddddddddddddddd
    dddddddddddddddddddddddddddddd
    gddddddddddddddddddddddddddddg
    ggddddddddddddddddddddddddddgg
    gggdddddddddddddddddddddddgggg
    ggggdddddddddddddddddddddggggg
  `,
  details: [
    // Ground layer: what lies on the field, under every foot.
    ...TICKS,
    fx("fx-acid", 342, 242, { anim: "bubble", play: true }),
    fx("fx-tome-crater", 258, 224, { frame: "c1" }),
    ...laid("fx-fault", "open", 288, 112, 0, 96, 16, { variants: 2, index: 2, start: true }),
    ...laid("fx-forecast", "warn", 196, 160, 0, 96, 16, { variants: 2, index: 3, start: true }),
    fx("fx-combust", 344, 192, { anim: "burn", play: true }),
    fx("fx-elite-aura", 396, 214, { anim: "aura", play: true }),
    // Red: the 유리수 병사 is about to charge down this lane, and something has marked the
    // chemistry student.
    ...laid("tele-line", "charge", 330, 178, 0, 96, 12, { play: true }),
    fx("tele-circle", 62, 238, { frame: "r24-3" }),
  ],
  objects: [
    // The era at the field's edge.
    { prop: "olive", at: [30, 52] },
    { prop: "column", frame: "whole", at: [430, 60] },
    { prop: "column", frame: "broken", at: [468, 70] },
    { prop: "amphora", at: [400, 34] },
    { prop: "amphora-tipped", at: [16, 266] },
    ...HORDE,
    ...PACK,
    student("reader", MATH[0], MATH[1], 1),
    student("club", PHYS[0], PHYS[1], 2),
    student("curls", CHEM[0], CHEM[1], 1),
    student("summer", BIO[0], BIO[1], 1),
    student("bedhead", EARTH[0], EARTH[1], 2),
    // Cells on the field: two nipping, one moving up, one splitting.
    { actor: "fx-cell", anim: "nip", index: 1, play: true, at: [214, 106] },
    { actor: "fx-cell", anim: "move", play: true, at: [244, 116] },
    { actor: "fx-cell", anim: "nip", index: 2, play: true, at: [222, 70] },
    { actor: "fx-cell", anim: "divide", index: 3, play: true, at: [196, 122] },
    // Drops left by the first wave.
    { actor: "drop-page-math", anim: "idle", play: true, at: [130, 160] },
    { actor: "drop-page-chemistry", anim: "idle", play: true, index: 2, at: [104, 196] },
    { actor: "drop-page-earth", anim: "idle", play: true, index: 4, at: [160, 150] },
    { actor: "drop-page-biology", anim: "idle", play: true, index: 1, at: [170, 254] },
    { actor: "drop-page-physics", anim: "idle", play: true, index: 3, at: [196, 182] },
    { actor: "drop-elite", anim: "idle", play: true, at: [208, 160] },
  ],
  overhead: [{ prop: "olive-crown", anim: "stir", play: true, at: [30, 52] }],
  atmosphere: [
    // 수학의 왕도 and 함수 그래프 노트.
    ...BEAM,
    ...ORBIT,
    fx("fx-wangdo-hit", MATH[0] + 22, MATH[1] - 2, { anim: "hit", play: true }),
    fx("fx-proof", 232, 118, { frame: "n7" }),
    fx("fx-proof", 292, 120, { frame: "n3" }),
    fx("fx-qed", 262, 112, { anim: "burst", index: 1, play: true }),
    fx("fx-hit-light", 236, 132, { anim: "hit", play: true }),
    // 홀리데이 일반물리 and 전자기 실습서.
    fx("fx-tome-shadow", 206, 222, { frame: "h1" }),
    fx("fx-tome", 200, 176, { anim: "spin", play: true }),
    fx("fx-tome-impact", 258, 226, { anim: "land", index: 1, play: true }),
    fx("fx-hit-heavy", 246, 206, { anim: "hit", play: true }),
    ...CHAIN,
    // 줌인 일반화학 and 실험 보고서.
    fx("fx-flask", 196, 208, { anim: "spin", play: true }),
    fx("fx-flask-shatter", 320, 238, { anim: "break", index: 2, play: true }),
    fx("fx-label", 330, 180, { anim: "stuck", play: true }),
    fx("fx-flame", 356, 186, { anim: "burn", play: true }),
    // 캠핑 생명과학 and 해부 실습서.
    fx("fx-scalpel", 196, 84, { anim: "fan", index: 2, play: true }),
    fx("fx-bleed", 232, 84, { anim: "bleed", play: true }),
    fx("fx-bleed", 252, 98, { anim: "bleed", play: true, index: 2 }),
    // 지구는 둥글다 and 암석 표본 상자.
    fx("fx-rock", 104, 52, { anim: "igneous", play: true }),
    fx("fx-rock", 146, 44, { anim: "sedimentary", play: true, index: 1 }),
    fx("fx-rock", 188, 48, { anim: "metamorphic", play: true, index: 2 }),
    fx("fx-rock-hit", 236, 58, { anim: "igneous", index: 1, play: true }),
    fx("fx-shard", 316, 92, { anim: "tumble0", play: true }),
    fx("fx-shard", 346, 88, { anim: "tumble2", play: true }),
    // Statuses over heads.
    fx("status", 330, 166, { anim: "flammable", play: true }),
    fx("status", 356, 168, { anim: "burn", play: true }),
    fx("status", 318, 220, { anim: "acid", play: true }),
    fx("status", 344, 232, { anim: "acid", play: true }),
    fx("status", 232, 70, { anim: "bleed", play: true }),
    fx("status", 252, 84, { anim: "bleed", play: true }),
    fx("status", 236, 40, { anim: "burn", play: true }),
    fx("status", 310, 44, { anim: "slow", play: true }),
    fx("status", 210, 234, { anim: "wet", play: true }),
    fx("status", 372, 220, { anim: "armor-break", play: true }),
    // Deaths.
    fx("fx-death-paper", 280, 172, { anim: "die", index: 1, play: true }),
    fx("fx-death", 300, 262, { anim: "die", index: 1, play: true }),
    fx("fx-debris-paper", 268, 160, { anim: "flutter", play: true }),
    fx("fx-debris-paper", 292, 166, { anim: "flutter", play: true, index: 2 }),
    // The rare drop's beam and a pickup.
    fx("drop-glint", 208, 160, { anim: "shine", play: true }),
    fx("fx-pickup", 130, 154, { anim: "twinkle", play: true }),
  ],
});
