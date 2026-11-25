import { type Legend, sprite } from "../../format.ts";
import { lobes, Pic, seal, smooth, tidy } from "../../paint.ts";

/**
 * 아고라 외곽, second draft: the city's edge as a city, not a row. Houses of every width and
 * height, roofs turned both ways, some seen from the back with their yard walls, a balcony, an
 * outside stair, a dovecote, washing strung between two of them; the gate in the wall; the
 * market's furniture in all its sizes; the stoa's building site; and what marks each element's
 * corner from across the square. Lit from the top left.
 */
const palette: Legend = {
  ".": null,
  // stone
  d: "stone.deep",
  S: "stone.dark",
  M: "stone.mid",
  v: "stone.vein",
  K: "stone.light",
  k: "stone.pale",
  w: "stone.bright",
  // plaster: whitewash, ochre wash, mudbrick
  W: "stone.bright",
  p: "clay.pale",
  P: "clay.dust",
  // wood
  B: "wood.deep",
  b: "wood.dark",
  u: "wood.mid",
  U: "wood.light",
  e: "wood.pale",
  // roof tiles and pots
  Q: "clay.deep",
  q: "clay.dark",
  R: "clay.mid",
  r: "clay.light",
  // cloth
  X: "red.deep",
  h: "red.mid",
  H: "red.light",
  A: "navy.deep",
  a: "navy.dark",
  i: "navy.mid",
  I: "navy.light",
  G: "gold.deep",
  g: "gold.dark",
  y: "gold.mid",
  Y: "gold.light",
  F: "gold.pale",
  // greens
  o: "olive.mid",
  O: "olive.dark",
  l: "olive.light",
  // fish and figs
  n: "navy.pale",
  z: "plum.dark",
  Z: "plum.mid",
  // water
  s: "sea.light",
  t: "sea.mid",
  T: "sea.dark",
  // soot and ink
  j: "ink.deep",
  J: "ink.dark",
  c: "ink.mid",
  x: null,
};

function finish(pic: Pic, outline: string, fill: string, keep = ""): string {
  return smooth(tidy(seal(pic, outline), fill, outline + keep), outline).toString();
}

function oval(w: number, h: number, cx: number, cy: number, rx: number, ry: number): string {
  const pic = Pic.blank(w, h);
  const isIn = lobes([{ x: cx, y: cy, rx, ry }]);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (isIn(x, y)) pic.set(x, y, "d");
  return pic.toString();
}

function hash(x: number, y: number, s: number): number {
  let v = (x * 374761393 + y * 668265263 + s * 2147483647) >>> 0;
  v = Math.imul(v ^ (v >>> 13), 1274126177) >>> 0;
  return ((v ^ (v >>> 16)) >>> 0) / 2 ** 32;
}

/** A filled box. */
function box(pic: Pic, x0: number, y0: number, w: number, h: number, ch: string): void {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) pic.set(x, y, ch);
}

// Houses ---------------------------------------------------------------------------------------------

interface HouseSpec {
  readonly w: number;
  /** Wall height in pixels below the eaves. */
  readonly wall: number;
  /** `ew`: ridge across, long tiled slope toward us; `ns`: gable end toward us; `flat`: a roof terrace. */
  readonly roof: "ew" | "ns" | "flat";
  readonly plaster: "W" | "p" | "P";
  /** Seen from the back: no door, a small high window, a yard wall in front. */
  readonly back?: boolean;
  readonly balcony?: boolean;
  readonly stair?: boolean;
  readonly awning?: boolean;
  readonly dovecote?: boolean;
  readonly washing?: boolean;
}

const HOUSES: Readonly<Record<string, HouseSpec>> = {
  a: { w: 44, wall: 26, roof: "ew", plaster: "W" },
  b: { w: 60, wall: 40, roof: "ew", plaster: "p", balcony: true },
  c: { w: 36, wall: 30, roof: "ns", plaster: "W", dovecote: true },
  d: { w: 52, wall: 28, roof: "flat", plaster: "P", stair: true, washing: true },
  e: { w: 48, wall: 24, roof: "ew", plaster: "W", back: true },
  f: { w: 40, wall: 36, roof: "ns", plaster: "p", awning: true },
  g: { w: 64, wall: 26, roof: "ew", plaster: "P", back: true },
  h: { w: 32, wall: 44, roof: "flat", plaster: "W", balcony: true },
};

const HW = 72;
const HH = 96;

/**
 * A house over its own ground line: plaster walls lit on the west, a tiled roof whose courses
 * run the way the roof does, a door and windows (or, from the back, a high slot and a yard
 * wall), and whatever the house is known for.
 */
function house(spec: HouseSpec): string {
  const pic = Pic.blank(HW, HH);
  const x0 = Math.floor((HW - spec.w) / 2);
  const x1 = x0 + spec.w - 1;
  const base = HH - 2;
  const eave = base - spec.wall;
  const wallLit = spec.plaster;
  const wallShade = spec.plaster === "W" ? "k" : spec.plaster === "p" ? "P" : "r";
  // Walls.
  for (let y = eave; y <= base; y++)
    for (let x = x0; x <= x1; x++)
      pic.set(x, y, x < x0 + 3 ? "W" : x > x1 - 4 ? wallShade : wallLit);
  // A plinth of rough stone.
  box(pic, x0, base - 2, spec.w, 3, "v");
  for (let x = x0; x <= x1; x += 5) pic.set(x, base - 1, "M");
  // Roof.
  if (spec.roof === "ew") {
    const depth = Math.round(spec.w * 0.42);
    for (let y = eave - depth; y < eave; y++) {
      const k = y - (eave - depth);
      for (let x = x0 - 2; x <= x1 + 2; x++) {
        const course = k % 4 === 3;
        const tile = (x + (Math.floor(k / 4) % 2) * 3) % 6 === 0;
        pic.set(x, y, k === 0 ? "q" : course ? "Q" : tile ? "q" : x < (x0 + x1) / 2 ? "r" : "R");
      }
    }
    for (let x = x0 - 2; x <= x1 + 2; x++) pic.set(x, eave, "Q");
  } else if (spec.roof === "ns") {
    // The gable end toward us: a triangle of plaster under two tiled slopes.
    const half = Math.round(spec.w / 2) + 2;
    const peak = eave - Math.round(spec.w * 0.38);
    for (let y = peak; y < eave; y++) {
      const t = (y - peak) / (eave - peak);
      const span = Math.round(half * t);
      const cx = Math.round((x0 + x1) / 2);
      for (let x = cx - span; x <= cx + span; x++) {
        const edge = Math.abs(x - cx) >= span - 2;
        pic.set(x, y, edge ? (x < cx ? "r" : "R") : x < cx ? wallLit : wallShade);
      }
    }
    // A round vent in the gable.
    const cx = Math.round((x0 + x1) / 2);
    pic.put("BB\nBB", cx - 1, eave - Math.round(spec.w * 0.15));
  } else {
    // A flat roof with a low parapet and a terrace's clutter.
    for (let x = x0; x <= x1; x++) pic.set(x, eave - 1, "k").set(x, eave - 2, "W");
    box(pic, x0 + 2, eave - 8, spec.w - 4, 6, "P");
    for (let x = x0 + 2; x < x1 - 1; x++) pic.set(x, eave - 8, "p");
    pic.put("QQQ\nQrQ\nQRQ", x0 + 5, eave - 11);
    pic.put("QQ\nRR", x1 - 8, eave - 10);
  }
  const mid = Math.round((x0 + x1) / 2);
  if (spec.back) {
    // The back: a small high window, a yard wall across the front with its gate.
    pic.put("SS\nSS", mid - 6, eave + 5);
    pic.put("SS\nSS", mid + 6, eave + 5);
    box(pic, x0 - 2, base - 9, spec.w + 4, 9, wallShade);
    for (let x = x0 - 2; x < x1 + 3; x++) pic.set(x, base - 9, "W").set(x, base - 10, "k");
    pic.put("BBBB\nBubB\nBubB\nBubB\nBubB\nBubB", mid - 2, base - 7);
  } else {
    // Door and windows with shutters.
    pic.put("BBBBBB\nBbuubB\nBbuubB\nBbuubB\nBbuubB\nBbuubB\nBbuubB\nBbuubB", mid - 3, base - 9);
    for (const wx of [x0 + 6, x1 - 9]) {
      if (wx + 4 > x1 || wx < x0) continue;
      const wy = spec.wall > 32 ? eave + 6 : base - 14;
      pic.put("ii..ii\nISSSSI\nISSSSI\nii..ii".replace(/i/g, "a").replace(/I/g, "a"), wx, wy);
    }
  }
  if (spec.balcony) {
    // A timber balcony on the upper floor, its rail and a pot of basil.
    const by = eave + 12;
    box(pic, x0 + 4, by, spec.w - 8, 2, "u");
    for (let x = x0 + 4; x < x1 - 3; x += 3)
      pic
        .set(x, by - 1, "b")
        .set(x, by - 2, "b")
        .set(x, by - 3, "b");
    for (let x = x0 + 4; x < x1 - 3; x++) pic.set(x, by - 4, "U");
    pic.put("ll\nRR", x0 + 7, by - 6);
  }
  if (spec.stair) {
    // An outside stair up to the roof terrace, stone treads on the east wall.
    for (let k = 0; k < 8; k++) {
      const sx = x1 - 2 - k * 2;
      const sy = base - 3 - k * 3;
      if (sy < eave) break;
      box(pic, sx - 1, sy, 4, 2, k % 2 ? "K" : "k");
      pic.set(sx - 1, sy + 2, "M").set(sx, sy + 2, "M");
    }
  }
  if (spec.awning) {
    // A striped awning over the door, shading a bench.
    for (let x = mid - 9; x <= mid + 9; x++) {
      const stripe = Math.floor((x - mid + 9) / 3) % 2 === 0;
      pic.set(x, base - 13, stripe ? "h" : "W").set(x, base - 12, stripe ? "X" : "k");
    }
    box(pic, mid + 5, base - 3, 6, 2, "u");
  }
  if (spec.dovecote) {
    // A dovecote on the ridge: a little tower full of holes.
    const cx = Math.round((x0 + x1) / 2);
    const top = eave - Math.round(spec.w * 0.38) - 14;
    box(pic, cx - 5, top + 3, 10, 12, "W");
    for (let y = top + 5; y < top + 13; y += 3)
      for (let x = cx - 3; x < cx + 4; x += 3) pic.set(x, y, "S");
    pic.put("..QQQQQQ..\n.QrrrrRRQ.\nQrrrrRRRRQ", cx - 5, top);
  }
  if (spec.washing) {
    // A line of washing across the roof terrace.
    for (let x = x0 + 4; x <= x1 - 4; x++) pic.set(x, eave - 14, "b");
    for (const [wx, c1, c2] of [
      [x0 + 8, "W", "k"],
      [x0 + 16, "h", "X"],
      [x0 + 24, "I", "a"],
    ] as const)
      for (let y = eave - 13; y < eave - 8; y++)
        pic
          .set(wx, y, c1)
          .set(wx + 1, y, c1)
          .set(wx + 2, y, c2);
  }
  return finish(pic, "d", wallLit, "WkpPrRqQBbuUSaiIhXlsM");
}

/** Washing strung across an alley between two houses: a line and its sheets, three gusts. */
function alleyWashing(frame: number): string {
  const W = 56;
  const H = 30;
  const pic = Pic.blank(W, H);
  for (let x = 0; x < W; x++)
    pic.set(x, 4 + Math.round(Math.sin((x / (W - 1)) * Math.PI) * 4), "b");
  const sheets: readonly [number, number, number, string, string][] = [
    [6, 8, 12, "W", "k"],
    [17, 7, 14, "Y", "g"],
    [27, 9, 11, "I", "a"],
    [39, 8, 13, "h", "X"],
  ];
  sheets.forEach(([x0, w, len, c1, c2], i) => {
    for (let k = 0; k < len; k++)
      for (let dx = 0; dx < w; dx++) {
        const x = x0 + dx + Math.round((k / len) * ([1, 2, 0][frame] ?? 0));
        const top = 5 + Math.round(Math.sin(((x0 + dx) / (W - 1)) * Math.PI) * 4);
        const flap = k > len - 4 && (dx + frame + i) % 3 === 0 ? 1 : 0;
        if (x < W) pic.set(x, top + k + flap, dx < w / 2 ? c1 : c2);
      }
  });
  return smooth(pic).toString();
}

// The gate ------------------------------------------------------------------------------------------

/**
 * A gate tower where the road goes through the city wall: dressed blocks, a slit, crenels, its
 * lit west face toward the agora. Two stand either side of the opening.
 */
function gateTower(): string {
  const W = 36;
  const H = 76;
  const pic = Pic.blank(W, H);
  box(pic, 2, 10, W - 4, H - 12, "K");
  for (let y = 10; y < H - 2; y++) {
    pic.set(2, y, "k").set(3, y, "k");
    pic.set(W - 3, y, "M").set(W - 4, y, "v");
    if ((y - 10) % 7 === 6) for (let x = 2; x < W - 2; x++) pic.set(x, y, "v");
    else for (let x = 2 + ((((y - 10) / 7) | 0) % 2) * 6; x < W - 4; x += 12) pic.set(x, y, "v");
  }
  // Crenels and the walkway's lip.
  for (let x = 1; x < W - 1; x++) pic.set(x, 9, "w").set(x, 10, "k");
  for (let x = 1; x < W - 1; x += 7) box(pic, x, 3, 4, 6, x < W / 2 ? "w" : "k");
  // The slit and a banner of the city.
  box(pic, W / 2 - 1, 22, 2, 10, "S");
  box(pic, 7, 40, 6, 14, "h");
  for (let y = 40; y < 54; y++) pic.set(12, y, "X");
  pic.put("YY\nYY", 9, 45);
  return finish(pic, "d", "K", "hXYwkvM");
}

/**
 * The city wall where it runs north and south, seen from above: the walkway's flags between two
 * parapets, the west parapet lit, the east in shade. A tile long, so it runs for any length.
 */
function wallNS(v: number): string {
  const pic = Pic.blank(16, 16);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      let ch = "K";
      if (x < 3) ch = x === 0 ? "d" : y % 8 === 7 ? "v" : "w";
      else if (x > 12) ch = x === 15 ? "d" : y % 8 === 3 ? "S" : "M";
      else if ((y + v * 5) % 6 === 5 || (x + Math.floor((y + v * 5) / 6) * 4) % 8 === 0) ch = "v";
      pic.set(x, y, ch);
    }
  }
  return pic.toString();
}

// Market --------------------------------------------------------------------------------------------

/** A long stall seen end-on: its awning slopes down toward us on two poles, goods on trestles. */
function longStall(goods: "jars" | "cloth"): string {
  const W = 52;
  const H = 40;
  const pic = Pic.blank(W, H);
  // The awning: a sloped canvas, striped, its front edge scalloped.
  for (let y = 0; y < 14; y++)
    for (let x = 2 + Math.floor(y / 3); x < W - 2 - Math.floor(y / 3); x++) {
      const stripe = Math.floor(x / 5) % 2 === 0;
      pic.set(x, y, stripe ? (goods === "jars" ? "Y" : "I") : "W");
    }
  for (let x = 6; x < W - 6; x++) if (x % 5 !== 4) pic.set(x, 14, goods === "jars" ? "g" : "a");
  for (const px of [6, W - 7])
    for (let y = 14; y < H - 1; y++) pic.set(px, y, "u").set(px + 1, y, "b");
  // Trestle table and its load.
  box(pic, 3, H - 12, W - 6, 3, "U");
  for (let x = 3; x < W - 3; x++) pic.set(x, H - 9, "b");
  for (const lx of [6, W - 9]) for (let y = H - 9; y < H - 1; y++) pic.set(lx, y, "u");
  if (goods === "jars") {
    for (let k = 0; k < 6; k++) pic.put("QQ\nRr\nRR\nQQ", 6 + k * 7, H - 17);
  } else {
    // Bolts of dyed cloth, and two hanging from the awning's rail.
    for (const [x, c1, c2] of [
      [7, "h", "X"],
      [15, "I", "a"],
      [23, "Y", "g"],
      [31, "W", "k"],
      [39, "l", "O"],
    ] as const) {
      box(pic, x, H - 15, 6, 3, c1);
      box(pic, x, H - 13, 6, 1, c2);
    }
    for (let y = 15; y < 24; y++)
      pic.set(12, y, "h").set(13, y, "X").set(38, y, "I").set(39, y, "a");
  }
  return finish(pic, "B", "U", "YWIgahXQRrkls");
}

/** The fishmonger's slab: fish laid head to tail on wet stone, a striped canopy on two poles. */
const FISH_TABLE = (() => {
  const pic = Pic.blank(44, 34);
  for (let y = 0; y < 8; y++)
    for (let x = 2; x < 42; x++) pic.set(x, y, Math.floor(x / 4) % 2 ? "W" : "h");
  for (let x = 4; x < 40; x++) if (x % 4 !== 3) pic.set(x, 8, "X");
  for (const px of [4, 39]) for (let y = 8; y < 33; y++) pic.set(px, y, "u");
  box(pic, 2, 20, 40, 6, "v");
  for (let x = 2; x < 42; x++) pic.set(x, 20, "w").set(x, 25, "M");
  for (let k = 0; k < 6; k++) pic.put("nnnn.\nnIIIn\n.nnnn", 4 + k * 6, 21);
  box(pic, 6, 26, 2, 7, "S");
  box(pic, 36, 26, 2, 7, "S");
  return finish(pic, "d", "v", "WhXnIuwM");
})();

/** Crates of figs and pomegranates stacked by a stall. */
const CRATES = `
  .bbbbbbbbbb...........
  bUeeUeeUeeUb..........
  bUzZzZzZzZUb.bbbbbbbbb
  bUZzZzZzZzUbbUeeUeeUeU
  bbbbbbbbbbbbbUhHhHhHhU
  bUeeUeeUeeUbbUHhHhHhHU
  bUuuUuuUuuUbbbbbbbbbbb
  bUuuUuuUuuUbbUeeUeeUeU
  bUuuUuuUuuUbbUuuUuuUuU
  bbbbbbbbbbbbbbbbbbbbbb
`;

/** Amphorae stacked in a pyramid, necks out, as they came off the boat. */
function amphoraPile(): string {
  const pic = Pic.blank(40, 26);
  for (const [x, y] of [
    [2, 14],
    [10, 14],
    [18, 14],
    [26, 14],
    [6, 7],
    [14, 7],
    [22, 7],
    [10, 0],
    [18, 0],
  ] as const)
    pic.put(
      `
        ..QQ....
        .QrrQQQ.
        QrrRRRqQ
        QrRRRqqQ
        .QQRqqQ.
        ...QQQ..
      `,
      x,
      y + 6,
    );
  return finish(pic, "Q", "R", "rq");
}

/** The square's fountain: a round basin, a stone post with a bronze spout, water falling. */
function basin(frame: number): string {
  const W = 60;
  const H = 46;
  const pic = Pic.blank(W, H);
  const rim = lobes([{ x: 30, y: 33, rx: 28, ry: 12 }]);
  const water = lobes([{ x: 30, y: 32, rx: 24, ry: 9 }]);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!rim(x, y)) continue;
      if (water(x, y)) {
        const ring = Math.hypot((x - 30) / 24, (y - 32) / 9);
        const ripple = Math.abs(((ring * 6 - frame * 0.7) % 1) - 0.5) < 0.12;
        pic.set(x, y, ripple ? "s" : ring > 0.85 ? "T" : "t");
      } else pic.set(x, y, y < 31 ? "w" : y < 40 ? "k" : "K");
    }
  // The post and its spout.
  box(pic, 27, 6, 7, 26, "k");
  for (let y = 6; y < 32; y++) pic.set(27, y, "w").set(33, y, "v");
  for (let x = 26; x < 35; x++) pic.set(x, 5, "w").set(x, 6, "K");
  pic.put("GGG\nGYG\nGgG", 29, 12);
  for (let y = 15; y < 30; y++) pic.set(30 + ((y + frame) % 3 === 0 ? 1 : 0), y, y % 2 ? "s" : "t");
  return finish(pic, "d", "k", "tTsGYgwvK");
}

/** A canvas awning strung between two poles across a lane: sagging, striped, two gusts. */
function stringAwning(frame: number): string {
  const W = 98;
  const H = 52;
  const pic = Pic.blank(W, H);
  for (const px of [2, W - 4])
    for (let y = 6; y < H - 1; y++) pic.set(px, y, "U").set(px + 1, y, "b");
  for (let x = 4; x < W - 4; x++) {
    const sag = Math.round(Math.sin(((x - 4) / (W - 9)) * Math.PI) * (5 + frame));
    for (let k = 0; k < 9; k++) {
      const stripe = Math.floor((x + 3) / 7) % 2 === 0;
      pic.set(x, 6 + sag + k, k === 8 ? (stripe ? "g" : "K") : stripe ? "Y" : "W");
    }
  }
  return finish(pic, "B", "W", "UbYgWK");
}

/** Figs and pomegranates spilled across the paving from a tipped basket. Flat. */
const SPILL = `
  ..zz.........HH..
  .zZZz..zz...HhhH.
  ..zz..zZZz...HH..
  ......zZZz.......
  .HH....zz....zz..
  HhhH........zZZz.
  .HH..zz......zz..
  ....zZZz.........
  .....zz..........
`;

// The paving's structure ----------------------------------------------------------------------------

/** A band of marble slabs, half a tile wide, edging the flags: lit on its north, joints every eight. */
function band(dir: "h" | "v"): string {
  const pic = Pic.blank(16, 16);
  for (let a = 0; a < 16; a++)
    for (let b = 0; b < 8; b++) {
      const ch = b === 0 ? "w" : b === 7 ? "v" : a % 8 === 7 ? "v" : b < 3 ? "k" : "K";
      if (dir === "h") pic.set(a, 4 + b, ch);
      else pic.set(4 + b, a, ch);
    }
  return pic.toString();
}

/** Marble laid in a ring around the fountain, a different stone from the square's flags. Flat. */
function ring(): string {
  const W = 104;
  const H = 72;
  const pic = Pic.blank(W, H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const r = Math.hypot((x - W / 2 + 0.5) / (W / 2), (y - H / 2 + 0.5) / (H / 2));
      if (r > 1 || r < 0.62) continue;
      const a = Math.atan2(y - H / 2, x - W / 2);
      const seg = (((a + Math.PI) / (2 * Math.PI)) * 28) % 1;
      const band = r > 0.94 ? "v" : r < 0.66 ? "v" : seg < 0.1 ? "v" : r > 0.8 ? "k" : "w";
      pic.set(x, y, band);
    }
  return smooth(pic).toString();
}

/** Paving worn pale and smooth along a lane where feet go most. Flat, a tile long. */
const WORN = {
  h: `
    ..FFF....FFFF...
    FFFFFFFFFFFFFFFF
    .FFFF.FFFFF.FFF.
  `,
  v: `
    .FF
    FFF
    FF.
    FFF
    .FF
    FFF
    FF.
    FFF
    .FF
    FFF
    FF.
    FFF
    .FF
    FFF
    FF.
    FFF
  `,
};

// The building site ------------------------------------------------------------------------------------

/** The stoa's back wall, built one, two or three courses high, a tile long. */
function stoaWall(courses: number): string {
  const W = 16;
  const H = 34;
  const pic = Pic.blank(W, H);
  const top = H - 1 - courses * 8;
  for (let y = top; y < H; y++)
    for (let x = 0; x < W; x++) {
      const row = Math.floor((y - top) / 8);
      const joint = (y - top) % 8 === 7 || (x + row * 8) % 16 === 15;
      pic.set(x, y, joint ? "v" : (y - top) % 8 === 0 ? "w" : x > 12 ? "K" : "k");
    }
  for (let x = 0; x < W; x++) pic.set(x, top, "w").set(x, top - 1, "d");
  for (let x = 0; x < W; x++) pic.set(x, H - 1, "d");
  return pic.toString();
}

/** Drums waiting to go up, stacked three and two, fluted, ends to the light. */
const DRUM_STACK = (() => {
  const pic = Pic.blank(44, 26);
  const drum = `
    ..dddddddddddd..
    .dwwkkKkkKkkKMd.
    dwkkKkkKkkKkkMSd
    dkKKKKKKKKKKKMSd
    .dMMMMMMMMMMMSd.
    ..dddddddddddd..
  `;
  for (const [x, y] of [
    [0, 20],
    [14, 20],
    [28, 20],
    [7, 14],
    [21, 14],
    [14, 8],
  ] as const)
    pic.put(drum, x, y - 6 + 6);
  return finish(pic, "d", "K");
})();

/** An earth ramp shored with planks, leaning on the stylobate to roll drums up. Flat-ish. */
const RAMP = `
  ..BBBBBBBBBBBBBBBBBBBB..
  .BUUUUUUUUUUUUUUUUUUUUB.
  BUeUeUeUeUeUeUeUeUeUeUUB
  BuUuUuUuUuUuUuUuUuUuUuuB
  BuuuuuuuuuuuuuuuuuuuuuuB
  .BBBBBBBBBBBBBBBBBBBBBB.
`;

/**
 * The mason's shelter: a lean-to of poles and reeds over a bench, a capital half-carved on it,
 * mallet and chisels hung up, a basket of chips.
 */
function shelter(): string {
  const W = 60;
  const H = 52;
  const pic = Pic.blank(W, H);
  // The reed roof, sloping down to the south.
  for (let y = 0; y < 16; y++)
    for (let x = 2; x < W - 2; x++)
      pic.set(x, y, y % 3 === 2 ? "u" : (x + y) % 4 === 0 ? "U" : "e");
  for (let x = 2; x < W - 2; x++) pic.set(x, 16, "b");
  for (const px of [4, W - 6])
    for (let y = 16; y < H - 1; y++) pic.set(px, y, "u").set(px + 1, y, "b");
  // The bench and the capital on it.
  box(pic, 10, H - 14, 40, 3, "U");
  for (let x = 10; x < 50; x++) pic.set(x, H - 11, "b");
  for (const lx of [12, 46]) for (let y = H - 11; y < H - 1; y++) pic.set(lx, y, "u");
  pic.put(
    `
      ..dddddddddddddd..
      .dwwwwwkkkkkkkKd..
      dddddddddddddddd..
      .dkkkkSSkkkkKMd...
      ..dKKKKSSKKKMd....
      ...ddddddddd......
    `,
    16,
    H - 20,
  );
  // Tools on the post: mallet and chisels.
  pic.put("BBB\nBuB\n.u.\n.u.", 8, 22);
  pic.put("S\nS\nu", W - 9, 22);
  pic.put("S\nS\nu", W - 11, 23);
  return finish(pic, "B", "e", "UubSdwkKMv");
}

/** A bigger crane, base and top on one canvas each: treadwheel, legs, windlass, boom, drum. */
const CW = 140;
const CH = 196;

function timber(pic: Pic, x0: number, y0: number, x1: number, y1: number, w = 5): void {
  const len = Math.max(1, Math.hypot(x1 - x0, y1 - y0));
  const steep = Math.abs(y1 - y0) > Math.abs(x1 - x0);
  for (let t = 0; t <= len; t += 0.5) {
    const x = Math.round(x0 + ((x1 - x0) * t) / len);
    const y = Math.round(y0 + ((y1 - y0) * t) / len);
    for (let k = 0; k < w; k++) {
      const off = k - Math.floor(w / 2);
      const ch = k === 0 ? "e" : k === w - 1 ? "b" : k === 1 ? "U" : "u";
      pic.set(steep ? x + off : x, steep ? y : y + off, ch);
    }
  }
}

function bigCraneBase(): string {
  const pic = Pic.blank(CW, CH);
  // The treadwheel, a man's height and a half, spokes and treads.
  const cx = 34;
  const cy = CH - 32;
  for (let a = 0; a < 360; a += 1.2) {
    const r = (a * Math.PI) / 180;
    for (const [rr, ch] of [
      [29, "b"],
      [28, "u"],
      [27, "U"],
      [26, "u"],
      [25, "b"],
    ] as const)
      pic.set(Math.round(cx + Math.cos(r) * rr), Math.round(cy + Math.sin(r) * rr), ch);
    if (Math.round(a) % 15 === 0)
      pic.set(Math.round(cx + Math.cos(r) * 24), Math.round(cy + Math.sin(r) * 24), "e");
  }
  for (let k = 0; k < 8; k++) {
    const r = (k * Math.PI) / 4;
    timber(pic, cx, cy, cx + Math.cos(r) * 24, cy + Math.sin(r) * 24, 2);
  }
  pic.put("BBBB\nBeUB\nBUuB\nBBBB", cx - 2, cy - 2);
  // Its frame on the ground.
  timber(pic, cx - 26, CH - 3, cx + 26, CH - 3, 4);
  // The two legs, planted wide.
  timber(pic, 62, CH - 3, 80, 64);
  timber(pic, 112, CH - 3, 88, 64);
  timber(pic, 68, CH - 48, 106, CH - 48, 4);
  // The windlass between the legs, rope wound on it, the rope to the wheel's axle.
  pic.put(
    `
      BBBBBBBBBBBBBBBBBBBB
      BeUeUeUeUeUeUeUeUeUB
      BUuUuUuUuUuUuUuUuUuB
      BuuuuuuuuuuuuuuuuuuB
      BBBBBBBBBBBBBBBBBBBB
    `,
    76,
    CH - 44,
  );
  for (let x = cx; x < 76; x++) pic.set(x, CH - 41 + Math.round((x - cx) * 0.02), "b");
  // A coil of rope, a wedge, a spare pulley on the ground.
  pic.put(".bbbb.\nbUeeUb\nbUbbUb\n.bbbb.", 118, CH - 7);
  pic.put("BBB\nBeB\nBBB", 128, CH - 5);
  return finish(pic, "B", "u", "eUbd");
}

function bigCraneTop(): string {
  const pic = Pic.blank(CW, CH);
  // The legs meet at the head; the boom reaches out east over the stoa's last column.
  timber(pic, 80, 64, 88, 14);
  timber(pic, 88, 64, 90, 14);
  timber(pic, 89, 14, 134, 30, 4);
  // A stay rope from the head back down to a stake.
  for (let t = 0; t < 1; t += 0.01) pic.set(Math.round(89 - t * 70), Math.round(14 + t * 120), "b");
  // The pulley block, the falls of rope, the drum in its sling.
  pic.put("BBBB\nBeUB\nBUuB\nBBBB", 131, 29);
  for (let y = 33; y < 92; y++) pic.set(132, y, "b").set(134, y, "b");
  pic.put(
    `
      ......bb........
      .....b..b.......
      ...bb....bb.....
      .dddddddddddddd.
      dwwkkKkkKkkKKMMd
      dwkkKkkKkkKkkMMd
      dkKKkkKkkKkkKMSd
      dkKKKKKKKKKKKMSd
      dMMMMMMMMMMMMMSd
      .dddddddddddddd.
    `,
    125,
    90,
  );
  return finish(pic, "B", "u", "eUbdwkKMS");
}

// The four corners ------------------------------------------------------------------------------------

/** Smoke off a casting furnace: soft grey puffs swelling as they rise and lean east. Raw. */
function smoke(frame: number): string {
  const W = 34;
  const H = 70;
  const pic = Pic.blank(W, H);
  for (let k = 0; k < 11; k++) {
    const t = ((k * 6.4 + frame * 1.6) % 70) / 70;
    const y = H - 6 - t * (H - 14);
    const x = 9 + t * 15 + Math.sin(t * 5 + k) * 2;
    const r = 3 + t * 6;
    const isIn = lobes([{ x, y, rx: r, ry: r * 0.8 }]);
    for (let yy = 0; yy < H; yy++)
      for (let xx = 0; xx < W; xx++) {
        if (!isIn(xx, yy)) continue;
        const top = !isIn(xx, yy - 2);
        const thin = t > 0.6 && (xx + yy) % 2 === 1;
        if (thin) continue;
        pic.set(xx, yy, top ? "k" : yy > y + r * 0.3 ? "v" : "K");
      }
  }
  return smooth(pic).toString();
}

/** Soot and cinders trodden into the foundry's ground. Flat. */
function soot(v: number): string {
  const W = 40;
  const H = 22;
  const pic = Pic.blank(W, H);
  const isIn = lobes([
    { x: 20, y: 11, rx: 18, ry: 9 },
    { x: 10 + v * 6, y: 8, rx: 9, ry: 6 },
  ]);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!isIn(x, y)) continue;
      const edge = !isIn(x + 2, y) || !isIn(x - 2, y) || !isIn(x, y + 2) || !isIn(x, y - 2);
      if (edge && hash(x, y, v) < 0.5) continue;
      const r = hash(x, y, v + 4);
      if (r > 0.62) continue;
      pic.set(x, y, hash(x, y, v + 3) < 0.06 ? "R" : r < 0.25 ? "J" : "S");
    }
  return smooth(pic, "R").toString();
}

/** A heap of charcoal by the furnace. */
const CHARCOAL = `
  ....jjjj.....
  ..jjJJcJjj...
  .jJcJJJcJJj..
  jJJcJJcJJJJj.
  jjjjjjjjjjjjj
`;

/** A mould pit: a half-cast bronze figure standing in its clay, arms still in the mould. */
const MOLD = `
  .......GG.......
  ......GyyG......
  ......GYyG......
  .....QGyyGQ.....
  ....QrGyygGrQ...
  ...QrrGYyygGrQ..
  ...QrRGyyygGRQ..
  ...QrRGyyggGRQ..
  ..QQrRRGyggRRQQ.
  .QjjjjjjjjjjjjjQ
  QjJJJJJJJJJJJJJjQ
  .QjjjjjjjjjjjjQ.
  ..QQQQQQQQQQQQ..
`;

/** Water standing on sunken paving by the fountain house: a sheen that slides. Flat. */
function puddle(frame: number): string {
  const W = 34;
  const H = 14;
  const pic = Pic.blank(W, H);
  const isIn = lobes([
    { x: 17, y: 7, rx: 15, ry: 5 },
    { x: 9, y: 8, rx: 7, ry: 4 },
  ]);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!isIn(x, y)) continue;
      const sheen = (x - frame * 3 + y * 2 + 60) % 14 < 3;
      const rim = !isIn(x, y - 1) || !isIn(x, y + 1) || !isIn(x - 1, y) || !isIn(x + 1, y);
      pic.set(x, y, rim ? "P" : sheen ? "w" : (x + y) % 5 === 0 ? "s" : "n");
    }
  return smooth(pic).toString();
}

/** Moss greening the wet stones round the fountain house. Flat. */
const MOSS = `
  ..oo....ll..
  .oOOo..lool.
  oOOoo...oo..
  .oo...oo....
  .....oOOo...
  ......oo....
`;

/** A stone trough brimming, a jar by it. */
const TROUGH = `
  dddddddddddddddddddd....
  dwwwwwwwwwwwwwwwwwkd....
  dkdddddddddddddddkKd....
  dkdssssssssssssdkKd..QQ.
  dkdtttttttttttttdKd.QrrQ
  dkdddddddddddddddKd.QrRQ
  dKKKKKKKKKKKKKKKKMd.QRRQ
  dMMMMMMMMMMMMMMMMSd..QQ.
  dddddddddddddddddddd....
`;

/** A string of pennants between two poles on the windy terrace, streaming in three gusts. */
function pennants(frame: number): string {
  const W = 66;
  const H = 40;
  const pic = Pic.blank(W, H);
  for (const px of [2, W - 4])
    for (let y = 4; y < H - 1; y++) pic.set(px, y, "U").set(px + 1, y, "b");
  for (let x = 4; x < W - 4; x++)
    pic.set(x, 6 + Math.round(Math.sin(((x - 4) / (W - 9)) * Math.PI) * 5), "b");
  const colours = [
    ["h", "X"],
    ["Y", "g"],
    ["I", "a"],
    ["W", "k"],
  ] as const;
  for (let k = 0; k < 8; k++) {
    const x0 = 6 + k * 7;
    const top = 7 + Math.round(Math.sin(((x0 - 4) / (W - 9)) * Math.PI) * 5);
    const [c1, c2] = colours[k % 4] as readonly [string, string];
    for (let t = 0; t < 7; t++) {
      const sway = Math.round((t / 7) * ([3, 1, 2][frame] ?? 0));
      const half = Math.max(0, 2 - Math.floor(t / 3));
      for (let dx = -half; dx <= half; dx++) pic.set(x0 + dx + sway, top + t, dx < 0 ? c1 : c2);
    }
  }
  return smooth(pic, "b").toString();
}

/** Straw and dust combed into long streaks by the wind on the terrace. Flat. */
const STREAKS = `
  .....GG..........GGG.........
  GGGGG..GGGGG..GGG...GGGGG....
  ...........GGGG..........GGGG
  ..GGGG..........GGGGGG.......
`;

/** Stone dust and chips on the yard's ground, white and sharp. Flat. */
function stoneDust(v: number): string {
  const W = 44;
  const H = 22;
  const pic = Pic.blank(W, H);
  const isIn = lobes([
    { x: 22, y: 11, rx: 20, ry: 9 },
    { x: 12 + v * 8, y: 9, rx: 10, ry: 6 },
  ]);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!isIn(x, y)) continue;
      const edge = !isIn(x + 2, y) || !isIn(x - 2, y) || !isIn(x, y + 2) || !isIn(x, y - 2);
      if (edge && hash(x, y, v) < 0.6) continue;
      const r = hash(x, y, v + 9);
      pic.set(x, y, r < 0.08 ? "v" : r < 0.6 ? "w" : "k");
    }
  return smooth(pic).toString();
}

/** A lifting tripod over a block, its chain and hook. */
function tripod(): string {
  const W = 40;
  const H = 60;
  const pic = Pic.blank(W, H);
  timber(pic, 4, H - 2, 20, 4, 3);
  timber(pic, 36, H - 2, 20, 4, 3);
  timber(pic, 20, H - 6, 20, 4, 3);
  for (let y = 8; y < H - 18; y++) pic.set(21, y, y % 2 ? "S" : "M");
  pic.put(
    `
      .dddddddddddd.
      dwwwwkkkkkKKMd
      dkkkkkkkkKKMSd
      dKKKKKKKKKKMSd
      .dddddddddddd.
    `,
    13,
    H - 18,
  );
  return finish(pic, "B", "u", "eUbdwkKMSv");
}

const pad = (grid: string, w: number, h: number): string => {
  const p = Pic.of(grid);
  return Pic.blank(w, h)
    .put(p, Math.floor((w - p.w) / 2), h - p.h)
    .toString();
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

export default [
  sprite({
    name: "townhouse",
    size: [HW, HH],
    palette,
    lone: "SBl",
    frames: Object.fromEntries(Object.entries(HOUSES).map(([k, spec]) => [k, house(spec)])),
    anim: { idle: { frames: ["a"], fps: 1 } },
  }),
  sprite({
    name: "alley-washing",
    size: [56, 30],
    origin: [28, 29],
    palette,
    outline: false,
    frames: { gust0: alleyWashing(0), gust1: alleyWashing(1), gust2: alleyWashing(2) },
    anim: { gust: { frames: ["gust0", "gust1", "gust2"], fps: 3 } },
  }),
  sprite({
    name: "wall-ns",
    size: [16, 16],
    origin: [0, 0],
    palette,
    outline: false,
    frames: { a: wallNS(0), b: wallNS(1) },
    anim: { idle: { frames: ["a"], fps: 1 } },
  }),
  one("gate-tower", [36, 76], gateTower(), { shadow: oval(36, 76, 19, 74, 17, 2.5) }),
  sprite({
    name: "long-stall",
    size: [52, 40],
    palette,
    shadow: oval(52, 40, 26, 38, 24, 2.4),
    frames: { jars: longStall("jars"), cloth: longStall("cloth") },
    anim: { idle: { frames: ["jars"], fps: 1 } },
  }),
  one("fish-table", [44, 34], FISH_TABLE, { shadow: oval(44, 34, 22, 32, 20, 2) }),
  one("crates", [22, 10], finish(Pic.of(CRATES), "b", "U", "eUzZhH"), { outline: false }),
  one("amphora-pile", [40, 26], amphoraPile(), { shadow: oval(40, 26, 20, 25, 18, 2) }),
  sprite({
    name: "basin",
    size: [60, 46],
    palette,
    shadow: oval(60, 46, 31, 44, 28, 3),
    frames: { pour0: basin(0), pour1: basin(1), pour2: basin(2) },
    anim: { pour: { frames: ["pour0", "pour1", "pour2"], fps: 5 } },
  }),
  sprite({
    name: "string-awning",
    size: [98, 52],
    palette,
    frames: { sag0: stringAwning(0), sag1: stringAwning(1) },
    anim: { sag: { frames: ["sag0", "sag1"], fps: 1.5 } },
  }),
  one("fruit-spill", [17, 9], SPILL, { outline: false, lone: "zZhH" }),
  sprite({
    name: "paving-band",
    size: [16, 16],
    origin: [0, 0],
    palette,
    outline: false,
    frames: { h: band("h"), v: band("v") },
    anim: { idle: { frames: ["h"], fps: 1 } },
  }),
  sprite({
    name: "paving-ring",
    size: [104, 72],
    origin: [52, 36],
    palette,
    outline: false,
    frames: { still: ring() },
    anim: { idle: { frames: ["still"], fps: 1 } },
  }),
  sprite({
    name: "paving-worn",
    size: [16, 16],
    origin: [0, 0],
    palette,
    outline: false,
    frames: { h: pad(WORN.h, 16, 16), v: pad(WORN.v, 16, 16) },
    anim: { idle: { frames: ["h"], fps: 1 } },
  }),
  sprite({
    name: "stoa-wall",
    size: [16, 34],
    palette,
    outline: false,
    frames: { c1: stoaWall(1), c2: stoaWall(2), c3: stoaWall(3) },
    anim: { idle: { frames: ["c2"], fps: 1 } },
  }),
  one("drum-stack", [44, 26], DRUM_STACK, { shadow: oval(44, 26, 22, 25, 21, 2) }),
  one("ramp", [24, 6], finish(Pic.of(RAMP), "B", "u", "UeB"), { outline: false }),
  one("shelter", [60, 52], shelter(), { outline: false, shadow: oval(60, 52, 31, 50, 28, 2.6) }),
  one("crane-big", [CW, CH], bigCraneBase(), {
    outline: false,
    shadow: oval(CW, CH, 72, CH - 3, 60, 4),
  }),
  one("crane-big-top", [CW, CH], bigCraneTop(), { outline: false }),
  sprite({
    name: "smoke",
    size: [34, 70],
    origin: [9, 69],
    palette,
    lone: "kKv",
    outline: false,
    frames: Object.fromEntries([0, 1, 2, 3].map((f) => [`rise${f}`, smoke(f)])),
    anim: { rise: { frames: ["rise0", "rise1", "rise2", "rise3"], fps: 3, jump: 1 } },
  }),
  sprite({
    name: "soot",
    size: [40, 22],
    origin: [20, 11],
    palette,
    outline: false,
    lone: "R",
    frames: { a: soot(0), b: soot(1) },
    anim: { idle: { frames: ["a"], fps: 1 } },
  }),
  one("charcoal", [13, 5], CHARCOAL, { outline: false }),
  one("mold", [17, 13], finish(Pic.blank(17, 13).put(Pic.of(MOLD), 0, 0), "Q", "R", "GyYgjJr"), {
    outline: false,
  }),
  sprite({
    name: "puddle",
    size: [34, 14],
    origin: [17, 7],
    palette,
    outline: false,
    frames: { sheen0: puddle(0), sheen1: puddle(1), sheen2: puddle(2) },
    anim: { sheen: { frames: ["sheen0", "sheen1", "sheen2"], fps: 2 } },
  }),
  one("moss", [12, 6], MOSS, { outline: false }),
  one("trough", [24, 9], finish(Pic.of(TROUGH), "d", "k", "stQrR"), {
    shadow: oval(24, 9, 10, 8, 10, 1.4),
  }),
  sprite({
    name: "pennants",
    size: [66, 40],
    palette,
    outline: false,
    frames: { gust0: pennants(0), gust1: pennants(1), gust2: pennants(2) },
    anim: { gust: { frames: ["gust0", "gust1", "gust2"], fps: 4 } },
  }),
  one("wind-streaks", [29, 4], STREAKS, { outline: false }),
  sprite({
    name: "stone-dust",
    size: [44, 22],
    origin: [22, 11],
    palette,
    outline: false,
    frames: { a: stoneDust(0), b: stoneDust(1) },
    anim: { idle: { frames: ["a"], fps: 1 } },
  }),
  one("tripod", [40, 60], tripod(), { outline: false, shadow: oval(40, 60, 20, 58, 17, 2) }),
];
