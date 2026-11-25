import { type Legend, sprite } from "../../format.ts";
import { Pic, smooth, tidy } from "../../paint.ts";

/**
 * What lies past the 운동장 at 23:40, when the first rift opens. On the campus side the night:
 * the dorm's lit windows behind a row of pines. In the middle the sky itself is torn like a
 * page, and through the hole the era's afternoon pours in: gold haze, a low sun, olive hills
 * with a temple on the brow, and a bright sea below them. The tear's lip is paper, lit by the
 * day it lets through.
 */
const palette: Legend = {
  ".": null,
  // night
  a: "ink.deep",
  b: "ink.dark",
  B: "navy.dark",
  f: "board.deep",
  F: "board.dark",
  // greek sky
  Y: "gold.pale",
  y: "gold.light",
  t: "clay.pale",
  T: "clay.light",
  w: "stone.bright",
  // hills and temple
  o: "olive.mid",
  O: "olive.dark",
  l: "olive.light",
  k: "stone.pale",
  K: "stone.light",
  M: "stone.mid",
  // sea
  s: "sea.mid",
  S: "sea.dark",
  q: "sea.light",
  Q: "sea.pale",
  // paper
  P: "stone.bright",
  p: "stone.pale",
  e: "stone.light",
  v: "stone.vein",
  n: "navy.light",
  N: "navy.mid",
  r: "red.light",
  R: "red.mid",
  // working cells
  x: null,
  // lit windows and specks are dots on purpose
  "'": "gold.light",
  "*": "gold.pale",
  "+": "clay.pale",
};
const lone = "'*+";

// The torn sky ------------------------------------------------------------------------------

const TEAR_W = 200;
const TEAR_H = 96;

/** A triangle wave: the zigzag of a tear. */
const tri = (v: number, period: number, amp: number): number =>
  amp * (Math.abs(((v / period) % 1) * 2 - 1) * 2 - 1);

/** The hole's left and right edge per row: ripped from a point at the top, open at the bottom. */
function holeSpan(y: number): [number, number] {
  const k = Math.min(1, Math.max(0, (y - 2) / 66));
  const half = 4 + 84 * k ** 1.25;
  const lean = (1 - k) * 10;
  const tearL = tri(y, 8, 5) + tri(y + 3, 3, 1.5);
  const tearR = tri(y + 5, 10, 5) + tri(y, 4, 1.5);
  return [100 + lean - half + tearL, 100 + lean + half + tearR];
}

function inHole(x: number, y: number): boolean {
  const [l, r] = holeSpan(y);
  const top = 2 + Math.abs(x - 112) * 0.9 + tri(x, 6, 2);
  return y >= top && x >= l && x <= r;
}

/** The era's view: banded gold sky, a low sun, hills of olives with a temple, the sea below. */
function eraView(x: number, y: number): string {
  if (y >= 66) {
    // Sea, darker toward the far shore, glints in rows.
    const glint = (x * 3 + y * 5) % 23 < 2 && y % 3 === 0;
    if (y < 69) return "S";
    return glint ? (y < 80 ? "Q" : "q") : "s";
  }
  const hill =
    52 - 16 * Math.exp(-(((x - 106) / 34) ** 2)) - 6 * Math.exp(-(((x - 170) / 26) ** 2));
  if (y >= hill) return y < hill + 1.5 ? "l" : (x * 7 + y * 3) % 17 === 0 ? "O" : "o";
  const sun = Math.hypot(x - 134, (y - 24) * 1.1);
  if (sun < 6) return "w";
  if (sun < 8.5) return (x + y) % 2 ? "Y" : "y";
  if (y < 14) return "T";
  if (y < 18) return (x + y) % 2 ? "T" : "t";
  if (y < 32) return "t";
  if (y < 36) return (x + y) % 2 ? "t" : "Y";
  return "Y";
}

function skyTear(): string {
  const pic = Pic.blank(TEAR_W, TEAR_H);
  for (let y = 0; y < TEAR_H; y++)
    for (let x = 0; x < TEAR_W; x++) if (inHole(x, y)) pic.set(x, y, eraView(x, y));
  // The temple on the brow of the first hill.
  pic.put(
    `
      ....kkkkkkkkkkkk....
      ..wwwwwwwwwwwwwwww..
      ..KKKKKKKKKKKKKKKK..
      ...wK.wK.wK.wK.wK...
      ...wK.wK.wK.wK.wK...
      ...wK.wK.wK.wK.wK...
      ..kkkkkkkkkkkkkkkk..
      .KKKKKKKKKKKKKKKKKK.
    `,
    96,
    31,
  );
  // The paper lip around the hole: lit torn edge, pale page, crease, fibres.
  const lip = Pic.blank(TEAR_W, TEAR_H);
  for (let y = 0; y < TEAR_H; y++) {
    for (let x = 0; x < TEAR_W; x++) {
      if (inHole(x, y)) continue;
      let d = 9;
      for (let dy = -6; dy <= 6; dy++)
        for (let dx = -6; dx <= 6; dx++)
          if (inHole(x + dx, y + dy)) d = Math.min(d, Math.hypot(dx, dy));
      const w = 3 + 2.5 * (0.5 + 0.5 * Math.sin(y * 0.21 + x * 0.05));
      const fibre = (x * 5 + y * 3) % 7 === 0;
      if (d <= 1.01) lip.set(x, y, "e");
      else if (d <= w - 1) lip.set(x, y, "P");
      else if (d <= w || (fibre && d <= w + 1.5)) lip.set(x, y, "p");
    }
  }
  pic.put(smooth(lip), 0, 0);
  return smooth(pic, "'").toString();
}

// The campus side ---------------------------------------------------------------------------

/** 새벽관 at night beyond the field: a long dark block with its corridors lit, pines in front. */
function nightDorm(): string {
  const W = 240;
  const H = 36;
  const pic = Pic.blank(W, H);
  for (let x = 6; x < 200; x++) {
    const top = x < 90 ? 8 : x < 100 ? 8 - (x - 90) * 0.6 : x < 110 ? 2 + (x - 100) * 0.6 : 8;
    for (let y = Math.round(top); y < H; y++) pic.set(x, y, y === Math.round(top) ? "B" : "b");
  }
  // Corridor lights in rows, some rooms awake.
  for (let row = 0; row < 3; row++) {
    const y = 12 + row * 7;
    for (let x = 10; x < 196; x += 6) {
      const on = (x * 7 + row * 13) % 5 < (row === 1 ? 3 : 1);
      if (on) pic.set(x, y, "'").set(x + 1, y, "'");
    }
  }
  // Pines in front, cones with ragged sides.
  for (const [cx, hgt] of [
    [6, 24],
    [28, 18],
    [50, 28],
    [76, 20],
    [104, 26],
    [128, 17],
    [150, 29],
    [176, 22],
    [204, 27],
    [228, 19],
  ] as const) {
    for (let y = H - hgt; y < H; y++) {
      const half = Math.max(1, Math.round(((y - (H - hgt)) / hgt) * 7 + Math.sin(y * 1.7) * 1.3));
      for (let x = cx - half; x <= cx + half; x++)
        if (x >= 0 && x < W) pic.set(x, y, x === cx - half ? "F" : "f");
    }
  }
  return tidy(pic, "f", "'").toString();
}

/** Marble balustrade along the far edge of the agora's terrace, where the ground drops to the sea. */
const TERRACE = `
  KKKKKKKKKKKKKKKK
  wwwwwwwwwwwwwwww
  kkkkkkkkkkkkkkkk
  MMMMMMMMMMMMMMMM
  .wK..wK..wK..wK.
  .wK..wK..wK..wK.
  .wK..wK..wK..wK.
  .wK..wK..wK..wK.
  kkkkkkkkkkkkkkkk
  KKKKKKKKKKKKKKKK
  MMMMMMMMMMMMMMMM
`;

// Things being pulled in ------------------------------------------------------------------------

type V3 = readonly [number, number, number];

const rotX = ([x, y, z]: V3, a: number): V3 => [
  x,
  y * Math.cos(a) - z * Math.sin(a),
  y * Math.sin(a) + z * Math.cos(a),
];
const rotY = ([x, y, z]: V3, a: number): V3 => [
  x * Math.cos(a) + z * Math.sin(a),
  y,
  -x * Math.sin(a) + z * Math.cos(a),
];
const rotZ = ([x, y, z]: V3, a: number): V3 => [
  x * Math.cos(a) - y * Math.sin(a),
  x * Math.sin(a) + y * Math.cos(a),
  z,
];

/** Light from the top left and a little toward the viewer. */
const SUN: V3 = (() => {
  const v: V3 = [-0.55, -0.7, 0.85];
  const n = Math.hypot(...v);
  return [v[0] / n, v[1] / n, v[2] / n];
})();

/** How a flying sheet sits in one frame: turned, tipped, spun, bowed and curled. */
interface Pose {
  readonly turn: number;
  readonly tip: number;
  readonly spin: number;
  readonly bow: number;
  readonly curl: number;
}

/**
 * A page torn out of the 0조 notebook, as a real sheet in the air: bowed across its width by
 * the wind, its top corner curling, turned and tipped in space and drawn from that, so its
 * outline, its foreshortening and its shading all come from the bend. Lit from the top left;
 * the side turned away goes a step grey, and a sheet seen from behind shows its blank back.
 * The front is ruled in blue with a red margin, its left edge torn where it left the spiral.
 */
function page(w: number, h: number, size: number, pose: Pose): string {
  const pic = Pic.blank(size, size);
  const best = new Map<number, { z: number; d: number; ch: string }>();
  const at = (u: number, v: number): V3 => {
    const x = (u - 0.5) * w;
    const y = (v - 0.5) * h;
    const z =
      pose.bow * w * ((u - 0.5) ** 2 * 4 - 0.33) +
      pose.curl * h * Math.max(0, u - v - 0.4) ** 2 * 3;
    return rotZ(rotX(rotY([x, y, z], pose.turn), pose.tip), pose.spin);
  };
  const c = (size - 1) / 2;
  const step = 0.2;
  for (let pv = 0; pv <= h - step / 2; pv += step) {
    for (let pu = 0; pu <= w - step / 2; pu += step) {
      const col = Math.floor(pu);
      const row = Math.floor(pv);
      // The spiral's torn edge: a notch every third row.
      if (col === 0 && row % 3 === 1 && h >= 9) continue;
      const u = (pu + step / 2) / w;
      const v = (pv + step / 2) / h;
      const p = at(u, v);
      const du = at(u + 0.01, v);
      const dv = at(u, v + 0.01);
      const a: V3 = [du[0] - p[0], du[1] - p[1], du[2] - p[2]];
      const b: V3 = [dv[0] - p[0], dv[1] - p[1], dv[2] - p[2]];
      const n: V3 = [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
      ];
      const len = Math.hypot(...n) || 1;
      const front = n[2] >= 0;
      const s = front ? 1 : -1;
      const lit = (s * (n[0] * SUN[0] + n[1] * SUN[1] + n[2] * SUN[2])) / len;
      const tone = front
        ? lit > 0.82
          ? 3
          : lit > 0.55
            ? 2
            : lit > 0.25
              ? 1
              : 0
        : lit > 0.7
          ? 2
          : lit > 0.3
            ? 1
            : 0;
      let ch = "vepP"[tone] as string;
      if (front && col === 2 && w >= 8) ch = tone >= 2 ? "r" : "R";
      else if (front && row % 3 === 2 && col >= 3 && col < w - 1) ch = tone >= 2 ? "n" : "N";
      const sx = Math.round(c + p[0]);
      const sy = Math.round(c + p[1]);
      if (sx < 0 || sy < 0 || sx >= size || sy >= size) continue;
      const key = sy * size + sx;
      const d = Math.hypot(c + p[0] - sx, c + p[1] - sy);
      const cur = best.get(key);
      if (!cur || p[2] > cur.z + 0.4 || (Math.abs(p[2] - cur.z) <= 0.4 && d < cur.d))
        best.set(key, { z: Math.max(p[2], cur?.z ?? -1e9), d, ch });
    }
  }
  for (const [key, { ch }] of best) pic.set(key % size, Math.floor(key / size), ch);
  // The edge turned from the light, below and to the right, one step darker.
  const darker: Record<string, string> = { P: "p", p: "e", e: "v", v: "M", n: "N", r: "R" };
  const edged = pic.clone();
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const ch = pic.at(x, y) as string;
      if (ch === "." || !(ch in darker)) continue;
      if (pic.at(x + 1, y) === "." || pic.at(x, y + 1) === ".")
        edged.set(x, y, darker[ch] as string);
    }
  }
  return smooth(edged).toString();
}

/** A tumble: one full turn of the sheet about its long axis, flexing as it goes. */
function pageFrames(w: number, h: number, n: number): string[] {
  const size = Math.ceil(Math.hypot(w, h)) + 3;
  return Array.from({ length: n }, (_, i) => {
    const t = (i / n) * Math.PI * 2;
    return page(w, h, size, {
      turn: t + 0.4,
      tip: 0.45 + 0.2 * Math.sin(t),
      spin: -0.35 + 0.25 * Math.sin(t + 1.2),
      bow: 0.08 + 0.06 * Math.cos(t * 2),
      curl: 0.3 + 0.15 * Math.sin(t),
    });
  });
}

/** A scrap of the field coming loose at the tear: sand on top, pale page underneath. */
const SCRAPS = [
  `
    ..kkk...
    .kKKkk..
    kKKKKkp.
    .pppppp.
    ..pPP...
  `,
  `
    ...kk...
    ..kKKk..
    .pkKKkp.
    .ppPPpp.
    ........
  `,
  `
    ........
    .pppp...
    pPPPPp..
    .kKKkk..
    ..kkk...
  `,
  `
    ...pp...
    ..pPPp..
    .kkKKkk.
    ..kKKk..
    ........
  `,
];

/** Warm specks of the era's light, rising toward the tear. */
function embers(frame: number): string {
  const pic = Pic.blank(24, 32);
  for (const [x0, y0, ch] of [
    [3, 30, "*"],
    [12, 26, "+"],
    [20, 31, "*"],
    [8, 20, "+"],
    [16, 14, "*"],
  ] as const) {
    const t = (frame * 2 + x0) % 30;
    const x = Math.round(x0 + Math.sin((t + x0) * 0.5) * 2);
    const y = y0 - t;
    if (y >= 0) pic.set(Math.max(0, Math.min(23, x)), y, ch);
  }
  return pic.toString();
}

const four = (grids: readonly string[], prefix: string) =>
  Object.fromEntries(grids.map((g, i) => [`${prefix}${i}`, g]));

export default [
  sprite({
    name: "sky-tear",
    size: [TEAR_W, TEAR_H],
    origin: [0, 0],
    palette,
    outline: false,
    frames: { still: skyTear() },
    anim: { idle: { frames: ["still"], fps: 1 } },
  }),
  sprite({
    name: "night-dorm",
    size: [240, 36],
    origin: [0, 35],
    palette,
    lone,
    outline: false,
    frames: { still: nightDorm() },
    anim: { idle: { frames: ["still"], fps: 1 } },
  }),
  sprite({
    name: "terrace",
    size: [16, 11],
    origin: [0, 10],
    palette,
    outline: false,
    frames: { run: TERRACE },
    anim: { idle: { frames: ["run"], fps: 1 } },
  }),
  ...(
    [
      ["page-s", 6, 8],
      ["page-m", 9, 12],
      ["page-l", 12, 16],
    ] as const
  ).map(([name, w, h]) => {
    const frames = pageFrames(w, h, 8);
    const size = Math.ceil(Math.hypot(w, h)) + 3;
    return sprite({
      name,
      size: [size, size],
      origin: [Math.floor(size / 2), Math.floor(size / 2)],
      palette,
      outline: false,
      frames: Object.fromEntries(frames.map((g, i) => [`turn${i}`, g])),
      anim: {
        turn: { frames: frames.map((_, i) => `turn${i}`), fps: 8, jump: 1 },
      },
    });
  }),
  sprite({
    name: "scrap",
    size: [8, 5],
    palette,
    outline: false,
    frames: four(SCRAPS, "tumble"),
    anim: { tumble: { frames: ["tumble0", "tumble1", "tumble2", "tumble3"], fps: 6, jump: 1 } },
  }),
  sprite({
    name: "embers",
    size: [24, 32],
    origin: [0, 31],
    palette,
    lone,
    outline: false,
    frames: Object.fromEntries(Array.from({ length: 15 }, (_, i) => [`rise${i}`, embers(i)])),
    anim: {
      rise: { frames: Array.from({ length: 15 }, (_, i) => `rise${i}`), fps: 8, jump: 1 },
    },
  }),
];
