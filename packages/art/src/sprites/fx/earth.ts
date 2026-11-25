import { type Legend, sprite } from "../../format.ts";
import {
  clean,
  ell,
  framesOf,
  line,
  names,
  Pic,
  type Pt,
  paintAt,
  path,
  put,
  rng,
  turnCw,
} from "../../fx.ts";
import { shade } from "../../paint.ts";

/**
 * 지구과학: amber and umber, slow and heavy. A forecast traced on the ground like a seismogram,
 * then the ground itself: cracks with gold light deep inside, slabs that tip up, rock that is
 * really rock. Big, angular, and always under the monsters, never over them.
 */
const EARTH: Legend = {
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
const LONE = "*',:;";
const fx = { group: "combat", outline: false, palette: EARTH, lone: LONE } as const;

// 지구는 둥글다 -------------------------------------------------------------------------------

const FW = 48;

/**
 * 예보: the forecast traced on the ground where the fault will open, in five stages from a dotted
 * survey line to a trace that is all spikes. Tiles along the fault; the client stretches the
 * stage across the delay, and the last frame says it is about to break.
 */
function forecast(k: number): Pic {
  const h = 13;
  const mid = 6;
  const pic = Pic.blank(FW, h);
  const amp = [0, 1, 2, 3.4, 4.4][k] as number;
  const r = rng(31);
  const trace: Pt[] = [[0, mid]];
  for (let x = 3; x < FW - 2; x += 3) {
    const spike = r() < 0.5 ? -1 : 1;
    trace.push([x, mid + spike * amp * (0.4 + r() * 0.6)]);
  }
  trace.push([FW - 1, mid]);
  if (k === 0) {
    for (let x = 1; x < FW; x += 4) put(pic, "mm", x, mid);
  } else {
    // Ticks across the line every eight pixels, like a survey.
    for (let x = 4; x < FW; x += 8) line(pic, x, mid - 2, x, mid + 2, k >= 3 ? "d" : "o");
    path(pic, trace, k === 4 ? "W" : k >= 2 ? "l" : "m");
  }
  // Umber under the trace so it holds on sunlit ground.
  const out = pic.clone();
  for (let y = 0; y < h; y++)
    for (let x = 0; x < FW; x++)
      if (out.at(x, y) === "." && "mlWp".includes(pic.at(x, y - 1) ?? ".")) out.set(x, y, "o");
  if (k === 4) {
    for (let y = 0; y < h; y++)
      for (let x = 0; x < FW; x++)
        if (pic.at(x, y) === "W" && out.at(x, y - 1) === ".") out.set(x, y - 1, "p");
  }
  return clean(out);
}

const forecastSprite = sprite({
  ...fx,
  name: "fx-forecast",
  size: [FW, 13],
  origin: [0, 6],
  frames: framesOf("f", [0, 1, 2, 3, 4].map(forecast)),
  anim: {
    warn: { frames: names("f", 4), fps: 2, loop: false, jump: 1 },
    break: { frames: ["f4", "f3", "f4"], fps: 12, jump: 1 },
  },
});

/** The crack's centre line, ending on the axis at both ends so strips join. */
function crackLine(seed: number): Pt[] {
  const r = rng(seed);
  const pts: Pt[] = [[0, 16]];
  for (let x = 4; x < FW - 3; x += 4 + Math.floor(r() * 3)) pts.push([x, 16 + (r() - 0.5) * 4]);
  pts.push([FW - 1, 16]);
  return pts;
}

/** Half-width of the opened crack at x, wider in the middle of each strip. */
const gape = (x: number, k: number): number =>
  ([0.6, 2.2, 3.2, 1.6, 0.6, 0][k] as number) * (0.55 + 0.45 * Math.sin((Math.PI * x) / FW));

/** A slab tipped up beside the crack: a lit top face and a dark front face. */
function slab(pic: Pic, x: number, y: number, w: number, tall: number, side: -1 | 1): void {
  if (tall <= 0) return;
  for (let i = 0; i < w; i++) {
    const top = y - Math.round(tall * (side === 1 ? 1 - i / w : i / w) * 0.6 + tall * 0.4);
    for (let yy = top; yy <= y; yy++) {
      const ch = yy === top ? "t" : yy === top + 1 ? "s" : yy >= y - 1 ? "q" : "a";
      put(pic, ch, x + i, yy);
    }
  }
}

/**
 * The fault opens: the crack splits along the traced line with gold light deep inside, slabs
 * tip up along both lips, then the slabs sink and the crack closes to a scar.
 */
function fault(k: number): Pic {
  const h = 28;
  const pic = Pic.blank(FW, h);
  const line0 = crackLine(9);
  const yAt = (x: number): number => {
    for (let i = 0; i + 1 < line0.length; i++) {
      const a = line0[i] as Pt;
      const b = line0[i + 1] as Pt;
      if (x >= a[0] && x <= b[0]) return a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0] || 1);
    }
    return 16;
  };
  // Slabs behind the crack first, so the crack's near lip overlaps them.
  const tall = [0, 4, 7, 3, 0, 0][k] as number;
  if (tall > 0) {
    const r = rng(17);
    for (let x = 1; x < FW - 6; x += 7 + Math.floor(r() * 3)) {
      const w = 4 + Math.floor(r() * 3);
      slab(
        pic,
        x,
        Math.round(yAt(x + w / 2) - gape(x, k) - 1),
        w,
        tall * (0.6 + r() * 0.5),
        r() < 0.5 ? -1 : 1,
      );
    }
  }
  paintOverCrack(pic, yAt, k);
  if (tall > 0) {
    const r = rng(23);
    for (let x = 4; x < FW - 6; x += 9 + Math.floor(r() * 4)) {
      const w = 4 + Math.floor(r() * 2);
      const y = Math.round(yAt(x + w / 2) + gape(x, k) + tall * 0.5 + 1);
      slab(pic, x, y, w, tall * 0.5 * (0.6 + r() * 0.5), r() < 0.5 ? -1 : 1);
    }
  }
  if (k === 5) {
    const r = rng(4);
    for (let x = 2; x < FW; x += 5 + Math.floor(r() * 4)) {
      pic.set(x, Math.round(yAt(x) + (r() - 0.5) * 6), r() < 0.5 ? ":" : ";");
    }
  }
  return clean(pic, LONE);
}

function paintOverCrack(pic: Pic, yAt: (x: number) => number, k: number): void {
  for (let x = 0; x < FW; x++) {
    const c = yAt(x);
    const g = gape(x, k);
    if (k === 5) continue;
    for (let y = 0; y < pic.h; y++) {
      const d = Math.abs(y + 0.5 - c);
      if (d > g + 0.9) continue;
      let ch = "K";
      if (k >= 1 && k <= 3 && d < g - 1.2) ch = k === 2 && d < g - 2.2 ? "W" : k === 3 ? "d" : "l";
      else if (k >= 1 && k <= 2 && d < g - 0.4) ch = "m";
      if (y + 0.5 < c - g + 0.2 && k <= 3) ch = "K";
      pic.set(x, y, ch);
    }
  }
}

const faultSprite = sprite({
  ...fx,
  name: "fx-fault",
  size: [FW, 28],
  origin: [0, 16],
  frames: framesOf("c", [0, 1, 2, 3, 4, 5].map(fault)),
  anim: {
    open: { frames: ["c0", "c1", "c2"], fps: 14, loop: false, jump: 1 },
    close: { frames: ["c3", "c4", "c5"], fps: 6, loop: false, jump: 1 },
  },
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
function specimen(kind: "igneous" | "sedimentary" | "metamorphic"): Pic {
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
      ? (_x: number, y: number) =>
          ["b", "j", "B", "j", "J", "F"][Math.floor(y / 2 + 0.5) % 6] as string
      : (x: number, y: number) =>
          ["N", "n", "e", "n"][Math.floor((y + 1.6 * Math.sin(x * 0.9)) / 1.5 + 8) % 4] as string;
  for (let y = 0; y < 12; y++)
    for (let x = 0; x < 12; x++) {
      const ch = base.at(x, y);
      if (ch === "." || ch === "K") continue;
      let b = bands(x, y);
      // Shade: the lit side one step up, the shadow side one step down.
      if (ch === "s" && kind === "sedimentary") b = b === "J" ? "b" : b === "j" ? "J" : b;
      if (ch === "q") b = kind === "sedimentary" ? "B" : "N";
      base.set(x, y, b);
    }
  return clean(base);
}

const ROCK: Legend = {
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
  lone: LONE,
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
    return clean(pic, LONE);
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
  return clean(pic, `${LONE}n`);
}

const rockHitSprite = sprite({
  name: "fx-rock-hit",
  group: "combat",
  outline: false,
  palette: { ...ROCK, R: "clay.light", r: "clay.mid" },
  lone: `${LONE}n`,
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

export default [forecastSprite, faultSprite, shard, rock, rockHitSprite];
