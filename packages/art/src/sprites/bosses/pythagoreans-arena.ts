import { type Legend, sprite } from "../../format.ts";
import { line, Pic, rect } from "./kit.ts";

/**
 * The 피타고라스 학파 arena at 크로톤 학당: a floor of square sandstone slabs, each one a unit cell
 * of their grid, numbered with white pebbles laid out as figurate numbers (the triangles 3, 6 and
 * 10, the squares 4 and 9). Slabs are 32 px, two tiles, so a student fits inside one and can
 * cross it corner to corner. The seams between slabs are the grid lines every attack follows.
 *
 * - `p1-cell`: the slab, frames `n1` to `n10`. Tile them edge to edge; seams sit on the right
 *   and bottom edges so neighbours share one line.
 * - `p1-diagonal`: drawn over one slab. `idle` shows the corner studs, `trace0` to `trace3`
 *   draw the line as a player crosses, `open` holds while the weak point is open. Flip it for
 *   the other diagonal.
 * - `p1-lane`: one cell of a row strike (`h*`) or a column strike (`v*`): the knotted cord laid
 *   along the lane, `warn0`/`warn1` pulsing, `strike` when it snaps taut.
 * - `p1-square`: one cell of a square-number strike: corner brackets closing in, then the
 *   tablet's impact.
 */

const palette: Legend = {
  ".": null,
  T: "clay.deep",
  t: "clay.dark",
  u: "clay.mid",
  U: "clay.light",
  d: "clay.dust",
  y: "clay.pale",
  G: "stone.deep",
  g: "stone.mid",
  q: "stone.light",
  p: "stone.pale",
  w: "stone.bright",
  D: "gold.deep",
  a: "gold.mid",
  A: "gold.light",
  Y: "gold.pale",
  R: "red.deep",
  r: "red.dark",
  m: "red.mid",
  M: "red.light",
  P: "red.pale",
};

const N = 32;

// Slabs ---------------------------------------------------------------------------------------

/** Pebble positions (column, row on a 3 px lattice) for each figurate number. */
const FIGURES: Record<number, readonly (readonly [number, number])[]> = {
  1: [[1.5, 1.5]],
  2: [
    [1, 1.5],
    [2, 1.5],
  ],
  3: [
    [1.5, 1],
    [1, 2],
    [2, 2],
  ],
  4: [
    [1, 1],
    [2, 1],
    [1, 2],
    [2, 2],
  ],
  5: [
    [1, 1],
    [2, 1],
    [1.5, 1.75],
    [1, 2.5],
    [2, 2.5],
  ],
  6: [
    [1.5, 0.5],
    [1, 1.5],
    [2, 1.5],
    [0.5, 2.5],
    [1.5, 2.5],
    [2.5, 2.5],
  ],
  7: [
    [1, 0.5],
    [2, 0.5],
    [0.5, 1.5],
    [1.5, 1.5],
    [2.5, 1.5],
    [1, 2.5],
    [2, 2.5],
  ],
  8: [
    [0.5, 0.5],
    [1.5, 0.5],
    [2.5, 0.5],
    [1, 1.5],
    [2, 1.5],
    [0.5, 2.5],
    [1.5, 2.5],
    [2.5, 2.5],
  ],
  9: [0, 1, 2].flatMap((r) => [0.5, 1.5, 2.5].map((c) => [c, r + 0.5] as const)),
  10: [
    [1.5, 0],
    [1, 1],
    [2, 1],
    [0.5, 2],
    [1.5, 2],
    [2.5, 2],
    [0, 3],
    [1, 3],
    [2, 3],
    [3, 3],
  ],
};

/** A slab: bevel lit from the top left, a seam on the right and bottom, pebbles in the corner. */
function slab(n: number): string {
  const p = Pic.blank(N, N, "d");
  rect(p, 0, 0, N, 1, "y");
  rect(p, 0, 0, 1, N, "y");
  rect(p, 1, 1, N - 3, 1, "y");
  rect(p, 1, 1, 1, N - 3, "y");
  rect(p, 2, N - 3, N - 4, 1, "U");
  rect(p, N - 3, 2, 1, N - 4, "U");
  // The seam: a dark cut and its lip.
  rect(p, 0, N - 2, N, 2, "t");
  rect(p, N - 2, 0, 2, N, "t");
  rect(p, 0, N - 1, N, 1, "u");
  rect(p, N - 1, 0, 1, N, "u");
  p.set(N - 1, N - 1, "t");
  // Wear: a few scuffs, placed by the number so neighbours differ.
  const scuffs = [
    [9 + ((n * 7) % 11), 20 + ((n * 3) % 6)],
    [18 + ((n * 5) % 7), 9 + ((n * 11) % 9)],
  ];
  for (const [x, y] of scuffs) {
    p.set(x as number, y as number, "U");
    p.set((x as number) + 1, y as number, "U");
  }
  // The pebbles, each a 2 px stone lit from the top left, on a 3 px lattice in the corner.
  const pts = FIGURES[n] ?? [];
  for (const [c, r] of pts) {
    const x = 4 + Math.round(c * 3);
    const y = 4 + Math.round(r * 3);
    p.set(x, y, "w");
    p.set(x + 1, y, "p");
    p.set(x, y + 1, "p");
    p.set(x + 1, y + 1, "g");
  }
  return p.toString();
}

// The diagonal -------------------------------------------------------------------------------

/** Corner studs that show where the diagonal starts and ends. */
function studs(p: Pic, ch: string): void {
  for (const [x, y] of [
    [1, 1],
    [N - 5, N - 5],
  ] as const) {
    rect(p, x, y, 3, 3, ch);
    p.set(x + 1, y + 1, "Y");
  }
}

/** The diagonal drawn `t` of the way from the top-left corner, two pixels thick. */
function diagonal(t: number, glow: boolean): string {
  const p = Pic.blank(N, N);
  studs(p, "A");
  const end = Math.round(3 + (N - 7) * t);
  if (t > 0) {
    line(p, 3, 3, end, end, glow ? "w" : "Y");
    line(p, 4, 3, end + 1, end, glow ? "Y" : "A");
    line(p, 3, 4, end, end + 1, glow ? "Y" : "A");
    line(p, 5, 3, end + 2, end, "a");
    line(p, 3, 5, end, end + 2, "a");
  }
  if (glow) {
    for (const [x, y] of [
      [9, 6],
      [20, 17],
      [14, 18],
      [25, 22],
    ] as const)
      p.set(x, y, "w");
  }
  return p.toString();
}

/** Faint chalk dashes along the line nobody has drawn yet. */
function hint(): string {
  const p = Pic.blank(N, N);
  studs(p, "a");
  for (let k = 6; k < N - 6; k += 4) {
    p.set(k, k, "y");
    p.set(k + 1, k + 1, "y");
  }
  return p.toString();
}

// Telegraphs ----------------------------------------------------------------------------------

/**
 * A row lane: two red rails just inside the seams with dashes marching along them, a few dashes
 * inside, and the knotted cord laid along the centre.
 */
function lane(phase: 0 | 1 | 2): string {
  const p = Pic.blank(N, N);
  const rail = phase === 2 ? "M" : "m";
  for (let x = 0; x < N; x++) {
    const on = (x + phase * 2) % 6 < 4;
    for (const y of [3, N - 4]) {
      p.set(x, y, rail);
      p.set(x, y + (y < 8 ? 1 : -1), on ? (phase === 1 ? "M" : "r") : "R");
    }
  }
  const cy = N / 2 - 1;
  for (let x = 0; x < N; x++) {
    if ((x + phase * 3) % 8 < 3) {
      p.set(x, cy - 5, "r");
      p.set(x + 4, cy + 6, "r");
    }
  }
  for (let x = 0; x < N; x++) {
    const knot = x % 8 === 4;
    if (phase === 2) {
      p.set(x, cy, "w");
      p.set(x, cy + 1, "P");
      p.set(x, cy - 1, x % 2 ? "M" : "P");
      p.set(x, cy + 2, x % 2 ? "P" : "M");
    } else {
      p.set(x, cy, knot ? "D" : phase === 1 ? "Y" : "A");
      p.set(x, cy + 1, knot ? "D" : "a");
    }
  }
  return p.toString();
}
const turn = (g: string): string => {
  const src = Pic.of(g);
  const out = Pic.blank(src.h, src.w);
  for (let y = 0; y < src.h; y++)
    for (let x = 0; x < src.w; x++) out.set(y, x, src.at(x, y) as string);
  return out.toString();
};

/** A square-number cell: brackets close toward the slab, then the tablet lands. */
function square(phase: 0 | 1 | 2): string {
  const p = Pic.blank(N, N);
  const inset = phase === 0 ? 1 : phase === 1 ? 4 : 2;
  const ch = phase === 2 ? "M" : phase === 1 ? "m" : "r";
  const len = 7;
  const a = inset;
  const b = N - 1 - inset;
  for (const [x, y, dx, dy] of [
    [a, a, 1, 1],
    [b, a, -1, 1],
    [a, b, 1, -1],
    [b, b, -1, -1],
  ] as const) {
    for (let k = 0; k < len; k++) {
      p.set(x + dx * k, y, ch);
      p.set(x, y + dy * k, ch);
      p.set(x + dx * k, y + dy, ch);
      p.set(x + dx, y + dy * k, ch);
    }
  }
  if (phase === 2) {
    rect(p, 8, 8, 16, 16, "A");
    rect(p, 8, 8, 16, 1, "Y");
    rect(p, 8, 8, 1, 16, "Y");
    rect(p, 8, 23, 16, 1, "D");
    rect(p, 23, 8, 1, 16, "D");
    rect(p, 11, 11, 10, 10, "a");
    for (const [x, y] of [
      [5, 12],
      [26, 18],
      [14, 26],
      [19, 4],
    ] as const)
      p.set(x, y, "w");
  }
  return p.toString();
}

const ground = {
  group: "page1-bosses",
  size: [N, N] as const,
  origin: [0, 0] as const,
  palette,
  outline: false,
};

export default [
  sprite({
    ...ground,
    name: "p1-cell",
    lone: "wg",
    frames: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`n${i + 1}`, slab(i + 1)])),
    anim: { idle: { frames: ["n1"], fps: 1 } },
  }),
  sprite({
    ...ground,
    name: "p1-diagonal",
    lone: "wyYA",
    frames: {
      hint: hint(),
      trace0: diagonal(0.25, false),
      trace1: diagonal(0.5, false),
      trace2: diagonal(0.75, false),
      trace3: diagonal(1, false),
      open: diagonal(1, true),
    },
    anim: {
      idle: { frames: ["hint"], fps: 1 },
      trace: {
        frames: ["trace0", "trace1", "trace2", "trace3", "open"],
        fps: 10,
        loop: false,
        jump: 1,
      },
      open: { frames: ["open", "trace3"], fps: 4, jump: 1 },
    },
  }),
  sprite({
    ...ground,
    name: "p1-lane",
    lone: "RrmMwPDAaY",
    frames: {
      h0: lane(0),
      h1: lane(1),
      hstrike: lane(2),
      v0: turn(lane(0)),
      v1: turn(lane(1)),
      vstrike: turn(lane(2)),
    },
    anim: {
      row: { frames: ["h0", "h1"], fps: 6, jump: 1 },
      "row-strike": { frames: ["hstrike"], fps: 1, loop: false },
      col: { frames: ["v0", "v1"], fps: 6, jump: 1 },
      "col-strike": { frames: ["vstrike"], fps: 1, loop: false },
    },
  }),
  sprite({
    ...ground,
    name: "p1-square",
    lone: "rmMwYAaD",
    frames: { warn0: square(0), warn1: square(1), strike: square(2) },
    anim: {
      warn: { frames: ["warn0", "warn1"], fps: 6, jump: 1 },
      strike: { frames: ["strike"], fps: 1, loop: false },
    },
  }),
];
