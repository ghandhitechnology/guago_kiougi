import type { Vec } from "../../format.ts";
import { type Legend, sprite } from "../../format.ts";
import { clean, ellipse, light, line, Pic, poly, rect, seal, silhouette } from "./kit.ts";

/**
 * 아리스토텔레스, the era boss of Page 1, built from parts that animate on their own. Every part
 * is a 160×160 sprite with the same origin (the foot of his plinth), so the client stacks them
 * at one position, back to front:
 *
 *   halo → plinth → body → arms → head → lectern → front
 *
 * He is the greatest classifier who ever lived, standing on a marble drum that is his natural
 * place, lecturing to whoever walks in: steel-grey curls receding from a broad forehead, a
 * square beard, a plum himation with a gold meander over white linen, one hand up with a finger
 * raised and the other on the lectern. Behind him turn the four spheres of the elements, earth,
 * water, air and fire, each at its natural height. His wrong theories are the machine around
 * him, and each 논제 rebuilds it:
 *
 * - 논제 1 무거운 것이 더 빨리 떨어진다: arms out like a balance, a boulder low in one hand and a
 *   feather high in the other; the spheres tilt and hang with stones.
 * - 논제 2 모든 것은 제자리로 돌아간다: arms raised, the spheres ablaze in their four colours, an
 *   orb of each element riding at its natural height.
 * - 논제 3 움직이는 것은 무언가가 민다: arms folded, immovable; four stone hands press the
 *   stopped spheres, because nothing turns unless something pushes it.
 * - 논제 4 자연에 빈 곳은 없다: palms pressed outward against a sphere of air that fills every
 *   gap around him; his robe swells to fill it too.
 *
 * When he is freed the spheres crack and fall, the plinth splits, and he steps down onto the
 * ground for the first time.
 *
 * The client plays one animation on each part per state (`boss-aristotle-shield` from the arena
 * file goes on top: `full`, `crack1`, `crack2`, `break` as the class strips it):
 *
 *   state                 halo     plinth   body     arms      head      lectern
 *   lecture (idle)        lecture  still    stand    lecture   lecture   idle
 *   announcing 논제 N      lecture  still    stand    countN    lecture   slam
 *   논제 1                 weight   still    stand    scale     lecture   idle
 *   논제 1 wind-up         weight   still    stand    scale-up  shout     idle
 *   논제 2                 place    still    stand    raise     lecture   idle
 *   논제 2 wind-up         place    still    swell    raise     shout     idle
 *   논제 3                 push     still    stand    fold      neutral   idle
 *   논제 3 being pushed    push     pushed   lean     pushed    lecture   idle
 *   논제 3 wind-up         push     still    stand    lecture   shout     slam
 *   논제 4                 plenum   still    swell    press     lecture   idle
 *   논제 4 wind-up         plenum   still    swell    flail     shout     idle
 *   논제 4 the block slides plenum  still    swell    press     stunned   idle
 *   hit (any)             -        -        hit      -         hit       -
 *   phase break           break    cracked  stagger  flail     wince     slam
 *   freed                 shards   split    freed    freed     freed     fallen
 */

const palette: Legend = {
  ".": null,
  K: "plum.deep",
  P: "plum.dark",
  Q: "plum.mid",
  Y: "plum.light",
  Z: "plum.pale",
  G: "stone.deep",
  g: "stone.mid",
  v: "stone.vein",
  q: "stone.light",
  p: "stone.pale",
  w: "stone.bright",
  O: "flesh.deep",
  k: "flesh.dark",
  s: "flesh.mid",
  S: "flesh.light",
  y: "flesh.pale",
  X: "ink.deep",
  x: "ink.dark",
  h: "ink.mid",
  H: "ink.light",
  D: "gold.deep",
  a: "gold.mid",
  A: "gold.light",
  B: "gold.pale",
  W: "wood.deep",
  c: "wood.mid",
  C: "wood.light",
  T: "clay.deep",
  t: "clay.dark",
  u: "clay.mid",
  U: "clay.light",
  N: "sea.deep",
  n: "sea.dark",
  b: "sea.mid",
  l: "sea.light",
  L: "sea.pale",
  R: "red.deep",
  r: "red.dark",
  m: "red.mid",
  M: "red.light",
  F: "red.pale",
  // Lone marks: eyes, glints, sparks, streaks of air, cracks.
  e: "ink.deep",
  "^": "stone.bright",
  "!": "gold.pale",
  "+": "stone.bright",
  "~": "stone.pale",
  ":": "stone.light",
  "*": "red.light",
  "'": "flesh.dark",
};
const lone = "e^!+~:*'";

export const SIZE = 160;
const CX = 80;
/** The deep step of every material, for sealing silhouettes. */
const DEEP = "KGOXDWTNR";
const DEEP_OF: Record<string, string> = {
  P: "K",
  Q: "K",
  Y: "K",
  Z: "K",
  g: "G",
  v: "G",
  q: "G",
  p: "G",
  w: "G",
  k: "O",
  s: "O",
  S: "O",
  y: "O",
  x: "X",
  h: "X",
  H: "X",
  a: "D",
  A: "D",
  B: "D",
  c: "W",
  C: "W",
  t: "T",
  u: "T",
  U: "T",
  n: "N",
  b: "N",
  l: "N",
  L: "N",
  r: "R",
  m: "R",
  M: "R",
  F: "R",
};
const finish = (p: Pic): string =>
  clean(seal(clean(p, lone, DEEP), DEEP_OF, lone), lone, DEEP).toString();
const blank = () => Pic.blank(SIZE, SIZE);

/** Every pixel within `r` of the polyline. */
function limb(p: Pic, pts: readonly Vec[], r: number, ch: string): Pic {
  for (let i = 0; i + 1 < pts.length; i++) {
    const [x0, y0] = pts[i] as Vec;
    const [x1, y1] = pts[i + 1] as Vec;
    const minX = Math.floor(Math.min(x0, x1) - r - 1);
    const maxX = Math.ceil(Math.max(x0, x1) + r + 1);
    const minY = Math.floor(Math.min(y0, y1) - r - 1);
    const maxY = Math.ceil(Math.max(y0, y1) + r + 1);
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len2 = dx * dx + dy * dy || 1;
    for (let y = minY; y <= maxY; y++)
      for (let x = minX; x <= maxX; x++) {
        const t = Math.max(0, Math.min(1, ((x + 0.5 - x0) * dx + (y + 0.5 - y0) * dy) / len2));
        const d = Math.hypot(x + 0.5 - (x0 + t * dx), y + 0.5 - (y0 + t * dy));
        if (d <= r && p.at(x, y) !== undefined) p.set(x, y, ch);
      }
  }
  return p;
}

const SKIN = { line: "O", dark: "k", mid: "s", light: "S" } as const;
const PLUM = { line: "K", dark: "P", mid: "Q", light: "Y" } as const;
const LINEN = { line: "G", dark: "q", mid: "p", light: "w" } as const;

// Head ------------------------------------------------------------------------------------------

const HX = 61;
const HY = 33;
const HAIR = { dark: "h", mid: "H", light: "g" } as const;

/** Steel-grey curls receding at the temples, a broad forehead, a full square beard. */
function head(): Pic {
  const p = Pic.blank(38, 44);
  ellipse(p, 19, 20, 14.5, 15, "s");
  ellipse(p, 4.5, 22, 2.5, 4, "s");
  ellipse(p, 33.5, 22, 2.5, 4, "s");
  const lit = light(p, "s", SKIN, { light: 3, dark: 3 });
  const hair = Pic.blank(38, 44);
  ellipse(hair, 19, 16.5, 18.5, 16.5, "H");
  for (let y = 0; y < 44; y++)
    for (let x = 0; x < 38; x++) {
      if (hair.at(x, y) !== "H") continue;
      const dx = Math.abs(x + 0.5 - 19);
      // An M of a hairline: a lock in the middle, bare temples, thick over the ears.
      const line = dx < 3 ? 8 : dx < 8 ? 6 : dx < 11 ? 10 : 17;
      if ((y >= line && dx < 13.5) || y > 17) hair.set(x, y, ".");
    }
  poly(
    hair,
    [
      [5, 21],
      [8, 28],
      [13, 30],
      [16, 29],
      [22, 29],
      [25, 30],
      [30, 28],
      [33, 21],
      [35, 29],
      [33, 37],
      [29, 43],
      [9, 43],
      [5, 37],
      [3, 29],
    ],
    "H",
  );
  const hl = light(hair, "H", HAIR, { light: 2, dark: 3 });
  lit.put(hl, 0, 0);
  // Curls: little crescents of light on the cap and the beard.
  for (const [x, y] of [
    [9, 3],
    [14, 2],
    [21, 2],
    [26, 4],
    [5, 9],
    [31, 10],
    [4, 15],
    [9, 33],
    [15, 35],
    [22, 35],
    [28, 33],
    [12, 39],
    [19, 40],
    [25, 39],
    [7, 30],
    [31, 30],
  ] as const) {
    if (lit.at(x, y) === "H" || lit.at(x, y) === "h") {
      lit.set(x, y, "g");
      lit.set(x + 1, y, "g");
      lit.set(x + 1, y + 1, "h");
      lit.set(x + 2, y + 1, "h");
    }
  }
  // Mustache, the nose and its shadow.
  rect(lit, 13, 28, 12, 1, "h");
  rect(lit, 12, 29, 14, 1, "H");
  rect(lit, 18, 20, 2, 4, "S");
  rect(lit, 20, 21, 1, 4, "k");
  rect(lit, 18, 24, 3, 1, "k");
  return Pic.of(clean(lit, lone, "XO").toString());
}
const HEAD = head();

type Mark = readonly [x: number, y: number, w: number, h: number, ch: string];
/** Brows (x), lids (X), eyes (e) with glints (^), mouth (e) in the beard. */
const FACES: Record<string, readonly Mark[]> = {
  // Brows level and heavy, eyes half lidded: he already knows.
  neutral: [
    [9, 12, 8, 2, "x"],
    [21, 12, 8, 2, "x"],
    [16, 14, 1, 1, "x"],
    [21, 14, 1, 1, "x"],
    [11, 16, 6, 1, "X"],
    [21, 16, 6, 1, "X"],
    [12, 17, 4, 1, "e"],
    [22, 17, 4, 1, "e"],
    [16, 31, 6, 1, "e"],
  ],
  blink: [
    [9, 12, 8, 2, "x"],
    [21, 12, 8, 2, "x"],
    [11, 17, 6, 1, "X"],
    [21, 17, 6, 1, "X"],
    [16, 31, 6, 1, "e"],
  ],
  // Mid-sentence: one brow up, eyes open, the mouth open in the beard.
  lecture: [
    [9, 10, 8, 2, "x"],
    [21, 12, 8, 2, "x"],
    [11, 15, 6, 1, "X"],
    [21, 16, 6, 1, "X"],
    [12, 16, 4, 2, "e"],
    [22, 17, 4, 2, "e"],
    [15, 16, 1, 1, "^"],
    [25, 17, 1, 1, "^"],
    [15, 30, 8, 3, "e"],
    [17, 33, 4, 1, "e"],
  ],
  // Emphatic: brows drawn in, mouth wide.
  shout: [
    [9, 11, 7, 2, "x"],
    [15, 13, 2, 1, "x"],
    [22, 11, 7, 2, "x"],
    [21, 13, 2, 1, "x"],
    [12, 16, 4, 2, "e"],
    [22, 16, 4, 2, "e"],
    [15, 16, 1, 1, "^"],
    [25, 16, 1, 1, "^"],
    [14, 30, 10, 4, "e"],
  ],
  // Something slid across the ice with nothing pushing it.
  stunned: [
    [10, 9, 7, 2, "x"],
    [21, 9, 7, 2, "x"],
    [11, 14, 5, 5, "e"],
    [22, 14, 5, 5, "e"],
    [12, 15, 3, 3, "w"],
    [23, 15, 3, 3, "w"],
    [13, 16, 1, 1, "e"],
    [24, 16, 1, 1, "e"],
    [17, 30, 4, 4, "e"],
  ],
  wince: [
    [9, 13, 8, 2, "x"],
    [21, 13, 8, 2, "x"],
    [11, 16, 2, 1, "e"],
    [13, 17, 2, 1, "e"],
    [11, 18, 2, 1, "e"],
    [25, 16, 2, 1, "e"],
    [23, 17, 2, 1, "e"],
    [25, 18, 2, 1, "e"],
    [14, 31, 10, 2, "e"],
  ],
  // Freed: brows lifted, eyes bright, the corners of the mouth up.
  curious: [
    [10, 11, 7, 2, "x"],
    [21, 11, 7, 2, "x"],
    [12, 16, 4, 2, "e"],
    [22, 16, 4, 2, "e"],
    [15, 16, 1, 1, "^"],
    [25, 16, 1, 1, "^"],
    [15, 30, 1, 1, "e"],
    [16, 31, 6, 1, "e"],
    [22, 30, 1, 1, "e"],
  ],
};
function face(name: string): Pic {
  const p = Pic.blank(38, 44);
  for (const [x, y, w, h, ch] of FACES[name] ?? []) rect(p, x, y, w, h, ch);
  return p;
}

// Body ------------------------------------------------------------------------------------------

/** The robe without arms: linen chiton, the plum himation over the left shoulder. */
function body(swell = 0, lean = 0): Pic {
  const p = blank();
  const s = swell;
  const L = (x: number, y: number): Vec => [x + Math.round(lean * ((140 - y) / 66)), y];
  poly(
    p,
    [
      L(65, 72),
      L(95, 72),
      L(105, 79),
      L(108 + s, 102),
      L(111 + s * 2, 139),
      L(49 - s * 2, 139),
      L(52 - s, 102),
      L(55, 79),
    ],
    "p",
  );
  const lit = light(p, "p", LINEN, { light: 3, dark: 2 });
  for (const x of [56, 62, 68, 92, 98, 104]) line(lit, x + lean, 133, x + lean, 138, "q");
  const him = blank();
  poly(
    him,
    [
      L(86, 71),
      L(96, 72),
      L(106, 80),
      L(109 + s, 102),
      L(112 + s * 2, 131),
      L(48 - s * 2, 131),
      L(50 - s, 114),
    ],
    "Q",
  );
  const hl = light(him, "Q", PLUM, { light: 4, dark: 3 });
  const folds: [Vec, Vec, string][] = [
    [L(62, 112), L(58, 130), "P"],
    [L(63, 111), L(59, 130), "Y"],
    [L(75, 104), L(73, 130), "P"],
    [L(86, 94), L(86, 130), "P"],
    [L(87, 94), L(87, 128), "Y"],
    [L(97, 84), L(99, 130), "P"],
    [L(104, 82), L(106, 122), "K"],
  ];
  for (const [[x0, y0], [x1, y1], ch] of folds) line(hl, x0, y0, x1, y1, ch, "QPY");
  // The gold meander along the diagonal edge and round the hem.
  const [a, b] = [L(86, 71), L(50, 114)];
  line(hl, a[0], a[1], b[0], b[1], "A", "QPYK");
  line(hl, a[0], a[1] + 1, b[0], b[1] + 1, "D", "QPYK");
  line(hl, a[0], a[1] + 2, b[0], b[1] + 2, "a", "QPYK");
  for (let x = 40; x <= 120; x++) {
    const m = (x + 200) % 6;
    for (const [dy, ch] of [
      [0, m < 3 ? "A" : "D"],
      [1, m === 1 || m === 4 ? "D" : "a"],
      [2, m < 3 ? "D" : "A"],
    ] as const) {
      const cur = hl.at(x, 127 + dy);
      if (cur && "QPYK".includes(cur)) hl.set(x, 127 + dy, ch);
    }
  }
  lit.put(hl, 0, 0);
  lit.put(
    `
    .OOOOO.......OOOOO.
    OSSSkO.......OSSSkO
    OOOOOO.......OOOOOO
  `,
    70 + lean,
    138,
  );
  return lit;
}

// Arms -------------------------------------------------------------------------------------------

const HANDS: Record<string, string> = {
  // Index finger up at the thumb side, the thumb laid across: the lecturing hand.
  point: `
    .OO........
    OSkO.......
    OSkO.......
    OSkO.......
    OSkOOOOO...
    OSSSSSSkO..
    OSOSOSOkO..
    OSSSSSSkO..
    OOOOOOSkO..
    .OSSSSkkO..
    ..OOOOOO...
  `,
  // Open palm turned up.
  palm: `
    ..O.O.O....
    .OSOSOSO...
    .OSOSOSOO..
    .OSSSSSSkO.
    OSOSSSSSkO.
    OSSSSSSkkO.
    .OSSSSkkO..
    ..OOOOOO...
  `,
  two: `
    .O.O.......
    OSOSO......
    OSOSO......
    OSOSOOOO...
    OSSSSSSkO..
    OSSSSSSkO..
    .OSSSSkkO..
    ..OOOOOO...
  `,
  three: `
    .O.O.O.....
    OSOSOSO....
    OSOSOSO....
    OSOSOSOOO..
    OSSSSSSkO..
    OSSSSSSkO..
    .OSSSSkkO..
    ..OOOOOO...
  `,
  // Four fingers up: the fourth 논제.
  four: `
    .O.O.O.O...
    OSOSOSOkO..
    OSOSOSOkO..
    OSOSOSOkO..
    OSSSSSSkO..
    OSSSSSSkO..
    .OSSSSkkO..
    ..OOOOOO...
  `,
  fist: `
    .OOOOOO.
    OSSSSSkO
    OSSSSSkO
    OSSSSkkO
    OSSSkkkO
    .OOOOOO.
  `,
};

/** An arm from the shoulder: a sleeve (linen) or the himation (plum) to the elbow, then skin. */
function arm(p: Pic, pts: readonly Vec[], sleeve: "linen" | "plum"): void {
  const skin = blank();
  limb(skin, pts.slice(1), 3.4, "s");
  p.put(light(skin, "s", SKIN, { light: 1, dark: 1 }), 0, 0);
  const cloth = blank();
  const [s0, s1] = pts as [Vec, Vec];
  const reach = sleeve === "linen" ? 0.55 : 0.9;
  const mid: Vec = [s0[0] + (s1[0] - s0[0]) * reach, s0[1] + (s1[1] - s0[1]) * reach];
  limb(cloth, [s0, mid], sleeve === "linen" ? 5.5 : 5.5, sleeve === "linen" ? "p" : "Q");
  p.put(
    sleeve === "linen"
      ? light(cloth, "p", LINEN, { light: 2, dark: 2 })
      : light(cloth, "Q", PLUM, { light: 2, dark: 2 }),
    0,
    0,
  );
}

const BOULDER = `
  .....GGGGG.....
  ...GGqqqqvGG...
  ..GqwwqqqqvgG..
  .GqwqqqqqvvggG.
  GqwqqqqqvvgggG.
  GqqqqqvvvgggggG
  GvqqqvvggggggGG
  GvvvvgggggggggG
  .GggggggggggGG.
  ..GGGGGGGGGGG..
`;
const FEATHER = `
  .......GG
  ......GwG
  .....GwpG
  ....GwpqG
  ....GwpG.
  ...GwpqG.
  ...GwpG..
  ..GwpqG..
  ..GwpG...
  .GwqqG...
  .GwqG....
  GqqG.....
  .DD......
  .D.......
`;

type Pose =
  | "lecture"
  | "chop"
  | "count1"
  | "count2"
  | "count3"
  | "count4"
  | "scale"
  | "scale-up"
  | "raise"
  | "fold"
  | "press"
  | "flail"
  | "clutch"
  | "down"
  | "look";

const SL: Vec = [59, 82];
const SR: Vec = [101, 82];

function arms(pose: Pose, lean = 0): Pic {
  const p = blank();
  const L = (x: number, y: number): Vec => [x + lean, y];
  const hand = (k: string, x: number, y: number) => p.put(HANDS[k] as string, x + lean, y);
  const onLectern = () => {
    arm(p, [L(...SR), L(110, 102), L(122, 110)], "plum");
    hand("fist", 120, 106);
  };
  switch (pose) {
    case "lecture":
      arm(p, [L(...SL), L(44, 96), L(40, 74)], "linen");
      hand("point", 34, 62);
      onLectern();
      break;
    case "chop":
      arm(p, [L(...SL), L(44, 94), L(36, 84)], "linen");
      hand("palm", 28, 78);
      onLectern();
      break;
    case "count1":
    case "count2":
    case "count3":
    case "count4":
      // The 논제 number on his fingers before he states it.
      arm(p, [L(...SL), L(44, 96), L(42, 74)], "linen");
      hand(
        ({ count1: "point", count2: "two", count3: "three", count4: "four" } as const)[pose],
        36,
        pose === "count1" ? 60 : 64,
      );
      onLectern();
      break;
    case "scale":
    case "scale-up": {
      // A balance: the boulder low on his right, the feather high on his left.
      const d = pose === "scale-up" ? -4 : 0;
      arm(p, [L(...SL), L(42, 98), L(30, 108 + d)], "linen");
      p.put(BOULDER, 20 + lean, 100 + d);
      hand("fist", 24 + lean, 106 + d);
      arm(p, [L(...SR), L(118, 72), L(130, 58 - d)], "plum");
      hand("palm", 125, 52 - d);
      p.put(FEATHER, 131 + lean, 36 - d);
      break;
    }
    case "raise":
      arm(p, [L(...SL), L(42, 70), L(34, 50)], "linen");
      hand("palm", 27, 42);
      arm(p, [L(...SR), L(118, 70), L(126, 50)], "plum");
      hand("palm", 121, 42);
      break;
    case "fold":
      arm(p, [L(...SR), L(100, 100), L(64, 98)], "plum");
      arm(p, [L(...SL), L(60, 98), L(96, 94)], "linen");
      hand("fist", 92, 91);
      break;
    case "press":
      arm(p, [L(...SL), L(40, 88), L(24, 86)], "linen");
      hand("palm", 14, 80);
      arm(p, [L(...SR), L(120, 88), L(136, 86)], "plum");
      hand("palm", 135, 80);
      break;
    case "flail":
      arm(p, [L(...SL), L(46, 70), L(44, 52)], "linen");
      hand("palm", 38, 44);
      arm(p, [L(...SR), L(116, 92), L(128, 80)], "plum");
      hand("palm", 124, 72);
      break;
    case "clutch":
      arm(p, [L(...SL), L(56, 96), L(70, 84)], "linen");
      hand("fist", 66, 78);
      arm(p, [L(...SR), L(104, 96), L(92, 86)], "plum");
      hand("fist", 86, 80);
      break;
    case "down":
      arm(p, [L(...SL), L(54, 100), L(54, 112)], "linen");
      hand("fist", 50, 110);
      arm(p, [L(...SR), L(106, 100), L(106, 112)], "plum");
      hand("fist", 102, 110);
      break;
    case "look":
      // Freed: one hand turned up in front of him and studied like a new specimen.
      arm(p, [L(...SL), L(54, 100), L(54, 112)], "linen");
      hand("fist", 50, 110);
      arm(p, [L(...SR), L(106, 100), L(92, 94)], "plum");
      hand("palm", 82, 88);
      break;
  }
  return p;
}

// Plinth and lectern -------------------------------------------------------------------------

/** The marble drum he stands on: his natural place. A meander runs round its face. */
function plinth(dx = 0, cracked = 0): Pic {
  const p = blank();
  const cx = CX + dx;
  rect(p, cx - 36, 141, 73, 13, "q");
  ellipse(p, cx + 0.5, 153.5, 36.5, 5, "q");
  let lit = light(p, "q", { line: "G", dark: "g", mid: "q", light: "p" }, { light: 0, dark: 3 });
  for (let x = cx - 35; x <= cx + 35; x++) {
    const m = (x - cx + 60) % 8;
    lit.set(x, 145, m < 5 ? "v" : "q");
    lit.set(x, 146, m === 0 || m === 4 ? "v" : "q");
    lit.set(x, 147, m < 5 && m !== 2 ? "q" : "v");
    if (x < cx - 26) for (let y = 142; y < 154; y++) if (lit.at(x, y) === "q") lit.set(x, y, "p");
  }
  const top = Pic.blank(SIZE, SIZE);
  ellipse(top, cx + 0.5, 141.5, 36.5, 8, "p");
  const tl = light(top, "p", { line: "G", dark: "q", mid: "p", light: "w" }, { light: 3, dark: 1 });
  lit.put(tl, 0, 0);
  if (cracked > 0) {
    line(lit, cx - 4, 134, cx + 2, 142, "G");
    line(lit, cx + 2, 142, cx - 1, 153, "G");
    if (cracked > 1) {
      line(lit, cx + 14, 136, cx + 20, 148, "G");
      line(lit, cx - 20, 140, cx - 26, 152, "G");
    }
  }
  lit = Pic.of(lit.toString());
  return lit;
}

function lectern(slam = 0, fallen = false): Pic {
  const p = blank();
  if (fallen) {
    poly(
      p,
      [
        [110, 150],
        [148, 145],
        [150, 152],
        [112, 157],
      ],
      "c",
    );
    const l = light(p, "c", { line: "W", dark: "W", mid: "c", light: "C" });
    rect(l, 130, 140, 14, 6, "p");
    return l;
  }
  // A plain wooden stand beside the plinth, its slanted top holding the open scroll.
  rect(p, 125, 118, 7, 36, "c");
  poly(
    p,
    [
      [114, 150],
      [142, 150],
      [145, 156],
      [111, 156],
    ],
    "c",
  );
  poly(
    p,
    [
      [110, 108 + slam],
      [144, 103 + slam],
      [144, 112 + slam],
      [110, 119 + slam],
    ],
    "C",
  );
  let l = light(p, "c", { line: "W", dark: "W", mid: "c", light: "C" }, { light: 1, dark: 1 });
  l = light(l, "C", { line: "W", dark: "c", mid: "C", light: "C" }, { light: 1, dark: 1 });
  rect(l, 113, 107 + slam, 28, 7, "p");
  line(l, 113, 107 + slam, 140, 103 + slam, "w");
  for (const y of [110, 112]) line(l, 116, y + slam, 138, y - 4 + slam, "g");
  return l;
}

// The four spheres -----------------------------------------------------------------------------

const HALO_C: Vec = [80, 92];
/** Each element's ring: radius, then deep, dark, mid, light characters. */
const SPHERES = [
  { r: 36, c: "TtuU" },
  { r: 46, c: "Nnbl" },
  { r: 56, c: "Ggpw" },
  { r: 66, c: "RrmF" },
] as const;

/**
 * One ring of a sphere, `tilt` squashing it vertically, `turn` sliding its dashes round. Lit
 * from the top left: the lit arc takes the light step.
 */
function sphereRing(
  p: Pic,
  r: number,
  chars: string,
  tilt = 0.92,
  turn = 0,
  dy = 0,
  gap = 0,
): void {
  const [cx, cy] = HALO_C;
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      const nx = (x + 0.5 - cx) / r;
      const ny = (y + 0.5 - cy - dy) / (r * tilt);
      const d = Math.hypot(nx, ny);
      if (d > 1 || d < 1 - 3 / r) continue;
      const a = (Math.atan2(nx, -ny) / (2 * Math.PI) + 1) % 1;
      if (gap && ((a + turn) * gap) % 1 < 0.18) continue;
      const band = d > 1 - 1 / r ? 0 : d > 1 - 2 / r ? 2 : 3;
      const lit = a > 0.62 && a < 0.95;
      const shade = a > 0.2 && a < 0.5;
      const ch = band === 0 ? chars[0] : band === 2 ? chars[shade ? 1 : 2] : chars[lit ? 3 : 2];
      p.set(x, y, ch as string);
    }
}

/** A small orb of an element. */
function orb(p: Pic, x: number, y: number, kind: "earth" | "water" | "air" | "fire"): void {
  const o = Pic.blank(12, 12);
  const ramp = { earth: "TtuU", water: "Nnbl", air: "Ggpw", fire: "RrmF" }[kind];
  ellipse(o, 6, 6, 5.5, 5.5, ramp[2] as string);
  const lit = light(o, ramp[2] as string, {
    line: ramp[0] as string,
    dark: ramp[1] as string,
    mid: ramp[2] as string,
    light: ramp[3] as string,
  });
  if (kind === "fire") {
    lit.set(5, 0, "R");
    lit.set(6, 0, "m");
    lit.set(7, 1, "M");
  }
  p.put(lit, x - 6, y - 6);
}

/** A stone hand pressing the outer sphere: the mover that keeps everything moving. */
/** A stone hand pressing the outer sphere, fingers spread: the mover that keeps it moving. */
const PUSHER = `
  ...GG..GG..GG.......
  ..GpqGGpqGGpqG......
  ..GpqGGpqGGpqG......
  ..GpqGGpqGGpqG.GG...
  ..GpqGGpqGGpqGGpqG..
  ..GpqGGpqGGpqGGpqG..
  ..GpqGGpqGGpqGpqG...
  ..GpqqqqqqqqqqqqG...
  .GpqqqqqqqqqqqqqG...
  .GpqqqqqqqqqqqqgG...
  .GpqqqqqqqqqqqggG...
  ..GqqqqqqqqqqqggG...
  ..GqqqqqqqqqqggG....
  ...GqqqqqqqqggG.....
  ....GgggggggGG......
  .....GgggggG........
  .....GgggggG........
  .....GGGGGGG........
`;
const flipGrid = (g: string) => Pic.of(g).flipX().toString();
const flipV = (g: string) => {
  const r = Pic.of(g)
    .rows.slice()
    .reverse()
    .map((row) => row.join(""));
  return r.join("\n");
};

type HaloKind = "lecture" | "weight" | "place" | "push" | "plenum" | "break" | "shards";

function halo(kind: HaloKind, step: number): Pic {
  const p = blank();
  switch (kind) {
    case "lecture":
      for (const [i, s] of SPHERES.entries())
        sphereRing(p, s.r, s.c, 0.92, step * 0.03 * (i % 2 ? -1 : 1), 0, 6);
      break;
    case "weight":
      // Tilted and sinking, stones hung from the outer ring.
      for (const [i, s] of SPHERES.entries())
        sphereRing(p, s.r, s.c, 0.5, step * 0.02, 10 + i * 2, 4);
      for (const [x, y] of [
        [22, 112],
        [138, 110],
        [44, 128],
      ] as const) {
        line(p, x, y - 14 - step, x, y - 6, "G");
        p.put(BOULDER, x - 6, y - 6 + (step % 2));
      }
      break;
    case "place":
      for (const s of SPHERES) sphereRing(p, s.r, s.c, 0.92, 0, 0, 0);
      // Each element riding at its natural height: earth lowest, then water, air, fire on top.
      orb(p, 30 + step, 140, "earth");
      orb(p, 144 - step, 90, "water");
      orb(p, 26 + step, 62, "air");
      orb(p, 80 + (step % 2 ? -3 : 3), 18, "fire");
      break;
    case "push":
      for (const s of SPHERES) sphereRing(p, s.r, s.c, 0.92, 0, 0, 6);
      // Palms toward the centre, pressing the outer sphere round.
      p.put(flipV(flipGrid(PUSHER)), 14 + step, 30 + step);
      p.put(flipV(PUSHER), 126 - step, 30 + step);
      p.put(flipGrid(PUSHER), 14 + step, 118 - step);
      p.put(PUSHER, 126 - step, 118 - step);
      break;
    case "plenum": {
      // The spheres closed into one full sphere of air: nowhere left empty.
      const [cx, cy] = HALO_C;
      ellipse(p, cx, cy, 66 + step, 62 + step, "p");
      const lit = light(
        p,
        "p",
        { line: "G", dark: "q", mid: "p", light: "w" },
        { light: 3, dark: 3 },
      );
      for (let y = 0; y < SIZE; y++)
        for (let x = 0; x < SIZE; x++) {
          if (lit.at(x, y) !== "p") continue;
          if ((x * 2 + y + step * 3) % 11 === 0) lit.set(x, y, "~");
          else if ((x + y * 3 + step * 5) % 17 === 0) lit.set(x, y, ":");
        }
      return lit;
    }
    case "break":
      for (const [i, s] of SPHERES.entries())
        sphereRing(p, s.r, s.c, 0.92 - i * 0.04, 0.1 * i, i * 2 - 3, 3);
      for (let k = 0; k < 6; k++)
        line(p, 30 + k * 20, 20 + (k % 3) * 30, 36 + k * 20, 40 + (k % 3) * 30, "+");
      break;
    case "shards":
      for (const [i, s] of SPHERES.entries())
        sphereRing(p, s.r, s.c, 0.6, 0.2 * i, 30 + step * 8 + i * 4, 2);
      break;
  }
  return p;
}

// Parts and frames -------------------------------------------------------------------------------

type Frames = Record<string, string>;

const headFrames: Frames = {};
for (const name of Object.keys(FACES)) {
  for (const [suffix, dy] of [
    ["", 0],
    ["-nod", 1],
  ] as const) {
    const p = blank();
    p.put(HEAD, HX, HY + dy);
    p.put(face(name), HX, HY + dy);
    headFrames[`${name}${suffix}`] = finish(p);
  }
}

const bodyFrames: Frames = {
  stand: finish(body()),
  swell0: finish(body(2)),
  swell1: finish(body(4)),
  lean: finish(body(0, 3)),
  stagger: finish(body(0, -3)),
};

const ARM_POSES: Pose[] = [
  "lecture",
  "chop",
  "count1",
  "count2",
  "count3",
  "count4",
  "scale",
  "scale-up",
  "raise",
  "fold",
  "press",
  "flail",
  "clutch",
  "down",
  "look",
];
const armFrames: Frames = Object.fromEntries(ARM_POSES.map((k) => [k, finish(arms(k))]));
armFrames["push-lean"] = finish(arms("fold", 3));

/** A finished frame moved down: freed, he steps off the drum onto the ground in front of it. */
function shifted(grid: string, dy: number): string {
  const src = Pic.of(grid);
  const out = Pic.blank(src.w, src.h);
  out.put(src, 0, dy);
  return out.toString();
}
const STEP = 13;
bodyFrames.ground = shifted(bodyFrames.stand as string, STEP);
armFrames["down-ground"] = shifted(armFrames.down as string, STEP);
armFrames["look-ground"] = shifted(armFrames.look as string, STEP);
headFrames["stunned-ground"] = shifted(headFrames.stunned as string, STEP);
headFrames["curious-ground"] = shifted(headFrames.curious as string, STEP);
headFrames["curious-ground-nod"] = shifted(headFrames["curious-nod"] as string, STEP);

const plinthFrames: Frames = {
  still: finish(plinth()),
  pushed0: finish(plinth(1)),
  pushed1: finish(plinth(2)),
  cracked: finish(plinth(0, 1)),
  split: finish(plinth(0, 2)),
};

const lecternFrames: Frames = {
  idle: finish(lectern()),
  slam: finish(lectern(2)),
  fallen: finish(lectern(0, true)),
};

const haloFrames: Frames = {};
for (const [kind, steps] of [
  ["lecture", 4],
  ["weight", 2],
  ["place", 2],
  ["push", 2],
  ["plenum", 2],
  ["break", 1],
  ["shards", 3],
] as const) {
  for (let i = 0; i < steps; i++)
    haloFrames[`${kind}${i}`] = clean(halo(kind, i), lone, DEEP).toString();
}

/** The whole lecturing figure in one colour, for the entrance's palette drain. */
const DRAIN = (() => {
  const p = blank();
  for (const g of [
    haloFrames.lecture0,
    plinthFrames.still,
    bodyFrames.stand,
    armFrames.lecture,
    headFrames.neutral,
    lecternFrames.idle,
  ])
    p.put(g as string, 0, 0);
  return p.toString();
})();

const part = (
  name: string,
  frames: Frames,
  anim: Record<string, { frames: string[]; fps: number; loop?: boolean; jump?: number }>,
  extra: object = {},
) =>
  sprite({
    name: `boss-aristotle-${name}`,
    group: "page1-bosses",
    size: [SIZE, SIZE],
    origin: [CX, 156],
    palette,
    lone,
    frames,
    anim,
    ...extra,
  });

export default [
  part(
    "halo",
    haloFrames,
    {
      lecture: { frames: ["lecture0", "lecture1", "lecture2", "lecture3"], fps: 3 },
      weight: { frames: ["weight0", "weight1"], fps: 2 },
      place: { frames: ["place0", "place1"], fps: 2 },
      push: { frames: ["push0", "push1"], fps: 2 },
      plenum: { frames: ["plenum0", "plenum1"], fps: 3 },
      break: { frames: ["break0"], fps: 1, loop: false },
      shards: { frames: ["shards0", "shards1", "shards2"], fps: 4, loop: false, jump: 1 },
    },
    { outline: false },
  ),
  part("plinth", plinthFrames, {
    still: { frames: ["still"], fps: 1 },
    pushed: { frames: ["pushed0", "pushed1"], fps: 8 },
    cracked: { frames: ["cracked"], fps: 1 },
    split: { frames: ["split"], fps: 1, loop: false },
  }),
  part("body", bodyFrames, {
    stand: { frames: ["stand"], fps: 1 },
    swell: { frames: ["swell0", "swell1"], fps: 3 },
    lean: { frames: ["lean"], fps: 1 },
    hit: { frames: ["lean", "stand"], fps: 8, loop: false },
    stagger: { frames: ["stagger"], fps: 1, loop: false },
    freed: { frames: ["stand", "ground"], fps: 1, loop: false },
  }),
  part("arms", armFrames, {
    lecture: { frames: ["lecture", "lecture", "chop", "lecture"], fps: 2 },
    count1: { frames: ["count1"], fps: 1 },
    count2: { frames: ["count2"], fps: 1 },
    count3: { frames: ["count3"], fps: 1 },
    count4: { frames: ["count4"], fps: 1 },
    "scale-up": { frames: ["scale", "scale-up"], fps: 4, loop: false },
    scale: { frames: ["scale"], fps: 1 },
    raise: { frames: ["raise"], fps: 1 },
    fold: { frames: ["fold"], fps: 1 },
    press: { frames: ["press"], fps: 1 },
    pushed: { frames: ["push-lean"], fps: 1 },
    flail: { frames: ["flail", "clutch"], fps: 4, loop: false },
    freed: { frames: ["down", "down-ground", "look-ground"], fps: 1, loop: false },
  }),
  part("head", headFrames, {
    neutral: { frames: ["neutral", "neutral", "neutral", "neutral", "blink"], fps: 2 },
    lecture: { frames: ["lecture", "neutral", "lecture-nod", "lecture", "neutral-nod"], fps: 4 },
    shout: { frames: ["shout"], fps: 1, loop: false },
    stunned: { frames: ["stunned"], fps: 1, loop: false },
    wince: { frames: ["wince"], fps: 1, loop: false },
    hit: { frames: ["wince", "neutral"], fps: 6, loop: false },
    curious: { frames: ["curious", "curious-nod"], fps: 1 },
    freed: {
      frames: ["stunned", "stunned-ground", "curious-ground", "curious-ground-nod"],
      fps: 1,
      loop: false,
    },
  }),
  part("lectern", lecternFrames, {
    idle: { frames: ["idle"], fps: 1 },
    slam: { frames: ["slam", "idle"], fps: 6, loop: false },
    fallen: { frames: ["fallen"], fps: 1, loop: false },
  }),
  sprite({
    name: "boss-aristotle-drain",
    group: "page1-bosses",
    size: [SIZE, SIZE],
    origin: [CX, 156],
    palette: silhouette(palette, "ink.deep"),
    frames: { drain: DRAIN },
    anim: { drain: { frames: ["drain"], fps: 1 } },
  }),
];
