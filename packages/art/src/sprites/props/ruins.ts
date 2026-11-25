import { type Legend, sprite } from "../../format.ts";
import { lobes, Pic, seal, shade, smooth, tidy } from "../../paint.ts";

/**
 * 무너진 열주: what is left of a temple on a headland, and the coast around it. Marble is lit
 * from the top left; tall things keep their tops in a separate overhead sprite on the same
 * canvas, so students pass behind them. Fallen pieces lie east, the way the whole row went.
 */
const palette: Legend = {
  ".": null,
  // marble
  d: "stone.deep",
  S: "stone.dark",
  M: "stone.mid",
  v: "stone.vein",
  K: "stone.light",
  k: "stone.pale",
  w: "stone.bright",
  // cypress
  f: "board.deep",
  z: "board.dark",
  N: "board.mid",
  n: "board.light",
  // wood and its paint
  B: "wood.deep",
  b: "wood.dark",
  u: "wood.mid",
  U: "wood.light",
  e: "wood.pale",
  // boat paint
  A: "navy.deep",
  a: "navy.dark",
  i: "navy.mid",
  I: "navy.light",
  // ochre and bronze
  Q: "clay.deep",
  q: "clay.dark",
  R: "clay.mid",
  r: "clay.light",
  G: "gold.deep",
  g: "gold.dark",
  y: "gold.mid",
  Y: "gold.light",
  // red ribbon and paint
  X: "red.deep",
  h: "red.mid",
  H: "red.light",
  // ink for the eye on the bow
  j: "ink.deep",
  // scrub
  o: "olive.mid",
  O: "olive.dark",
  l: "olive.light",
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

/**
 * Closes a grid's outline in `outline` and folds stray single pixels into `fill`, except the
 * characters in `keep` (highlights and details that stand alone on purpose).
 */
function finish(pic: Pic, outline: string, fill: string, keep = ""): string {
  return tidy(tidy(seal(pic, outline), fill, outline + keep), fill, outline + keep).toString();
}

/** A ground shadow ellipse for the `shadow` grid. */
function oval(w: number, h: number, cx: number, cy: number, rx: number, ry: number): string {
  const pic = Pic.blank(w, h);
  const isIn = lobes([{ x: cx, y: cy, rx, ry }]);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (isIn(x, y)) pic.set(x, y, "d");
  return pic.toString();
}

/**
 * Fills horizontal spans row by row (`[row, x0, x1]`), shading each span lit on its west end and
 * shaded on its east, the way a rounded marble form takes light from the top left.
 */
function spans(
  w: number,
  h: number,
  list: readonly (readonly [number, number, number])[],
  ramp = { lit: "w", mid: "k", turn: "K", dark: "M" },
): Pic {
  const pic = Pic.blank(w, h);
  for (const [y, x0, x1] of list) {
    for (let x = x0; x <= x1; x++) {
      const ch =
        x === x0 + 1 ? ramp.lit : x === x1 - 1 ? ramp.dark : x === x1 - 2 ? ramp.turn : ramp.mid;
      pic.set(x, y, ch);
    }
  }
  return pic;
}

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

// The temple ------------------------------------------------------------------------------------

/** Fluted shaft row, 14 wide, as the standing columns draw it. */
const FLUTED = "dwwkKkkKkkKvvd";
const COL_H = 66;

/**
 * A Doric entablature resting on three columns 32 px apart, seen from below the sun: the
 * cornice's lit top, its shadowed drip, the frieze of triglyphs and plain metopes, the lit
 * taenia, the architrave's broad face. Its east end broke off where the fourth column fell.
 * Drawn on a canvas whose foot is the middle column's foot, so it sits on the capitals.
 */
function entablature(): string {
  const W = 88;
  const pic = Pic.blank(W, COL_H + 2);
  const top = 0;
  const rows: readonly string[] = [
    "w", // cornice top, lit
    "w",
    "k",
    "K", // cornice face
    "M", // drip in shadow
    "S",
    "f", // frieze, 7 rows
    "f",
    "f",
    "f",
    "f",
    "f",
    "f",
    "k", // taenia
    "v",
    "K", // architrave face
    "k",
    "k",
    "K",
    "K",
    "M",
  ];
  /** Where the break runs: the beam's east end, per row. */
  const bite = [0, 1, 1, 3, 2, 4, 6, 5, 7, 8, 8, 9, 11, 10, 10, 9, 8, 6, 5, 3, 2];
  const end = (y: number): number => W - 3 - (bite[y] ?? 0);
  rows.forEach((kind, y) => {
    for (let x = 1; x <= end(y); x++) {
      let ch = kind;
      if (kind === "f") {
        // Triglyphs over each column and between: three bars with grooves, then a metope.
        const slot = (x - 3 + 64) % 16;
        if (slot < 6) ch = slot === 1 || slot === 4 ? "v" : slot === 0 ? "k" : "K";
        else ch = y === top + 6 ? "v" : "k";
      }
      if (kind === "w" && x < 3) ch = "w";
      pic.set(x, top + y, ch);
    }
  });
  // The break itself: a lit fracture face along the east end.
  rows.forEach((_, y) => {
    const x = end(y);
    if (y > 1) pic.set(x, top + y, y % 3 ? "w" : "k");
  });
  return finish(pic, "d", "k");
}

/**
 * A shaft lying on its side, three drums still in a row, the near end's round face toward the
 * light. The middle drum slid a pixel when it landed. With `snapped`, the far drum is gone and
 * the end is a break.
 */
function shaftFallen(snapped: boolean): string {
  const W = 52;
  const pic = Pic.blank(W, 14);
  const bands = "dwwkKkkKvMSd";
  const last = snapped ? 36 : W - 2;
  for (let x = 4; x <= last; x++) {
    const drop = x >= 18 && x < 34 ? 1 : 0;
    for (let y = 0; y < bands.length; y++) {
      let ch = bands[y] as string;
      if ((x === 18 || x === 34) && y > 0 && y < bands.length - 1) ch = y < 6 ? "v" : "S";
      pic.set(x, y + 1 + drop, ch);
    }
  }
  // The near end: a round cut face, lit.
  pic.put(
    `
      ..ddd
      .dwwk
      dwkkk
      dwkkK
      dkkkK
      dkkKv
      dkKKv
      dkKvM
      .dvMS
      .dMSd
      ..dd.
    `,
    0,
    2,
  );
  if (snapped) {
    pic.put(
      `
        d..
        wd.
        kwd
        Kkd
        kkd
        KKd
        vkd
        MKd
        Sd.
      `,
      last,
      2,
    );
  }
  return finish(pic, "d", "k", "w");
}

/** A Doric capital fallen on its back: the square abacus on the ground, the cushion above. */
const CAPITAL_FALLEN = `
  .....dddddddddd.....
  ....dwkkkkkkkKMd....
  ...dwkkKkkKkkKMMd...
  ..dwkKkkKkkKkkKMMd..
  ..dkkkkkkkkkkkKMSd..
  ..dkKKKKKKKKKKKMSd..
  ...dMMMMMMMMMMMSd...
  dddddddddddddddddddd
  dwwwwwwwwwwwwwwwwwkd
  dkkkkkkkkkkkkkkkkKMd
  dKKKKKKKKKKKKKKKKMSd
  dMMMMMMMMMMMMMMMMSSd
  dddddddddddddddddddd
`;

/** A column cut down to its base: one drum (`low`) or two with a broken top (`high`). */
function stump(high: boolean): string {
  const pic = Pic.blank(20, 30);
  const top = high ? 9 : 17;
  for (let y = top; y <= 24; y++) pic.put(FLUTED, 3, y);
  if (high)
    pic.put(
      `
        ..dd.....dd...
        .dwwdd..dwkd..
        dwkkwwddwkkKd.
        dkKkkkkwkkKMd.
      `,
      3,
      top - 2,
    );
  else
    pic.put(
      `
        .dddddddddddd.
        dwwwwwwwwwwkkd
        dwkkkkkkkkkKMd
      `,
      3,
      top - 1,
    );
  pic.put(
    `
      dddddddddddddddddddd
      dwwwwwwwwwwwwwwwwwkd
      dkkkkkkkkkkkkkkkkkKd
      dKKKKKKKKKKKKKKKKKMd
      dddddddddddddddddddd
    `,
    0,
    25,
  );
  return finish(pic, "d", "k", "w");
}

/**
 * A kouros, an archaic marble youth, left foot forward and fists at his sides, as they always
 * stood. His head is on the ground beside the plinth.
 */
function statue(): string {
  const rows: [number, number, number][] = [];
  const add = (ys: number[], x0: number, x1: number) => {
    for (const y of ys) rows.push([y, x0, x1]);
  };
  add([0, 1], 7, 10);
  add([2], 6, 11);
  add([3], 3, 14);
  add([4, 5], 2, 15);
  add(range(6, 16), 1, 3);
  add(range(6, 16), 14, 16);
  add(range(6, 19), 5, 12);
  add(range(20, 31), 4, 8);
  add(range(20, 30), 9, 12);
  add([32], 3, 8);
  add([31], 9, 13);
  const pic = spans(18, 39, rows);
  // The cut of the arms from the body, the pectorals, the groin line, the knees.
  for (const y of range(6, 16)) pic.set(4, y, ".").set(13, y, ".");
  for (const x of range(6, 11)) pic.set(x, 9, "K");
  pic.set(8, 12, "v").set(8, 13, "v").set(9, 18, "v").set(8, 19, "v");
  pic.set(6, 25, "K").set(7, 25, "K").set(10, 25, "K").set(11, 25, "K");
  for (const y of range(20, 30)) pic.set(9, y, "M");
  pic.put(
    `
      dddddddddddddddddd
      dwwwwwwwwwwwwwwwkd
      dkkkkkkkkkkkkkkkKd
      dKKKKKKKKKKKKKKKMd
      dMMMMMMMMMMMMMMMSd
      dddddddddddddddddd
    `,
    0,
    33,
  );
  // The neck's break, lit and rough.
  pic.put("wk\nkK", 7, 0);
  return finish(pic, "d", "k");
}

/** The kouros's head, face down in the dust: the archaic curls up, a chipped nose. */
const STATUE_HEAD = `
  .dddddd.
  dwkvkvkd
  dkvkvkKd
  dkkkkKMd
  dKKkKMSd
  .dddddd.
`;

/**
 * A herm: a square marble pillar with a bearded head, standing where two roads meet. Its paint
 * is long gone except a little ochre in the beard.
 */
function herm(): string {
  const rows: [number, number, number][] = [];
  for (const y of range(1, 7)) rows.push([y, 2, 9]);
  rows.push([0, 3, 8]);
  for (const y of range(8, 27)) rows.push([y, 2, 9]);
  const pic = spans(12, 31, rows);
  // Hair, eyes, the beard, the shoulders' stubs, the base.
  pic.put("vkvk", 4, 1).put("dKdK", 4, 4).put("RrRr", 4, 6).put("rRr", 4, 7);
  for (const y of range(9, 26)) pic.set(8, y, "M").set(7, y, "K");
  pic.put(
    `
      dddddddddddd
      dwwwwwwwwwkd
      dKKKKKKKKKMd
      dddddddddddd
    `,
    0,
    27,
  );
  pic.put("kd\nkd", 1, 8).put("dK\ndK", 9, 8);
  return finish(pic, "d", "k");
}

/** A field altar of rough blocks, an offering bowl and a fig branch on its top. */
const ALTAR = `
  ....dddddddddddddddddd....
  ...dkwwwwwwwwwwwwwwwwkd...
  ..dwwkkkkqQQQQqkkkkkkKMd..
  ..dkkkkkkQrrrrQkkkkkkKMd..
  ..dkKKKKKKQQQQKKKKKKKKMd..
  ..dddddddddddddddddddddd..
  ..dwwkkkkkkkdwkkkkkkkKMd..
  ..dkkkkkkkkKdkkkkkkkKKMd..
  ..dKKKKKKKKKdkKKKKKKKMSd..
  ..dddddddddddddddddddddd..
  .dwwwwwwwwwwwwwwwwwwwwwkd.
  .dkkkkkkkkkkkkkkkkkkkkKMd.
  .dKKKKKKKKKKKKKKKKKKKKMSd.
  .ddddddddddddddddddddddd..
`;

/** The fire in the altar's bowl: three flickers, drawn raw because it is light. */
const FIRE = [
  `
    ...YY...
    ..YYYy..
    ..YyHy..
    .YyHHyY.
    .yHHhHy.
    ..hHHh..
  `,
  `
    ....Y...
    ...YYy..
    ..YYHy..
    .yYHHyy.
    .yHhHHy.
    ..hHHh..
  `,
  `
    ..Y.....
    ..YYy...
    ..yYHy..
    .yYHHHy.
    .yHhhHy.
    ..hHHh..
  `,
];

// Rocks and trees -------------------------------------------------------------------------------

/** A boulder: rounded limestone lit on its top left, lichen and a crack. */
function boulder(w: number, h: number, parts: readonly [number, number, number, number][]): string {
  const isIn = lobes(parts.map(([x, y, rx, ry]) => ({ x, y, rx, ry })));
  const pic = shade(
    w,
    h,
    isIn,
    { outline: "d", dark: "M", mid: "K", light: "k", glint: "w" },
    {
      light: 2,
      dark: 2,
    },
  );
  // A crack and lichen.
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (pic.at(x, y) !== "K") continue;
      if ((x * 7 + y * 13) % 29 === 0 && pic.at(x + 1, y + 1) === "K")
        pic.set(x, y, "v").set(x + 1, y + 1, "v");
      else if ((x * 5 + y * 3) % 31 === 0 && pic.at(x + 1, y) === "K")
        pic.set(x, y, "l").set(x + 1, y, "l");
    }
  return finish(pic, "d", "K");
}

const CY_W = 20;
const CY_H = 60;

/**
 * A cypress: a dark flame of a tree, narrow and tall, built of overlapping tufts lit on their
 * west sides, each lower tuft in front of the one above it. The tip sways a pixel.
 */
function cypressCrown(sway: number): string {
  const pic = Pic.blank(CY_W, CY_H);
  const cx = 9.5;
  const base = CY_H - 5;
  /** Half-width of the tree's profile at height t (0 at the foot, 1 at the tip). */
  const profile = (t: number) =>
    1.2 + 6.4 * Math.sin(Math.min(1, t * 1.15 + 0.5) * Math.PI * 0.6) * (1 - t ** 3);
  const tufts: { x: number; y: number; rx: number; ry: number }[] = [];
  for (let k = 0; k < 15; k++) {
    const t = 1 - k / 14;
    const y = base - 2 - t * (base - 5);
    const side = k % 2 ? 1 : -1;
    const r = profile(t);
    tufts.push({
      x: cx + side * r * 0.32 + sway * t * 1.4,
      y,
      rx: r * 0.8,
      ry: 2.6 + r * 0.42,
    });
  }
  const ink = { outline: "f", dark: "z", mid: "N", light: "n" };
  for (const tuft of tufts) {
    const isIn = lobes([tuft]);
    const c = shade(CY_W, CY_H, isIn, ink, { light: 2, dark: 2 });
    for (let y = 0; y < CY_H; y++) {
      for (let x = 0; x < CY_W; x++) {
        let ch = c.at(x, y) as string;
        if (ch === ".") continue;
        // Over a tuft behind, the upper edge stays foliage instead of outline.
        if (ch === "f" && pic.at(x, y) !== "." && !isIn(x, y - 1)) ch = "N";
        pic.set(x, y, ch);
      }
    }
  }
  return finish(smooth(pic), "f", "N");
}

const CYPRESS_TRUNK = `
  ...dd...
  ..dbbd..
  ..dbud..
  .dbbudd.
  dbbbuubd
  .dddddd.
`;

// The shore ---------------------------------------------------------------------------------------

/**
 * A fishing boat pulled up on the beach, bow to the west with an eye painted on it to see the
 * way home, a blue hull with a red line, the oars shipped inside.
 */
function boat(): string {
  const W = 50;
  const H = 22;
  const pic = Pic.blank(W, H);
  const outer = (x: number, y: number) => {
    const u = (x - 25) / 24;
    const half =
      7.2 * Math.sqrt(Math.max(0, 1 - Math.abs(u) ** 2.2)) * (u < 0 ? 1 - (-u) ** 3 * 0.4 : 1);
    return Math.abs(y - 9) <= half;
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!outer(x, y)) continue;
      const inner = outer(x - 2, y) && outer(x + 2, y) && outer(x, y - 2) && outer(x, y + 3);
      if (inner) pic.set(x, y, x % 8 === 0 ? "u" : y % 3 === 0 ? "U" : "e");
      else pic.set(x, y, y < 9 ? "U" : "e");
    }
  }
  // The hull's outer side below the gunwale, painted.
  for (let x = 0; x < W; x++) {
    let bottom = -1;
    for (let y = H - 1; y >= 0; y--)
      if (pic.at(x, y) !== ".") {
        bottom = y;
        break;
      }
    if (bottom < 0) continue;
    for (let k = 1; k <= 5 && bottom + k < H; k++) {
      const ch = k === 1 ? "H" : k === 2 ? "h" : k < 5 ? "I" : "i";
      if (outer(x, bottom - 3) || x > 3) pic.set(x, bottom + k - 1 + 1, ch);
    }
  }
  // Thwarts and oars.
  for (const tx of [16, 28, 38])
    for (let y = 4; y < 14; y++)
      if (pic.at(tx, y) === "e" || pic.at(tx, y) === "U") pic.set(tx, y, "b").set(tx + 1, y, "u");
  for (let x = 12; x < 44; x++) if (pic.at(x, 7) !== ".") pic.set(x, 7, "u");
  // The eye on the bow.
  pic.put("kkk\nkjk\nkkk", 5, 12);
  return finish(pic, "B", "e", "j");
}

/** Nets drying between two poles, sagging, with cork floats along the head line. */
function nets(): string {
  const W = 34;
  const H = 28;
  const pic = Pic.blank(W, H);
  const sag = (x: number) => 6 + Math.round(4 * Math.sin(((x - 3) / 28) * Math.PI));
  for (let x = 3; x <= 30; x++) {
    const top = sag(x);
    for (let y = top; y < Math.min(H - 3, top + 14 - Math.abs(x - 16) / 4); y++) {
      const diamond = (x + y) % 4 === 0 || (x - y + 64) % 4 === 0;
      if (diamond) pic.set(x, y, y > top + 8 ? "u" : "U");
    }
    if (x % 5 === 0) pic.put("RR\nrR", x - 1, top - 1);
  }
  for (const px of [2, 31]) {
    for (let y = 2; y < H - 1; y++)
      pic
        .set(px, y, "u")
        .set(px - 1, y, "U")
        .set(px + 1, y, "b");
  }
  return tidy(pic, "U").toString();
}

// Survey, tracks, threshing floor -----------------------------------------------------------------

/** 아리스타르코스's gnomon: a bronze rod on a stone foot, set to read the sun. */
const GNOMON = `
  ..dd...
  .dygd..
  .dygd..
  .dygd..
  .dygd..
  .dygd..
  .dygd..
  .dygd..
  .dygd..
  .dygd..
  .dygd..
  .dygd..
  .dygd..
  .dygd..
  .dygd..
  .dygd..
  dddddd.
  dwkkKd.
  dKKKMd.
  dddddd.
`;

/** A survey stake with a red rag, and the cord pegged along a shadow. */
const STAKE = `
  .BB.
  BhHB
  BHhB
  BUbB
  BUbB
  BUbB
  .BB.
`;

/**
 * Tortoise tracks in the dust: four feet and a dragged tail, going on and on. Drawn in shadow
 * colours, flat, for the details layer.
 */
const TRACKS = {
  h: `
    MM.....MM.......
    ..vvvvvvvvvvvvvv
    ....MM.....MM...
  `,
  d: `
    MM.......
    .vv..MM..
    ..vv.....
    MM.vv....
    ....vv...
    ..MM.vv.M
    ......vvM
  `,
};

/**
 * A threshing floor: a round of flat stones laid in rings around a post hole, bordered by a kerb
 * of upright slabs. Flat, for the details layer, so a fight runs right across it.
 */
function threshing(): string {
  const W = 104;
  const H = 66;
  const pic = Pic.blank(W, H);
  const cx = 51.5;
  const cy = 32.5;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = (x - cx) / 51;
      const dy = (y - cy) / 32;
      const r = Math.hypot(dx, dy);
      if (r > 1) continue;
      const a = Math.atan2(dy, dx);
      if (r > 0.9) {
        // The kerb: upright slabs, lit on top, joints between.
        const seg = Math.floor(((a + Math.PI) / (2 * Math.PI)) * 40);
        const joint = Math.abs(((a + Math.PI) / (2 * Math.PI)) * 40 - seg - 0.5) > 0.42;
        pic.set(x, y, joint ? "M" : r > 0.96 ? (dy > 0 ? "v" : "K") : "k");
        continue;
      }
      const ring = Math.floor(r * 6);
      const spokes = 8 + ring * 6;
      const t = ((a + Math.PI) / (2 * Math.PI)) * spokes;
      const rJoint = Math.abs(r * 6 - ring - 0.5) > 0.44;
      const aJoint = Math.abs(t - Math.floor(t) - 0.5) > 0.45;
      if (r < 0.06) pic.set(x, y, "S");
      else pic.set(x, y, rJoint || aJoint ? "v" : (Math.floor(t) + ring) % 3 === 0 ? "K" : "k");
    }
  }
  return smooth(pic).toString();
}

// Shore animation ---------------------------------------------------------------------------------

/** A wavelet of foam sliding up the beach and back, in three frames. Raw sea colours. */
const SURF = [
  `
    ....qqqqqq....
    ..qq......qq..
  `,
  `
    ..qqqqqqqqqq..
    qq..........qq
  `,
  `
    ...qqq..qqq...
    .qq...qq...qq.
  `,
];

export default [
  one("entablature", [88, COL_H + 2], entablature(), { origin: [42, COL_H + 1] }),
  sprite({
    name: "shaft-fallen",
    size: [52, 14],
    palette,
    shadow: oval(52, 14, 27, 12, 25, 2.2),
    frames: { whole: shaftFallen(false), snapped: shaftFallen(true) },
    anim: { idle: { frames: ["whole"], fps: 1 } },
  }),
  one("capital-fallen", [20, 13], finish(Pic.of(CAPITAL_FALLEN), "d", "k"), {
    shadow: oval(20, 13, 10.5, 12, 10, 1.4),
  }),
  sprite({
    name: "column-stump",
    size: [20, 30],
    palette,
    shadow: oval(20, 30, 11, 29, 10.5, 1.8),
    frames: { low: stump(false), high: stump(true) },
    anim: { idle: { frames: ["low"], fps: 1 } },
  }),
  one("statue", [18, 39], statue(), { shadow: oval(18, 39, 9.5, 38, 9.5, 1.6) }),
  one("statue-head", [8, 6], finish(Pic.of(STATUE_HEAD), "d", "k")),
  one("herm", [12, 31], herm(), {
    lone: "d",
    shadow: oval(12, 31, 6.5, 30, 6, 1.4),
  }),
  one("altar", [26, 14], finish(Pic.of(ALTAR), "d", "k", "Qr"), {
    shadow: oval(26, 14, 13, 13, 12.5, 1.6),
  }),
  sprite({
    name: "altar-fire",
    size: [8, 6],
    palette,
    outline: false,
    lone: "Yh",
    frames: Object.fromEntries(FIRE.map((g, i) => [`burn${i}`, g])),
    anim: { burn: { frames: FIRE.map((_, i) => `burn${i}`), fps: 7 } },
  }),
  one(
    "boulder",
    [18, 14],
    boulder(18, 14, [
      [8, 8, 7.5, 5.2],
      [12, 6, 4.5, 3.8],
    ]),
    { shadow: oval(18, 14, 9.5, 12, 8.5, 1.8) },
  ),
  one(
    "boulder-big",
    [34, 22],
    boulder(34, 22, [
      [15, 13, 13.5, 8],
      [22, 9, 9, 6.5],
      [9, 11, 6.5, 5.5],
    ]),
    { shadow: oval(34, 22, 17.5, 20, 16, 2.4) },
  ),
  one("cypress", [8, 6], finish(Pic.of(CYPRESS_TRUNK), "B", "b"), {
    shadow: oval(8, 6, 4.5, 5, 6, 1.6),
  }),
  sprite({
    name: "cypress-crown",
    size: [CY_W, CY_H],
    origin: [10, CY_H - 1],
    palette,
    frames: { sway0: cypressCrown(0), sway1: cypressCrown(1) },
    anim: { sway: { frames: ["sway0", "sway1"], fps: 1.2 } },
  }),
  one("boat", [50, 22], boat(), {
    lone: "j",
    shadow: oval(50, 22, 25, 19, 24, 2.6),
  }),
  one("nets", [34, 28], nets(), { outline: false, shadow: oval(34, 28, 17, 26, 15, 1.8) }),
  one("gnomon", [7, 20], finish(Pic.of(GNOMON), "d", "k", "yg"), {
    shadow: oval(7, 20, 3, 19, 3, 1.2),
  }),
  one("stake", [4, 7], finish(Pic.of(STAKE), "B", "U", "hH")),
  sprite({
    name: "tracks",
    size: [16, 7],
    palette,
    outline: false,
    frames: {
      h: Pic.blank(16, 7).put(TRACKS.h, 0, 2).toString(),
      d: Pic.blank(16, 7).put(TRACKS.d, 3, 0).toString(),
    },
    anim: { idle: { frames: ["h"], fps: 1 } },
  }),
  sprite({
    name: "threshing",
    size: [104, 66],
    origin: [52, 33],
    palette,
    outline: false,
    frames: { still: threshing() },
    anim: { idle: { frames: ["still"], fps: 1 } },
  }),
  sprite({
    name: "surf",
    size: [14, 2],
    palette: { ".": null, q: "sea.pale" },
    outline: false,
    frames: Object.fromEntries(SURF.map((g, i) => [`lap${i}`, g])),
    anim: { lap: { frames: SURF.map((_, i) => `lap${i}`), fps: 3, jump: 1 } },
  }),
];
