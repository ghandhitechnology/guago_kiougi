import { type Legend, sprite } from "../../format.ts";
import {
  type Axis,
  capFrames,
  clean,
  ell,
  framesOf,
  line,
  lineFrames,
  names,
  Pic,
  type Pt,
  paintAt,
  path,
  put,
  rng,
  turnCw,
  upSide,
  wrap,
} from "../../fx.ts";
import { shade } from "../../paint.ts";

/**
 * 지구과학: amber and umber, slow and heavy. A forecast traced on the ground like a seismogram,
 * then the ground itself: cracks with gold light deep inside, slabs that tip up, rock that is
 * really rock. Big, angular, and always under the monsters, never over them.
 */
export const EARTH: Legend = {
  ".": null,
  o: "gold.deep",
  d: "gold.dark",
  m: "gold.mid",
  l: "gold.light",
  p: "gold.pale",
  W: "stone.bright",
  // Slab rock.
  q: "stone.deep",
  a: "stone.dark",
  s: "stone.mid",
  t: "stone.light",
  // The dark of a crack.
  K: "wood.deep",
  // Lone grit, motes and embers.
  "*": "stone.bright",
  "'": "gold.pale",
  ",": "gold.light",
  ":": "stone.light",
  ";": "stone.mid",
};
export const EARTH_LONE = "*',:;";
const fx = { group: "combat", outline: false, palette: EARTH, lone: EARTH_LONE } as const;

// 지구는 둥글다 -------------------------------------------------------------------------------

/** Tile length along the 예보 and the fault. */
export const FL = 16;

/**
 * 예보: the forecast traced on the ground where the fault will open, in five stages from a dotted
 * survey line to a trace that is all spikes. Laid tile by tile along the line at the nearest of
 * sixteen aims; the client steps the stage across the delay, and the last says it will break.
 * The spikes lie across the line and the umber shadow under them falls straight down the
 * screen, so the trace holds on sunlit dirt at every angle.
 */
function forecast(ax: Axis, k: number, v: number): Pic {
  const pic = Pic.blank(ax.size, ax.size);
  const amp = [0, 1.4, 2.2, 3.4, 4.4][k] as number;
  if (k === 0) {
    for (let t = 1; t < FL; t += 4) {
      const [x0, y0] = ax.at(t, 0);
      const [x1, y1] = ax.at(t + 1.4, 0);
      line(pic, x0, y0, x1, y1, "m");
    }
  } else {
    // Survey ticks across the line every eight pixels.
    for (const t of [4, 12]) {
      const [x0, y0] = ax.at(t, -3);
      const [x1, y1] = ax.at(t, 3);
      line(pic, x0, y0, x1, y1, k >= 3 ? "d" : "o");
    }
    const r = rng(31 + v * 6);
    const pts: Pt[] = [ax.at(-2, 0), ax.at(0, 0)];
    for (let i = 1; i < 6; i++) {
      const spike = r() < 0.5 ? -1 : 1;
      pts.push(ax.at((i * FL) / 6, spike * amp * (0.45 + r() * 0.55)));
    }
    pts.push(ax.at(FL, 0), ax.at(FL + 2, 0));
    const ink = k === 4 ? "W" : k >= 2 ? "l" : "m";
    path(pic, pts, ink);
    // The trace is drawn twice, a pixel apart, so it reads as a stroke from the first stage.
    path(
      pic,
      pts.map(([x, y]) => [x, y + 1] as Pt),
      k === 4 ? "p" : k >= 2 ? "m" : "d",
      false,
      ".",
    );
  }
  // Umber under every lit pixel so the trace holds on sunlit ground.
  const out = pic.clone();
  for (let y = 0; y < pic.h; y++)
    for (let x = 0; x < pic.w; x++)
      if (out.at(x, y) === "." && "mlWpd".includes(pic.at(x, y - 1) ?? ".")) out.set(x, y, "o");
  if (k === 4) {
    for (let y = 0; y < pic.h; y++)
      for (let x = 0; x < pic.w; x++)
        if (pic.at(x, y) === "W" && out.at(x, y - 1) === ".") out.set(x, y - 1, "p");
  }
  return out;
}

const FORECAST_ANIMS = {
  warn: { stages: [0, 1, 2, 3], fps: 2, loop: false },
  break: { stages: [4, 3, 4], fps: 12 },
} as const;

const forecastSprite = sprite({
  ...fx,
  name: "fx-forecast",
  size: [48, 48],
  origin: [24, 24],
  ...lineFrames(
    { length: FL, canvas: 48, variants: 2, lone: EARTH_LONE, draw: (ax, k, v) => forecast(ax, k, v) },
    FORECAST_ANIMS,
  ),
});

/** The 예보's ends: a surveyor's stake across the line, the trace dying into it. */
function forecastEnd(ax: Axis, k: number): Pic {
  const pic = Pic.blank(ax.size, ax.size);
  const ink = k === 4 ? "W" : k >= 2 ? "l" : "m";
  const [x0, y0] = ax.at(0, -4);
  const [x1, y1] = ax.at(0, 4);
  line(pic, x0, y0, x1, y1, ink);
  const [a0, b0] = ax.at(-0.8, -4);
  const [a1, b1] = ax.at(-0.8, 4);
  line(pic, a0, b0, a1, b1, k >= 2 ? "m" : "d", ".");
  const [hx, hy] = ax.at(0, 0);
  put(pic, k >= 3 ? "WW\nWW" : "pp\npp", hx - 0.5, hy - 0.5);
  const out = pic.clone();
  for (let y = 0; y < pic.h; y++)
    for (let x = 0; x < pic.w; x++)
      if (out.at(x, y) === "." && "mlWpd".includes(pic.at(x, y - 1) ?? ".")) out.set(x, y, "o");
  return out;
}

const forecastEndSprite = sprite({
  ...fx,
  name: "fx-forecast-end",
  size: [20, 20],
  origin: [10, 10],
  ...capFrames(20, forecastEnd, FORECAST_ANIMS, EARTH_LONE),
});

/** A slab tipped up beside the crack: a lit top face and a dark front face. */
export function slab(pic: Pic, x: number, y: number, w: number, tall: number, side: -1 | 1): void {
  if (tall <= 0) return;
  for (let i = 0; i < w; i++) {
    const top = y - Math.round(tall * (side === 1 ? 1 - i / w : i / w) * 0.6 + tall * 0.4);
    for (let yy = top; yy <= y; yy++) {
      const ch = yy === top ? "t" : yy === top + 1 ? "s" : yy >= y - 1 ? "q" : "a";
      put(pic, ch, x + i, yy);
    }
  }
}

/** The crack's half width by stage: hairline, split, open with light, closing, scar. */
const GAPE = [0.6, 2.2, 3.2, 1.6, 0.6, 0];
const TALL = [0, 4, 7, 3, 0, 0];

/** Paints the crack over `pic` where `centre` and `half` say, in the colours of stage `k`. */
function crack(
  pic: Pic,
  ax: Axis,
  k: number,
  centre: (t: number) => number,
  half: (t: number) => number,
  from: number,
  to: number,
): void {
  if (k === 5) return;
  for (let y = 0; y < pic.h; y++)
    for (let x = 0; x < pic.w; x++) {
      const { t, n } = ax.of(x, y);
      if (t < from || t >= to) continue;
      const g = half(t);
      if (g <= 0) continue;
      const d = Math.abs(n - centre(t));
      if (d > g + 0.9) continue;
      let ch = "K";
      if (k >= 1 && k <= 3 && d < g - 1.2) ch = k === 2 && d < g - 2.2 ? "W" : k === 3 ? "d" : "l";
      else if (k >= 1 && k <= 2 && d < g - 0.4) ch = "m";
      pic.set(x, y, ch);
    }
}

/**
 * The fault opens: the crack splits along the traced line with gold light deep inside, slabs
 * tip up along both lips, then the slabs sink and the crack closes to a scar. Laid like the
 * 예보; the two variants alternate so a long fault does not repeat. Slabs stand up the screen
 * at every aim, the far one on the side that faces up.
 */
function fault(ax: Axis, k: number, v: number): Pic {
  const pic = Pic.blank(ax.size, ax.size);
  const r = rng(9 + v * 5);
  const kinks = [0, (r() - 0.5) * 3, (r() - 0.5) * 3, (r() - 0.5) * 3, 0];
  const centre = (t: number): number => {
    const tt = wrap(t, FL);
    const i = Math.min(3, Math.floor(tt / 4));
    const f = (tt - i * 4) / 4;
    return (kinks[i] as number) * (1 - f) + (kinks[i + 1] as number) * f;
  };
  const half = (t: number): number =>
    (GAPE[k] as number) * (0.85 + 0.15 * Math.sin((Math.PI * 2 * t) / FL));
  const tall = TALL[k] as number;
  const up = upSide(ax);
  if (tall > 0) {
    const spots: [t: number, side: 1 | -1, w: number][] = v
      ? [
          [10, 1, 5],
          [4, -1, 4],
        ]
      : [
          [5, 1, 5],
          [11, -1, 4],
        ];
    for (const [t, side, w] of spots) {
      const far = side === 1;
      const lip = half(t) + 1.5;
      const [x, y] = ax.at(t, centre(t) + up * side * lip);
      const h = tall * (far ? 0.7 + r() * 0.4 : 0.4 + r() * 0.2);
      const base = far ? Math.round(y) : Math.round(y + h * 0.6);
      slab(pic, Math.round(x - w / 2), base, w, h, r() < 0.5 ? -1 : 1);
    }
  }
  crack(pic, ax, k, centre, half, -2, FL + 2);
  if (k === 5) {
    for (let t = 2; t < FL; t += 5) {
      const [x, y] = ax.at(t, (r() - 0.5) * 5);
      pic.set(Math.round(x), Math.round(y), r() < 0.5 ? ":" : ";");
    }
  }
  return pic;
}

const FAULT_ANIMS = {
  open: { stages: [0, 1, 2], fps: 14, loop: false },
  close: { stages: [3, 4, 5], fps: 6, loop: false },
} as const;

const faultSprite = sprite({
  ...fx,
  name: "fx-fault",
  size: [64, 64],
  origin: [32, 32],
  ...lineFrames(
    { length: FL, canvas: 64, variants: 2, lone: EARTH_LONE, draw: (ax, k, v) => fault(ax, k, v) },
    FAULT_ANIMS,
  ),
});

/** Where the fault runs out: the crack narrowing to a point past the end, a chip beside it. */
function faultEnd(ax: Axis, k: number): Pic {
  const pic = Pic.blank(ax.size, ax.size);
  const g = (GAPE[k] as number) * 0.85;
  crack(
    pic,
    ax,
    k,
    () => 0,
    (t) => (t <= 0 ? g : g * Math.max(0, 1 - t / 7)),
    -3,
    7,
  );
  if (k >= 1 && k <= 3) {
    const [x, y] = ax.at(3, upSide(ax) * (g + 2.5));
    put(pic, ".t.\ntsa\n.q.", x - 1, y - 1);
  }
  if (k === 5) {
    const [x, y] = ax.at(1, 0);
    put(pic, ":.;", x - 1, y);
  }
  return pic;
}

const faultEndSprite = sprite({
  ...fx,
  name: "fx-fault-end",
  size: [32, 32],
  origin: [16, 16],
  ...capFrames(32, faultEnd, FAULT_ANIMS, EARTH_LONE),
});

/** Chips the fault throws: three stones, a quarter turn per frame. */
const CHIPS = [
  `
    ..qq....
    .qtsq...
    qtssaq..
    qsaaaq..
    .qaaq...
    ..qq....
    ........
    ........
  `,
  `
    ........
    .qqq....
    qttsq...
    qssaaq..
    .qsaaq..
    ..qqq...
    ........
    ........
  `,
  `
    ...q....
    ..qtq...
    .qtsaq..
    .qsaaq..
    ..qaq...
    ...q....
    ........
    ........
  `,
];

const shard = sprite({
  name: "fx-shard",
  group: "combat",
  palette: EARTH,
  size: [8, 8],
  origin: [3, 3],
  frames: Object.fromEntries(
    CHIPS.flatMap((g, i) => {
      const p = Pic.of(g);
      return [
        [`s${i}a`, p.toString()],
        [`s${i}b`, turnCw(p).toString()],
      ];
    }),
  ),
  anim: Object.fromEntries(
    CHIPS.map((_, i) => [`tumble${i}`, { frames: [`s${i}a`, `s${i}b`], fps: 12, jump: 0.6 }]),
  ),
});

// 암석 표본 상자 ------------------------------------------------------------------------------

/** An irregular stone: seven corners at hashed radii. */
function stoneShape(seed: number): (x: number, y: number) => boolean {
  const r = rng(seed);
  const radii = Array.from({ length: 7 }, () => 4 + r() * 1.6);
  return (x, y) => {
    const dx = x + 0.5 - 6;
    const dy = y + 0.5 - 6;
    const a = Math.atan2(dy, dx);
    const t = (((a / (Math.PI * 2)) * 7 + 7) % 7) as number;
    const i = Math.floor(t);
    const f = t - i;
    const rr = (radii[i] as number) * (1 - f) + (radii[(i + 1) % 7] as number) * f;
    return Math.hypot(dx, dy) <= rr;
  };
}

/**
 * The three specimens, each its own stone at a glance: igneous is black basalt veined with
 * glowing lava, sedimentary is sandstone laid in flat bands, metamorphic is gneiss with its
 * bands folded into waves.
 */
export function specimen(kind: "igneous" | "sedimentary" | "metamorphic"): Pic {
  const inside = stoneShape(kind === "igneous" ? 3 : kind === "sedimentary" ? 8 : 12);
  const base = shade(12, 12, inside, { outline: "K", dark: "q", mid: "a", light: "s" });
  if (kind === "igneous") {
    // Lava veins.
    path(
      base,
      [
        [3, 7],
        [5, 6],
        [6, 7],
        [8, 5],
      ],
      "l",
      false,
      "qas",
    );
    path(
      base,
      [
        [6, 7],
        [6, 9],
      ],
      "m",
      false,
      "qas",
    );
    put(base, "p", 5, 6, "l");
    return clean(base);
  }
  const bands =
    kind === "sedimentary"
      ? (_x: number, y: number) => ["b", "B", "j", "F"][Math.floor(y / 2) % 4] as string
      : (x: number, y: number) =>
          ["N", "n", "e", "n"][Math.floor((y + 1.6 * Math.sin(x * 0.9)) / 1.5 + 8) % 4] as string;
  for (let y = 0; y < 12; y++)
    for (let x = 0; x < 12; x++) {
      const ch = base.at(x, y);
      if (ch === "." || ch === "K") continue;
      let b = bands(x, y);
      // Shade: the lit side one step up, the shadow side one step down.
      if (ch === "q") b = kind === "sedimentary" ? "F" : "N";
      base.set(x, y, b);
    }
  return clean(base);
}

export const ROCK: Legend = {
  ...EARTH,
  // Sandstone.
  F: "wood.mid",
  J: "clay.light",
  j: "clay.dust",
  b: "clay.pale",
  B: "clay.mid",
  // Gneiss.
  N: "ink.mid",
  n: "stone.light",
  e: "rose.pale",
};

const KINDS = ["igneous", "sedimentary", "metamorphic"] as const;

const rock = sprite({
  name: "fx-rock",
  group: "combat",
  palette: ROCK,
  lone: EARTH_LONE,
  size: [12, 12],
  origin: [6, 6],
  frames: Object.fromEntries(
    KINDS.flatMap((kind) => {
      const p = specimen(kind);
      return [p, turnCw(p), turnCw(turnCw(p)), turnCw(turnCw(turnCw(p)))].map((q, i) => [
        `${kind}${i}`,
        q.toString(),
      ]);
    }),
  ),
  anim: Object.fromEntries(
    KINDS.map((kind) => [kind, { frames: names(kind, 4), fps: 12, jump: 0.6 }]),
  ),
});

/**
 * Each specimen's impact: igneous bursts into embers (불), sedimentary drops a pall of sand that
 * settles flat around the target (둔화), metamorphic shatters into a star of flakes (방어 감소).
 */
function rockHit(kind: (typeof KINDS)[number], k: number): Pic {
  const w = 32;
  const h = 26;
  const cx = 16;
  const cy = 17;
  const pic = Pic.blank(w, h);
  const r = rng(kind.length * 31 + 5);
  if (kind === "igneous") {
    if (k === 0) {
      return clean(
        paintAt(w, h, (x, y) => {
          const e = ell(x, y, cx, cy - 2, 6, 5);
          return e < 0.45 ? "W" : e < 0.75 ? "p" : e < 1 ? "R" : null;
        }),
      );
    }
    const t = k * 0.1;
    for (let i = 0; i < 12; i++) {
      const a = r() * Math.PI * 2;
      const v = 60 + r() * 60;
      const x = cx + Math.cos(a) * v * t;
      const y = cy - 2 + Math.sin(a) * v * t * 0.7 + 160 * t * t - 20 * t;
      const big = k === 1 && i % 3 === 0;
      put(pic, big ? "pR\nRr" : i % 2 ? "," : "'", x, y);
      if (k === 1) put(pic, "r", x - Math.cos(a) * 2, y - Math.sin(a) * 1.4);
    }
    if (k <= 2)
      put(
        pic,
        paintAt(w, h, (x, y) => (ell(x, y, cx, cy + 1, 5, 2) < 1 ? "r" : null)),
        0,
        0,
      );
    return clean(pic, EARTH_LONE);
  }
  if (kind === "sedimentary") {
    const rx = [5, 9, 12, 13][k] as number;
    const ry = [5, 4.5, 3.6, 3][k] as number;
    const lift = [4, 3, 1, 0][k] as number;
    return clean(
      paintAt(w, h, (x, y) => {
        const a = Math.atan2(y - cy, x - cx);
        const e = ell(x, y, cx, cy - lift, rx, ry) - 0.12 * Math.sin(5 * a + k);
        if (e > 1) return null;
        if (k === 3) return e > 0.62 ? (e > 0.84 ? "B" : "J") : null;
        if (e > 0.84) return "B";
        if (e < 0.5 && k <= 1) return "b";
        return y < cy - lift ? "j" : "J";
      }),
    );
  }
  // Metamorphic: the target's armour, flaked off as banded chips thrown out in a star.
  if (k === 0) {
    put(
      pic,
      paintAt(w, h, (x, y) => (Math.abs(x - cx) + Math.abs(y - cy + 2) * 1.4 < 5 ? "W" : null)),
      0,
      0,
    );
    return clean(pic);
  }
  const chips = ["NNN\nnee\nNnn", "NN.\nnnN\neeN", ".NN\nNen\nNnn"];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 - 0.3;
    const d = [0, 6, 10, 12][k] as number;
    const x = cx + Math.cos(a) * d - 1;
    const y = cy - 3 + Math.sin(a) * d * 0.75 + (k === 3 ? 3 : 0);
    put(pic, k === 3 ? "nN" : (chips[i % 3] as string), x, y);
  }
  return clean(pic, `${EARTH_LONE}n`);
}

const rockHitSprite = sprite({
  name: "fx-rock-hit",
  group: "combat",
  outline: false,
  palette: { ...ROCK, R: "clay.light", r: "clay.mid" },
  lone: `${EARTH_LONE}n`,
  size: [32, 26],
  origin: [16, 17],
  frames: Object.fromEntries(
    KINDS.flatMap((kind) => [0, 1, 2, 3].map((k) => [`${kind}${k}`, rockHit(kind, k).toString()])),
  ),
  anim: Object.fromEntries(
    KINDS.map((kind) => [
      kind,
      { frames: names(kind, 4), fps: kind === "sedimentary" ? 8 : 14, loop: false, jump: 1 },
    ]),
  ),
});

export default [
  forecastSprite,
  forecastEndSprite,
  faultSprite,
  faultEndSprite,
  shard,
  rock,
  rockHitSprite,
];
