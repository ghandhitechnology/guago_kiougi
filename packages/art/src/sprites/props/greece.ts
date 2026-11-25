import { type Legend, sprite } from "../../format.ts";
import { lobes, Pic, seal, shade, smooth, tidy } from "../../paint.ts";

/**
 * Page 1 props: what grows out of the 운동장 when the agora comes through. Marble is lit from
 * the top left like everything else; columns and the olive keep their tops in a separate
 * overhead sprite on the same canvas, so students pass behind them.
 */
const palette: Legend = {
  ".": null,
  // marble, with its warm shadow
  v: "stone.vein",
  d: "stone.deep",
  S: "stone.dark",
  M: "stone.mid",
  K: "stone.light",
  k: "stone.pale",
  w: "stone.bright",
  // terracotta
  Q: "clay.deep",
  q: "clay.dark",
  R: "clay.mid",
  r: "clay.light",
  t: "clay.pale",
  J: "ink.deep",
  j: "ink.dark",
  // olive leaves and bark
  o: "olive.deep",
  O: "olive.dark",
  l: "olive.mid",
  L: "olive.light",
  // olive leaves: grey-green, silver where the light catches them
  f: "board.deep",
  z: "board.dark",
  N: "board.mid",
  n: "board.light",
  B: "wood.deep",
  b: "wood.dark",
  U: "wood.mid",
  // field things
  g: "grass.mid",
  G: "grass.dark",
  F: "grass.deep",
  y: "gold.light",
  e: "wood.mid",
  E: "wood.dark",
  // working cells
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

/** Closes a hand-drawn grid's outline in `outline` and folds stray single pixels into `fill`. */
function finish(grid: string, outline: string, fill: string, keep = ""): string {
  return tidy(
    tidy(seal(Pic.of(grid), outline, keep), fill, outline + keep),
    fill,
    outline + keep,
  ).toString();
}

function oval(w: number, h: number, cx: number, cy: number, rx: number, ry: number): string {
  const pic = Pic.blank(w, h);
  const isIn = lobes([{ x: cx, y: cy, rx, ry }]);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (isIn(x, y)) pic.set(x, y, "d");
  return pic.toString();
}

// Doric column ---------------------------------------------------------------------------------

const COL_W = 20;
const COL_H = 66;
/** Fluted shaft row, 14 wide: lit west edge, flutes as soft grooves, shade to the east. */
const FLUTED = "dwwkKkkKkkKvvd";
const SHAFT_X = 3;

/** Shaft rows from `top` to `bottom` inclusive, tapering one pixel near the top. */
function shaft(pic: Pic, top: number, bottom: number): void {
  for (let y = top; y <= bottom; y++) {
    const taper = y < top + 10 ? 1 : 0;
    const row = taper ? `d${FLUTED.slice(2, 12)}Md` : FLUTED;
    pic.put(row, SHAFT_X + taper, y);
  }
}

const CAPITAL = `
  dddddddddddddddddddd
  dwwwwwwwwwwwwwwwwwkd
  dKKKKKKKKKKKKKKKKKMd
  dddddddddddddddddddd
  .dwwkkkkkkkkkkkkKMd.
  ..dKKKKKKKKKKKKKMd..
  ...ddddddddddddddd..
`;
const STYLOBATE = `
  dddddddddddddddddddd
  dwwwwwwwwwwwwwwwwwkd
  dkkkkkkkkkkkkkkkkkKd
  dKKKKKKKKKKKKKKKKKMd
  dddddddddddddddddddd
`;

function columnBase(): string {
  const pic = Pic.blank(COL_W, COL_H);
  shaft(pic, 6, COL_H - 6);
  pic.put(STYLOBATE, 0, COL_H - 5);
  return finish(pic.toString(), "d", "k");
}

function columnCapital(): string {
  const pic = Pic.blank(COL_W, COL_H);
  pic.put(CAPITAL, 0, 0);
  return finish(pic.toString(), "d", "k");
}

/** A shaft snapped off: a jagged lit break on top, chips on the ground beside it. */
function columnBroken(): string {
  const pic = Pic.blank(COL_W, COL_H);
  const top = COL_H - 30;
  shaft(pic, top, COL_H - 6);
  pic.put(
    `
      ..dd..........
      .dwwdd...dd...
      dwkkwwddwwkd..
      dkKkkkkwkkKMd.
    `,
    SHAFT_X,
    top - 2,
  );
  pic.put(STYLOBATE, 0, COL_H - 5);
  return finish(pic.toString(), "d", "k");
}

/** A fallen drum: a flute-banded cylinder on its side, end face toward the light. */
const DRUM = `
  ...ddddddddddddd..
  ..dkwwwwwwwwwwwKd.
  .dwKkkKkkKkkKkkMMd
  dwkKkkKkkKkkKkkMSd
  dkKKKKKKKKKKKKKMSd
  .dKMMMMMMMMMMMMSd.
  ..ddddddddddddddd.
`;

// Olive tree ---------------------------------------------------------------------------------

const OL_W = 52;
const OL_H = 58;
const OL_ORIGIN = [26, 56] as const;

/** A gnarled double trunk that twists apart and back together. */
function oliveTrunk(): string {
  const pic = Pic.blank(OL_W, OL_H);
  const stems: (readonly [number, number, number])[] = [];
  for (let y = 18; y < OL_H - 1; y++) {
    const k = (OL_H - 1 - y) / 38;
    // One thick twisting bole that forks a third of the way up.
    if (y >= 42) stems.push([25 - Math.sin(k * 5) * 2.5, y, 4.8 - k * 1.4]);
    else {
      const up = (42 - y) / 20;
      stems.push([24 - up * 5 - Math.sin(up * 4) * 1.5, y, 3.4 - up * 1.2]);
      stems.push([28 + up * 5 + Math.sin(up * 3), y, 2.8 - up * 0.9]);
    }
  }
  for (const [cx, y, hw] of stems) {
    const flare = y >= OL_H - 4 ? (y - (OL_H - 5)) * 1.2 : 0;
    const x0 = Math.round(cx - hw - flare);
    const x1 = Math.round(cx + hw + flare);
    for (let x = x0; x <= x1; x++) {
      const cur = pic.at(x, y);
      if (cur && cur !== ".") continue;
      pic.set(x, y, x === x0 + 1 ? "K" : x > x1 - 2 ? "S" : "M");
    }
  }
  // Knots and splits.
  for (const [x, y] of [
    [22, 48],
    [25, 40],
    [21, 33],
    [29, 30],
  ] as const)
    if (pic.at(x, y) === "M" && pic.at(x + 1, y) === "M") pic.set(x, y, "S").set(x + 1, y, "S");
  return tidy(tidy(seal(pic, "d"), "M", "d"), "M", "d").toString();
}

/** A clump of leaves: a main lobe with smaller bumps on its crown. */
const clump = (x: number, y: number, r: number) => [
  { x, y, rx: r, ry: r * 0.72 },
  { x: x - r * 0.5, y: y - r * 0.4, rx: r * 0.55, ry: r * 0.45 },
  { x: x + r * 0.35, y: y - r * 0.55, rx: r * 0.55, ry: r * 0.42 },
  { x: x + r * 0.75, y: y + r * 0.05, rx: r * 0.42, ry: r * 0.38 },
];

/** Leaf clumps of the crown, back to front. */
const OLIVE_CLUMPS: readonly (readonly [x: number, y: number, r: number])[] = [
  [27, 8, 8],
  [15, 13, 7],
  [38, 14, 7.5],
  [24, 18, 8.5],
  [9, 23, 6],
  [44, 24, 5.5],
  [33, 25, 7.5],
  [17, 28, 7],
  [27, 32, 5.5],
];

/**
 * The crown as olive leaves: clumps lit on their upper left, where the leaves turn their silver
 * undersides to the light, grey-green through the middle and blue-green in the shade below
 * where each clump sits over the next. Single leaves show as slivers of silver on the middle
 * and of grey-green in the shade, and leaf tips break the silhouette.
 */
function oliveCrown(stir: number): string {
  const mid = "n";
  const leafMid = "v";
  const leafDark = "n";
  const pic = Pic.blank(OL_W, OL_H);
  const ink = { outline: "f", dark: "N", mid, light: "v", glint: "K" };
  OLIVE_CLUMPS.forEach(([cx, cy, r], i) => {
    const x0 = cx + (i % 2 ? stir : 0);
    const isIn = lobes(clump(x0, cy, r));
    const c = shade(OL_W, OL_H, isIn, ink, { light: 2, dark: 3 });
    // Leaves: small slivers of another tone, scattered by a hash, thicker toward the light.
    for (let y = 1; y < OL_H - 1; y++) {
      for (let x = 1; x < OL_W - 2; x++) {
        const h = (x * 73 + y * 151 + i * 29) % 17;
        const at = c.at(x, y);
        if (at === mid && h < 4)
          c.put(Pic.of(h < 2 ? "xx" : "x.\n.x").swap("x", leafMid), x, y, {
            onto: mid,
            whole: true,
          });
        else if (at === "N" && h < 3)
          c.put(Pic.of(h < 1 ? "xx" : ".x\nx.").swap("x", leafDark), x, y, {
            onto: "N",
            whole: true,
          });
        else if (at === "v" && h < 3)
          c.put(Pic.of("xx").swap("x", "K"), x, y, { onto: "v", whole: true });
      }
    }
    for (let y = 0; y < OL_H; y++) {
      for (let x = 0; x < OL_W; x++) {
        let ch = c.at(x, y) as string;
        if (ch === ".") continue;
        // Over a clump behind, the lit upper left edge stays leafy instead of outlined.
        if (ch === "f" && pic.at(x, y) !== "." && (!isIn(x - 1, y) || !isIn(x, y - 1))) ch = mid;
        pic.set(x, y, ch);
      }
    }
  });
  // Leaf tips breaking the top and sides of the silhouette.
  const tips = pic.clone();
  for (let y = 1; y < OL_H - 1; y++) {
    for (let x = 1; x < OL_W - 1; x++) {
      if (pic.at(x, y) !== "f" || pic.at(x, y - 1) !== "." || (x * 5 + y) % 4 !== 0) continue;
      tips.set(x, y - 1, "f").set(x, y, "N");
    }
  }
  let out = tips;
  for (let pass = 0; pass < 3; pass++) out = seal(smooth(out), "f");
  return out.toString();
}

// Amphorae -----------------------------------------------------------------------------------

const AMPHORA = `
  ....QQQQ....
  ...QrRRqQ...
  ..QQQrqQQQ..
  .Q.QrRRqQ.Q.
  .Q.QrRRqQ.Q.
  .QQrrRRRqQQ.
  .QrrRRRRRqQ.
  QrrRRRRRRqqQ
  QrRRRRRRRqqQ
  QjjjjjjjjjjQ
  QjttjjttjjjQ
  QjjjjjjjjjjQ
  QrRRRRRRRqqQ
  .QrRRRRRqqQ.
  .QrRRRRRqqQ.
  ..QrRRRqqQ..
  ...QRRqqQ...
  ....QRqQ....
  ....QQQQ....
`;

const AMPHORA_TIPPED = `
  .........QQQQQQ.....
  .......QQrRRRRRQQ...
  .QQQ..QrrRRjRRRqqQ..
  QrRRQQrRRRRjRRRRqqQ.
  QqrRRRrRRRRjRRRRRqQQ
  QqqRRRRRRRRjRRRRRqqQ
  .QQqqRRRRRRjRRRRqqQ.
  ...QQqqqqqqjqqqqQQ..
  .....QQQQQQQQQQQ....
`;

// Tortoise statue ----------------------------------------------------------------------------

/** 제논의 거북이, in marble on its plinth: the tortoise nobody has ever caught. */
const TORTOISE = `
  ...........dddddddd...........
  .........ddwwkkkkkKdd.........
  ........dwwkKkkKkkkKMd........
  .......dwkkKkkKkkKkkKMd.......
  ..ddd..dwKKKKKKKKKKKKMd.......
  .dwwkd.dkkKkkKkkKkkKKMMd......
  .dwkKdddkKkkKkkKkkKKMMMd......
  ..dKMMdKKKKKKKKKKKKKMMMMd.....
  ...ddMdMMMMMMMMMMMMMMMMMd.....
  .....ddKKd.ddddddd.dKKMdd.....
  ......dkMd.........dkMd.......
  ......dddd.........dddd.......
  ddddddddddddddddddddddddddddd.
  dwwwwwwwwwwwwwwwwwwwwwwwwwwkd.
  dkkkkkkkkkkkkkkkkkkkkkkkkkkKd.
  dkkkkkkkkkkkMMMMMMkkkkkkkkkKd.
  dkkkkkkkkkkkMyyyyMkkkkkkkkkKd.
  dkkkkkkkkkkkMMMMMMkkkkkkkkkKd.
  dKKKKKKKKKKKKKKKKKKKKKKKKKKMd.
  dMMMMMMMMMMMMMMMMMMMMMMMMMMMd.
  ddddddddddddddddddddddddddddd.
`;

// The field ----------------------------------------------------------------------------------

/**
 * The 운동장's goal, and the column that came up through it: the left post is now fluted
 * marble, and it took the crossbar with it on the way up.
 */
function goalColumn(): string {
  const pic = Pic.blank(72, 62);
  // Net: a slanted back panel of diamonds behind the frame.
  for (let y = 26; y < 58; y++) {
    for (let x = 12; x < 66; x++) {
      if (y > 56) continue;
      const u = (x + y) % 4;
      const v = (x - y + 400) % 4;
      if (u === 0 || v === 0) pic.set(x, y, y < 30 ? "K" : "k");
    }
  }
  // Right post and the crossbar, bent up toward the column.
  for (let y = 22; y < 60; y++) pic.put("dwkd", 64, y);
  for (let x = 14; x < 68; x++) {
    const lift = x < 30 ? Math.round((30 - x) * 0.55) : 0;
    pic.put("d\nw\nk\nd", x, 20 - lift);
  }
  // The column, on its own base where the post's foot used to be.
  for (let y = 6; y < 58; y++) pic.put(FLUTED, 4, y);
  pic.put(
    `
      ddddddddddddddddd
      dwwwwwwwwwwwwwwkd
      dKKKKKKKKKKKKKKMd
      ddddddddddddddddd
      .dwwkkkkkkkkKKMd.
      ..ddddddddddddd..
    `,
    2,
    0,
  );
  pic.put(
    `
      ddddddddddddddddddd
      dwwwwwwwwwwwwwwwwkd
      dKKKKKKKKKKKKKKKKMd
      ddddddddddddddddddd
    `,
    1,
    58,
  );
  const done = Pic.of(finish(tidy(pic, "x", "dwkKM").toString(), "d", "k", "K"));
  return tidy(done, ".", "dwkM").toString();
}

const ROCKET = `
  ......dd......
  .....dwkd.....
  .....dwkd.....
  ....dgggGd....
  ....dgFgGd....
  ....dggGGd....
  ....dgggGd....
  ....dggGGd....
  ...ddgggGdd...
  ..dgdggGGdgd..
  ..dgdgggGdgd..
  ..dddwwkKddd..
  .....dkKd.....
  .....dkKd.....
  .....dkKd.....
  ....ddkKdd....
  ...dwwkkKMd...
  ..dwkkkkkKMd..
  ..dddddddddd..
  ..d........d..
  .d..........d.
  dd..........dd
`;

/** Where a column broke through: the field's crust split and heaved around its foot. */
const HEAVE = `
  .......E..........E......
  ..E.....E.......eE.....E.
  ...EE...eE.....Ee....EE..
  .....EEe.eEEEEEe.eEEE....
  ..EEE..E.........E..EEE..
  E....EE...........EE....E
  ..EEE..E.........E..EEE..
  .....EEe.eEEEEEe.eEEE....
  ...E....Ee.....eE....E...
  ..E.....E.......E.....E..
`;

/**
 * Long afternoon shadows for the shadow layer: the sun is low in the west, so a column's shadow
 * runs east and a little south from its foot. Only the shape is used.
 */
function longShadow(len: number, width: number): string {
  const W = len + width + 2;
  const H = Math.ceil(len * 0.32) + width + 2;
  const pic = Pic.blank(W, H);
  for (let t = 0; t <= len; t++) {
    const cx = 1 + t;
    const cy = 1 + t * 0.32;
    const half = (width / 2) * (1 - (t / len) * 0.35);
    for (let y = Math.floor(cy - half); y <= Math.ceil(cy + half); y++) {
      if (Math.abs(y + 0.5 - cy - width / 2) <= half) pic.set(cx, y + Math.floor(width / 2), "d");
    }
  }
  return pic.toString();
}

export default [
  sprite({
    name: "long-shadow",
    size: [52, 26],
    origin: [1, 4],
    palette,
    outline: false,
    frames: {
      column: Pic.blank(52, 26).put(longShadow(42, 6), 0, 0).toString(),
      tree: Pic.blank(52, 26).put(longShadow(46, 12), 0, 0).toString(),
    },
    anim: { idle: { frames: ["column"], fps: 1 } },
  }),
  sprite({
    name: "column",
    size: [COL_W, COL_H],
    palette,
    shadow: oval(COL_W, COL_H, 12, 64, 11, 2.2),
    frames: { whole: columnBase(), broken: columnBroken() },
    anim: { idle: { frames: ["whole"], fps: 1 } },
  }),
  one("column-capital", [COL_W, COL_H], columnCapital()),
  one("drum", [18, 7], finish(DRUM, "d", "k"), { shadow: oval(18, 7, 10, 6, 9, 1.4) }),
  sprite({
    name: "olive",
    size: [OL_W, OL_H],
    origin: OL_ORIGIN,
    palette,
    shadow: oval(OL_W, OL_H, 28, 56, 15, 2.6),
    frames: { base: oliveTrunk() },
    anim: { idle: { frames: ["base"], fps: 1 } },
  }),
  sprite({
    name: "olive-crown",
    size: [OL_W, OL_H],
    origin: OL_ORIGIN,
    palette,
    frames: { stir0: oliveCrown(0), stir1: oliveCrown(1) },
    anim: { stir: { frames: ["stir0", "stir1"], fps: 1.5 } },
  }),
  one("amphora", [12, 19], finish(AMPHORA, "Q", "R", "j"), {
    lone: "",
    shadow: oval(12, 19, 6.5, 18, 5.5, 1.4),
  }),
  one("amphora-tipped", [20, 9], finish(AMPHORA_TIPPED, "Q", "R", "j"), {
    shadow: oval(20, 9, 10, 8, 9.5, 1.5),
  }),
  one("tortoise-statue", [30, 21], finish(TORTOISE, "d", "k", "y"), {
    lone: "",
    shadow: oval(30, 21, 15.5, 20, 14.5, 1.8),
  }),
  one("goal-column", [72, 62], goalColumn(), {
    outline: false,
    shadow: oval(72, 62, 38, 60, 34, 2.4),
  }),
  one("rocket", [14, 22], finish(ROCKET, "d", "g"), { shadow: oval(14, 22, 7, 21, 6.5, 1.4) }),
  sprite({
    name: "heave",
    size: [25, 10],
    palette,
    outline: false,
    lone: "",
    frames: { still: tidy(Pic.of(HEAVE), ".", "").toString() },
    anim: { idle: { frames: ["still"], fps: 1 } },
  }),
];
