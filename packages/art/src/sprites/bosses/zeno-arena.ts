import { type Legend, sprite } from "../../format.ts";
import { Pic, rect } from "./kit.ts";

/**
 * The 제논 arena at 엘레아 경주로: a racetrack whose finish nobody reaches. Ground pieces only,
 * drawn flat in the 3/4 view (a circle on the ground is an ellipse 0.62 as tall as it is wide).
 *
 * - `p1-limit-96`, `p1-limit-48`, `p1-limit-24`: the limit circles, each half the last. Gold
 *   is help: `open` waits for a student, `held` while one stands in it, `full` once it counts.
 *   The same rings in red are his dichotomy wave: `warn0`/`warn1`, then `strike`.
 * - `p1-mark`: fraction marks painted across a lane, `half`, `quarter`, `eighth`, `sixteenth`.
 * - `p1-arrow-path`: one 32 px stretch of the arrow's path, the arrow frozen at every instant
 *   along it (`warn0`/`warn1`), then the streak when it is somewhere else (`strike`).
 * - `p1-track`: a worn lane line (`line`) and the stone starting sill (`start`).
 */

const palette: Legend = {
  ".": null,
  D: "gold.deep",
  a: "gold.mid",
  A: "gold.light",
  Y: "gold.pale",
  R: "red.deep",
  r: "red.dark",
  m: "red.mid",
  M: "red.light",
  P: "red.pale",
  G: "stone.deep",
  g: "stone.mid",
  q: "stone.light",
  p: "stone.pale",
  w: "stone.bright",
  T: "clay.deep",
  t: "clay.dark",
  u: "clay.mid",
  U: "clay.light",
  d: "clay.dust",
  y: "clay.pale",
  l: "sea.light",
  L: "sea.pale",
};

const FLAT = 0.62;

/** Pixels in a ground ring `width` thick, with the angle of each from the top (0 to 1). */
function ring(
  d: number,
  width: number,
  paint: (t: number, inner: boolean, outer: boolean) => string | null,
): Pic {
  const h = Math.ceil(d * FLAT) + 2;
  const p = Pic.blank(d + 2, h);
  const cx = (d + 2) / 2;
  const cy = h / 2;
  const rx = d / 2;
  const ry = (d * FLAT) / 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < d + 2; x++) {
      const nx = (x + 0.5 - cx) / rx;
      const ny = (y + 0.5 - cy) / ry;
      const r = Math.hypot(nx, ny);
      const edge = width / rx;
      if (r > 1 || r < 1 - edge) continue;
      const a = Math.atan2(nx, -ny);
      const t = (a < 0 ? a + 2 * Math.PI : a) / (2 * Math.PI);
      const ch = paint(t, r < 1 - edge / 2, r > 1 - 1 / rx);
      if (ch) p.set(x, y, ch);
    }
  }
  return p;
}

/** Ticks pointing inward on the ring's four quarters: take the limit, step in. */
function ticks(p: Pic, ch: string): Pic {
  const cx = Math.floor(p.w / 2);
  const cy = Math.floor(p.h / 2);
  const rx = Math.floor(p.w / 2) - 4;
  const ry = Math.floor(p.h / 2) - 3;
  for (let k = 0; k < 2; k++) {
    p.set(cx - rx + k + 1, cy, ch);
    p.set(cx + rx - k - 1, cy, ch);
    p.set(cx, cy - ry + k, ch);
    p.set(cx, cy + ry - k - 1, ch);
  }
  return p;
}

function limit(d: number) {
  const dashes = Math.max(8, Math.round(d / 4));
  // Gold on sand needs its dark rim to read: every gold ring sits on a gold.deep line.
  const open = ring(d, 2, (t, _, out) => (Math.floor(t * dashes * 2) % 2 ? null : out ? "D" : "Y"));
  const held = ticks(
    ring(d, 3, (t, inner, out) =>
      out ? "D" : inner ? "A" : Math.floor(t * dashes) % 3 === 0 ? "w" : "Y",
    ),
    "Y",
  );
  const full = ring(d, 4, (_, inner, out) => (out ? "D" : inner ? "Y" : "w"));
  const inner = ring(Math.max(8, d - 12), 2, (t, _, out) =>
    out ? "D" : Math.floor(t * dashes) % 2 ? "Y" : "w",
  );
  full.put(inner, 6, Math.round(6 * FLAT));
  const warn0 = ring(d, 2, (t, inner) =>
    Math.floor(t * dashes * 2) % 2 ? (inner ? "R" : null) : inner ? "r" : "m",
  );
  const warn1 = ring(d, 3, (t, inner) =>
    inner ? "m" : Math.floor(t * dashes * 2) % 2 ? "M" : "m",
  );
  const strike = ring(d, 3, (_, inner) => (inner ? "M" : "P"));
  strike.put(
    ring(Math.max(8, d - 8), 1, (t) => (Math.floor(t * dashes) % 2 ? "w" : null)),
    4,
    Math.round(4 * FLAT),
  );
  const size = [open.w, open.h] as const;
  return sprite({
    name: `p1-limit-${d}`,
    group: "page1-bosses",
    size,
    origin: [Math.floor(size[0] / 2), Math.floor(size[1] / 2)],
    palette,
    lone: "DaAYrRmMPw",
    outline: false,
    frames: {
      open: open.toString(),
      held: held.toString(),
      full: full.toString(),
      warn0: warn0.toString(),
      warn1: warn1.toString(),
      strike: strike.toString(),
    },
    anim: {
      open: { frames: ["open"], fps: 1 },
      held: { frames: ["held", "open"], fps: 4, jump: 1 },
      full: { frames: ["full"], fps: 1 },
      warn: { frames: ["warn0", "warn1"], fps: 6, jump: 1 },
      strike: { frames: ["strike"], fps: 1, loop: false },
    },
  });
}

// Fraction marks ------------------------------------------------------------------------------

const DIGITS: Record<string, string> = {
  "1": ".w\nww\n.w\n.w\n.w",
  "2": "ww.\n..w\n.w.\nw..\nwww",
  "4": "w.w\nw.w\nwww\n..w\n..w",
  "6": ".ww\nw..\nwww\nw.w\nwww",
  "8": "www\nw.w\nwww\nw.w\nwww",
  "/": "..w\n..w\n.w.\nw..\nw..",
};

/** A painted line across the lane with its fraction beside it, chalk-white with a worn shadow. */
function mark(text: string): string {
  const p = Pic.blank(32, 16);
  rect(p, 2, 9, 28, 2, "w");
  rect(p, 2, 11, 28, 1, "q");
  for (const x of [6, 17, 24]) p.set(x, 9, "p");
  let x = 3;
  for (const ch of text) {
    const g = Pic.of(DIGITS[ch] as string);
    // Shadow first, one pixel down and right.
    p.put(g.swap("w", "q"), x + 1, 2);
    p.put(g, x, 1);
    x += g.w + 1;
  }
  return p.toString();
}

// The arrow's path ----------------------------------------------------------------------------

/** One frozen instant of the arrow, as a pale ghost. */
const GHOST = `
  r...........m..
  .r..........mm.
  ..rmmmmmmmmmmMm
  .r..........mm.
  r...........m..
`;
function path(phase: 0 | 1 | 2): string {
  const p = Pic.blank(32, 16);
  if (phase === 2) {
    rect(p, 0, 7, 32, 1, "P");
    rect(p, 0, 8, 32, 1, "w");
    rect(p, 0, 9, 32, 1, "M");
    for (const x of [3, 13, 22, 29]) p.set(x, 5 + (x % 3), "w");
    return p.toString();
  }
  const ghost = Pic.of(GHOST);
  p.put(phase === 0 ? ghost : ghost.swap("rmM", "mMP"), 1, 5);
  p.put(phase === 0 ? ghost.swap("rmM", "mMP") : ghost, 17, 5);
  for (let x = 0; x < 32; x += 4) {
    p.set(x, 2, "R");
    p.set(x + 1, 2, "R");
    p.set(x + 2, 13, "R");
    p.set(x + 3, 13, "R");
  }
  return p.toString();
}

// Track ----------------------------------------------------------------------------------------

function trackLine(): string {
  const p = Pic.blank(32, 4);
  rect(p, 0, 1, 32, 1, "p");
  rect(p, 0, 2, 32, 1, "q");
  for (const x of [5, 6, 19, 27]) p.set(x, 1, "U");
  return p.toString();
}
/** The stone sill a race starts from: two grooves for the toes, worn smooth. */
function start(): string {
  const p = Pic.blank(32, 9);
  rect(p, 0, 0, 32, 9, "q");
  rect(p, 0, 0, 32, 1, "w");
  rect(p, 0, 1, 32, 1, "p");
  rect(p, 0, 7, 32, 1, "g");
  rect(p, 0, 8, 32, 1, "G");
  rect(p, 0, 3, 32, 1, "g");
  rect(p, 0, 4, 32, 1, "G");
  rect(p, 0, 5, 32, 1, "p");
  for (const x of [0, 15, 16, 31]) {
    for (let y = 0; y < 9; y++) p.set(x, y, "g");
  }
  return p.toString();
}

const ground = { group: "page1-bosses", palette, outline: false } as const;

export default [
  limit(96),
  limit(48),
  limit(24),
  sprite({
    ...ground,
    name: "p1-mark",
    size: [32, 16],
    origin: [0, 0],
    lone: "wpqU",
    frames: {
      half: mark("1/2"),
      quarter: mark("1/4"),
      eighth: mark("1/8"),
      sixteenth: mark("1/16"),
    },
    anim: { idle: { frames: ["half"], fps: 1 } },
  }),
  sprite({
    ...ground,
    name: "p1-arrow-path",
    size: [32, 16],
    origin: [0, 8],
    lone: "RrmMPw",
    frames: { warn0: path(0), warn1: path(1), strike: path(2) },
    anim: {
      warn: { frames: ["warn0", "warn1"], fps: 8, jump: 1 },
      strike: { frames: ["strike"], fps: 1, loop: false },
    },
  }),
  sprite({
    ...ground,
    name: "p1-track",
    size: [32, 9],
    origin: [0, 0],
    lone: "U",
    frames: { line: Pic.blank(32, 9).put(trackLine(), 0, 2).toString(), start: start() },
    anim: { idle: { frames: ["line"], fps: 1 } },
  }),
];
