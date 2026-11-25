import { type Legend, sprite } from "../../format.ts";
import { lobes, Pic, seal, smooth, tidy } from "../../paint.ts";

/**
 * 아고라 외곽: the city's edge at noon, where the road into the square passes a stoa still being
 * built. A crane stopped with a drum in the air; stalls left with their goods; and in each
 * corner one of the four elements has dug in where it says it belongs: the fountain, the
 * foundry, the windy terrace hung with cloth, the stonecutters' yard. Houses and the city wall
 * close the edges. Lit from the top left.
 */
const palette: Legend = {
  ".": null,
  // stone and marble
  d: "stone.deep",
  S: "stone.dark",
  M: "stone.mid",
  v: "stone.vein",
  K: "stone.light",
  k: "stone.pale",
  w: "stone.bright",
  // wood
  B: "wood.deep",
  b: "wood.dark",
  u: "wood.mid",
  U: "wood.light",
  e: "wood.pale",
  // terracotta roofs and pots
  Q: "clay.deep",
  q: "clay.dark",
  R: "clay.mid",
  r: "clay.light",
  t: "clay.pale",
  // awnings and cloth
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
  // water
  z: "sea.dark",
  Z: "sea.mid",
  s: "sea.light",
  // fire
  F: "gold.pale",
  // goods: figs, fish
  p: "plum.dark",
  P: "plum.mid",
  n: "stone.light",
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

/**
 * Closes the outline, folds stray pixels into `fill` (sparing `keep`), then lets any pixel still
 * standing alone take the colour of its neighbours, outline excepted.
 */
function finish(pic: Pic, outline: string, fill: string, keep = ""): string {
  return smooth(tidy(seal(pic, outline), fill, outline + keep), outline).toString();
}

function oval(w: number, h: number, cx: number, cy: number, rx: number, ry: number): string {
  const pic = Pic.blank(w, h);
  const isIn = lobes([{ x: cx, y: cy, rx, ry }]);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (isIn(x, y)) pic.set(x, y, "d");
  return pic.toString();
}

/**
 * A straight timber between two points, `w` pixels thick, lit on its upper or west side and
 * shaded on the other. Sealing later turns its two outer edges into outline.
 */
function beam(pic: Pic, x0: number, y0: number, x1: number, y1: number, w = 4): void {
  const len = Math.max(1, Math.hypot(x1 - x0, y1 - y0));
  const steep = Math.abs(y1 - y0) > Math.abs(x1 - x0);
  const shades =
    w <= 1 ? ["u"] : ["U", ...Array.from({ length: w - 2 }, (_, k) => (k === 0 ? "U" : "u")), "b"];
  for (let t = 0; t <= len; t += 0.5) {
    const x = Math.round(x0 + ((x1 - x0) * t) / len);
    const y = Math.round(y0 + ((y1 - y0) * t) / len);
    shades.forEach((ch, k) => {
      const off = k - Math.floor(w / 2);
      pic.set(steep ? x + off : x, steep ? y : y + off, ch);
    });
  }
}

// The crane --------------------------------------------------------------------------------------

const CR_W = 76;
const CR_H = 124;

/** The crane's feet: the treadwheel on the left, the legs' feet, the windlass, a coil of rope. */
function craneBase(): string {
  const pic = Pic.blank(CR_W, CR_H);
  // The treadwheel: a big spoked wheel a man walks inside.
  const cx = 18;
  const cy = CR_H - 18;
  for (let a = 0; a < 360; a += 2) {
    const r = (a * Math.PI) / 180;
    for (const [rr, ch] of [
      [16, "b"],
      [15, "u"],
      [14, "U"],
      [13, "b"],
    ] as const)
      pic.set(Math.round(cx + Math.cos(r) * rr), Math.round(cy + Math.sin(r) * rr), ch);
  }
  for (let k = 0; k < 8; k++) {
    const r = (k * Math.PI) / 4;
    beam(pic, cx, cy, cx + Math.cos(r) * 13, cy + Math.sin(r) * 13, 1);
  }
  // The two legs, feet planted apart, rising out of the frame (the overhead carries the rest).
  beam(pic, 30, CR_H - 2, 40, 40);
  beam(pic, 54, CR_H - 2, 44, 40);
  beam(pic, 34, CR_H - 30, 50, CR_H - 30);
  // The windlass drum between the legs, rope wound on it.
  pic.put(
    `
      BBBBBBBBBBBB
      BeUeUeUeUeUB
      BUuUuUuUuUuB
      BBBBBBBBBBBB
    `,
    36,
    CR_H - 26,
  );
  // A coil of spare rope on the ground.
  pic.put(
    `
      .bbbb.
      bUeeUb
      bUbbUb
      .bbbb.
    `,
    58,
    CR_H - 5,
  );
  return finish(pic, "B", "u", "Ue");
}

/** The crane's top: legs meeting at the head, the boom out over the stoa, the rope and the drum. */
function craneTop(): string {
  const pic = Pic.blank(CR_W, CR_H);
  beam(pic, 40, 40, 44, 8);
  beam(pic, 44, 40, 45, 8);
  beam(pic, 44, 8, 70, 18);
  // The pulley at the boom's end and the rope down to the drum.
  pic.put("BBB\nBeB\nBBB", 68, 17);
  for (let y = 20; y < 46; y++) pic.set(69, y, "u");
  for (let y = 12; y < 34; y++) pic.set(46 + Math.round((y - 12) * 0.05), y + 6, "b");
  // The drum, a fluted marble cylinder hanging on its sling.
  pic.put(
    `
      .....bb.....
      ....b..b....
      .dddddddddd.
      dwwkkKkkKvMd
      dwkkkKkkKvMd
      dkkkKkkKvvMd
      dKKKKKKKKMSd
      .dddddddddd.
    `,
    63,
    44,
  );
  return finish(pic, "B", "u", "bdwkKvMS");
}

/** Scaffolding: poles lashed together around a column going up, with a plank deck halfway. */
function scaffold(): string {
  const W = 36;
  const H = 80;
  const pic = Pic.blank(W, H);
  for (const x of [3, 32]) beam(pic, x, H - 1, x, 4, 3);
  for (const y of [12, 40, 66]) beam(pic, 1, y, 35, y, 3);
  beam(pic, 4, 66, 31, 14, 3);
  pic.put(
    "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB\nBeeUeeUeeUeeUeeUeeUeeUeeUeeUeeUeeB\nBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
    1,
    38,
  );
  return finish(pic, "B", "u", "Ue");
}

// Market stalls -----------------------------------------------------------------------------------

/** A trestle table of goods: the same table, three loads. */
function stall(goods: "fish" | "pots" | "figs"): string {
  const pic = Pic.of(`
    ..............................
    ..............................
    ..............................
    ..............................
    ..............................
    ..............................
    BBBBBBBBBBBBBBBBBBBBBBBBBBBBBB
    BeeeeeeeeeeeeeeeeeeeeeeeeeeeeB
    BUUUUUUUUUUUUUUUUUUUUUUUUUUUUB
    BuuuuuuuuuuuuuuuuuuuuuuuuuuuuB
    BBBBBBBBBBBBBBBBBBBBBBBBBBBBBB
    .Bub......................buB.
    .Bub......................buB.
    .BBB......................BBB.
  `);
  if (goods === "fish")
    for (const x of [3, 10, 17, 24])
      pic.put(
        `
          .nnnnn.
          nkkkkKn
          .nnnnn.
        `,
        x,
        4,
      );
  if (goods === "pots")
    for (const x of [2, 9, 16, 23])
      pic.put(
        `
          .QQQQ.
          QrrRqQ
          QrRRqQ
          .QQQQ.
        `,
        x,
        3,
      );
  if (goods === "figs")
    for (const x of [3, 11, 19])
      pic.put(
        `
          .bbbbbb.
          bpPpPpPb
          bPpPpPpb
          .bbbbbb.
        `,
        x,
        3,
      );
  return finish(pic, "B", "U", "nkKQrRqpPbe");
}

/** The awning over a stall, striped, its scalloped front edge in shade. Overhead. */
function awning(c: { dark: string; mid: string; light: string }): string {
  const W = 34;
  const pic = Pic.blank(W, 36);
  for (let y = 0; y < 12; y++)
    for (let x = 0; x < W; x++) {
      const stripe = Math.floor(x / 4) % 2 === 0;
      pic.set(x, y, stripe ? (y < 2 ? c.light : c.mid) : y < 2 ? "w" : "k");
    }
  for (let x = 0; x < W; x++)
    if (x % 4 !== 3) pic.set(x, 12, Math.floor(x / 4) % 2 === 0 ? c.dark : "K");
  // Its poles down to the table corners.
  for (let y = 13; y < 36; y++) pic.set(1, y, "u").set(W - 2, y, "u");
  return finish(pic, "B", c.mid, `${c.dark}${c.light}wkKu`);
}

// The four corners ------------------------------------------------------------------------------

/**
 * The fountain house: a marble front of two columns under a pediment, three lion heads along
 * the back wall pouring into a long basin. Three frames of falling water.
 */
function fountain(frame: number): string {
  const W = 64;
  const H = 58;
  const pic = Pic.blank(W, H);
  // Pediment and roof.
  for (let y = 0; y < 10; y++) {
    const half = Math.round((y + 1) * 3.2);
    for (let x = 32 - half; x <= 31 + half; x++) pic.set(x, y, y === 9 ? "K" : x < 32 ? "w" : "k");
  }
  for (let x = 0; x < W; x++) pic.set(x, 10, "k").set(x, 11, "K").set(x, 12, "M");
  // The back wall with three spouts.
  for (let y = 13; y < 40; y++)
    for (let x = 2; x < W - 2; x++) pic.set(x, y, (x + y * 3) % 17 === 0 ? "v" : "K");
  for (const sx of [14, 31, 48]) {
    pic.put(
      `
        .ggg.
        gYyYg
        gyGyg
        .ggg.
      `,
      sx - 2,
      18,
    );
    for (let y = 22; y < 40; y++) {
      const wob = (y + frame) % 3 === 0 ? 1 : 0;
      pic.set(sx + wob - 1, y, "s").set(sx + wob, y, (y + frame) % 2 ? "Z" : "s");
    }
  }
  // Two columns at the front corners.
  for (const cx of [3, W - 7]) for (let y = 13; y < 44; y++) pic.put("wkKM", cx, y);
  // The basin: a marble lip, water inside with ripples where the spouts land.
  for (let y = 40; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (y === 40 || y === H - 6) pic.set(x, y, "w");
      else if (y === 41 || y === H - 5) pic.set(x, y, "K");
      else if (y > H - 5) pic.set(x, y, y === H - 1 ? "S" : "M");
      else
        pic.set(
          x,
          y,
          [14, 31, 48].some((sx) => Math.abs(x - sx) < 3 && (y + frame) % 3 === 0) ? "s" : "Z",
        );
    }
  return finish(pic, "d", "K", "gGyYsZzwkKM");
}

/** The foundry's furnace: a clay dome, its mouth glowing, bellows at its side. Three glows. */
function furnace(frame: number): string {
  const W = 40;
  const H = 40;
  const pic = Pic.blank(W, H);
  const dome = lobes([{ x: 20, y: 24, rx: 16, ry: 15 }]);
  for (let y = 0; y < H - 2; y++)
    for (let x = 0; x < W; x++) {
      if (!dome(x, y) || y > 37) continue;
      pic.set(x, y, x < 14 && y < 20 ? "r" : x > 28 ? "q" : "R");
    }
  // The chimney mouth on top, smoke-blackened.
  pic.put("QQQQ\nQqqQ", 18, 8);
  // The glowing mouth.
  const glow = ["F", "Y", "y"][frame] ?? "F";
  pic.put(
    `
      ..QQQQQQ..
      .QhyyyyhQ.
      QhyGGGGyhQ
      QyGxxxxGyQ
      QyGxxxxGyQ
    `
      .replace(/G/g, glow === "F" ? "Y" : "y")
      .replace(/x/g, glow),
    15,
    27,
  );
  // Bellows.
  pic.put(
    `
      ..BBBB...
      .BUeeUB..
      BUuuuuUBB
      .BbbbbB..
    `,
    0,
    32,
  );
  return finish(pic, "Q", "R", "rqhyYFGBUeub");
}

/** Cloths hung on a line between two posts, snapping in the wind. Three frames. */
function dryingLine(frame: number): string {
  const W = 52;
  const H = 34;
  const pic = Pic.blank(W, H);
  for (const x of [2, 49]) for (let y = 4; y < H - 1; y++) pic.set(x, y, "U").set(x + 1, y, "b");
  for (let x = 3; x < 49; x++)
    pic.set(x, 6 + Math.round(Math.sin(((x - 3) / 46) * Math.PI) * 2), "B");
  const cloths: readonly [number, number, number, string, string][] = [
    [6, 10, 14, "w", "K"],
    [19, 9, 16, "h", "X"],
    [31, 10, 12, "I", "a"],
    [40, 7, 12, "y", "g"],
  ];
  cloths.forEach(([x0, w, len, light, dark], i) => {
    for (let k = 0; k < len; k++) {
      const lift = Math.round(Math.sin(k * 0.45 + frame * 2.1 + i) * (k / len) * 3);
      const sway = Math.round((k / len) * (frame === 1 ? 3 : frame === 2 ? 1 : 2));
      for (let dx = 0; dx < w; dx++) {
        const x = x0 + dx + sway;
        const y =
          7 +
          Math.round(Math.sin(((x0 + dx - 3) / 46) * Math.PI) * 2) +
          k +
          lift * (dx % 3 === 0 ? 1 : 0);
        if (x < W && y < H) pic.set(x, y, dx < w / 2 ? light : dark);
      }
    }
  });
  return smooth(pic).toString();
}

/** A banner on a tall pole, streaming east. Three frames. */
function banner(frame: number): string {
  const W = 30;
  const H = 52;
  const pic = Pic.blank(W, H);
  for (let y = 2; y < H - 1; y++) pic.set(2, y, "U").set(3, y, "b");
  pic.put("YY\nyy", 2, 0);
  for (let k = 0; k < 24; k++) {
    const x = 4 + k;
    const wave = Math.round(Math.sin(k * 0.35 - frame * 2) * (1 + k * 0.12));
    for (let y = 0; y < 9 - Math.floor(k / 6); y++) {
      const yy = 4 + y + wave;
      pic.set(x, yy, y < 2 ? "H" : y > 6 - Math.floor(k / 6) ? "X" : "h");
    }
  }
  return smooth(seal(pic, "X", "UbYyB"), "X").toString();
}

/** Ashlar blocks stacked for the stoa, one with its mason's mark. */
const BLOCKS = `
  .....dddddddddddddddd...........
  ....dwwwwwwwwwwwwwwwkd..........
  ....dkkkkkkkkkkkkkkkKd..........
  ....dKKKKKKKKKKKKKKKMd..........
  ....dkkkkkkSkkkkkkkkKd..........
  ....dKKKKKKKKKKKKKKKMd..........
  ....dMMMMMMMMMMMMMMMSd..........
  dddddddddddddddddddddddddddddddd
  dwwwwwwwwwwwwwwkdwwwwwwwwwwwwwkd
  dkkkkkkkkkkkkkkKdkkkkkkkkkkkkkKd
  dKKKKKKKKKKKKKKMdKKKKKKKKKKKKKMd
  dkkkkkkkkkkkkkkKdkkkkkkkkkkkkkKd
  dKKKKKKKKKKKKKKMdKKKKKKKKKKKKKMd
  dMMMMMMMMMMMMMMSdMMMMMMMMMMMMMSd
  dddddddddddddddddddddddddddddddd
`;

/** A rack of amphorae waiting at the gate, necks up. */
function amphoraRack(): string {
  const pic = Pic.blank(34, 22);
  for (const x of [1, 9, 17, 25]) {
    pic.put(
      `
        ..QQ..
        .QrrQ.
        QrrRRQ
        QrRRqQ
        QrRRqQ
        .QRqQ.
        ..QQ..
      `,
      x,
      6,
    );
  }
  for (const x of [5, 13, 21])
    pic.put(
      `
        ..QQ..
        .QrrQ.
        QrRRqQ
        .QRqQ.
      `,
      x,
      1,
    );
  for (let x = 0; x < 34; x++) pic.set(x, 13, "B").set(x, 14, "U").set(x, 15, "b");
  for (const x of [1, 32]) for (let y = 15; y < 22; y++) pic.set(x, y, "u");
  return finish(pic, "B", "R", "QrRqUbu");
}

/** The boundary stone at the gate: a plain pillar with its old line cut across the face. */
const HOROS = `
  ..dddddd..
  .dwwwkkKd.
  .dkkkkkKd.
  .dkSSSSKd.
  .dkkkkkKd.
  .dkSSSkKd.
  .dkkkkkKd.
  .dkSSSSKd.
  .dkkkkkKd.
  .dKKKKKMd.
  .dKKKKKMd.
  .dMMMMMSd.
  dddddddddd
`;

// The city's edge ---------------------------------------------------------------------------------

/** A house seen over its yard wall: whitewash, a tiled roof with its ridge, a door. Two kinds. */
function house(kind: "a" | "b"): string {
  const W = 56;
  const H = 60;
  const pic = Pic.blank(W, H);
  const eave = kind === "a" ? 26 : 22;
  // Roof: tile courses running down from the ridge, lit side west.
  for (let y = 0; y < eave; y++)
    for (let x = 2; x < W - 2; x++) {
      const course = y % 4;
      const tile = (x + (Math.floor(y / 4) % 2) * 3) % 6;
      let ch =
        course === 3
          ? "Q"
          : tile === 0
            ? "q"
            : x < W / 2
              ? course === 0
                ? "t"
                : "r"
              : course === 0
                ? "r"
                : "R";
      if (y === 0) ch = "q";
      pic.set(x, y, ch);
    }
  for (let x = 2; x < W - 2; x++) pic.set(x, eave, "Q");
  // Walls.
  for (let y = eave + 1; y < H - 1; y++)
    for (let x = 4; x < W - 4; x++) pic.set(x, y, x < 8 ? "w" : x > W - 9 ? "K" : "k");
  // Door and a window slit.
  pic.put("BBBBBB\nBbuubB\nBbuubB\nBbuubB\nBbuubB\nBbuubB", kind === "a" ? 22 : 30, H - 7);
  pic.put("SS\nSS\nSS", kind === "a" ? 40 : 12, eave + 6);
  return finish(pic, "Q", "r", "QqtrRwkKSBbu");
}

/** The city wall, one 16-pixel run: dressed blocks, a walkway's parapet on top. */
const CITY_WALL = `
  dddddddddddddddd
  wwwkwwwkwwwkwwwk
  KKKMKKKMKKKMKKKM
  dddddddddddddddd
  kkkkkkkKkkkkkkkK
  KKKKKKKMKKKKKKKM
  KKKKKKKMKKKKKKKM
  MMMMMMMSMMMMMMMS
  kkkKkkkkkkkKkkkk
  KKKMKKKKKKKMKKKK
  KKKMKKKKKKKMKKKK
  MMMSMMMMMMMSMMMM
  kkkkkkkKkkkkkkkK
  KKKKKKKMKKKKKKKM
  KKKKKKKMKKKKKKKM
  MMMMMMMSMMMMMMMS
  kkkKkkkkkkkKkkkk
  KKKMKKKKKKKMKKKK
  KKKMKKKKKKKMKKKK
  MMMSMMMMMMMSMMMM
  SSSSSSSSSSSSSSSS
  dddddddddddddddd
`;

export default [
  one("crane", [CR_W, CR_H], craneBase(), {
    outline: false,
    shadow: oval(CR_W, CR_H, 40, CR_H - 2, 30, 3),
  }),
  one("crane-top", [CR_W, CR_H], craneTop(), { outline: false }),
  one("scaffold", [36, 80], scaffold(), { outline: false }),
  sprite({
    name: "stall",
    size: [30, 14],
    palette,
    shadow: oval(30, 14, 15, 13, 14, 1.6),
    frames: { fish: stall("fish"), pots: stall("pots"), figs: stall("figs") },
    anim: { idle: { frames: ["fish"], fps: 1 } },
  }),
  sprite({
    name: "awning",
    size: [34, 36],
    origin: [17, 35],
    palette,
    outline: false,
    frames: {
      red: awning({ dark: "X", mid: "h", light: "H" }),
      blue: awning({ dark: "A", mid: "i", light: "I" }),
      ochre: awning({ dark: "G", mid: "y", light: "Y" }),
    },
    anim: { idle: { frames: ["red"], fps: 1 } },
  }),
  sprite({
    name: "fountain-house",
    size: [64, 58],
    palette,
    shadow: oval(64, 58, 32, 56, 31, 2.6),
    frames: { pour0: fountain(0), pour1: fountain(1), pour2: fountain(2) },
    anim: { pour: { frames: ["pour0", "pour1", "pour2"], fps: 6 } },
  }),
  sprite({
    name: "furnace",
    size: [40, 40],
    palette,
    shadow: oval(40, 40, 21, 38, 18, 2.4),
    frames: { glow0: furnace(0), glow1: furnace(1), glow2: furnace(2) },
    anim: { glow: { frames: ["glow0", "glow1", "glow2"], fps: 4 } },
  }),
  sprite({
    name: "drying-line",
    size: [52, 34],
    palette,
    outline: false,
    frames: { snap0: dryingLine(0), snap1: dryingLine(1), snap2: dryingLine(2) },
    anim: { snap: { frames: ["snap0", "snap1", "snap2"], fps: 5 } },
  }),
  sprite({
    name: "banner",
    size: [30, 52],
    origin: [3, 51],
    palette,
    outline: false,
    frames: { snap0: banner(0), snap1: banner(1), snap2: banner(2) },
    anim: { snap: { frames: ["snap0", "snap1", "snap2"], fps: 5 } },
  }),
  one("blocks", [32, 15], finish(Pic.of(BLOCKS), "d", "k", "S"), {
    shadow: oval(32, 15, 16, 14, 15, 1.6),
  }),
  one("amphora-rack", [34, 22], amphoraRack(), {
    outline: false,
    shadow: oval(34, 22, 17, 21, 16, 1.6),
  }),
  one("horos", [10, 13], finish(Pic.of(HOROS), "d", "k", "S"), {
    shadow: oval(10, 13, 5, 12, 5, 1.2),
  }),
  sprite({
    name: "house",
    size: [56, 60],
    palette,
    frames: { a: house("a"), b: house("b") },
    anim: { idle: { frames: ["a"], fps: 1 } },
  }),
  sprite({
    name: "city-wall",
    size: [16, 22],
    palette,
    outline: false,
    frames: { run: smooth(Pic.of(CITY_WALL), "d").toString() },
    anim: { idle: { frames: ["run"], fps: 1 } },
  }),
];
