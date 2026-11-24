import { type Legend, sprite } from "../../format.ts";
import { lobes, Pic, texture, tidy } from "../../paint.ts";

/**
 * The 운동장 as a school field: chalk lines laid by hand and half rubbed out, a goal mouth worn
 * bare, drag marks, weeds where the sand meets the lawn. All ground detail, drawn under
 * everything and lit by the scene's theme.
 */
const palette: Legend = {
  ".": null,
  w: "stone.bright",
  k: "stone.pale",
  K: "stone.light",
  M: "stone.mid",
  g: "grass.light",
  G: "grass.mid",
  D: "grass.dark",
  h: "grass.pale",
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
];
