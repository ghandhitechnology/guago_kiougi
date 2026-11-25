import { type Legend, sprite } from "../../format.ts";
import {
  clean,
  ell,
  facesLight,
  framesOf,
  grow,
  line,
  names,
  Pic,
  type Pt,
  paintAt,
  path,
  put,
  rng,
} from "../../fx.ts";

/**
 * 물리: plum light, white-hot at the core. Arcs, rings, zigzags and shock lines; impacts that
 * read as weight. Electricity is the violet of a plasma ball, so no 물리 effect is ever confused
 * with the red of an enemy.
 */
const PHYS: Legend = {
  ".": null,
  o: "plum.deep",
  d: "plum.dark",
  m: "plum.mid",
  l: "plum.light",
  p: "plum.pale",
  W: "stone.bright",
  // Ground: crack, its lit lip, dust.
  k: "ink.deep",
  i: "ink.dark",
  s: "stone.mid",
  t: "stone.light",
  u: "stone.pale",
  // Lone motes and grit.
  "*": "stone.bright",
  "'": "plum.pale",
  ",": "plum.light",
  ":": "stone.light",
};
const LONE = "*',:";
const fx = { group: "combat", outline: false, palette: PHYS, lone: LONE } as const;

// 홀리데이 일반물리 ---------------------------------------------------------------------------

/**
 * The tome, seen from above as it tumbles: a plum cover with a gold title band, its page block
 * showing under it. The book is drawn at angle `a` with light fixed at the top left, so every
 * turn keeps the same light.
 */
function tome(a: number): Pic {
  const s = 18;
  const c = 9;
  const hw = 6.2;
  const hh = 4.6;
  const local = (x: number, y: number, lift: number): [number, number] => {
    const dx = x - c;
    const dy = y - c + lift;
    return [dx * Math.cos(a) + dy * Math.sin(a), -dx * Math.sin(a) + dy * Math.cos(a)];
  };
  const inBox = (u: number, v: number, grow = 0) =>
    Math.abs(u) <= hw + grow && Math.abs(v) <= hh + grow;
  const pic = paintAt(s, s, (x, y) => {
    const [u, v] = local(x, y, 1);
    if (inBox(u, v)) {
      const edge = !inBox(u, v, -1);
      if (edge) {
        // Which way this edge faces on screen decides its light.
        const n =
          Math.abs(u) / hw > Math.abs(v) / hh
            ? Math.atan2(Math.sin(a) * Math.sign(u), Math.cos(a) * Math.sign(u))
            : Math.atan2(Math.cos(a) * Math.sign(v), -Math.sin(a) * Math.sign(v));
        return facesLight(n) ? "l" : "d";
      }
      if (Math.abs(v) < 1.1) return "Y";
      if (Math.abs(v) < 1.9) return "G";
      return u + v < -2 ? "l" : "m";
    }
    const [u2, v2] = local(x, y, -1);
    if (inBox(u2, v2)) return Math.round(u2 + v2) % 2 === 0 ? "t" : "u";
    return null;
  });
  // Outline: the plum deep around the cover, stone deep around the pages.
  const out = pic.clone();
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      if (pic.at(x, y) !== ".") continue;
      const n = [pic.at(x - 1, y), pic.at(x + 1, y), pic.at(x, y - 1), pic.at(x, y + 1)];
      if (n.some((ch) => ch && "lmdYG".includes(ch))) out.set(x, y, "o");
      else if (n.some((ch) => ch === "t" || ch === "u")) out.set(x, y, "q");
    }
  }
  return clean(out);
}

const TOME: Legend = { ...PHYS, Y: "gold.light", G: "gold.mid", q: "stone.deep" };

const tomeSprite = sprite({
  name: "fx-tome",
  group: "combat",
  palette: TOME,
  size: [18, 18],
  origin: [9, 9],
  frames: framesOf(
    "spin",
    [0, 1, 2, 3].map((k) => tome((k * Math.PI) / 4)),
  ),
  anim: { spin: { frames: names("spin", 4), fps: 16, jump: 0.5 } },
});

/**
 * The tome's ground shadow on the fake height axis: the client picks the frame by height, small
 * at the top of the arc and full as it lands.
 */
const tomeShadow = sprite({
  name: "fx-tome-shadow",
  group: "combat",
  outline: false,
  palette: { ".": null, z: "ink.dark", i: "ink.mid" },
  size: [18, 8],
  origin: [9, 4],
  frames: framesOf(
    "h",
    [3, 4.5, 6, 7.8].map((rx) =>
      clean(
        paintAt(18, 8, (x, y) => {
          const e = ell(x, y, 9, 4, rx, Math.max(1.3, rx * 0.42));
          return e < 0.65 ? "z" : e < 1 ? "i" : null;
        }),
      ),
    ),
  ),
  anim: { fall: { frames: names("h", 4), fps: 8, loop: false, jump: 1 } },
});

/** Ground cracks from the landing point: jagged runs squashed by the ground's perspective. */
function cracks(reach: number, seed: number): Pt[][] {
  const r = rng(seed);
  const runs: Pt[][] = [];
  const spokes = [0.15, 1.2, 2.3, 3.0, 4.3, 5.3];
  const lengths = [1, 0.55, 0.8, 0.95, 0.6, 0.75];
  spokes.forEach((spoke, i) => {
    let a = spoke + (r() - 0.5) * 0.4;
    const len = reach * (lengths[i] as number);
    let x = 24 + Math.cos(a) * 5.5;
    let y = 12.5 + Math.sin(a) * 2.8;
    const pts: Pt[] = [[x, y]];
    let d = 0;
    while (d < len) {
      const step = 2 + r() * 2.5;
      d += step;
      a += (r() - 0.5) * 1.1;
      x += Math.cos(a) * step;
      y += Math.sin(a) * step * 0.55;
      pts.push([x, y]);
    }
    runs.push(pts);
  });
  return runs;
}

/**
 * The landing on the ground: the crack star with plum glowing in it, a ring of dust thrown out,
 * then the cracks alone, lingering and closing.
 */
function crater(k: number): Pic {
  const w = 48;
  const h = 24;
  const pic = Pic.blank(w, h);
  const reach = [9, 12, 13, 13, 9, 4][k] as number;
  // Dust ring.
  if (k < 3) {
    const rx = [10, 16, 21][k] as number;
    const ry = rx * 0.45;
    const width = [2.2, 1.6, 1.1][k] as number;
    put(
      pic,
      paintAt(w, h, (x, y) => {
        const e = (ell(x, y, 24, 12, rx, ry) - 1) * ry;
        if (e < -width || e > 0.6) return null;
        if (k === 2 && Math.floor(Math.atan2(y - 12, (x - 24) * 0.5) * 2.2) % 2 === 0) return null;
        return y < 12 ? "u" : "t";
      }),
      0,
      0,
    );
  }
  for (const run of cracks(reach, 7)) {
    path(pic, run, "i");
  }
  // A lit lip above each crack pixel so it holds on the dark field too.
  const lip = pic.clone();
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (pic.at(x, y) === "i" && pic.at(x, y - 1) === ".") lip.set(x, y - 1, "s");
  if (k <= 1) {
    for (const run of cracks(reach, 7)) path(lip, run.slice(0, 2), k === 0 ? "p" : "l", false, "i");
  }
  if (k <= 3) {
    put(
      lip,
      paintAt(w, h, (x, y) => {
        // A shallow bowl: its far wall in shadow, its near wall catching the light, a raised rim.
        const e = ell(x, y, 24, 12.5, 5.2, 2.8);
        if (e < 0.78) return y < 12.5 ? "i" : "s";
        if (e < 1.25) return y < 12 ? "t" : "s";
        return null;
      }),
      0,
      0,
    );
  }
  return clean(lip);
}

const tomeCrater = sprite({
  ...fx,
  name: "fx-tome-crater",
  size: [48, 24],
  origin: [24, 12],
  frames: framesOf("c", [0, 1, 2, 3, 4, 5].map(crater)),
  anim: {
    land: { frames: ["c0", "c1", "c2"], fps: 14, loop: false, jump: 1 },
    linger: { frames: ["c3"], fps: 1, loop: false },
    fade: { frames: ["c3", "c4", "c5"], fps: 6, loop: false, jump: 1 },
  },
});

/**
 * The landing in the air: a white flat flash with shock spikes, a plum shock ring with impact
 * lines, the ring thrown wider and breaking, then motes.
 */
function impact(k: number): Pic {
  const w = 48;
  const h = 32;
  const cx = 24;
  const cy = 20;
  const pic = Pic.blank(w, h);
  if (k === 0) {
    put(
      pic,
      paintAt(w, h, (x, y) => {
        const e = ell(x, y, cx, cy, 10, 3.6);
        return e < 0.7 ? "W" : e < 1 ? "p" : null;
      }),
      0,
      0,
    );
    for (const [x, top] of [
      [17, 9],
      [21, 4],
      [24, 2],
      [27, 4],
      [31, 9],
    ] as const) {
      line(pic, x, top, x, cy - 3, x === 24 ? "W" : "p");
    }
    return clean(pic);
  }
  const rx = [0, 15, 21, 23][k] as number;
  const ry = rx * 0.42;
  if (k < 3) {
    put(
      pic,
      paintAt(w, h, (x, y) => {
        const e = (ell(x, y, cx, cy, rx, ry) - 1) * ry;
        if (e > 0.5 || e < (k === 1 ? -1.6 : -0.6)) return null;
        if (k === 2 && Math.floor((Math.atan2(y - cy, (x - cx) * 0.45) + 4) * 2.6) % 3 === 0)
          return null;
        return y < cy ? "W" : "l";
      }),
      0,
      0,
    );
    // Impact lines thrown out past the ring.
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + 0.3;
      const r0 = 1.12 + (k - 1) * 0.12;
      const r1 = r0 + 0.22;
      const x0 = cx + Math.cos(a) * rx * r0;
      const y0 = cy + Math.sin(a) * ry * r0;
      const x1 = cx + Math.cos(a) * rx * r1;
      const y1 = cy + Math.sin(a) * ry * r1;
      line(pic, x0, y0, x1, y1, k === 1 ? "p" : "l");
    }
    return clean(pic);
  }
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.6;
    pic.set(
      Math.round(cx + Math.cos(a) * rx),
      Math.round(cy + Math.sin(a) * ry),
      i % 2 ? "'" : ",",
    );
  }
  return pic;
}

const tomeImpact = sprite({
  ...fx,
  name: "fx-tome-impact",
  blend: "add",
  size: [48, 32],
  origin: [24, 20],
  frames: framesOf("i", [0, 1, 2, 3].map(impact)),
  anim: { land: { frames: names("i", 4), fps: 14, loop: false, jump: 1 } },
});

// 전자기 실습서 -------------------------------------------------------------------------------

/**
 * A bolt from `a` to `b`: a zigzag of short diagonal strokes that swings to alternate sides, with
 * a fork. White core, pale halo and a plum shadow under it so it holds on bright ground. Its
 * flicker frame (`bright` false) is a fresh zigzag between the same two ends, dimmer, so the
 * chain crackles. The ends sit on the axis so segments chain end to end.
 */
function bolt(w: number, h: number, a: Pt, b: Pt, seed: number, bright: boolean): Pic {
  const r = rng(seed * 7 + (bright ? 0 : 3));
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const ux = (b[0] - a[0]) / len;
  const uy = (b[1] - a[1]) / len;
  const nx = -uy;
  const ny = ux;
  const pts: Pt[] = [a];
  let t = 0;
  let side = r() < 0.5 ? -1 : 1;
  while (t < len - 7) {
    t += 2 + Math.floor(r() * 5);
    const off = side * (0.8 + r() * 3.4);
    if (r() < 0.75) side = -side;
    pts.push([a[0] + ux * t + nx * off, a[1] + uy * t + ny * off]);
  }
  pts.push(b);
  const core = bright ? "W" : "p";
  const halo = bright ? "l" : "m";
  const pic = Pic.blank(w, h);
  path(pic, pts, core);
  // A fork off one of the middle kinks.
  const at = pts[Math.max(1, Math.min(pts.length - 2, 2 + Math.floor(r() * 3)))] as Pt;
  const fs = r() < 0.5 ? -1 : 1;
  path(
    pic,
    [
      at,
      [at[0] + ux * 2 + nx * fs * 3, at[1] + uy * 2 + ny * fs * 3],
      [at[0] + ux * 5 + nx * fs * 3, at[1] + uy * 5 + ny * fs * 3],
      [at[0] + ux * 6 + nx * fs * 5, at[1] + uy * 6 + ny * fs * 5],
    ],
    halo,
    false,
    ".",
  );
  grow(pic, core, halo);
  // The shadow: one plum pixel under the light, never above it.
  const out = pic.clone();
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (pic.at(x, y) === "." && pic.at(x, y - 1) !== "." && pic.at(x, y - 1) !== undefined)
        out.set(x, y, "d");
  return clean(out);
}

const BOLT_W = 32;
const BOLT_H = 13;
const boltH = (seed: number, bright: boolean) =>
  bolt(BOLT_W, BOLT_H, [0, 6], [BOLT_W - 1, 6], seed, bright);
const boltD = (seed: number, bright: boolean) => bolt(26, 26, [3, 3], [22, 22], seed, bright);

const VARIANTS = [
  ["a", 11],
  ["b", 23],
  ["c", 41],
] as const;

const boltSprite = sprite({
  ...fx,
  name: "fx-bolt",
  blend: "add",
  size: [BOLT_W, BOLT_H],
  origin: [0, 6],
  frames: Object.fromEntries(
    VARIANTS.flatMap(([v, seed]) => [
      [`${v}0`, boltH(seed, true).toString()],
      [`${v}1`, boltH(seed, false).toString()],
    ]),
  ),
  anim: Object.fromEntries(
    VARIANTS.map(([v]) => [v, { frames: [`${v}0`, `${v}1`], fps: 20, jump: 1 }]),
  ),
});

const boltDiag = sprite({
  ...fx,
  name: "fx-bolt-diag",
  blend: "add",
  size: [26, 26],
  origin: [3, 3],
  frames: Object.fromEntries(
    VARIANTS.flatMap(([v, seed]) => [
      [`${v}0`, boltD(seed + 5, true).toString()],
      [`${v}1`, boltD(seed + 5, false).toString()],
    ]),
  ),
  anim: Object.fromEntries(
    VARIANTS.map(([v]) => [v, { frames: [`${v}0`, `${v}1`], fps: 20, jump: 1 }]),
  ),
});

/** Where the chain touches a target: a white star, a plum ring with diagonal sparks, embers. */
function node(k: number): Pic {
  const s = 15;
  const c = 7;
  const pic = Pic.blank(s, s);
  if (k === 0) {
    line(pic, c - 6, c, c + 6, c, "p");
    line(pic, c, c - 6, c, c + 6, "p");
    line(pic, c - 3, c, c + 3, c, "W");
    line(pic, c, c - 3, c, c + 3, "W");
    put(pic, "WWW\nWWW\nWWW", c - 1, c - 1);
    return clean(pic);
  }
  if (k === 1) {
    put(
      pic,
      paintAt(s, s, (x, y) =>
        Math.abs(Math.hypot(x - c - 0.5, y - c - 0.5) - 3.6) < 0.6
          ? x + y < 2 * c + 1
            ? "W"
            : "l"
          : null,
      ),
      0,
      0,
    );
    for (const [dx, dy] of [
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1],
    ] as const) {
      line(pic, c + dx * 4, c + dy * 4, c + dx * 6, c + dy * 6, "p");
    }
    put(pic, "pp\npp", c, c);
    return clean(pic);
  }
  for (const [x, y, ch] of [
    [c - 5, c - 2, "'"],
    [c + 5, c - 3, ","],
    [c + 3, c + 5, "'"],
    [c - 3, c + 4, ","],
    [c, c - 6, "*"],
  ] as const) {
    pic.set(x, y, ch);
  }
  put(pic, "p", c, c);
  pic.set(c, c, "*");
  return pic;
}

const boltNode = sprite({
  ...fx,
  name: "fx-bolt-node",
  blend: "add",
  size: [15, 15],
  origin: [7, 7],
  frames: framesOf("n", [0, 1, 2].map(node)),
  anim: {
    strike: { frames: ["n0", "n1", "n2"], fps: 20, loop: false, jump: 1 },
    hold: { frames: ["n0", "n1", "n0", "n2"], fps: 16, jump: 1 },
  },
});

export default [tomeSprite, tomeShadow, tomeCrater, tomeImpact, boltSprite, boltDiag, boltNode];
