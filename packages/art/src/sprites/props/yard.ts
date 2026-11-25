import { type Legend, sprite } from "../../format.ts";
import { type Lobe, lobes, Pic, seal, shade, smooth, texture, tidy } from "../../paint.ts";

/**
 * The yard's furniture and planting: the flag in front of 가설관, the bench ring around the
 * 해솔, a zelkova, boxwood hedges, bikes nobody has ridden since spring, recycling bins, picnic
 * tables by the 급식실, the sealed hatch with a dead flashlight beside it, the covered walk to
 * the dorm, and drifting motes and needles for the air. Lit from the top left.
 */
const palette: Legend = {
  ".": null,
  // steel and dark
  J: "ink.deep",
  j: "ink.dark",
  I: "ink.mid",
  i: "ink.light",
  // concrete
  d: "stone.deep",
  S: "stone.dark",
  M: "stone.mid",
  K: "stone.light",
  k: "stone.pale",
  w: "stone.bright",
  // wood
  B: "wood.deep",
  b: "wood.dark",
  U: "wood.mid",
  u: "wood.light",
  W: "wood.pale",
  // leaves
  F: "grass.deep",
  D: "grass.dark",
  G: "grass.mid",
  g: "grass.light",
  h: "grass.pale",
  // school green, flags, bins
  o: "board.deep",
  O: "board.dark",
  m: "board.mid",
  l: "board.light",
  // red, rust
  Q: "red.deep",
  q: "red.dark",
  R: "red.mid",
  r: "red.light",
  c: "clay.mid",
  C: "clay.light",
  // blue, gold
  Z: "navy.dark",
  N: "navy.mid",
  n: "navy.light",
  y: "gold.light",
  Y: "gold.pale",
  t: "gold.mid",
  T: "gold.dark",
  // wisteria
  v: "plum.light",
  V: "plum.mid",
  // specks
  "*": "gold.pale",
  "+": "stone.bright",
  ",": "board.dark",
  "'": "board.mid",
};

/** A one-frame sprite. Stray single pixels fold into their neighbours, `lone` excepted. */
const still = (
  name: string,
  size: [number, number],
  grid: string,
  extra: Partial<Parameters<typeof sprite>[0]> = {},
) =>
  sprite({
    name,
    size,
    palette,
    frames: { still: smooth(Pic.of(grid), extra.lone ?? "").toString() },
    anim: { idle: { frames: ["still"], fps: 1 } },
    ...extra,
  });

function oval(w: number, h: number, cx: number, cy: number, rx: number, ry: number): string {
  const pic = Pic.blank(w, h);
  const isIn = lobes([{ x: cx, y: cy, rx, ry }]);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (isIn(x, y)) pic.set(x, y, "J");
  return pic.toString();
}

// The flag --------------------------------------------------------------------------------------

/** The school flag: green, a white wave across it, snapping in the sea wind. */
function flagFrame(phase: number): string {
  const W = 28;
  const H = 92;
  const pic = Pic.blank(W, H);
  // Pole, a gilt ball, a cleat and a stone base.
  for (let y = 3; y < H - 4; y++) pic.set(1, y, "J").set(2, y, "i").set(3, y, "J");
  pic.put(".JJ.\nJyYJ\nJtyJ\n.JJ.", 0, 0);
  pic.put("JJ\nIJ", 3, 60);
  pic.put("JJJJJJ\nJkkkKd\nddddddd", 0, H - 4);
  // The cloth: 22 wide, 14 tall, rippling as a sine travelling outward.
  const top = 6;
  for (let x = 0; x < 22; x++) {
    const wave = Math.round(
      Math.sin((x / 22) * Math.PI * 2 - phase * (Math.PI / 2)) * (1 + x / 14),
    );
    for (let y = 0; y < 14; y++) {
      const px = 4 + x;
      const py = top + y + wave;
      const edge = y === 0 || y === 13 || x === 21;
      const band = y >= 6 && y <= 8 && (x + Math.floor(wave)) % 9 !== 0;
      const light = Math.sin((x / 22) * Math.PI * 2 - phase * (Math.PI / 2) + 0.9) > 0.35;
      pic.set(px, py, edge ? "o" : band ? (light ? "+" : "k") : light ? "l" : "m");
    }
  }
  return smooth(pic, "Jyo+").toString();
}

// The 해솔's bench ring --------------------------------------------------------------------------

/**
 * A round brick planter around the 해솔 with a slatted wooden seat on its rim, where everybody
 * waits for everybody. Two frames: the back half (behind the trunk) and the front half.
 */
function ringPart(part: "back" | "front"): string {
  const W = 72;
  const H = 40;
  const cx = 36;
  const cy = 18;
  const pic = Pic.blank(W, H);
  const outer = (x: number, y: number) =>
    ((x + 0.5 - cx) / 34) ** 2 + ((y + 0.5 - cy) / 14) ** 2 <= 1;
  const inner = (x: number, y: number) =>
    ((x + 0.5 - cx) / 26) ** 2 + ((y + 0.5 - cy) / 9) ** 2 <= 1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const front = y >= cy;
      if ((part === "front") !== front) continue;
      if (inner(x, y)) {
        pic.set(x, y, (x * 3 + y * 5) % 7 === 0 ? "U" : "b");
        continue;
      }
      // The wall's face below the rim, front half only.
      const rim = outer(x, y);
      const face = !rim && front && outer(x, y - 6);
      if (!rim && !face) continue;
      if (face) {
        const course = (y - Math.floor(cy)) % 3 === 0;
        pic.set(x, y, course ? "C" : x < cx - 20 ? "C" : x > cx + 22 ? "q" : "c");
        continue;
      }
      // The seat: planks around the rim, lit on the far side.
      const slat = Math.floor(Math.atan2(y - cy, (x - cx) / 2.4) * 6) % 2 === 0;
      pic.set(x, y, slat ? (y < cy ? "W" : "u") : y < cy ? "u" : "U");
    }
  }
  const sealed = seal(pic, part === "back" ? "B" : "Q", "bU");
  return smooth(sealed, "BQ").toString();
}

// The zelkova -------------------------------------------------------------------------------------

const ZW = 80;
const ZH = 96;
const Z_ORIGIN = [40, 94] as const;

function zelkovaTrunk(): string {
  const pic = Pic.blank(ZW, ZH);
  for (let y = 40; y < ZH - 1; y++) {
    const k = (94 - y) / 54;
    const hw = 3.6 - 1.4 * k + (y > 89 ? (y - 89) * 1.2 : 0);
    const cx = 40 + Math.sin(k * 2.2) * 2;
    for (let x = Math.round(cx - hw); x <= Math.round(cx + hw); x++) {
      const edge = x === Math.round(cx - hw) || x === Math.round(cx + hw);
      pic.set(x, y, edge ? "B" : x < cx - hw + 2 ? "u" : x > cx + hw - 2 ? "b" : "U");
    }
  }
  // Two limbs forking into the crown.
  for (let t = 0; t < 18; t++) {
    pic.set(40 - Math.round(t * 0.9), 44 - t, "U").set(41 - Math.round(t * 0.9), 44 - t, "b");
    pic.set(41 + Math.round(t * 0.8), 46 - t, "U").set(42 + Math.round(t * 0.8), 46 - t, "b");
  }
  return tidy(seal(pic, "B"), "U", "B").toString();
}

const ZELKOVA: readonly (readonly Lobe[])[] = [
  [
    { x: 22, y: 34, rx: 15, ry: 11 },
    { x: 33, y: 26, rx: 13, ry: 10 },
  ],
  [
    { x: 56, y: 32, rx: 16, ry: 11 },
    { x: 46, y: 22, rx: 13, ry: 10 },
  ],
  [
    { x: 40, y: 16, rx: 16, ry: 11 },
    { x: 30, y: 12, rx: 10, ry: 8 },
    { x: 52, y: 14, rx: 10, ry: 8 },
  ],
  [
    { x: 38, y: 40, rx: 18, ry: 9 },
    { x: 24, y: 44, rx: 10, ry: 6 },
    { x: 54, y: 43, rx: 11, ry: 6 },
  ],
];

const leafMarks = [
  [
    [3, 3, Pic.of("hg\ngh")],
    [10, 8, Pic.of("D.\n.D")],
    [6, 12, Pic.of("gg")],
  ],
  [
    [9, 2, Pic.of("gh\n.g")],
    [2, 9, Pic.of("D.\nDD")],
  ],
] as const;

function zelkovaCrown(shift: readonly number[]): string {
  const pic = Pic.blank(ZW, ZH);
  ZELKOVA.forEach((pad, i) => {
    const moved = pad.map((l) => ({ ...l, x: l.x + (shift[i] ?? 0) }));
    const shaded = shade(ZW, ZH, lobes(moved), {
      outline: "F",
      dark: "D",
      mid: "G",
      light: "g",
      glint: "h",
    });
    texture(shaded, leafMarks as never, "G", (cx, cy) => cx + cy + i);
    pic.put(tidy(shaded, "G", "F"), 0, 0);
  });
  return tidy(tidy(seal(pic, "F"), "G", "F"), "G", "F").toString();
}

// Hedges ----------------------------------------------------------------------------------------

/**
 * Clipped boxwood in 16-pixel pieces that join: a flat top in the sun, a leafy front face in
 * its own shade, dark at the foot. `l` and `r` round the ends.
 */
function hedge(part: "run" | "l" | "r"): string {
  const W = 16;
  const H = 22;
  const TOP = 8;
  const pic = Pic.blank(W, H);
  const cut = (x: number, y: number): boolean => {
    const r = 3;
    if (part === "l" && x < r) {
      const cy = y < TOP ? r : H - 1 - r;
      if ((y < r || y > H - 1 - r) && (x - r) ** 2 + (y - cy) ** 2 > r * r) return true;
    }
    if (part === "r" && x > W - 1 - r) {
      const cy = y < TOP ? r : H - 1 - r;
      if ((y < r || y > H - 1 - r) && (x - (W - 1 - r)) ** 2 + (y - cy) ** 2 > r * r) return true;
    }
    return false;
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (cut(x, y)) continue;
      let ch: string;
      if (y === 0) ch = "F";
      else if (y < TOP) ch = y === 1 ? "h" : (x * 3 + y * 5) % 9 === 0 ? "h" : "g";
      else if (y === TOP) ch = "D";
      else if (y >= H - 2) ch = y === H - 1 ? "F" : "D";
      else ch = (x * 5 + y * 7) % 11 < 2 ? "D" : (x * 7 + y * 3) % 13 === 0 ? "g" : "G";
      pic.set(x, y, ch);
    }
  }
  const out = seal(pic, "F", "hgGD");
  if (part !== "l")
    for (let y = 1; y < H - 1; y++) if (out.at(0, y) === "F") out.set(0, y, y < TOP ? "g" : "G");
  if (part !== "r")
    for (let y = 1; y < H - 1; y++)
      if (out.at(W - 1, y) === "F") out.set(W - 1, y, y < TOP ? "g" : "G");
  return smooth(out, "F").toString();
}

/**
 * A trodden line across the lawn: where students cut the corner to the 급식실 the grass has worn
 * to bare earth. Pieces lean from top left to bottom right; chained, flipped for the other way.
 */
function trodden(v: number): string {
  const W = 20;
  const H = 12;
  const pic = Pic.blank(W, H);
  const isIn = lobes([
    { x: 6 + (v % 2), y: 4, rx: 6.5, ry: 2.6 },
    { x: 13 - (v % 3), y: 7.5, rx: 6, ry: 2.4 },
  ]);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!isIn(x, y)) continue;
      const edge = !isIn(x, y - 1) || !isIn(x, y + 1) || !isIn(x - 1, y) || !isIn(x + 1, y);
      pic.set(
        x,
        y,
        edge ? ((x + y + v) % 3 === 0 ? "G" : "u") : (x * 3 + y + v) % 7 === 0 ? "U" : "W",
      );
    }
  }
  return smooth(pic, "").toString();
}

/**
 * 등나무 쉼터: a timber pergola grown over with wisteria, flowers hanging through the slats,
 * benches in its shade. The canopy is drawn overhead, the posts stand on their own.
 */
function pergola(): string {
  const W = 72;
  const H = 40;
  const pic = Pic.blank(W, H);
  // Beams along the front and back, rafters across.
  for (let x = 2; x < W - 2; x++) {
    for (const y of [6, 30])
      pic
        .set(x, y, "B")
        .set(x, y + 1, "u")
        .set(x, y + 2, "U")
        .set(x, y + 3, "B");
  }
  for (let x = 4; x < W - 4; x += 8)
    for (let y = 4; y < 36; y++)
      pic
        .set(x, y, "B")
        .set(x + 1, y, "u")
        .set(x + 2, y, "B");
  // Wisteria: leaf masses over the timber, flower tresses hanging below them.
  const leaves = lobes([
    { x: 14, y: 12, rx: 13, ry: 8 },
    { x: 32, y: 10, rx: 14, ry: 8 },
    { x: 52, y: 13, rx: 14, ry: 9 },
    { x: 24, y: 24, rx: 12, ry: 7 },
    { x: 46, y: 25, rx: 13, ry: 7 },
    { x: 62, y: 22, rx: 8, ry: 6 },
  ]);
  const shaded = shade(W, H, leaves, { outline: "F", dark: "D", mid: "G", light: "g", glint: "h" });
  texture(shaded, leafMarks as never, "G", (cx, cy) => cx * 2 + cy);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (shaded.at(x, y) !== ".") pic.set(x, y, shaded.at(x, y) as string);
  for (const [x, y, n] of [
    [10, 17, 5],
    [19, 15, 6],
    [28, 16, 4],
    [37, 15, 6],
    [47, 19, 5],
    [56, 19, 6],
    [64, 25, 4],
    [17, 29, 5],
    [31, 29, 6],
    [42, 30, 5],
    [52, 30, 4],
  ] as const) {
    for (let k = 0; k < n; k++) {
      const c = k === 0 ? "+" : k % 2 ? "v" : "V";
      pic.set(x, y + k, c).set(x + 1, y + k, k < n - 1 ? "V" : c);
    }
  }
  return smooth(pic, "BF").toString();
}

// Bikes -----------------------------------------------------------------------------------------

/** A rack of three bikes: hoops of steel, wheels, one with a basket, one fallen against another. */
const BIKES = (() => {
  const W = 52;
  const H = 22;
  const pic = Pic.blank(W, H);
  const wheel = (cx: number, cy: number) => {
    for (let a = 0; a < 24; a++) {
      const x = Math.round(cx + Math.cos((a / 24) * Math.PI * 2) * 4.5);
      const y = Math.round(cy + Math.sin((a / 24) * Math.PI * 2) * 4.5);
      pic.set(x, y, "J");
    }
    pic.set(Math.round(cx), Math.round(cy), "i");
  };
  const frame = (x0: number, colour: string) => {
    wheel(x0 + 4, 15);
    wheel(x0 + 15, 15);
    for (let t = 0; t <= 10; t++) pic.set(x0 + 4 + t, 15 - Math.round(t * 0.5), colour);
    for (let t = 0; t <= 6; t++) pic.set(x0 + 9 + t, 10 + Math.round(t * 0.8), colour);
    pic
      .set(x0 + 9, 9, "J")
      .set(x0 + 8, 9, "J")
      .set(x0 + 14, 8, "J")
      .set(x0 + 15, 8, "J");
  };
  // The rack: three hoops.
  for (const x of [6, 22, 38]) {
    for (let y = 8; y < H - 1; y++) pic.set(x, y, "i").set(x + 8, y, "i");
    for (let k = 0; k <= 8; k++) pic.set(x + k, 7, "i");
  }
  frame(1, "R");
  frame(17, "N");
  frame(34, "l");
  pic.put("JJJJ\nJkkJ\nJJJJ", 38, 7);
  return smooth(pic, "Jil").toString();
})();

// Bins, tables, small things ------------------------------------------------------------------------

/** 분리수거함: three lidded bins, blue for paper, yellow for cans, green for plastic. */
const BINS = `
  .JJJJJJJJJ.JJJJJJJJJ.JJJJJJJJJJ.
  JnnnnnnnnNJyyyyyyyytJlllllllllmJ
  JNNNNNNNNZJttttttttTJmmmmmmmmmOJ
  JJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJ
  JNnNNNNNNZJtytttttTTJmlmmmmmmOOJ
  JNnNJJJNNZJtytJJJttTJmlmJJJmmOOJ
  JNnNNNNNNZJtytttttTTJmlmmmmmmOOJ
  JNnNNNNNNZJtytttttTTJmlmmmmmmOOJ
  JNnNNNNNNZJtytttttTTJmlmmmmmmOOJ
  JNnNNNNNNZJtytttttTTJmlmmmmmmOOJ
  JNNNNNNNNZJttttttttTJmmmmmmmmOOJ
  JZZZZZZZZZJTTTTTTTTTJOOOOOOOOOOJ
  JJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJ
`;

/** A picnic table by the 급식실: planks, benches either side, legs splayed. */
const PICNIC = `
  ...BBBBBBBBBBBBBBBBBBBBBBBB...
  ...BWWWWWWWWWWWWWWWWWWWWWWB...
  ...BuuuuuuuuuuuuuuuuuuuuuuB...
  ...BBBBBBBBBBBBBBBBBBBBBBBB...
  BBBBBBBBBBBBBBBBBBBBBBBBBBBBBB
  BWWWWWWWWWWWWWWWWWWWWWWWWWWWWB
  BuuuuuuuuuuuuuuuuuuuuuuuuuuuuB
  BUUUUUUUUUUUUUUUUUUUUUUUUUUUUB
  BBBBBBBBBBBBBBBBBBBBBBBBBBBBBB
  BWWWWWWWWWWWWWWWWWWWWWWWWWWWWB
  BuuuuuuuuuuuuuuuuuuuuuuuuuuuuB
  BUUUUUUUUUUUUUUUUUUUUUUUUUUUUB
  BBBBBBBBBBBBBBBBBBBBBBBBBBBBBB
  ..BUB....................BUB..
  ..BUB....................BUB..
  ..BBB....................BBB..
`;

/** A striped parasol over a picnic table, its pole at the table's middle. */
function parasol(): string {
  const W = 44;
  const H = 34;
  const pic = Pic.blank(W, H);
  const isIn = lobes([{ x: 22, y: 9, rx: 21, ry: 8 }]);
  for (let y = 0; y < 14; y++) {
    for (let x = 0; x < W; x++) {
      if (!isIn(x, y) || y > 12) continue;
      const stripe = Math.floor(Math.atan2(y - 3, x - 22) * 5) % 2 === 0;
      const lit = x < 20 && y < 8;
      pic.set(x, y, stripe ? (lit ? "+" : "k") : lit ? "r" : "R");
    }
  }
  for (let x = 2; x < W - 2; x++) if (pic.at(x, 12) !== ".") pic.set(x, 12, "q");
  for (let y = 12; y < H; y++) pic.set(21, y, "J").set(22, y, "i");
  return seal(smooth(pic, "J"), "Q", "Ji").toString();
}

/** 청소 당번 left their bucket and mop by the door. */
const MOP = `
  ......JJ...
  .....JiJ...
  .....JiJ...
  ....JiJ....
  ....JiJ....
  ...JiJ.....
  ...JiJ.....
  ..JiJ......
  ..JiJ......
  .JJJJJJJJ..
  JkkkkkkkKJ.
  JNNNNNNNZJ.
  .JNNNNNZJ..
  .JnNNNNZJ..
  .JNNNNNZJ..
  .JJJJJJJJ..
`;

/**
 * The sealed hatch to the tunnel under the 급식실: a rusted steel plate, a new padlock on an old
 * hasp. Ground detail.
 */
const HATCH = `
  JJJJJJJJJJJJJJJJJJJJJJ
  JiiiiiiiiiiiiiiiiiiiIJ
  JiIIcIIIIIIIIIIIcIIIjJ
  JiIccIIIIIIIIIIIIIIIjJ
  JiIIIIIIIIIIIIIIIIIIjJ
  JiIIIIIIIIJJJJIIIIcIjJ
  JiIIIIIIIJyyyJIIIccIjJ
  JiIIcIIIIJytTJIIIIIIjJ
  JiIccIIIIJTTTJIIIIIIjJ
  JiIIIIIIIIJJJIIIIIIIjJ
  JijjjjjjjjjjjjjjjjjjjJ
  JJJJJJJJJJJJJJJJJJJJJJ
`;

/** A flashlight on the ground, its lens cracked, dead for years. */
const FLASHLIGHT = `
  .JJJJJJJJ.
  JKiiiiiiyJ
  JIIIIIIIkJ
  .JJJJJJJJ.
`;

/** 교내 게시판: a glass-fronted notice case on two legs, papers inside nobody can read from here. */
const NOTICE = (() => {
  const pic = Pic.of(`
    JJJJJJJJJJJJJJJJJJJJJJJJJJJJ
    JiiiiiiiiiiiiiiiiiiiiiiiiiiJ
    JiJJJJJJJJJJJJJJJJJJJJJJJJIJ
    JiJmmmmmmmmmmmmmmmmmmmmmmJIJ
    JiJmmmmmmmmmmmmmmmmmmmmmmJIJ
    JiJmmmmmmmmmmmmmmmmmmmmmmJIJ
    JiJmmmmmmmmmmmmmmmmmmmmmmJIJ
    JiJmmmmmmmmmmmmmmmmmmmmmmJIJ
    JiJmmmmmmmmmmmmmmmmmmmmmmJIJ
    JiJmmmmmmmmmmmmmmmmmmmmmmJIJ
    JiJmmmmmmmmmmmmmmmmmmmmmmJIJ
    JiJmmmmmmmmmmmmmmmmmmmmmmJIJ
    JiJmmmmmmmmmmmmmmmmmmmmmmJIJ
    JiJmmmmmmmmmmmmmmmmmmmmmmJIJ
    JiJJJJJJJJJJJJJJJJJJJJJJJJIJ
    JIIIIIIIIIIIIIIIIIIIIIIIIIIJ
    JJJJJJJJJJJJJJJJJJJJJJJJJJJJ
    ...JiJ...............JiJ....
    ...JiJ...............JiJ....
    ...JiJ...............JiJ....
    ...JiJ...............JiJ....
    ...JJJ...............JJJ....
  `);
  // Notices: white sheets with grey lines, one red-headed, one yellow sticky.
  pic.put("++++++\n+kkkk+\n++++++\n+kkk++\n++++++\n+kkkk+\n++++++", 4, 4);
  pic.put("rrrrr\n+++++\n+kk++\n+++++\n+kkk+\n+++++", 12, 5);
  pic.put("yyyy\nyTTy\nyyyy", 19, 4);
  pic.put("+++++\n+kk++\n+++++\n+kkk+\n+++++", 18, 8);
  return pic.toString();
})();

/** A coin binocular on a post at the lookout, pointed at the city. */
const BINOCULAR = `
  .JJJJJJJJ.
  JnnJJJJnnJ
  JNvJiiJNvJ
  JJJJiIJJJJ
  ...JiIJ...
  ...JIIJ...
  ...JiIJ...
  ...JiIJ...
  ...JiIJ...
  ...JiIJ...
  ...JiIJ...
  ...JiIJ...
  ...JiIJ...
  ..JJiIJJ..
  .JiiiIIIJ.
  .JJJJJJJJ.
`;

/** A potted shrub by a door. */
const POT = `
  ...FFFF...
  .FFggGFF..
  FggGhgGDF.
  FgGgGGDDF.
  .FDGGDDF..
  ..FFFFF...
  .QQQQQQQ..
  .QCCcccQ..
  .QCccccQ..
  ..QCccQ...
  ..QQQQQ...
`;

/** The 급식실's menu stand: a chalk board on an easel, today's lines scrawled and smudged. */
const MENU = `
  .BBBBBBBBBBBB.
  BUUUUUUUUUUUUB
  BUOOOOOOOOOOUB
  BUO++O+++OOOUB
  BUOOOOOOOOOOUB
  BUO+++O++OOOUB
  BUOOOOOOOOOOUB
  BUO++++OO+OOUB
  BUOOOOOOOOOOUB
  BUOyyOOOOOOOUB
  BUOOOOOOOOOOUB
  BUUUUUUUUUUUUB
  BBBBBBBBBBBBBB
  .BU........UB.
  .BU........UB.
  BBU........UBB
`;

// The covered walk to the dorm ---------------------------------------------------------------

/**
 * The covered walk to 새벽관, seen from above: a ribbed polycarbonate roof between two steel
 * edge beams, one piece per tile, running north and south.
 */
const WALKWAY = (() => {
  const rows: string[] = [];
  for (let y = 0; y < 16; y++) {
    let row = "JiI";
    for (let x = 0; x < 26; x++)
      row += x % 5 === 0 ? "K" : x % 5 === 1 ? "+" : x % 5 === 4 ? "M" : "k";
    row += "SIJ";
    rows.push(y === 7 ? `JiI${"K".repeat(26)}SIJ` : row);
  }
  return rows.join("\n");
})();
const WALKWAY_POST = `
  JJJ
  JiJ
  JiJ
  JiJ
  JiJ
  JiJ
  JiJ
  JiJ
  JiJ
  JiJ
  JiJ
  JiJ
  JiJ
  JiJ
  JiJ
  JiJ
  JiJ
  JiJ
  JiJ
  JiJ
  JiJ
  JiJ
  JiJ
  JiJ
  JIJ
  JJJ
`;

// Air ----------------------------------------------------------------------------------------

/** A mote of dust in the low sun, turning bright and dim. */
const MOTE = ["*.\n..", "+.\n..", "*.\n.*", ".+\n.."];
/** A single pine needle, turning as it falls. */
const NEEDLE = [",.\n.'", ".,\n'.", ",'\n..", "'.\n.,"];

export default [
  sprite({
    name: "flagpole",
    size: [28, 92],
    origin: [2, 91],
    palette,
    lone: "y",
    outline: false,
    frames: { wave0: flagFrame(0), wave1: flagFrame(1), wave2: flagFrame(2), wave3: flagFrame(3) },
    anim: { wave: { frames: ["wave0", "wave1", "wave2", "wave3"], fps: 6 } },
    shadow: oval(28, 92, 3, 89, 4, 1.6),
  }),
  sprite({
    name: "ring-bench",
    size: [72, 40],
    origin: [36, 31],
    palette,
    outline: false,
    frames: { back: ringPart("back"), front: ringPart("front") },
    anim: { idle: { frames: ["front"], fps: 1 } },
  }),
  sprite({
    name: "zelkova",
    size: [ZW, ZH],
    origin: Z_ORIGIN,
    palette,
    shadow: oval(ZW, ZH, 41, 93, 12, 2.6),
    frames: { base: zelkovaTrunk() },
    anim: { idle: { frames: ["base"], fps: 1 } },
  }),
  sprite({
    name: "zelkova-crown",
    size: [ZW, ZH],
    origin: Z_ORIGIN,
    palette,
    frames: {
      sway0: zelkovaCrown([0, 0, 0, 0]),
      sway1: zelkovaCrown([1, 0, 1, 0]),
      sway2: zelkovaCrown([1, 1, 1, 0]),
    },
    anim: { sway: { frames: ["sway0", "sway1", "sway2", "sway1"], fps: 2 } },
  }),
  sprite({
    name: "hedge",
    size: [16, 22],
    origin: [0, 21],
    palette,
    outline: false,
    frames: { run: hedge("run"), l: hedge("l"), r: hedge("r") },
    anim: { idle: { frames: ["run"], fps: 1 } },
  }),
  still("bikes", [52, 22], BIKES, { outline: false, shadow: oval(52, 22, 26, 20, 25, 2) }),
  still("bins", [32, 13], BINS, { outline: false, shadow: oval(32, 13, 16, 12, 16, 1.6) }),
  still("picnic", [30, 16], PICNIC, { outline: false, shadow: oval(30, 16, 15, 14, 15, 2.4) }),
  still("parasol", [44, 34], parasol(), { origin: [22, 33], outline: false }),
  still("mop", [11, 16], MOP, { outline: false }),
  still("hatch", [22, 12], HATCH, { origin: [0, 0], outline: false }),
  still("flashlight", [10, 4], FLASHLIGHT, { origin: [0, 0], outline: false }),
  still("notice-case", [28, 22], NOTICE, {
    outline: false,
    lone: "+ry",
    shadow: oval(28, 22, 14, 21, 12, 1.4),
  }),
  still("binocular", [10, 16], BINOCULAR, { outline: false, shadow: oval(10, 16, 5, 15, 4, 1.2) }),
  still("pot", [10, 11], POT, { outline: false, shadow: oval(10, 11, 5, 10, 4, 1.2) }),
  still("menu-stand", [14, 16], MENU, { outline: false, lone: "+y" }),
  sprite({
    name: "walkway",
    size: [32, 16],
    origin: [0, 15],
    palette,
    lone: "+",
    outline: false,
    frames: { run: WALKWAY },
    anim: { idle: { frames: ["run"], fps: 1 } },
  }),
  still("walkway-post", [3, 26], WALKWAY_POST, { outline: false }),
  sprite({
    name: "trodden",
    size: [20, 12],
    origin: [0, 0],
    palette,
    outline: false,
    frames: { t0: trodden(0), t1: trodden(1), t2: trodden(2), t3: trodden(3) },
    anim: { idle: { frames: ["t0"], fps: 1 } },
  }),
  still("pergola", [72, 40], pergola(), { origin: [36, 39], outline: false, lone: "+" }),
  still(
    "pergola-post",
    [4, 34],
    Array.from({ length: 34 }, (_, y) => (y === 33 ? "BBBB" : "BuUB")).join("\n"),
    { outline: false },
  ),
  sprite({
    name: "mote",
    size: [2, 2],
    origin: [0, 0],
    palette,
    lone: "*+",
    outline: false,
    frames: Object.fromEntries(MOTE.map((g, i) => [`f${i}`, g])),
    anim: { drift: { frames: MOTE.map((_, i) => `f${i}`), fps: 3, jump: 1 } },
  }),
  sprite({
    name: "needle",
    size: [2, 2],
    origin: [0, 0],
    palette,
    lone: ",'",
    outline: false,
    frames: Object.fromEntries(NEEDLE.map((g, i) => [`f${i}`, g])),
    anim: { fall: { frames: NEEDLE.map((_, i) => `f${i}`), fps: 6, jump: 1 } },
  }),
];
