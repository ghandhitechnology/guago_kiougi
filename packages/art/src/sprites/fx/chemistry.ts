import { type Legend, sprite } from "../../format.ts";
import { clean, ell, framesOf, names, Pic, paintAt, put, rng, turnCw } from "../../fx.ts";

/**
 * 화학: sea cyan and glass. Liquids that splash, drip and bubble, rounded pools, and fire that
 * burns the blue-green of an alcohol lamp, so a chemist's flame is never an enemy's red.
 */
const CHEM: Legend = {
  ".": null,
  o: "sea.deep",
  d: "sea.dark",
  m: "sea.mid",
  l: "sea.light",
  p: "sea.pale",
  W: "stone.bright",
  g: "stone.light",
  // Scorched ground under a burn.
  k: "ink.dark",
  // Lone glints, droplets and embers.
  "*": "stone.bright",
  "'": "sea.pale",
  ",": "sea.light",
  ";": "sea.mid",
};
const LONE = "*',;";
const fx = { group: "combat", outline: false, palette: CHEM, lone: LONE } as const;

// 줌인 일반화학 -------------------------------------------------------------------------------

/** An Erlenmeyer flask, half full, light from the top left, centred for quarter turns. */
const FLASK = put(
  Pic.blank(16, 16),
  Pic.of(`
    ...oooooo...
    ....oWgo....
    ....oWgo....
    ....oWgo....
    ...oWggmo...
    ..oWppppmo..
    ..oWllllmo..
    .oWlllllmmo.
    .oWllllllmo.
    oWlllllllmmo
    olmmmmmmmddo
    .oooooooooo.
  `),
  2,
  2,
);

const flask = sprite({
  name: "fx-flask",
  group: "combat",
  palette: CHEM,
  size: [16, 16],
  origin: [8, 8],
  frames: framesOf("spin", [
    FLASK,
    turnCw(FLASK),
    turnCw(turnCw(FLASK)),
    turnCw(turnCw(turnCw(FLASK))),
  ]),
  anim: { spin: { frames: names("spin", 4), fps: 12 } },
});

/** Drops and glass thrown from where the flask breaks, by simple ballistics. */
function shatter(k: number): Pic {
  const w = 32;
  const h = 26;
  const gx = 16;
  const gy = 20;
  const pic = Pic.blank(w, h);
  if (k === 0) {
    put(
      pic,
      paintAt(w, h, (x, y) => {
        const e = ell(x, y, gx, gy - 3, 5, 4);
        return e < 0.5 ? "W" : e < 0.8 ? "p" : e < 1 ? "l" : null;
      }),
      0,
      0,
    );
    for (const [dx, dy] of [
      [-7, -3],
      [7, -4],
      [-4, -9],
      [5, -8],
    ] as const) {
      put(pic, "W", gx + dx, gy - 3 + dy);
    }
    return clean(pic, LONE);
  }
  const r = rng(5);
  const t = k * 0.11;
  for (let i = 0; i < 9; i++) {
    const vx = (r() - 0.5) * 90;
    const vy = -40 - r() * 70;
    const x = gx + vx * t;
    const y = gy - 3 + vy * t + 0.5 * 420 * t * t;
    if (y > gy + 2) continue;
    put(pic, k < 3 ? "pl\nlm" : "lm", x, y);
  }
  for (let i = 0; i < 6; i++) {
    const vx = (r() - 0.5) * 120;
    const vy = -25 - r() * 50;
    const x = gx + vx * t;
    const y = Math.min(gy + 1, gy - 3 + vy * t + 0.5 * 420 * t * t);
    pic.set(Math.round(x), Math.round(y), "*");
    pic.set(Math.round(x) + (i % 2 ? 1 : -1), Math.round(y) + 1, "*");
  }
  if (k >= 2) {
    put(
      pic,
      paintAt(w, h, (x, y) => {
        const e = ell(x, y, gx, gy + 1, k === 2 ? 5 : 8, k === 2 ? 2 : 3);
        return e < 0.7 ? "l" : e < 1 ? "m" : null;
      }),
      0,
      0,
    );
  }
  return clean(pic, LONE);
}

const flaskShatter = sprite({
  ...fx,
  name: "fx-flask-shatter",
  size: [32, 26],
  origin: [16, 20],
  frames: framesOf("s", [0, 1, 2, 3].map(shatter)),
  anim: { break: { frames: names("s", 4), fps: 14, loop: false, jump: 1 } },
});

/** A pool's ragged edge: an ellipse wobbled by two waves round it. */
function pool(rx: number, ry: number, seed: number): (x: number, y: number) => number {
  const cx = 20;
  const cy = 10;
  return (x, y) => {
    const a = Math.atan2((y - cy) / ry, (x - cx) / rx);
    const wob = 0.1 * Math.sin(3 * a + seed) + 0.07 * Math.sin(5 * a + seed * 2);
    return ell(x, y, cx, cy, rx, ry) - wob;
  };
}

/** Bubbles at the three stages of a pop: a bead, a dome with a glint, a broken ring. */
const BEAD = "pp\npp";
const DOME = ".pp.\npWlp\n.pp.";
const POP = "p..p\n....\np..p";

/**
 * The acid pool: it spreads, bubbles where the flask broke, then dries to a crust and is gone.
 * Ground layer, drawn under monsters.
 */
function acid(k: number): Pic {
  const w = 40;
  const h = 20;
  const stage = ["spread", "spread", "bubble", "bubble", "bubble", "dry", "dry", "dry"][k];
  const size = [0.45, 0.8, 1, 1, 1, 0.85, 0.7, 0.6][k] as number;
  const f = pool(16 * size, 7 * size, 1.3);
  const pic = paintAt(w, h, (x, y) => {
    const e = f(x, y);
    if (e > 1) return null;
    if (stage === "dry") {
      if (k === 7)
        return e > 0.78 && Math.floor(Math.atan2(y - 10, x - 20) * 3) % 2 === 0 ? "d" : null;
      if (e > 0.8) return "d";
      if (k === 6) return e > 0.55 ? "o" : null;
      return e < 0.45 ? "d" : "m";
    }
    if (e > 0.82) return "d";
    if (e > 0.62 && y < 10 && x < 20) return "l";
    if (e < 0.35 && y < 9.5) return "l";
    return "m";
  });
  if (stage === "bubble") {
    const spots = [
      [13, 8],
      [22, 11],
      [27, 7],
      [17, 12],
    ] as const;
    spots.forEach(([x, y], i) => {
      const phase = (k - 2 + i) % 3;
      put(pic, [BEAD, DOME, POP][phase] as string, x - 1, y - 1);
    });
  }
  return clean(pic, LONE);
}

const acidPool = sprite({
  ...fx,
  name: "fx-acid",
  size: [40, 20],
  origin: [20, 10],
  frames: framesOf("a", [0, 1, 2, 3, 4, 5, 6, 7].map(acid)),
  anim: {
    spread: { frames: ["a0", "a1"], fps: 12, loop: false, jump: 1 },
    bubble: { frames: ["a2", "a3", "a4"], fps: 6, jump: 1 },
    dry: { frames: ["a5", "a6", "a7"], fps: 4, loop: false, jump: 1 },
  },
});

// 실험 보고서 ---------------------------------------------------------------------------------

/**
 * 가연: the report files the target as flammable. A hazard label slaps onto it (big, squashed,
 * stuck), then its corner lifts now and then.
 */
const LABEL = `
  .....o.....
  ....oWo....
  ...oWWWo...
  ..oWWmWWo..
  .oWWmmWWWo.
  oWWmmlmWWWo
  .oWmllmWWo.
  ..oWmmWWo..
  ...oWWWo...
  ....oWo....
  .....o.....
`;
const LABEL_BIG = `
  ......o......
  .....oWo.....
  ....oWWWo....
  ...oWWmWWo...
  ..oWWmmWWWo..
  .oWWmmlmWWWo.
  oWWmmllmWWWWo
  .oWWmllmWWWo.
  ..oWWmmWWWo..
  ...oWWWWWo...
  ....oWWWo....
  .....oWo.....
  ......o......
`;
const LABEL_FLAT = `
  .............
  .............
  .....ooo.....
  ...ooWWWoo...
  .ooWWWmmWWoo.
  oWWWWmmlmWWWo
  .ooWWmllmWoo.
  ...ooWWWoo...
  .....ooo.....
  .............
  .............
`;
const LABEL_PEEL = `
  .....o.....
  ....oWo....
  ...oWWWo...
  ..oWWmWWo..
  .oWWmmWWWo.
  oWWmmlmWWgo
  .oWmllmWgo.
  ..oWmmWWo..
  ...oWWo....
  ....oo.....
  ...........
`;

const label = sprite({
  ...fx,
  name: "fx-label",
  size: [13, 13],
  origin: [6, 6],
  frames: {
    slap0: LABEL_BIG,
    slap1: put(Pic.blank(13, 13), Pic.of(LABEL_FLAT), 0, 1).toString(),
    stuck: put(Pic.blank(13, 13), Pic.of(LABEL), 1, 1).toString(),
    peel: put(Pic.blank(13, 13), Pic.of(LABEL_PEEL), 1, 1).toString(),
  },
  anim: {
    slap: { frames: ["slap0", "slap1", "stuck"], fps: 16, loop: false, jump: 1 },
    stuck: { frames: ["stuck", "stuck", "stuck", "stuck", "peel", "stuck"], fps: 6, jump: 1 },
  },
});

interface Tongue {
  readonly x: number;
  /** Height in pixels above the base. */
  readonly h: number;
  /** Half width at the widest. */
  readonly w: number;
  /** How far the tip leans, in pixels. */
  readonly lean: number;
}

/**
 * Fire from tongues: each is a round bulb at the base drawing up into a tip that sways in an S,
 * banded by how deep inside it a pixel is, so every tongue gets a dark edge, a cyan body and a
 * white heart low in the bulb whatever its size.
 */
function fire(w: number, h: number, base: number, tongues: readonly Tongue[]): Pic {
  return clean(
    paintAt(w, h, (x, y) => {
      let depth = -1;
      let low = false;
      for (const t of tongues) {
        const up = base - y + 0.5;
        if (up < 0 || up > t.h) continue;
        const f = up / t.h;
        const bulb = 0.32;
        const half =
          f < bulb
            ? t.w * Math.sqrt(Math.max(0, 1 - ((bulb - f) / bulb) ** 2 * 0.75))
            : t.w * (1 - (f - bulb) / (1 - bulb)) ** 1.25;
        const cx = t.x + t.lean * Math.sin(Math.PI * f * 1.15) * f * 1.6;
        const d = half - Math.abs(x - cx);
        if (d > depth) {
          depth = d;
          low = f < 0.42;
        }
      }
      if (depth <= 0) return null;
      if (depth < 1) return "d";
      if (depth < 2) return "m";
      if (depth < 3) return "l";
      return low && depth >= 3.4 ? "W" : "p";
    }),
  );
}

/** Ignite, climb, burn in a loop, gutter out: a flame on a target, base at its feet. */
const FLAME_FRAMES: readonly (readonly Tongue[])[] = [
  [{ x: 8, h: 6, w: 2.6, lean: 0.5 }],
  [
    { x: 8, h: 12, w: 4, lean: 1.5 },
    { x: 5, h: 7, w: 2.4, lean: -1 },
  ],
  [
    { x: 8, h: 17, w: 5.4, lean: 2 },
    { x: 4.5, h: 10, w: 3, lean: -2 },
    { x: 11.5, h: 9, w: 2.8, lean: 2 },
    { x: 9, h: 21, w: 1.6, lean: -1 },
  ],
  [
    { x: 8, h: 16, w: 5.6, lean: -2 },
    { x: 4.5, h: 12, w: 3, lean: -1.5 },
    { x: 11.5, h: 10, w: 3, lean: 2.5 },
    { x: 6, h: 20, w: 1.4, lean: 1 },
  ],
  [
    { x: 8, h: 18, w: 5.2, lean: 2.5 },
    { x: 5, h: 9, w: 3, lean: -2 },
    { x: 11, h: 12, w: 3, lean: 1 },
  ],
  [
    { x: 7.5, h: 10, w: 4.2, lean: 1.5 },
    { x: 11, h: 6, w: 2.4, lean: 1 },
  ],
  [{ x: 8, h: 5, w: 2.6, lean: 0.5 }],
];

function flame(k: number): Pic {
  if (k < FLAME_FRAMES.length) return fire(16, 24, 22, FLAME_FRAMES[k] as Tongue[]);
  const pic = Pic.blank(16, 24);
  for (const [x, y, ch] of [
    [7, 14, "'"],
    [10, 10, ","],
    [5, 8, ";"],
    [9, 19, "'"],
  ] as const) {
    pic.set(x, y, ch);
  }
  return pic;
}

const flameSprite = sprite({
  ...fx,
  name: "fx-flame",
  size: [16, 24],
  origin: [8, 22],
  frames: framesOf("f", [0, 1, 2, 3, 4, 5, 6, 7].map(flame)),
  anim: {
    ignite: { frames: ["f0", "f1"], fps: 14, loop: false, jump: 1 },
    burn: { frames: ["f2", "f3", "f4"], fps: 10, jump: 1 },
    gutter: { frames: ["f5", "f6", "f7"], fps: 8, loop: false, jump: 1 },
  },
});

/**
 * 연소: 가연 meets 불 and the ground goes up. A scorched ellipse ringed and filled with low
 * tongues, burning in a loop, then sinking to embers.
 */
function combust(k: number): Pic {
  const w = 48;
  const h = 30;
  const cx = 24;
  const cy = 20;
  const pic = paintAt(w, h, (x, y) => {
    const e = ell(x, y, cx, cy, 18, 7.5);
    if (e > 1) return null;
    if (k >= 3) return e > 0.86 ? "d" : e > 0.6 ? "o" : null;
    return e > 0.86 ? "o" : e > 0.55 ? "k" : null;
  });
  if (k >= 4) return clean(pic);
  const r = rng(13);
  const spots: [number, number][] = [];
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2 + 0.4;
    spots.push([cx + Math.cos(a) * 15, cy + Math.sin(a) * 6]);
  }
  spots.push([cx - 6, cy - 1], [cx + 5, cy + 1], [cx, cy - 2]);
  spots.sort((a, b) => a[1] - b[1]);
  for (const [sx, sy] of spots) {
    const grown = k === 3 ? 0.4 : 1;
    const height = (5 + r() * 6) * grown * (1 + 0.25 * Math.sin(k * 2.1 + sx));
    const tongue = fire(12, 14, 12, [
      { x: 6, h: height, w: 2.2 + r() * 0.8, lean: (r() - 0.5) * 3 + (k - 1) },
    ]);
    put(pic, tongue, sx - 6, sy - 12);
  }
  return clean(pic);
}

const combustSprite = sprite({
  ...fx,
  name: "fx-combust",
  size: [48, 30],
  origin: [24, 20],
  frames: framesOf("c", [0, 1, 2, 3, 4].map(combust)),
  anim: {
    burn: { frames: ["c0", "c1", "c2"], fps: 10, jump: 1 },
    out: { frames: ["c3", "c4"], fps: 6, loop: false, jump: 1 },
  },
});

export default [flask, flaskShatter, acidPool, label, flameSprite, combustSprite];
