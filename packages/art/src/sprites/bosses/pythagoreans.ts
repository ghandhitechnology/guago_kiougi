import { type Legend, sprite } from "../../format.ts";
import { clean, ellipse, Parts, Pic, seal, silhouette } from "./kit.ts";

/**
 * 피타고라스 학파, mid boss of Page 1: ten devotees standing in the tetractys, one, two, three and
 * four, the number they swore by. White linen, white fillets, the elder with a gold band at the
 * apex. They chant as one and count as one: the idle is the count itself, each row raising a
 * hand in turn while the tetractys of pebbles above them lights row by row, then the bow at ten.
 * One young member in the middle of the third row keeps glancing sideways at the diagonal; he is
 * the one who will say 나는 first.
 *
 * Their theory is their shape. The formation only moves in lockstep hops along the grid, every
 * attack is drawn along a row or a column (knotted cords held across each row, measuring rods
 * held upright, square tablets raised and slammed), and nothing they do ever leans. When a player
 * crosses a cell corner to corner they clap their hands over their ears, the formation splays,
 * and the doubter is left standing in the middle with the diagonal burning across his chest.
 */

const palette: Legend = {
  ".": null,
  G: "stone.deep",
  g: "stone.mid",
  q: "stone.light",
  p: "stone.pale",
  w: "stone.bright",
  O: "flesh.deep",
  k: "flesh.dark",
  s: "flesh.mid",
  S: "flesh.light",
  X: "ink.deep",
  x: "ink.dark",
  h: "ink.mid",
  H: "ink.light",
  W: "wood.deep",
  c: "wood.mid",
  C: "wood.light",
  D: "gold.deep",
  a: "gold.mid",
  A: "gold.light",
  Y: "gold.pale",
  N: "navy.deep",
  n: "navy.dark",
  v: "navy.mid",
  V: "navy.light",
  // Lone marks: eyes, mouths, pebble glints, sparks.
  e: "ink.deep",
  m: "flesh.deep",
  "*": "gold.pale",
  "+": "stone.bright",
  "'": "stone.light",
  "~": "gold.light",
  ":": "gold.mid",
  ";": "gold.pale",
};
const lone = "em*+'~:;";

// One member: 13 wide, 20 tall. Head rows 0 to 10, robe rows 11 to 19. -------------------------

const HEADS = {
  black: `
    ....XXXXX....
    ..XXhHhhhxX..
    .XhHhhhhhhxX.
    .XwwppppppqX.
    XhSSSSSSSSkxX
    XhSSSSSSSSkxX
    XhSSSSSSSSkxX
    XhSSSSSSSSkxX
    .XSSSSSSSSkX.
    ..OkSSSSSkO..
    ...OOOOOOO...
  `,
  brown: `
    ....WWWWW....
    ..WWcCcccWW..
    .WcCcccccccW.
    .WwwppppppqW.
    WcSSSSSSSSkcW
    WcSSSSSSSSkcW
    WcSSSSSSSSkcW
    WcSSSSSSSSkWW
    .WSSSSSSSSkW.
    ..OkSSSSSkO..
    ...OOOOOOO...
  `,
  beard: `
    ....XXXXX....
    ..XXhHhhhxX..
    .XhHhhhhhhxX.
    .XwwppppppqX.
    XhSSSSSSSSkxX
    XhSSSSSSSSkxX
    XhSSSSSSSSkxX
    XhSxxxxxxxkxX
    .XxhhhhhhxxX.
    ..XxhhhhxxX..
    ...XXXXXXX...
  `,
  doubter: `
    ...XX.XXX....
    ..XhhXhhhxX..
    .XhHhhhHhhxX.
    .XhhSShhShxX.
    XhSSSSSSSSkxX
    XhSSSSSSSSkxX
    XhSSSSSSSSkxX
    XhSSSSSSSSkxX
    .XSSSSSSSSkX.
    ..OkSSSSSkO..
    ...OOOOOOO...
  `,
  elder: `
    ....GGGGG....
    ..GGwwwppGG..
    .GwDaAAaaDqG.
    .GpSSSSSSSqG.
    GwSSSSSSSSkqG
    GwSSSSSSSSkqG
    GwSSSSSSSSkqG
    GwpwwwwwwpqqG
    .GwppppppqqG.
    ..GwpppppqgG.
    ...GwppqqgG..
    ....GwqqgG...
    .....GGGG....
  `,
} as const;
type Hair = keyof typeof HEADS;

/** Face marks, placed on the head at [0, 6]. Eyes on rows 0 and 1, mouth on row 3. */
const FACES = {
  shut: `
    .............
    ...ee...ee...
  `,
  chant: `
    .............
    ...ee...ee...
    .............
    ......m......
  `,
  open: `
    ....e...e....
    ....e...e....
  `,
  glance: `
    .....e...e...
    .....e...e...
  `,
  glanceL: `
    ...e...e.....
    ...e...e.....
  `,
  wince: `
    ...e.....e...
    ....e...e....
    ...e.....e...
    ......m......
  `,
  wide: `
    ....e...e....
    ....e...e....
    .............
    ......m......
  `,
} as const;
type Face = keyof typeof FACES;

const ROBE = `
  ..GwwppqqgG..
  ..GwwpgqqgG..
  .GwwpgqqqqgG.
  .GwpgqqqqqgG.
  .GwppqqqqqgG.
  .GwppppqqqgG.
  .GaAAAaaaaDG.
  .GGGGGGGGGGG.
  ..OO.....OO..
`;
/** The elder wears a navy mantle over the linen: the one robe in the group that is not white. */
const MANTLE = `
  ..NvvvnnnnN..
  ..NvvnnnnnN..
  .GNvnnnnnnNG.
  .GwNnnnnnNgG.
  .GwpNnnnNqgG.
  .GwppNNNqqgG.
  .GaAAAaaaaDG.
  .GGGGGGGGGGG.
  ..OO.....OO..
`;
/** Feet drawn up under the hem for a hop. */
const ROBE_HOP = `
  ..GwwppqqgG..
  ..GwwpgqqgG..
  .GwwpgqqqqgG.
  .GwpgqqqqqgG.
  .GwppqqqqqgG.
  .GaAAAaaaaDG.
  .GGGGGGGGGGG.
  ...OO...OO...
`;

/** Arm poses: [grid, x, y] pieces drawn behind or in front of the head. */
type Arm = readonly (readonly [string, number, number, "back" | "front"])[];
const ARMS: Record<string, Arm> = {
  clasp: [["SS\nkk", 5, 14, "front"]],
  // Counting: one hand raised beside the face, a finger up.
  up: [
    [
      `
      .O..
      OSO.
      OSO.
      OkO.
      GwG.
      GwqG
      GwqG
      .GwG
      .GwG
      ..Gw
      ..Gw
      ..GG
    `,
      -2,
      -1,
      "front",
    ],
  ],
  // Both hands out to the sides at chest height: neighbours' hands meet.
  out: [
    [
      `
      ..GGG
      OSwwG
      OkqgG
    `,
      -3,
      12,
      "front",
    ],
    [
      `
      GGG..
      GqgSO
      GggkO
    `,
      11,
      12,
      "front",
    ],
  ],
  // Hands pressed over the ears.
  ears: [
    [
      `
      OS.
      Ok.
      GwG
      GwG
      .Gw
    `,
      -1,
      6,
      "front",
    ],
    [
      `
      .SO
      .kO
      GgG
      GgG
      gG.
    `,
      11,
      6,
      "front",
    ],
  ],
  // A hand on the rod held upright at the right side.
  rod: [["SO\nkO", 10, 13, "front"]],
  // The tablet in both hands.
  hold: [
    ["Ok\nOk", 1, 14, "front"],
    ["kO\nkO", 10, 14, "front"],
  ],
  raise: [
    ["Ok\nOk", 1, 6, "front"],
    ["kO\nkO", 10, 6, "front"],
  ],
  none: [],
};

const ROD = `
  .A.
  DYD
  DAD
  DaD
  DaD
  DAD
  DaD
  DaD
  DAD
  DaD
  DaD
  DAD
  DaD
  DaD
  DAD
  DaD
  DaD
  DAD
  DaD
  DaD
  DAD
  DaD
  DaD
  DAD
  DaD
  .D.
`;
const TABLET = `
  DDDDDDD
  DYAAAaD
  DA*AaaD
  DAAaaaD
  DAaaaaD
  DDDDDDD
`;
const TABLET_FLAT = `
  .DDDDD.
  DYAAaaD
  DDDDDDD
`;

// The formation -------------------------------------------------------------------------------

interface Member {
  readonly hair: Hair;
  readonly row: number;
  readonly x: number;
  readonly y: number;
}

/** The tetractys, back row first, so the front row draws last. Centre line x = 32. */
const TETRACTYS: readonly Member[] = [
  { hair: "elder", row: 0, x: 26, y: 22 },
  { hair: "beard", row: 1, x: 18, y: 32 },
  { hair: "brown", row: 1, x: 34, y: 32 },
  { hair: "black", row: 2, x: 10, y: 42 },
  { hair: "doubter", row: 2, x: 26, y: 42 },
  { hair: "beard", row: 2, x: 42, y: 42 },
  { hair: "brown", row: 3, x: 2, y: 52 },
  { hair: "black", row: 3, x: 18, y: 52 },
  { hair: "beard", row: 3, x: 34, y: 52 },
  { hair: "black", row: 3, x: 50, y: 52 },
];
const DOUBTER = 4;

interface Pose {
  readonly arms?: keyof typeof ARMS;
  readonly face?: Face;
  readonly dx?: number;
  readonly dy?: number;
  /** Head offset on top of the body's. */
  readonly nod?: number;
  readonly hop?: boolean;
  readonly item?: "rod" | "rodUp" | "hold" | "raise" | "slam";
  /** Somewhere else entirely, `t` of the way there (freed). */
  readonly to?: readonly [x: number, y: number];
  readonly t?: number;
}

type Placement = string | readonly [string, number, number];
const lib = new Parts();
const part = (key: string, x: number, y: number, grid: string): string => lib.add(key, x, y, grid);
for (const [hair, grid] of Object.entries(HEADS)) part(`head-${hair}`, 0, 0, grid);
for (const [face, grid] of Object.entries(FACES)) part(`face-${face}`, 0, 6, grid);
part("robe", 0, 11, ROBE);
part("mantle", 0, 11, MANTLE);
part("robe-hop", 0, 11, ROBE_HOP);
for (const [name, pieces] of Object.entries(ARMS)) {
  pieces.forEach(([grid, x, y], i) => {
    part(`arm-${name}${i}`, x, y, grid);
  });
}
part("rod", 10, -7, ROD);
part("tablet", 3, 12, TABLET);
part("tablet-flat", 3, 18, TABLET_FLAT);

function spot(m: Member, p: Pose): readonly [number, number] {
  const t = p.t ?? 1;
  const bx = p.to ? Math.round(m.x + (p.to[0] - m.x) * t) : m.x;
  const by = p.to ? Math.round(m.y + (p.to[1] - m.y) * t) : m.y;
  return [bx + (p.dx ?? 0), by + (p.dy ?? 0)];
}

function member(m: Member, p: Pose): Placement[] {
  const [x, y] = spot(m, p);
  const armName = p.arms ?? "clasp";
  const arms = ARMS[armName] ?? [];
  const out: Placement[] = [];
  const robe = p.hop ? "robe-hop" : m.hair === "elder" ? "mantle" : "robe";
  out.push([robe, x, y]);
  arms.forEach(([, , , layer], i) => {
    if (layer === "back") out.push([`arm-${armName}${i}`, x, y]);
  });
  const ny = y + (p.nod ?? 0);
  out.push([`head-${m.hair}`, x, ny]);
  out.push([`face-${p.face ?? "shut"}`, x, ny]);
  if (p.item === "hold") out.push(["tablet", x, y]);
  if (p.item === "raise") out.push(["tablet", x, y - 8]);
  if (p.item === "slam") out.push(["tablet-flat", x, y]);
  if (p.item === "rod") out.push(["rod", x, y]);
  if (p.item === "rodUp") out.push(["rod", x, y - 4]);
  arms.forEach(([, , , layer], i) => {
    if (layer === "front") out.push([`arm-${armName}${i}`, x, y]);
  });
  return out;
}

// The tetractys of pebbles over their heads: one dot per member, lit row by row. -------------

const PEBBLES: readonly (readonly [number, number])[] = TETRACTYS.map((m, i) => {
  const inRow = TETRACTYS.slice(0, i).filter((o) => o.row === m.row).length;
  return [32 - m.row * 2 + inRow * 4, 5 + m.row * 4] as const;
});

function emblem(name: string, state: (i: number) => "lit" | "dim" | "bright" | "off", jitter = 0) {
  const rows: string[][] = Array.from({ length: 22 }, () => Array(64).fill("."));
  PEBBLES.forEach(([cx, cy], i) => {
    const s = state(i);
    if (s === "off") return;
    const j = jitter ? ((i * 7) % 3) - 1 : 0;
    const k = jitter ? ((i * 5) % 3) - 1 : 0;
    const [ring, core] = s === "dim" ? ["G", "'"] : s === "lit" ? ["D", "*"] : ["D", "+"];
    const x = cx + j * jitter;
    const y = cy + k * jitter;
    for (const [dx, dy] of [
      [0, -1],
      [-1, 0],
      [1, 0],
      [0, 1],
    ] as const) {
      const row = rows[y + dy];
      if (row) row[x + dx] = ring;
    }
    const row = rows[y];
    if (row) row[x] = core;
  });
  return part(name, 0, 0, rows.map((r) => r.join("")).join("\n"));
}
const rowOf = (i: number) => (TETRACTYS[i] as Member).row;
emblem("emblem-dim", () => "dim");
for (let r = 0; r < 4; r++) emblem(`emblem-${r + 1}`, (i) => (rowOf(i) <= r ? "lit" : "dim"));
emblem("emblem-ten", () => "bright");
emblem("emblem-shake", (i) => (i % 3 === 0 ? "lit" : "dim"), 1);
emblem("emblem-fall", (i) => (i % 2 ? "dim" : "off"), 2);

/** The diagonal burning across the doubter's chest while the weak point is open. */
part(
  "diagonal",
  0,
  0,
  `
  +.....
  .AY...
  ..AY..
  ...AY.
  ....A+
`,
);
/** A cord stretched along one row through the joined hands, knotted at every member. */
function cord(name: string, y: number, x0: number, x1: number, plucked: boolean): string {
  const rows = [Array(64).fill("."), Array(64).fill(".")];
  for (let x = x0; x <= x1; x++) {
    const knot = (x - x0) % 7 === 0;
    const up = plucked && (x - x0) % 14 < 7;
    (rows[up ? 0 : 1] as string[])[x] = knot ? ";" : plucked ? ";" : "~";
    if (!plucked || knot) (rows[1] as string[])[x] = knot ? ";" : ":";
    if (!plucked) (rows[0] as string[])[x] = knot ? ";" : "~";
  }
  return part(name, 0, y, rows.map((r) => r.join("")).join("\n"));
}
const ROW_Y = [0, 1, 2, 3].map((r) => 22 + r * 10 + 13);
const rowSpan = (r: number) => {
  const ms = TETRACTYS.filter((m) => m.row === r);
  return [Math.min(...ms.map((m) => m.x)) - 3, Math.max(...ms.map((m) => m.x)) + 15] as const;
};
for (let r = 0; r < 4; r++) {
  const [a, b] = rowSpan(r);
  cord(`cord${r}`, ROW_Y[r] as number, a, b, false);
  cord(`pluck${r}`, ROW_Y[r] as number, a, b, true);
}

type Spec = (m: Member, i: number) => Pose;
/** Every member in its pose, drawn from the back (smallest y) to the front. */
const formation = (spec: Spec, ...over: Placement[]): Placement[] => [
  ...TETRACTYS.map((m, i) => ({ m, p: spec(m, i) }))
    .map((o, i) => ({ ...o, i, y: spot(o.m, o.p)[1] }))
    .sort((a, b) => a.y - b.y || a.i - b.i)
    .flatMap(({ m, p }) => member(m, p)),
  ...over,
];
const all =
  (p: Pose): Spec =>
  () =>
    p;
const away = (i: number, n: number) => Math.sign((TETRACTYS[i] as Member).x + 6 - 32) * n;

// Frames ----------------------------------------------------------------------------------------

const counting =
  (row: number): Spec =>
  (m) =>
    m.row === row ? { arms: "up", face: "chant" } : { face: m.row < row ? "shut" : "shut" };

/** Where each member ends up when the count stops: turned toward the one who spoke. */
const FREE: readonly Pose[] = [
  { to: [26, 24], arms: "none", face: "open", nod: 1 },
  { to: [14, 31], arms: "none", face: "glance" },
  { to: [38, 31], arms: "none", face: "glanceL" },
  { to: [4, 40], arms: "none", face: "glance" },
  { to: [26, 49], arms: "up", face: "wide" },
  { to: [48, 40], arms: "none", face: "glanceL" },
  { to: [0, 52], arms: "none", face: "glance" },
  { to: [13, 51], arms: "clasp", face: "glance" },
  { to: [39, 51], arms: "clasp", face: "glanceL" },
  { to: [51, 52], arms: "none", face: "glanceL" },
];
/** The pebbles of the tetractys, dropped: ordinary stones at the doubter's feet. */
part(
  "stones",
  22,
  68,
  `
  .G....G.......G...
  G'G..G'G.G...G'G..
  .G....G.G'G...G...
  ........G.........
`,
);

const plan: Record<string, Placement[]> = {
  // Idle: the count. Each row raises a hand as its pebbles light; at ten they bow.
  idle0: formation(all({}), "emblem-dim"),
  idle1: formation(counting(0), "emblem-1"),
  idle2: formation(counting(1), "emblem-2"),
  idle3: formation(counting(2), "emblem-3"),
  idle4: formation(counting(3), "emblem-4"),
  idle5: formation(all({ face: "chant", nod: 1 }), "emblem-ten"),
  idle6: formation((_, i) => (i === DOUBTER ? { face: "glance" } : {}), "emblem-dim"),
  idle7: formation((_, i) => (i === DOUBTER ? { face: "open" } : {}), "emblem-dim"),

  // Move: one lockstep hop to the next cell.
  move0: formation(all({ dy: 1, nod: 1 }), ["emblem-dim", 0, 1]),
  move1: formation(all({ dy: -2, hop: true }), ["emblem-dim", 0, -2]),
  move2: formation(all({ dy: 1, nod: 0 }), ["emblem-dim", 0, 0]),
  move3: formation(all({}), "emblem-dim"),

  // Row strike: hands joined along every row, a knotted cord pulled taut, plucked, released.
  row0: formation(all({ arms: "out", face: "shut" }), "emblem-dim"),
  row1: formation(
    all({ arms: "out", face: "chant" }),
    "emblem-4",
    "cord0",
    "cord1",
    "cord2",
    "cord3",
  ),
  row2: formation(
    all({ arms: "out", face: "chant", dy: 1 }),
    "emblem-ten",
    "pluck0",
    "pluck1",
    "pluck2",
    "pluck3",
  ),
  row3: formation(all({ arms: "out", face: "open", dy: -1 }), "emblem-dim"),

  // Column strike: measuring rods held upright, lifted, driven down along the columns.
  col0: formation(all({ arms: "rod", item: "rod" }), "emblem-dim"),
  col1: formation(all({ arms: "rod", item: "rodUp", face: "chant", dy: -1 }), "emblem-4"),
  col2: formation(all({ arms: "rod", item: "rod", face: "open", dy: 1 }), "emblem-ten"),
  col3: formation(all({ arms: "rod", item: "rod" }), "emblem-dim"),

  // Square numbers: tablets raised over every face, ten squares in a grid, then slammed down.
  square0: formation(all({ arms: "hold", item: "hold" }), "emblem-dim"),
  square1: formation(all({ arms: "raise", item: "raise", dy: -1 }), "emblem-4"),
  square2: formation(all({ arms: "raise", item: "raise", dy: -2 }), "emblem-ten"),
  square3: formation(all({ arms: "none", item: "slam", face: "chant", dy: 1 }), "emblem-dim"),

  // The weak point: the diagonal they cannot hear. Hands over ears, the triangle splays, the
  // doubter alone in the middle with the line across his chest.
  weak0: formation(
    (_, i) =>
      i === DOUBTER
        ? { face: "open" }
        : { arms: "ears", face: "wince", dx: away(i, 2), dy: i === 0 ? -2 : 0 },
    "emblem-shake",
    ["diagonal", 29, 55],
  ),
  weak1: formation(
    (_, i) =>
      i === DOUBTER
        ? { face: "glance" }
        : { arms: "ears", face: "wince", dx: away(i, 3), dy: i === 0 ? -3 : 1 },
    "emblem-fall",
    ["diagonal", 29, 55],
  ),

  hit: formation(all({ face: "wince", dx: 1, nod: -1 }), ["emblem-shake", 1, 0]),

  // Freed: the count stops, they look at one another, the triangle comes apart, and the
  // pebbles drop to the ground as ordinary stones.
  freed0: formation(all({ face: "open" }), "emblem-shake"),
  freed1: formation((_, i) => ({ ...FREE[i], arms: "none", face: "open", t: 0.25 }), "emblem-fall"),
  freed2: formation(
    (_, i) => (i === DOUBTER ? { ...FREE[i], t: 0.6 } : { ...FREE[i], arms: "none", t: 0.6 }),
    ["emblem-fall", 0, 8],
  ),
  freed3: formation((_, i) => FREE[i] as Pose, "stones"),
};

const W = 64;
const H = 72;
const DEEP = "GODXWN";
const DEEP_OF: Record<string, string> = {
  g: "G",
  q: "G",
  p: "G",
  w: "G",
  k: "O",
  s: "O",
  S: "O",
  x: "X",
  h: "X",
  H: "X",
  c: "W",
  C: "W",
  a: "D",
  A: "D",
  Y: "D",
  n: "N",
  v: "N",
  V: "N",
};
const render = (list: readonly Placement[]): string =>
  clean(seal(clean(lib.draw(W, H, list), lone, DEEP), DEEP_OF, lone), lone, DEEP).toString();
/** The ground under the whole tetractys, widest at the front row's feet. */
const SHADOW = (() => {
  const p = Pic.blank(W, H);
  ellipse(p, 32, 62, 31, 11, "G");
  ellipse(p, 32, 52, 22, 10, "G");
  return p.toString();
})();
const frames = Object.fromEntries(Object.entries(plan).map(([k, v]) => [k, render(v)]));

export default [
  sprite({
    name: "boss-pythagoreans",
    group: "page1-bosses",
    size: [W, H],
    palette,
    lone,
    shadow: SHADOW,
    frames,
    anim: {
      idle: {
        frames: [
          "idle0",
          "idle1",
          "idle2",
          "idle3",
          "idle4",
          "idle5",
          "idle5",
          "idle0",
          "idle0",
          "idle6",
          "idle7",
          "idle6",
          "idle0",
        ],
        fps: 4,
      },
      move: { frames: ["move0", "move1", "move2", "move3"], fps: 10 },
      row: { frames: ["row0", "row1", "row1", "row1", "row2", "row3"], fps: 8, loop: false },
      col: { frames: ["col0", "col1", "col1", "col1", "col2", "col3"], fps: 8, loop: false },
      square: {
        frames: ["square0", "square1", "square2", "square2", "square2", "square3", "square3"],
        fps: 8,
        loop: false,
      },
      weak: { frames: ["weak0", "weak1"], fps: 6 },
      hit: { frames: ["hit"], fps: 1, loop: false },
      freed: {
        frames: ["freed0", "freed0", "freed1", "freed1", "freed2", "freed2", "freed2", "freed3"],
        fps: 3,
        loop: false,
      },
    },
  }),
  sprite({
    name: "boss-pythagoreans-drain",
    group: "page1-bosses",
    size: [W, H],
    palette: silhouette(palette, "ink.deep"),
    frames: { drain: frames.idle5 as string },
    anim: { drain: { frames: ["drain"], fps: 1 } },
  }),
];
