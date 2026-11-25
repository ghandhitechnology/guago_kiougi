import { type Legend, sprite } from "../../format.ts";
import {
  clean,
  ell,
  facesLight,
  framesOf,
  line,
  names,
  Pic,
  paintAt,
  path,
  polySdf,
  put,
  regular,
} from "../../fx.ts";

/**
 * 수학: chalk white over navy. Clean straight lines, regular polygons, axes and ticks; nothing
 * soft, nothing dithered. Every shape has a navy rim so it holds on bright ground, and a chalk
 * line lit from the top left so it reads on the dark field.
 */
const MATH: Legend = {
  ".": null,
  o: "navy.deep",
  d: "navy.dark",
  m: "navy.mid",
  l: "navy.light",
  p: "navy.pale",
  W: "stone.bright",
  c: "stone.pale",
  // Lone chalk specks and dust.
  "*": "stone.bright",
  "'": "navy.pale",
  ",": "navy.light",
};
const LONE = "*',";
const fx = { group: "combat", outline: false, palette: MATH, lone: LONE } as const;

// 수학의 왕도 ---------------------------------------------------------------------------------

/**
 * One orbiting polygon, upright: a navy rim, a chalk edge (bright where it faces the top-left
 * light), a navy face and a chalk centre point. `n` 0 is the circle the book ends on. The
 * polygon never turns, so its geometry stays exact at ×1; a glint running round the edge
 * (`glint` is its angle) carries the spin.
 */
function polygon(n: number, r: number, rot: number, glint: number, size = 15): Pic {
  const c = size / 2;
  // A triangle's centroid sits low in its box; lift the box centre so it looks centred.
  const cy = c + (n === 3 ? 1.6 : 0);
  const sdf = polySdf(n, r, rot);
  const near = (x: number, y: number) => {
    const a = Math.atan2(y - cy, x - c);
    const diff = Math.abs(((a - glint + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
    return diff < 0.5;
  };
  const pic = paintAt(size, size, (x, y) => {
    const { d, a } = sdf(x - c, y - cy);
    if (d > 0.5) return null;
    if (d > -0.5) return near(x, y) ? "p" : "d";
    if (d > -1.5) return near(x, y) ? "W" : facesLight(a) ? "c" : "p";
    if (d > -2.5 && facesLight(a)) return "l";
    return x - c + (y - cy) < -1.5 ? "l" : "m";
  });
  return clean(pic);
}

/** Four frames of the glint going round, a quarter turn each, so the loop never jumps. */
function spin(n: number, r: number): Pic[] {
  const rot = n === 4 ? Math.PI / 4 : n === 6 ? 0 : -Math.PI / 2;
  return [0, 1, 2, 3].map((k) => polygon(n, r, rot, -Math.PI * 0.75 + (k * Math.PI) / 2));
}

/** The set the book walks through as it levels, triangle to circle. */
const SHAPES = [
  ["tri", 3, 7.4],
  ["square", 4, 6.6],
  ["penta", 5, 6.6],
  ["hexa", 6, 6.6],
  ["circle", 0, 6.3],
] as const;

const wangdo = sprite({
  ...fx,
  name: "fx-wangdo",
  size: [15, 15],
  origin: [7, 7],
  frames: Object.assign({}, ...SHAPES.map(([key, n, r]) => framesOf(key, spin(n, r)))),
  anim: Object.fromEntries(
    SHAPES.map(([key]) => [key, { frames: names(key, 4), fps: 12, jump: 1 }]),
  ),
});

/**
 * The polygon lands: a white hexagon (the shape the white hit flash tints), the chalk edges
 * kicked outward, then chalk dust.
 */
function wangdoHit(): Pic[] {
  const s = 17;
  const c = s / 2;
  const flash = paintAt(s, s, (x, y) => {
    const { d } = polySdf(6, 4.6, 0)(x - c, y - c);
    return d <= -0.6 ? "W" : d <= 0.5 ? "p" : null;
  });
  const burst = Pic.blank(s, s);
  const out = regular(6, c - 0.5, c - 0.5, 7, Math.PI / 6);
  out.forEach((a, i) => {
    const b = out[(i + 1) % 6] as typeof a;
    const ax = a[0] + (b[0] - a[0]) * 0.22;
    const ay = a[1] + (b[1] - a[1]) * 0.22;
    const bx = a[0] + (b[0] - a[0]) * 0.78;
    const by = a[1] + (b[1] - a[1]) * 0.78;
    line(burst, ax, ay, bx, by, i < 3 ? "p" : "W");
  });
  const dust = Pic.blank(s, s);
  regular(6, c - 0.5, c - 0.5, 8, 0).forEach(([x, y], i) => {
    dust.set(Math.round(x), Math.round(y), i % 2 ? "*" : "'");
  });
  return [flash, clean(burst), dust];
}

const wangdoHitSprite = sprite({
  ...fx,
  name: "fx-wangdo-hit",
  blend: "add",
  size: [17, 17],
  origin: [8, 8],
  frames: framesOf("hit", wangdoHit()),
  anim: { hit: { frames: names("hit", 3), fps: 20, loop: false, jump: 1 } },
});

// 함수 그래프 노트 ----------------------------------------------------------------------------

const PERIOD = 16;
const BEAM_H = 15;
const MID = 7;

/** Distance from a pixel centre to y = MID − 4 sin(2π(x + shift)/16), sampled finely. */
function sineDist(x: number, y: number, shift: number): number {
  let best = 9;
  for (let t = x - 4; t <= x + 4; t += 0.125) {
    const yy = MID + 0.5 - 4 * Math.sin((2 * Math.PI * (t + shift)) / PERIOD);
    best = Math.min(best, Math.hypot(t - x, yy - y));
  }
  return best;
}

/**
 * One period of the beam: a white curve, pale halo, navy edge. Each frame moves the wave a
 * quarter period, so the tiled segment scrolls toward its head.
 */
function beam(shift: number): Pic {
  return clean(
    paintAt(PERIOD, BEAM_H, (x, y) => {
      const d = sineDist(x, y, shift);
      if (d < 0.8) return "W";
      if (d < 1.5) return "p";
      if (d < 2.2) return "l";
      if (d < 2.8) return "m";
      return null;
    }),
  );
}

const graphBeam = sprite({
  ...fx,
  name: "fx-graph-beam",
  size: [PERIOD, BEAM_H],
  origin: [0, MID],
  frames: framesOf("wave", [0, -4, -8, -12].map(beam)),
  anim: { travel: { frames: names("wave", 4), fps: 16, jump: 1 } },
});

/** The plotted point at the beam's tip: a node in a ring with four ticks, pulsing. */
function head(k: number): Pic {
  const s = 15;
  const c = 7.5;
  const r = [4.6, 5.4, 5][k] as number;
  const pic = paintAt(s, s, (x, y) => {
    const e = Math.hypot(x - c, y - c);
    if (e < 1.6) return "W";
    if (e < 2.5) return k === 1 ? "W" : "p";
    if (Math.abs(e - r) < 0.55) return x + y < 2 * c ? "p" : "l";
    return null;
  });
  const t = k === 1 ? 7 : 6;
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    line(pic, 7 + dx * (r + 1), 7 + dy * (r + 1), 7 + dx * t, 7 + dy * t, k === 1 ? "W" : "p");
  }
  return clean(pic);
}

const graphHead = sprite({
  ...fx,
  name: "fx-graph-head",
  blend: "add",
  size: [15, 15],
  origin: [7, 7],
  frames: framesOf("head", [0, 1, 2].map(head)),
  anim: { pulse: { frames: ["head0", "head1", "head2", "head1"], fps: 14, jump: 1 } },
});

/** The origin where the beam leaves the book: axes with arrowheads, flaring then holding. */
function origin(k: number): Pic {
  const s = 17;
  const pic = Pic.blank(s, s);
  if (k === 0) {
    const ring = paintAt(s, s, (x, y) =>
      Math.abs(Math.hypot(x - 8.5, y - 8.5) - 3.4) < 0.6 ? "p" : null,
    );
    put(pic, ring, 0, 0);
    line(pic, 5, 8, 11, 8, "W");
    line(pic, 8, 5, 8, 11, "W");
    put(pic, "WWW\nWWW\nWWW", 7, 7);
    return clean(pic);
  }
  const ink = k === 1 ? "W" : "p";
  const shade = k === 1 ? "p" : "l";
  line(pic, 1, 8, 15, 8, ink);
  line(pic, 8, 1, 8, 15, ink);
  // Arrowheads on +x and +y (up), the way every textbook draws them.
  path(
    pic,
    [
      [13, 6],
      [15, 8],
      [13, 10],
    ],
    ink,
  );
  path(
    pic,
    [
      [6, 3],
      [8, 1],
      [10, 3],
    ],
    ink,
  );
  // Tick marks.
  for (const t of [4, 12]) {
    line(pic, t, 7, t, 9, shade);
    line(pic, 7, t, 9, t, shade);
  }
  put(pic, `${shade}${shade}\n${shade}${shade}`, 8, 8);
  return clean(pic);
}

const graphOrigin = sprite({
  ...fx,
  name: "fx-graph-origin",
  blend: "add",
  size: [17, 17],
  origin: [8, 8],
  frames: framesOf("origin", [0, 1, 2].map(origin)),
  anim: {
    flare: { frames: ["origin0", "origin1"], fps: 16, loop: false, jump: 1 },
    hold: { frames: ["origin1", "origin2", "origin2", "origin1"], fps: 8, jump: 1 },
  },
});

/**
 * Graph paper under the beam: the x-axis with ticks every four pixels and the grid's crossing
 * points, then only the axis as it fades. Tiles along the beam like the segment.
 */
function ticks(k: number): Pic {
  const pic = Pic.blank(PERIOD, BEAM_H);
  for (let x = 0; x < PERIOD; x++) if (x % 4 !== 3) pic.set(x, MID, k === 0 ? "d" : "o");
  if (k === 0) {
    for (const x of [1, 5, 9, 13]) {
      pic.set(x, MID - 1, "d");
      pic.set(x, MID + 1, "d");
      for (const y of [MID - 5, MID + 5]) pic.set(x, y, ",");
    }
  }
  return pic;
}

const graphTicks = sprite({
  ...fx,
  name: "fx-graph-ticks",
  size: [PERIOD, BEAM_H],
  origin: [0, MID],
  frames: framesOf("ticks", [0, 1].map(ticks)),
  anim: {
    show: { frames: ["ticks0"], fps: 1, loop: false },
    fade: { frames: ["ticks0", "ticks1"], fps: 6, loop: false, jump: 1 },
  },
});

// 증명 스택 and Q.E.D. ------------------------------------------------------------------------

/** 正, stroke by stroke: five strokes to a character, the way a tally is kept on a board. */
const STROKES: readonly (readonly (readonly [number, number])[])[] = [
  [
    [0, 0],
    [1, 0],
    [2, 0],
    [3, 0],
    [4, 0],
  ],
  [
    [2, 1],
    [2, 2],
    [2, 3],
  ],
  [
    [3, 2],
    [4, 2],
  ],
  [
    [0, 2],
    [0, 3],
  ],
  [
    [0, 4],
    [1, 4],
    [2, 4],
    [3, 4],
    [4, 4],
  ],
];

/** The tally at `n` (1 to 10): chalk strokes with a navy shadow under them. */
function tally(n: number): Pic {
  const pic = Pic.blank(13, 7);
  const marks: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const glyph = Math.floor(i / 5);
    for (const [x, y] of STROKES[i % 5] as (readonly [number, number])[]) {
      marks.push([x + glyph * 6 + 1, y + 1]);
    }
  }
  for (const [x, y] of marks) {
    for (const [dx, dy] of [
      [1, 1],
      [0, 1],
      [1, 0],
    ] as const) {
      if (pic.at(x + dx, y + dy) === ".") pic.set(x + dx, y + dy, "o");
    }
  }
  for (const [x, y] of marks) pic.set(x, y, n === 10 ? "W" : "c");
  return clean(pic);
}

const proof = sprite({
  ...fx,
  name: "fx-proof",
  size: [13, 7],
  origin: [6, 6],
  frames: Object.fromEntries(
    Array.from({ length: 10 }, (_, i) => [`n${i + 1}`, tally(i + 1).toString()]),
  ),
  anim: {
    // The client shows one frame per stack count; `full` blinks at ten before Q.E.D. fires.
    count: { frames: names("n", 10).map((_, i) => `n${i + 1}`), fps: 4, loop: false, jump: 1 },
    full: { frames: ["n10", "n9", "n10"], fps: 12, jump: 1 },
  },
});

const LETTERS: Record<string, string> = {
  Q: ".##.\n#..#\n#..#\n#.#.\n.#.#",
  E: "###\n#..\n##.\n#..\n###",
  D: "##.\n#.#\n#.#\n#.#\n##.",
  ".": ".\n.\n.\n.\n#",
};

/** "Q.E.D." and the tombstone, with a navy drop shadow so chalk holds on bright ground. */
function qedText(ink: string): Pic {
  const pic = Pic.blank(26, 7);
  let x = 0;
  const marks: [number, number][] = [];
  for (const ch of "Q.E.D.") {
    const g = Pic.of(LETTERS[ch] as string);
    for (let y = 0; y < g.h; y++)
      for (let gx = 0; gx < g.w; gx++) if (g.at(gx, y) === "#") marks.push([x + gx, y]);
    x += g.w + 1;
  }
  for (let y = 1; y < 5; y++) for (let t = 0; t < 4; t++) marks.push([x + 1 + t, y]);
  for (const [mx, my] of marks) {
    if (pic.at(mx + 1, my + 1) === ".") pic.set(mx + 1, my + 1, "o");
  }
  for (const [mx, my] of marks) pic.set(mx, my, ink);
  return pic;
}

/** Q.E.D.: the tombstone slams down, the proof is written over a ring that breaks outward. */
function qed(k: number): Pic {
  const w = 40;
  const h = 22;
  const cx = w / 2;
  const cy = h / 2;
  const pic = Pic.blank(w, h);
  if (k === 0) {
    put(
      pic,
      paintAt(w, h, (x, y) => {
        const e = ell(x, y, cx, cy, 9, 6);
        return e < 0.55 ? "W" : e < 0.8 ? "p" : null;
      }),
      0,
      0,
    );
    return clean(pic);
  }
  const rx = [0, 14, 18, 19][k] as number;
  const ry = [0, 8, 10, 10.5][k] as number;
  put(
    pic,
    paintAt(w, h, (x, y) => {
      const e = Math.abs(ell(x, y, cx, cy, rx, ry) - 1) * Math.min(rx, ry);
      if (e > 0.6) return null;
      if (k === 2 && Math.floor(Math.atan2(y - cy, x - cx) * 3) % 2 === 0) return null;
      if (k === 3) return Math.floor(Math.atan2(y - cy, x - cx) * 5) % 3 === 0 ? "'" : null;
      return y < cy ? "p" : "l";
    }),
    0,
    0,
  );
  put(pic, qedText(k === 3 ? "p" : "W"), 7, 8);
  return clean(pic, LONE);
}

const qedSprite = sprite({
  ...fx,
  name: "fx-qed",
  blend: "add",
  size: [40, 22],
  origin: [20, 11],
  frames: framesOf("qed", [0, 1, 2, 3].map(qed)),
  anim: { burst: { frames: names("qed", 4), fps: 10, loop: false, jump: 1 } },
});

export default [
  wangdo,
  wangdoHitSprite,
  graphBeam,
  graphHead,
  graphOrigin,
  graphTicks,
  proof,
  qedSprite,
];
