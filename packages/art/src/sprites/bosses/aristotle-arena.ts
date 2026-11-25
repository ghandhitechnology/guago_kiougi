import { type Legend, sprite } from "../../format.ts";
import { clean, ellipse, light, line, Pic, poly, rect, seal } from "./kit.ts";

/**
 * The 리케이온 arena: everything the four 논제 throw at the class, and what the class breaks.
 *
 * - `p1-boulder` falls fast (`fall`), lands (`land`); its `p1-fall-mark` darkens quickly with a
 *   red rim. `p1-feather` drifts (`drift`), and its mark is a wide, faint dotted ring. Heavier
 *   things look like they fall faster because the telegraph says so; that is the joke.
 * - `p1-zone-earth`, `-water`, `-air`, `-fire`: element zones on the floor, each with its
 *   triangle and arrows toward its natural place (earth down, fire up). `dormant`, `pull0`,
 *   `pull1`.
 * - `p1-ice`: a tileable frozen floor, `fill` and `frost` (before the 넷째 논제), and
 *   `p1-block`, the marble block a student slides across it (`still`, `slide0`, `slide1`).
 * - `boss-aristotle-shield`: the 반론 불가 dome over him, on his 160×160 canvas: `full`,
 *   `crack1`, `crack2`, `break`.
 * - `p1-stele`: the thesis steles players break to strip the shield, one per 논제 (`t1` to
 *   `t4`), each with `-cracked` and `-broken`.
 */

const palette: Legend = {
  ".": null,
  G: "stone.deep",
  g: "stone.mid",
  v: "stone.vein",
  q: "stone.light",
  p: "stone.pale",
  w: "stone.bright",
  D: "gold.deep",
  a: "gold.mid",
  A: "gold.light",
  B: "gold.pale",
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
  X: "ink.deep",
  x: "ink.dark",
  K: "plum.deep",
  Q: "plum.mid",
  // Lone marks.
  "+": "stone.bright",
  "~": "sea.pale",
  ":": "gold.light",
  "*": "red.light",
  ",": "stone.light",
};
const lone = "+~:*,";
const DEEP = "GDTNRXK";
const DEEP_OF: Record<string, string> = {
  g: "G",
  v: "G",
  q: "G",
  p: "G",
  w: "G",
  a: "D",
  A: "D",
  B: "D",
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
  x: "X",
  Q: "K",
};
const finish = (p: Pic): string =>
  clean(seal(clean(p, lone, DEEP), DEEP_OF, lone), lone, DEEP).toString();
const STONE = { line: "G", dark: "g", mid: "q", light: "p" } as const;
const FLAT = 0.62;

// Boulder and feather -------------------------------------------------------------------------

function boulder(turn: number, cracked = false): string {
  const p = Pic.blank(24, 24);
  ellipse(p, 12, 13, 10.5, 9.5, "q");
  ellipse(p, 9, 9, 5, 4, "q");
  const lit = light(p, "q", STONE, { light: 3, dark: 3 });
  const marks =
    turn % 2
      ? [
          [7, 14, 11, 16],
          [14, 8, 17, 11],
        ]
      : [
          [8, 9, 11, 12],
          [14, 15, 18, 15],
        ];
  for (const [a, b, c, d] of marks)
    line(lit, a as number, b as number, c as number, d as number, "v");
  if (cracked) {
    line(lit, 12, 4, 10, 13, "G");
    line(lit, 10, 13, 15, 21, "G");
  }
  return finish(lit);
}
/** Falling: the boulder with speed streaks above it. */
function falling(turn: number): string {
  const p = Pic.of(boulder(turn));
  const out = Pic.blank(24, 40);
  for (const x of [6, 11, 17]) line(out, x, 0, x, 14 - (x % 3), ",");
  out.put(p, 0, 16);
  return out.toString();
}
function landed(): string {
  const out = Pic.blank(24, 40);
  out.put(Pic.of(boulder(0, true)), 0, 16);
  for (const [x, y] of [
    [1, 34],
    [22, 33],
    [3, 28],
    [21, 26],
  ] as const)
    out.set(x, y, "+");
  return out.toString();
}

const FEATHER = `
  ........GG
  .......GwG
  ......GwpG
  .....GwpqG
  .....GwpG.
  ....GwpqG.
  ....GwpG..
  ...GwpqG..
  ...GwpG...
  ..GwqqG...
  ..GwqG....
  .GqqG.....
  ..DD......
  ..D.......
`;
function feather(k: number): string {
  const p = Pic.blank(16, 18);
  const f = Pic.of(FEATHER);
  const tilt = [0, 1, 2, 1][k % 4] as number;
  p.put(k % 4 === 2 ? f.flipX() : f, 2 + tilt, 2 + (k % 2));
  return finish(p);
}

/** Where a boulder lands: a hard shadow that darkens fast, rimmed red. */
function fallMark(stage: number): string {
  const d = 30;
  const h = Math.ceil(d * FLAT) + 2;
  const p = Pic.blank(d + 2, h);
  const r = (d / 2) * (0.55 + stage * 0.15);
  ellipse(p, (d + 2) / 2, h / 2, r, r * FLAT, stage > 1 ? "x" : ".");
  for (let y = 0; y < h; y++)
    for (let x = 0; x < d + 2; x++) {
      const nx = (x + 0.5 - (d + 2) / 2) / (d / 2);
      const ny = (y + 0.5 - h / 2) / ((d / 2) * FLAT);
      const e = Math.hypot(nx, ny);
      if (e <= 1 && e > 1 - 2.2 / (d / 2)) p.set(x, y, stage === 3 ? "M" : "m");
      else if (stage <= 1 && e <= 0.55 + stage * 0.15 && (x + y) % 2 === 0) p.set(x, y, "x");
    }
  return p.toString();
}
/** Where a feather will settle, eventually: a wide ring of dots, barely there. */
function featherMark(stage: number): string {
  const d = 30;
  const h = Math.ceil(d * FLAT) + 2;
  const p = Pic.blank(d + 2, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < d + 2; x++) {
      const nx = (x + 0.5 - (d + 2) / 2) / (d / 2);
      const ny = (y + 0.5 - h / 2) / ((d / 2) * FLAT);
      const e = Math.hypot(nx, ny);
      if (e <= 1 && e > 1 - 1.2 / (d / 2) && (x + stage) % 3 === 0) p.set(x, y, "+");
    }
  return p.toString();
}

// Element zones -------------------------------------------------------------------------------

const ELEMENTS = {
  earth: { ramp: "TtuU", down: true, bar: true },
  water: { ramp: "Nnbl", down: true, bar: false },
  air: { ramp: "Gqpw", down: false, bar: true },
  fire: { ramp: "RrmF", down: false, bar: false },
} as const;

/**
 * A zone: a ring on the floor in the element's colours, its triangle in the middle (pointing
 * down for the heavy pair, up for the light pair, barred for earth and air) and arrows at the
 * sides toward its natural place.
 */
function zone(kind: keyof typeof ELEMENTS, pulse: number): string {
  const { ramp, down, bar } = ELEMENTS[kind];
  const [deep, dark, mid, lit] = [...ramp] as [string, string, string, string];
  const W = 64;
  const H = 42;
  const p = Pic.blank(W, H);
  const rx = 30 - (pulse === 2 ? 2 : 0);
  const ry = rx * FLAT;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const nx = (x + 0.5 - W / 2) / rx;
      const ny = (y + 0.5 - H / 2) / ry;
      const e = Math.hypot(nx, ny);
      if (e > 1) continue;
      if (e > 1 - (1.5 / rx) * 2) p.set(x, y, pulse ? lit : mid);
      else if (e > 1 - (3 / rx) * 2) p.set(x, y, deep);
      else if (pulse && (x + y * 2 + pulse * 3) % 7 === 0) p.set(x, y, dark);
    }
  // The triangle, 15 wide.
  const tri = Pic.blank(17, 13);
  const pts: [number, number][] = down
    ? [
        [0, 0],
        [17, 0],
        [8.5, 13],
      ]
    : [
        [8.5, 0],
        [17, 13],
        [0, 13],
      ];
  poly(tri, pts, mid);
  const tl = light(tri, mid, { line: deep, dark, mid, light: lit }, { light: 2, dark: 1 });
  if (bar) rect(tl, 3, down ? 4 : 8, 11, 2, deep);
  p.put(tl, W / 2 - 8, H / 2 - 7);
  // Arrows toward the natural place.
  const arrow = down ? [".x.", "xxx", ".x."] : [".x.", "xxx", ".x."];
  const ay = down ? H / 2 + 4 : H / 2 - 8;
  for (const ax of [10, W - 13]) {
    const g = Pic.of(arrow.join("\n").replaceAll("x", deep));
    p.put(g, ax, ay);
    p.set(ax + 1, ay + (down ? 3 : -1), deep);
    p.set(ax + 1, ay + (down ? 4 : -2), pulse ? lit : deep);
  }
  return p.toString();
}

// Ice and the block ---------------------------------------------------------------------------

/** A tileable sheet of ice: pale, with long cracks and glints that line up across tiles. */
function ice(frost: boolean): string {
  const p = Pic.blank(32, 32, "l");
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 32; x++) if ((x * 3 + y * 5) % 23 < 2) p.set(x, y, "L");
  line(p, 0, 9, 13, 14, "b");
  line(p, 13, 14, 31, 11, "b");
  line(p, 20, 0, 24, 13, "b");
  line(p, 6, 22, 31, 27, "b");
  rect(p, 4, 4, 3, 1, "w");
  rect(p, 22, 18, 2, 1, "w");
  if (frost)
    for (let y = 0; y < 32; y++)
      for (let x = 0; x < 32; x++)
        if ((x + y * 7) % 5 === 0 || (x * 5 + y) % 9 === 0) p.set(x, y, "p");
  return p.toString();
}

/** The marble block a student slides: lit from the top left, a meander scratched on it. */
function block(slide: number): string {
  const p = Pic.blank(30, 26);
  rect(p, 6, 4, 22, 9, "p");
  rect(p, 6, 13, 22, 11, "q");
  let lit = light(p, "p", { line: "G", dark: "q", mid: "p", light: "w" }, { light: 2, dark: 0 });
  lit = light(lit, "q", { line: "G", dark: "g", mid: "q", light: "q" }, { light: 0, dark: 2 });
  for (let x = 8; x < 26; x++) lit.set(x, 17, x % 4 < 2 ? "v" : "q");
  const out = Pic.of(finish(lit));
  if (slide) {
    for (const [y, len] of [
      [8, 5],
      [14, 4 + slide],
      [20, 3],
    ] as const)
      line(out, 0, y, len - 1, y, "~");
  }
  return out.toString();
}

// Shield --------------------------------------------------------------------------------------

/**
 * 반론 불가: a dome over him of gold rule lines, like the ruled border of an exam paper, broken
 * into dashes that thin out as the class strips it.
 */
function shield(stage: number): string {
  const S = 160;
  const p = Pic.blank(S, S);
  const cx = 80;
  const cy = 92;
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const nx = (x + 0.5 - cx) / 74;
      const ny = (y + 0.5 - cy) / 70;
      const e = Math.hypot(nx, ny);
      const a = (Math.atan2(nx, -ny) / (2 * Math.PI) + 1) % 1;
      const gap = stage === 0 ? 0 : stage === 1 ? 0.15 : 0.4;
      const hole = (a * 24) % 1 < gap || (stage >= 2 && a > 0.55 && a < 0.7);
      if (e <= 1 && e > 0.97 && !hole) p.set(x, y, e > 0.985 ? "D" : "A");
      else if (e <= 0.93 && e > 0.91 && !hole && Math.floor(a * 96) % 2 === 0) p.set(x, y, ":");
    }
  // The base ring on the ground.
  for (let x = 0; x < S; x++) {
    const nx = (x + 0.5 - cx) / 74;
    if (Math.abs(nx) > 1) continue;
    const y = Math.round(150 + Math.sqrt(1 - nx * nx) * 6);
    if (stage < 3) {
      p.set(x, y, "D");
      p.set(x, y - 1, "A");
    }
  }
  if (stage === 3) {
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2;
      const x = Math.round(cx + Math.sin(a) * (60 + (k % 3) * 8));
      const y = Math.round(cy - Math.cos(a) * (56 + (k % 2) * 8));
      line(p, x, y, x + (k % 2 ? 2 : -2), y + 2, ":");
    }
  }
  return p.toString();
}

// Steles ----------------------------------------------------------------------------------------

/** Each 논제's sign, cut into the stele face. */
const SIGNS: Record<string, string> = {
  // A stone over a feather on a beam.
  t1: `
    ...GGG....
    ..GgggG...
    ..GgggG..x
    xxxGGGxxxx
    ....x...x.
    ....x...x.
  `,
  // The four triangles of the elements.
  t2: `
    ..x....xxxxx
    .xxx....xxx.
    xxxxx....x..
    ............
    xxxxx....x..
    .xxx....xxx.
    ..x....xxxxx
  `,
  // An open hand pushing.
  t3: `
    .x.x.x....
    .x.x.x.x..
    .xxxxxxx..
    .xxxxxx...
    ..xxxx....
    ..xxxx....
  `,
  // A full circle: nowhere empty.
  t4: `
    ..xxxxx..
    .xxxxxxx.
    xxxxxxxxx
    xxxxxxxxx
    xxxxxxxxx
    .xxxxxxx.
    ..xxxxx..
  `,
};
function stele(sign: string, damage: number): string {
  const p = Pic.blank(26, 42);
  if (damage < 2) {
    poly(
      p,
      [
        [4, 6],
        [21, 6],
        [22, 36],
        [3, 36],
      ],
      "q",
    );
    rect(p, 2, 3, 22, 4, "p");
    rect(p, 1, 36, 24, 5, "q");
  } else {
    poly(
      p,
      [
        [4, 22],
        [12, 18],
        [21, 24],
        [22, 36],
        [3, 36],
      ],
      "q",
    );
    rect(p, 1, 36, 24, 5, "q");
  }
  let lit = light(p, "q", STONE, { light: 2, dark: 2 });
  lit = light(lit, "p", { line: "G", dark: "q", mid: "p", light: "w" }, { light: 1, dark: 1 });
  if (damage < 2) {
    const s = Pic.of(SIGNS[sign] as string);
    lit.put(s.swap("xG", "Ga"), Math.round(13 - s.w / 2), 13);
    // A gold rule under the sign, for the shield it feeds.
    rect(lit, 6, 29, 14, 1, "A");
  }
  if (damage === 1) {
    line(lit, 8, 7, 12, 20, "G");
    line(lit, 12, 20, 9, 33, "G");
    line(lit, 17, 12, 19, 22, "G");
  }
  if (damage === 2) {
    for (const [x, y] of [
      [3, 31],
      [24, 30],
      [7, 16],
      [20, 14],
    ] as const)
      rect(lit, x, y, 2, 2, "g");
  }
  return finish(lit);
}

export default [
  sprite({
    name: "p1-boulder",
    group: "page1-bosses",
    size: [24, 40],
    palette,
    lone,
    frames: { fall0: falling(0), fall1: falling(1), land: landed() },
    anim: {
      fall: { frames: ["fall0", "fall1"], fps: 12 },
      land: { frames: ["land"], fps: 1, loop: false },
    },
  }),
  sprite({
    name: "p1-feather",
    group: "page1-bosses",
    size: [16, 18],
    palette,
    lone,
    frames: { drift0: feather(0), drift1: feather(1), drift2: feather(2), drift3: feather(3) },
    anim: { drift: { frames: ["drift0", "drift1", "drift2", "drift3"], fps: 3 } },
  }),
  sprite({
    name: "p1-fall-mark",
    group: "page1-bosses",
    size: [32, 21],
    origin: [16, 10],
    palette,
    lone: "xmM+",
    outline: false,
    frames: {
      boulder0: fallMark(0),
      boulder1: fallMark(1),
      boulder2: fallMark(2),
      boulder3: fallMark(3),
      feather0: featherMark(0),
      feather1: featherMark(1),
    },
    anim: {
      boulder: {
        frames: ["boulder0", "boulder1", "boulder2", "boulder3"],
        fps: 8,
        loop: false,
        jump: 1,
      },
      feather: { frames: ["feather0", "feather1"], fps: 2, jump: 1 },
    },
  }),
  ...(Object.keys(ELEMENTS) as (keyof typeof ELEMENTS)[]).map((kind) =>
    sprite({
      name: `p1-zone-${kind}`,
      group: "page1-bosses",
      size: [64, 42],
      origin: [32, 21],
      palette,
      lone: "TtuUNnblGqpwRrmFx",
      outline: false,
      frames: { dormant: zone(kind, 0), pull0: zone(kind, 1), pull1: zone(kind, 2) },
      anim: {
        dormant: { frames: ["dormant"], fps: 1 },
        pull: { frames: ["pull0", "pull1"], fps: 4, jump: 1 },
      },
    }),
  ),
  sprite({
    name: "p1-ice",
    group: "page1-bosses",
    size: [32, 32],
    origin: [0, 0],
    palette,
    lone: "Lbwp",
    outline: false,
    frames: { fill: ice(false), frost: ice(true) },
    anim: { idle: { frames: ["fill"], fps: 1 } },
  }),
  sprite({
    name: "p1-block",
    group: "page1-bosses",
    size: [30, 26],
    palette,
    lone,
    frames: { still: block(0), slide0: block(1), slide1: block(3) },
    anim: {
      still: { frames: ["still"], fps: 1 },
      slide: { frames: ["slide0", "slide1"], fps: 8 },
    },
  }),
  sprite({
    name: "boss-aristotle-shield",
    group: "page1-bosses",
    size: [160, 160],
    origin: [80, 156],
    palette,
    lone: "DA:",
    outline: false,
    frames: { full: shield(0), crack1: shield(1), crack2: shield(2), break: shield(3) },
    anim: {
      full: { frames: ["full"], fps: 1 },
      crack1: { frames: ["crack1"], fps: 1 },
      crack2: { frames: ["crack2"], fps: 1 },
      break: { frames: ["break"], fps: 1, loop: false },
    },
  }),
  sprite({
    name: "p1-stele",
    group: "page1-bosses",
    size: [26, 42],
    palette,
    lone,
    frames: Object.fromEntries(
      Object.keys(SIGNS).flatMap((t) => [
        [t, stele(t, 0)],
        [`${t}-cracked`, stele(t, 1)],
        [`${t}-broken`, stele(t, 2)],
      ]),
    ),
    anim: { idle: { frames: ["t1"], fps: 1 } },
  }),
];
