import { type Legend, sprite } from "../../format.ts";
import { lobes, Pic, seal, texture, tidy } from "../../paint.ts";

/**
 * The 운동장 as a school field: chalk lines laid by hand and half rubbed out, a goal mouth worn
 * bare, drag marks, weeds where the sand meets the lawn. All ground detail, drawn under
 * everything and lit by the scene's theme.
 */
const palette: Legend = {
  ".": null,
  d: "stone.deep",
  w: "stone.bright",
  k: "stone.pale",
  K: "stone.light",
  M: "stone.mid",
  g: "grass.light",
  G: "grass.mid",
  D: "grass.dark",
  h: "grass.pale",
  // training cones
  Q: "clay.deep",
  R: "clay.mid",
  r: "clay.light",
  // the ball's patches
  j: "ink.dark",
  // shadow shapes
  x: "ink.deep",
};

/**
 * Chalk, 16 long: fresh, worn thin, and nearly gone. Pieces join end to end; the faded specks
 * are single grains of chalk on purpose.
 */
const CHALK_H = [
  `
    wwwwwwwwwwwwwwww
    wwwwwkwwwwwwwwkw
  `,
  `
    wwwwkk..kwwwwwww
    kwwk......kwwwkk
  `,
  `
    kk......kwwk....
    ..........kk....
  `,
  `
    wwwwwwwwkkwwwwww
    wwkkwwwwww..kwww
  `,
];
const vertical = (h: string) => {
  const rows = h
    .trim()
    .split("\n")
    .map((r) => [...r.trim()]);
  return Array.from({ length: 16 }, (_, y) => `${rows[0]?.[y] ?? "."}${rows[1]?.[y] ?? "."}`).join(
    "\n",
  );
};

/** The goal mouth, scuffed bare by a thousand lunchtime games. */
function worn(): string {
  const W = 44;
  const H = 18;
  const isIn = lobes([
    { x: 22, y: 9, rx: 19, ry: 7 },
    { x: 12, y: 8, rx: 9, ry: 6 },
    { x: 31, y: 11, rx: 10, ry: 5 },
  ]);
  const pic = Pic.blank(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!isIn(x, y)) continue;
      // Ragged edge: the outer ring is broken up.
      const edge = !isIn(x - 2, y) || !isIn(x + 2, y) || !isIn(x, y - 2) || !isIn(x, y + 2);
      if (edge && (x * 3 + y * 5) % 4 === 0) continue;
      pic.set(x, y, "K");
    }
  }
  texture(
    pic,
    [
      [
        [2, 3, Pic.of("MM.\n.MM")],
        [9, 8, Pic.of(".MM\nMM.")],
        [5, 12, Pic.of("MM")],
      ],
      [
        [3, 6, Pic.of("MM")],
        [10, 2, Pic.of("M.\n.M")],
        [7, 10, Pic.of(".MM\nMM.")],
      ],
    ],
    "K",
  );
  return tidy(tidy(pic, "K", ""), "K", "").toString();
}

const DRAG = `
  .KK..............
  KKKKKKK..........
  ..KKKKKKKKKKK....
  ........KKKKKKKK.
  ............KKK..
`;

const WEEDS = `
  .hh..g..
  .gG..gG.
  gGgG.Gg.
  .GDDGG..
`;

/** A training cone left out after PE: orange, a white band, lit on its left. */
function cone(): string {
  const W = 9;
  const H = 10;
  const c = 4;
  const pic = Pic.blank(W, H);
  for (let y = 0; y < H - 1; y++) {
    const half = Math.min(3, Math.floor((y + 2) / 2.6));
    for (let x = c - half; x <= c + half; x++) {
      const band = y === 4 || y === 5;
      pic.set(x, y, band ? (x <= c ? "w" : "k") : x <= c ? "r" : "R");
    }
  }
  for (let x = 0; x < W; x++) pic.set(x, H - 1, x < c ? "r" : "R");
  pic.set(0, H - 2, "r").set(W - 1, H - 2, "R");
  return seal(tidy(pic, "r"), "Q").toString();
}

/** The lunchtime ball, kicked into a corner when the field went quiet. */
const BALL = `
  ..ddd..
  .dwwkd.
  dwwjkkd
  dwjjjkd
  dkkjKKd
  .dkKKd.
  ..ddd..
`;

const one = (name: string, size: [number, number], grid: string) =>
  sprite({
    name,
    size,
    origin: [0, 0],
    palette,
    outline: false,
    frames: { still: grid },
    anim: { idle: { frames: ["still"], fps: 1 } },
  });

export default [
  sprite({
    name: "chalk-h",
    size: [16, 2],
    origin: [0, 0],
    palette,
    lone: "k",
    outline: false,
    frames: Object.fromEntries(CHALK_H.map((g, i) => [`h${i}`, g])),
    anim: { idle: { frames: ["h0"], fps: 1 } },
  }),
  sprite({
    name: "chalk-v",
    size: [2, 16],
    origin: [0, 0],
    palette,
    lone: "k",
    outline: false,
    frames: Object.fromEntries(CHALK_H.map((g, i) => [`v${i}`, vertical(g)])),
    anim: { idle: { frames: ["v0"], fps: 1 } },
  }),
  one("worn", [44, 18], worn()),
  one("drag", [17, 5], DRAG),
  one("weeds", [8, 4], WEEDS),
  sprite({
    name: "marker-cone",
    size: [11, 12],
    palette,
    frames: { still: Pic.blank(11, 12).put(cone(), 1, 1).toString() },
    shadow: `
      ...........
      ...........
      ...........
      ...........
      ...........
      ...........
      ...........
      ...........
      ...........
      ...........
      ..xxxxxxxxx
      ...xxxxxxx.
    `,
    anim: { idle: { frames: ["still"], fps: 1 } },
  }),
  sprite({
    name: "ball",
    size: [8, 8],
    palette,
    frames: { still: Pic.blank(8, 8).put(BALL, 0, 1).toString() },
    shadow: `
      ........
      ........
      ........
      ........
      ........
      ........
      ..xxxxx.
      ...xxx..
    `,
    anim: { idle: { frames: ["still"], fps: 1 } },
  }),
];
