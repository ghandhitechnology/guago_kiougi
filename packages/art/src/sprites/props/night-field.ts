import { type Legend, sprite } from "../../format.ts";
import { lobes, Pic, smooth } from "../../paint.ts";

/**
 * The 운동장 side of campus: the concrete stands and the 조회대 where the principal speaks on
 * Monday mornings, floodlights (one still sputtering after the power went at 23:40), goals, the
 * basketball court nobody uses, the old iron gate to the 생태공원, a buoy blinking out on the
 * water, and what was left on the field: a gym bag, a bottle, one sneaker by the tear.
 */
const palette: Legend = {
  ".": null,
  d: "stone.deep",
  S: "stone.dark",
  M: "stone.mid",
  K: "stone.light",
  k: "stone.pale",
  w: "stone.bright",
  J: "ink.deep",
  j: "ink.dark",
  I: "ink.mid",
  i: "ink.light",
  Y: "gold.pale",
  y: "gold.light",
  t: "gold.mid",
  R: "red.mid",
  r: "red.light",
  Q: "red.deep",
  q: "red.dark",
  C: "clay.light",
  c: "clay.mid",
  N: "navy.mid",
  n: "navy.light",
  v: "navy.dark",
  F: "grass.deep",
  D: "grass.dark",
  G: "grass.mid",
  g: "grass.light",
  e: "sea.light",
  E: "sea.mid",
  p: "rose.pale",
  P: "rose.light",
  o: "wood.dark",
  O: "wood.mid",
  "+": "stone.bright",
};

/** A one-frame sprite; stray single pixels fold into their neighbours, `lone` excepted. */
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

// Stands -----------------------------------------------------------------------------------------

/**
 * 스탠드: four concrete terraces stepping down to the field, a back wall behind them. Pieces
 * join edge to edge; `l` and `r` close the ends with the stepped side wall.
 */
function stands(part: "l" | "m" | "r"): string {
  const W = 16;
  const H = 64;
  const pic = Pic.blank(W, H);
  const STEP = 12;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let ch: string;
      if (y < 4) ch = y === 0 ? "d" : y === 1 ? "w" : y === 2 ? "k" : "M";
      else if (y < 10) ch = y === 9 ? "S" : "K";
      else {
        const r = (y - 10) % STEP;
        const last = y >= 10 + 4 * STEP;
        ch = last
          ? y === H - 1
            ? "d"
            : "S"
          : r === 0
            ? "w"
            : r < 6
              ? "k"
              : r === 6
                ? "K"
                : r < 11
                  ? "M"
                  : "S";
        if (!last && r > 6 && r < 11 && (x === 3 || x === 11)) ch = "S";
      }
      pic.set(x, y, ch);
    }
  }
  // The end walls step down with the terraces.
  if (part !== "m") {
    for (let y = 0; y < H; y++) {
      const tread = Math.max(0, Math.floor((y - 10) / STEP));
      const wall = Math.min(3, 1 + tread);
      for (let k = 0; k < wall; k++) {
        const x = part === "l" ? k : W - 1 - k;
        pic.set(x, y, k === 0 ? "d" : part === "l" ? "w" : "S");
      }
    }
  }
  return pic.toString();
}

/**
 * 조회대: the raised stage at the middle of the stands where Monday assembly happens. Its steps
 * at the sides, a plate on its face, and the microphone stand knocked flat on top.
 */
const PODIUM = (() => {
  const W = 64;
  const H = 40;
  const pic = Pic.blank(W, H);
  for (let y = 8; y < H; y++) {
    for (let x = 6; x < W - 6; x++) {
      let ch =
        y === 8
          ? "d"
          : y === 9
            ? "w"
            : y < 20
              ? "k"
              : y === 20
                ? "w"
                : y < H - 2
                  ? "K"
                  : y === H - 2
                    ? "M"
                    : "d";
      if (x === 6 || x === W - 7) ch = "d";
      else if (x === 7 && y > 9) ch = "w";
      else if (x === W - 8 && y > 9) ch = "M";
      pic.set(x, y, ch);
    }
  }
  // Side steps.
  for (const [x0, dir] of [
    [0, 1],
    [W - 6, -1],
  ] as const) {
    for (let s = 0; s < 3; s++) {
      const top = 24 + s * 5;
      for (let y = top; y < H; y++) {
        for (let k = 0; k < 6 - s * 2; k++) {
          const x = dir === 1 ? x0 + s * 2 + k : x0 + 5 - s * 2 - k;
          pic.set(x, y, y === top ? "w" : y === top + 1 ? "k" : y === H - 1 ? "d" : "M");
        }
      }
    }
  }
  // The plate, unreadable, and the fallen microphone stand.
  for (let y = 26; y < 32; y++)
    for (let x = 24; x < 40; x++)
      pic.set(x, y, y === 26 || y === 31 || x === 24 || x === 39 ? "o" : y % 2 ? "t" : "y");
  for (let x = 18; x < 44; x++) pic.set(x, 14 + Math.round((x - 18) * 0.12), "J");
  pic.put("JJJ\nJiJ\nJJJ", 42, 15);
  pic.put("JJJJJ\nJIIIJ", 15, 13);
  return smooth(pic, "dJw").toString();
})();

// Floodlight ---------------------------------------------------------------------------------------

/** A floodlight mast: a bank of six lamps on a steel pole. `lit` is the lamp glass. */
function floodlight(lit: "off" | "on" | "dim"): string {
  const W = 22;
  const H = 120;
  const pic = Pic.blank(W, H);
  for (let y = 18; y < H - 2; y++) pic.set(10, y, "J").set(11, y, "i").set(12, y, "J");
  for (let x = 6; x < 17; x++) pic.set(x, H - 2, "J").set(x, H - 1, "J");
  pic.set(9, H - 3, "J").set(13, H - 3, "J");
  // Lamp bank.
  const glass = lit === "on" ? ["Y", "Y"] : lit === "dim" ? ["y", "t"] : ["j", "I"];
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 3; c++) {
      const x0 = 1 + c * 7;
      const y0 = 2 + r * 7;
      for (let y = 0; y < 6; y++) {
        for (let x = 0; x < 6; x++) {
          const edge = x === 0 || y === 0 || x === 5 || y === 5;
          pic.set(x0 + x, y0 + y, edge ? "J" : y < 3 ? (glass[0] as string) : (glass[1] as string));
        }
      }
    }
  }
  for (let x = 1; x < 21; x++) pic.set(x, 16, "J").set(x, 17, "I");
  return pic.toString();
}

// Goals and hoops ----------------------------------------------------------------------------------

/** A goal seen from the side, facing east onto the field: post, bar going back, the net sloping. */
const GOAL = (() => {
  const W = 30;
  const H = 46;
  const pic = Pic.blank(W, H);
  for (let y = 10; y < H; y++) pic.set(26, y, "d").set(27, y, "w").set(28, y, "k").set(29, y, "d");
  for (let k = 0; k < 24; k++) {
    const x = 27 - k;
    const y = 10 - Math.round(k * 0.4);
    pic.set(x, y, "w").set(x, y + 1, "d");
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W - 4; x++) {
      const backTop = 10 - Math.round((27 - x) * 0.4);
      const slope = backTop + Math.round(((27 - x) / 24) * 30);
      if (y > backTop + 1 && y <= Math.min(H - 1, slope + 4) && (x + y) % 4 === 0)
        pic.set(x, y, "K");
      if (y > backTop + 1 && y <= Math.min(H - 1, slope + 4) && (x - y + 400) % 4 === 0)
        pic.set(x, y, "K");
    }
  }
  for (let x = 4; x < W - 2; x++) pic.set(x, H - 1, "M");
  return pic.toString();
})();

/** A hoop at the north end of the court, facing the camera: backboard, square, rim, a torn net. */
const HOOP_FRONT = `
  ..dddddddddddddddddd..
  ..dwwwwwwwwwwwwwwwKd..
  ..dwkkkkkkkkkkkkkkKd..
  ..dwkkkkrrrrrrkkkkKd..
  ..dwkkkkrkkkkrkkkkKd..
  ..dwkkkkrkkkkrkkkkKd..
  ..dwkkkkrrrrrrkkkkKd..
  ..dwkkkkkkkkkkkkkkKd..
  ..dMMMMMMMMMMMMMMMMd..
  ..ddddddddQQdddddddd..
  ........QRRRRQ........
  .......QR....RQ.......
  ........QRRRRQ........
  .........+..+.........
  ..........+...........
  .........+............
  ..........JiJ.........
  ..........JiJ.........
  ..........JiJ.........
  ..........JiJ.........
  ..........JiJ.........
  ..........JiJ.........
  ..........JiJ.........
  ..........JiJ.........
  ..........JiJ.........
  ..........JiJ.........
  ..........JiJ.........
  ..........JiJ.........
  ..........JiJ.........
  ..........JiJ.........
  ..........JiJ.........
  ..........JiJ.........
  ........JJJJJJJ.......
`;

/** The other hoop, from behind: the pole in front, the backboard's grey back, the rim above it. */
const HOOP_BACK = `
  ........RRRRRR........
  ..ddddddddddddddddd...
  ..dKKKKKKKKKKKKKKKd...
  ..dKMMMMMMMMMMMMMKd...
  ..dKMKKKKKKKKKKKMKd...
  ..dKMKKKKKKKKKKKMKd...
  ..dKMMMMMMMMMMMMMKd...
  ..dSSSSSSSSSSSSSSSd...
  ..ddddddddddddddddd...
  ..........JiJ.........
  ..........JiJ.........
  ..........JiJ.........
  ..........JiJ.........
  ..........JiJ.........
  ..........JiJ.........
  ..........JiJ.........
  ..........JiJ.........
  ..........JiJ.........
  ..........JiJ.........
  ..........JiJ.........
  ..........JiJ.........
  ..........JiJ.........
  ..........JiJ.........
  ..........JiJ.........
  ..........JiJ.........
  ..........JiJ.........
  ..........JiJ.........
  ..........JiJ.........
  ..........JiJ.........
  ..........JiJ.........
  ..........JiJ.........
  ..........JiJ.........
  ........JJJJJJJ.......
`;

// The gate to the eco park ------------------------------------------------------------------------

/**
 * The old gate to the 생태공원: two brick piers, an iron arch, one leaf hanging open, ivy over
 * all of it.
 */
function gate(): string {
  const W = 56;
  const H = 56;
  const pic = Pic.blank(W, H);
  for (const x0 of [0, W - 10]) {
    for (let y = 14; y < H; y++) {
      for (let x = x0; x < x0 + 10; x++) {
        const edge = x === x0 || x === x0 + 9 || y === H - 1;
        let ch = edge
          ? "Q"
          : (y - 14) % 4 === 3
            ? "q"
            : (x + Math.floor((y - 14) / 4) * 2) % 5 === 0
              ? "q"
              : "c";
        if (y < 18) ch = y === 14 ? "d" : y === 15 ? "w" : y === 16 ? "k" : "M";
        pic.set(x, y, ch);
      }
    }
  }
  // Iron arch between the piers.
  for (let x = 10; x < W - 10; x++) {
    const t = (x - 10) / (W - 21);
    const y = Math.round(16 - Math.sin(t * Math.PI) * 12);
    pic.set(x, y, "J").set(x, y + 1, "I");
    if (x % 4 === 0) for (let yy = y + 2; yy < 20; yy++) pic.set(x, yy, "J");
  }
  // The open leaf, bars swung toward the viewer, and the closed one.
  for (let y = 22; y < H - 1; y++) {
    for (let x = 12; x < 27; x += 3) pic.set(x, y, "J");
    for (let x = 31; x < 44; x += 3) pic.set(x + Math.round((y - 22) * 0.15), y, "I");
  }
  for (let x = 12; x < 27; x++) pic.set(x, 22, "J").set(x, H - 4, "J");
  // Ivy over the piers and the arch.
  const ivy = lobes([
    { x: 5, y: 16, rx: 7, ry: 5 },
    { x: 15, y: 9, rx: 7, ry: 4 },
    { x: 50, y: 22, rx: 6, ry: 7 },
    { x: 41, y: 8, rx: 6, ry: 4 },
    { x: 3, y: 40, rx: 4, ry: 8 },
  ]);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!ivy(x, y)) continue;
      pic.set(x, y, !ivy(x, y - 1) ? "g" : !ivy(x, y + 1) ? "F" : (x + y) % 5 === 0 ? "D" : "G");
    }
  }
  return smooth(pic, "JQF").toString();
}

// What was left on the field ----------------------------------------------------------------------

/** One white sneaker on its side by the tear, laces undone. */
const SNEAKER = `
  ...ddddd....
  ..dwwkwwd...
  .dwkKwkKwd..
  dwwwwwwwwwd.
  dPPPPPPPPPPd
  .dddddddddd.
`;

/** A navy gym bag left on the stands. */
const BAG = `
  ....JJJJJJJJ....
  ...J........J...
  .vvvvvvvvvvvvvv.
  vnnnnnnnnnnnnnNv
  vNNNNNNNNNNNNNNv
  v++++++++++++++v
  vNNNNNNNNNNNNNNv
  vNNNNNNNNNNNNNNv
  .vvvvvvvvvvvvvv.
`;

/** A water bottle, half full. */
const BOTTLE = `
  .JJ.
  .ii.
  JeeJ
  JeEJ
  JEEJ
  JEEJ
  JEEJ
  .JJ.
`;

/** A buoy out on the water, its red lamp blinking. */
const buoy = (on: boolean) => `
  ...${on ? "r" : "q"}...
  ..${on ? "rrr" : "qqq"}..
  ...J...
  .QRRRQ.
  QRrRRRQ
  QRRRRRQ
  .IIIII.
  .jjjjj.
`;

/** 철봉: three chin-up bars stepping up in height, every school field's oldest furniture. */
const BARS = (() => {
  const W = 56;
  const H = 36;
  const pic = Pic.blank(W, H);
  const posts = [2, 19, 36, 53];
  const tops = [20, 12, 4];
  posts.forEach((x, i) => {
    const top = Math.min(tops[Math.max(0, i - 1)] ?? 20, tops[Math.min(2, i)] ?? 20);
    for (let y = top; y < H; y++)
      pic
        .set(x - 1, y, "J")
        .set(x, y, "i")
        .set(x + 1, y, "J");
  });
  tops.forEach((y, i) => {
    const x0 = posts[i] as number;
    const x1 = posts[i + 1] as number;
    for (let x = x0; x <= x1; x++) pic.set(x, y, "+").set(x, y + 1, "M");
  });
  for (let x = 0; x < W; x++) if (pic.at(x, H - 1) !== ".") pic.set(x, H - 1, "J");
  return pic.toString();
})();

/** A row of old tyres half sunk in the ground, painted long ago in faded colours. */
const TIRES = (() => {
  const W = 52;
  const H = 14;
  const pic = Pic.blank(W, H);
  const paint = ["R", "y", "n", "R", "y"];
  for (let k = 0; k < 5; k++) {
    const cx = 5 + k * 10.5;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const d = Math.hypot((x + 0.5 - cx) / 5.2, (y + 0.5 - 9) / 8.5);
        if (d > 1 || y > 11) continue;
        const inner = d < 0.5;
        pic.set(x, y, inner ? "j" : d > 0.88 ? "J" : y < 5 ? (paint[k] as string) : "I");
      }
    }
  }
  for (let x = 0; x < W; x++) if (pic.at(x, 11) !== ".") pic.set(x, 11, "J");
  return smooth(pic, "J").toString();
})();

export default [
  still("bars", [56, 36], BARS, { outline: false, lone: "+" }),
  still("tires", [52, 14], TIRES, { outline: false }),
  sprite({
    name: "stands",
    size: [16, 64],
    origin: [0, 63],
    palette,
    outline: false,
    frames: { l: stands("l"), m: stands("m"), r: stands("r") },
    anim: { idle: { frames: ["m"], fps: 1 } },
  }),
  still("podium", [64, 40], PODIUM, { outline: false, lone: "Jt" }),
  sprite({
    name: "floodlight",
    size: [22, 120],
    origin: [11, 119],
    palette,
    outline: false,
    frames: { off: floodlight("off"), on: floodlight("on"), dim: floodlight("dim") },
    anim: {
      off: { frames: ["off"], fps: 1 },
      sputter: {
        frames: ["dim", "on", "dim", "off", "off", "dim", "off", "off", "off", "dim", "on", "off"],
        fps: 8,
        jump: 1,
      },
    },
  }),
  still("goal", [30, 46], GOAL, { outline: false, lone: "K" }),
  sprite({
    name: "hoop",
    size: [22, 33],
    palette,
    lone: "+",
    outline: false,
    frames: { front: HOOP_FRONT, back: HOOP_BACK },
    anim: { idle: { frames: ["front"], fps: 1 } },
  }),
  still("gate", [56, 56], gate(), { outline: false }),
  still("sneaker", [12, 6], SNEAKER, { outline: false, shadow: oval(12, 6, 6, 5, 6, 1.2) }),
  still("gym-bag", [16, 9], BAG, { outline: false, lone: "+" }),
  still("bottle", [4, 8], BOTTLE, { outline: false }),
  sprite({
    name: "buoy",
    size: [7, 8],
    palette,
    lone: "rqJ",
    outline: false,
    frames: { on: buoy(true), off: buoy(false) },
    anim: { blink: { frames: ["on", "off", "off", "off"], fps: 2, jump: 1 } },
  }),
];
