import { type Legend, sprite } from "../../format.ts";
import { lobes, Pic, seal, smooth, tidy } from "../../paint.ts";

/**
 * 생태공원: the garden built to show off flowers, now weeds to the knee. The water sculpture in
 * the middle stopped running long ago and its basin is green; reeds have the pond; the bugs have
 * everything else. At the gate somebody laid fresh turf. Campus colours, lit from the top left.
 */
const palette: Legend = {
  ".": null,
  // concrete and steel
  d: "stone.deep",
  S: "stone.dark",
  M: "stone.mid",
  K: "stone.light",
  k: "stone.pale",
  w: "stone.bright",
  I: "navy.light",
  i: "navy.pale",
  // algae and weeds
  F: "grass.deep",
  D: "grass.dark",
  G: "grass.mid",
  q: "grass.soft",
  g: "grass.light",
  h: "grass.pale",
  H: "grass.bright",
  // fresh turf, brighter than anything else on the lawn
  // reeds
  B: "wood.deep",
  b: "wood.dark",
  u: "wood.mid",
  U: "wood.light",
  // weed flowers
  y: "gold.light",
  v: "plum.light",
  // the hose
  r: "red.mid",
  R: "red.dark",
  // bugs
  j: "ink.deep",
  J: "ink.dark",
  s: "sea.light",
  x: null,
};

const one = (
  name: string,
  size: [number, number],
  grid: string,
  extra: Partial<Parameters<typeof sprite>[0]> = {},
) =>
  sprite({
    name,
    size,
    palette,
    frames: { still: grid },
    anim: { idle: { frames: ["still"], fps: 1 } },
    ...extra,
  });

function oval(w: number, h: number, cx: number, cy: number, rx: number, ry: number): string {
  const pic = Pic.blank(w, h);
  const isIn = lobes([{ x: cx, y: cy, rx, ry }]);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (isIn(x, y)) pic.set(x, y, "d");
  return pic.toString();
}

/**
 * The water sculpture, as it is now: three steel ribbons twisting up out of a tall concrete
 * drum, rust and algae run down them in streaks; the drum stained black where water used to
 * sheet over it, a green tidemark round its foot; the basin dried to a cracked crust of dead
 * algae with one stagnant green puddle left, leaves on it, and a garden hose someone dragged
 * over the rim and left there.
 */
function sculpture(): string {
  const W = 100;
  const H = 98;
  const pic = Pic.blank(W, H);
  const cx = 50;
  const lip = lobes([{ x: cx, y: 78, rx: 46, ry: 18 }]);
  const floor = lobes([{ x: cx, y: 77, rx: 41, ry: 14 }]);
  const puddle = lobes([
    { x: cx + 14, y: 82, rx: 11, ry: 4 },
    { x: cx + 6, y: 84, rx: 6, ry: 3 },
  ]);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!lip(x, y)) continue;
      if (puddle(x, y)) pic.set(x, y, !puddle(x, y - 1) ? "q" : (x + y) % 6 === 0 ? "g" : "G");
      else if (floor(x, y)) {
        // Dead algae dried to a crust, cracked into plates.
        const crack = (x * 3 + y * 7) % 17 === 0 || (x + y * 2) % 13 === 0;
        pic.set(x, y, crack ? "b" : (x * 5 + y) % 9 < 3 ? "u" : "D");
      } else pic.set(x, y, y < 76 ? "k" : y < 88 ? "K" : "M");
    }
  // The drum: tall, stained dark in long streaks from its top, green at its foot.
  for (let y = 42; y < 80; y++)
    for (let x = cx - 10; x < cx + 10; x++) {
      const streak = (x * 7) % 5 === 0 && y < 70;
      let ch = x < cx - 7 ? "k" : x > cx + 6 ? "M" : "K";
      if (streak) ch = y < 55 ? "M" : "S";
      if (y > 72) ch = y > 76 ? "D" : "G";
      pic.set(x, y, ch);
    }
  for (let x = cx - 10; x < cx + 10; x++) pic.set(x, 41, "w").set(x, 42, "k");
  // Three ribbons of steel, tall and thick, rust and algae down their undersides.
  for (let k = 0; k < 3; k++) {
    for (let y = 2; y < 42; y++) {
      const t = (42 - y) / 40;
      const ang = t * 5.6 + (k * Math.PI * 2) / 3;
      const x = cx + Math.sin(ang) * (4 + t * 9);
      const front = Math.cos(ang) > 0;
      const xi = Math.round(x);
      const rust = (y * 3 + k * 7) % 11 === 0 && !front;
      pic
        .set(xi - 1, y, front ? "i" : "I")
        .set(xi, y, front ? "w" : "K")
        .set(xi + 1, y, rust ? "u" : front ? "K" : "M")
        .set(xi + 2, y, rust ? "b" : front ? "M" : "S");
    }
  }
  for (let y = 30; y < 42; y++)
    for (let x = cx - 14; x < cx + 14; x++)
      if (pic.at(x, y) === "M" && (x + y) % 3 === 0) pic.set(x, y, "D");
  // Leaves blown onto the crust.
  for (const [lx, ly] of [
    [22, 74],
    [30, 82],
    [70, 72],
    [62, 88],
    [36, 70],
  ] as const)
    pic.put("UU\nU.", lx, ly);
  // The hose: coiled on the rim, dragged over it and left lying in the basin.
  for (let a = 0; a < 6.3; a += 0.05) {
    const hx = Math.round(84 + Math.cos(a) * 6);
    const hy = Math.round(70 + Math.sin(a) * 3);
    pic.set(hx, hy, "r").set(hx, hy + 1, "R");
  }
  for (let t = 0; t <= 1; t += 0.01) {
    const hx = Math.round(78 - t * 24 + Math.sin(t * 9) * 3);
    const hy = Math.round(71 + t * 12);
    pic.set(hx, hy, "r").set(hx, hy + 1, "R");
  }
  return smooth(tidy(seal(pic, "d"), "D", "dqrRU"), "drR").toString();
}

/** A clump of weeds to the knee, a flower or two in it, leaning in the breeze. */
function weedClump(lean: number, flower: string): string {
  const W = 20;
  const H = 18;
  const pic = Pic.blank(W, H);
  const blades: readonly [number, number][] = [
    [3, 10],
    [5, 15],
    [7, 12],
    [9, 16],
    [11, 13],
    [13, 15],
    [15, 11],
    [17, 8],
    [10, 9],
  ];
  blades.forEach(([x0, hgt], i) => {
    for (let k = 0; k < hgt; k++) {
      const y = H - 1 - k;
      const x = Math.round(x0 + (k / hgt) ** 2 * (lean + (i % 3) - 1) * 2);
      pic.set(x, y, k > hgt - 3 ? "h" : k > hgt / 2 ? "g" : "G");
      if (k < hgt - 2) pic.set(x + 1, y, k > hgt / 2 ? "G" : "D");
    }
  });
  for (let x = 2; x < 18; x++) pic.set(x, H - 1, "D").set(x, H - 2, x % 3 ? "G" : "D");
  pic.put(`${flower}${flower}\n${flower}${flower}`, 8 + lean, 2);
  return smooth(pic, flower).toString();
}

/** Reeds at the pond's edge: blades and brown cattail heads. */
function reeds(lean: number): string {
  const W = 16;
  const H = 24;
  const pic = Pic.blank(W, H);
  for (const [x0, hgt, head] of [
    [3, 18, true],
    [6, 22, false],
    [8, 20, true],
    [11, 16, false],
    [13, 19, true],
  ] as const) {
    for (let k = 0; k < hgt; k++) {
      const x = Math.round(x0 + (k / hgt) ** 2 * lean * 2);
      pic.set(x, H - 1 - k, k > hgt * 0.7 ? "g" : "G");
    }
    if (head) {
      const x = Math.round(x0 + lean * 2);
      pic.put("bb\nUb\nUb\nbb", x - 1, H - hgt - 1);
    }
  }
  return smooth(seal(pic, "F", "bU"), "F").toString();
}

/** A cloud of gnats, four frames of them milling. Raw. */
function gnats(frame: number): string {
  const pic = Pic.blank(11, 11);
  for (let k = 0; k < 7; k++) {
    const a = k * 2.1 + frame * 1.3 + (k % 2) * frame;
    const r = 2 + ((k * 3) % 4);
    pic.set(Math.round(5 + Math.cos(a) * r), Math.round(5 + Math.sin(a * 1.3) * r * 0.7), "J");
  }
  return pic.toString();
}

/** A dragonfly, two wingbeats. Raw. */
const DRAGONFLY = [
  `
    ..i.i..
    ss.j.ss
    ...j...
    ...j...
  `,
  `
    .i...i.
    ...j...
    ssJjJss
    ...j...
  `,
];

/**
 * Fresh turf laid in rolls across the gate, the only thing anyone has done here: strips of new
 * green with dark soil showing in the seams, their ends staggered, one roll not yet unrolled.
 * Flat.
 */
function sod(): string {
  const W = 52;
  const H = 34;
  const pic = Pic.blank(W, H);
  for (let strip = 0; strip < 5; strip++) {
    const y0 = strip * 6 + 1;
    const start = (strip * 7) % 5;
    const end = W - 3 - ((strip * 5) % 9);
    for (let y = y0; y < y0 + 5; y++)
      for (let x = start; x < end; x++) {
        const tuft = (x * 7 + y * 11) % 9 === 0;
        pic.set(x, y, y === y0 ? "H" : tuft ? "H" : y === y0 + 4 ? "g" : "h");
      }
    // Soil in the seam below, and at the strip's ragged ends.
    for (let x = start; x < end; x++) pic.set(x, y0 + 5, (x + strip) % 4 === 0 ? "u" : "b");
    pic
      .set(end, y0 + 1, "b")
      .set(end, y0 + 2, "b")
      .set(start, y0 + 3, "b")
      .set(start, y0 + 4, "b");
  }
  // The roll still waiting at the end of the last strip.
  pic.put(
    `
      .gggg.
      ghhhhg
      ghbbhg
      ghbbhg
      .gggg.
    `,
    W - 8,
    27,
  );
  return smooth(pic).toString();
}

/** Lily pads, one with a flower. Flat. */
const LILY = `
  ..GGGG......
  .GggggG.....
  GggGgggG.GG.
  GggGggggGggG
  .GgggggGgvvG
  ..GGGGG.GvvG
  ........GGG.
`;

/** A bank of morning mist lying low over the water: a dithered veil, thick in the middle. Raw. */
function mist(): string {
  const W = 104;
  const H = 14;
  const pic = Pic.blank(W, H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const body = 1 - Math.abs(y - 7) / 7.5 - Math.abs(x - 52) / 56 + Math.sin(x * 0.13) * 0.12;
      const on =
        body > 0.5
          ? (x + y) % 2 === 0
          : body > 0.28
            ? (x + y) % 2 === 0 && (x * 3 + y) % 4 < 2
            : body > 0.12 && (x + y * 3) % 6 === 0;
      if (on) pic.set(x, y, body > 0.6 && (x + y) % 4 === 0 ? "w" : "k");
    }
  return pic.toString();
}

/** The little plaque on the basin's rim. */
const PLAQUE = `
  dddddddd
  dwkkkkKd
  dkSSSSKd
  dkSSkSKd
  dKKKKKMd
  dddddddd
  ...dd...
  ...dd...
`;

export default [
  one("water-sculpture", [100, 98], sculpture(), {
    lone: "qUrR",
    shadow: oval(100, 98, 52, 95, 46, 3.5),
  }),
  sprite({
    name: "weed-clump",
    size: [20, 18],
    palette,
    outline: false,
    lone: "yv",
    frames: {
      a0: weedClump(0, "y"),
      a1: weedClump(1, "y"),
      b0: weedClump(-1, "v"),
      b1: weedClump(0, "v"),
    },
    anim: { sway: { frames: ["a0", "a1"], fps: 1.4 }, sway2: { frames: ["b0", "b1"], fps: 1.2 } },
  }),
  sprite({
    name: "reeds",
    size: [16, 24],
    palette,
    outline: false,
    frames: { a: reeds(0), b: reeds(1) },
    anim: { sway: { frames: ["a", "b"], fps: 1.1 } },
  }),
  sprite({
    name: "gnats",
    size: [11, 11],
    origin: [5, 5],
    palette,
    lone: "J",
    outline: false,
    frames: Object.fromEntries([0, 1, 2, 3].map((f) => [`mill${f}`, gnats(f)])),
    anim: { mill: { frames: ["mill0", "mill1", "mill2", "mill3"], fps: 8, jump: 1 } },
  }),
  sprite({
    name: "dragonfly",
    size: [7, 4],
    origin: [3, 2],
    palette,
    lone: "ijsJ",
    outline: false,
    frames: { beat0: DRAGONFLY[0] as string, beat1: DRAGONFLY[1] as string },
    anim: { beat: { frames: ["beat0", "beat1"], fps: 10, jump: 1 } },
  }),
  sprite({
    name: "sod",
    size: [52, 34],
    origin: [0, 0],
    palette,
    outline: false,
    frames: { still: sod() },
    anim: { idle: { frames: ["still"], fps: 1 } },
  }),
  sprite({
    name: "lily",
    size: [12, 7],
    palette,
    outline: false,
    frames: { still: tidy(Pic.of(LILY), "g", "Gv").toString() },
    anim: { idle: { frames: ["still"], fps: 1 } },
  }),
  sprite({
    name: "mist",
    size: [104, 14],
    origin: [52, 7],
    palette,
    lone: "wk",
    outline: false,
    frames: { still: mist() },
    anim: { idle: { frames: ["still"], fps: 1 } },
  }),
  one("plaque", [8, 8], smooth(Pic.of(PLAQUE), "dS").toString(), { lone: "S" }),
];
