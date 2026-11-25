import { type Legend, sprite } from "../../format.ts";
import { clean, ellipse, light, line, Parts, Pic, poly, rect, seal, silhouette } from "./kit.ts";

/**
 * 제논, mid boss of Page 1: the pupil who defends his teacher's One with questions that halve
 * every distance. Polite, patient and faintly amused; he never hurries and has never once been
 * reached. He stands bolt upright with his hands folded in his sleeves, a sea-blue himation over
 * white linen, short curls and a trimmed beard, and he does not touch the ground: below the knee
 * his robe is cut into bands, each half as tall as the one above and half as far from the next,
 * converging on a floor they never meet. Beside him the arrow of his paradox hangs in the air,
 * pointed at whoever is talking to him, motionless at every instant.
 *
 * - `idle`: perfectly still; the bands breathe, a blink, the polite tilt of a question.
 * - `retreat`: the halving step back. The bands spread, his palm comes up: one moment, please.
 * - `arrow`: he lifts two fingers, the arrow turns white at every instant, then is simply
 *   somewhere else. The ground telegraph is `p1-arrow-path`.
 * - `halve`: hands part, the bands flare, a ring of the dichotomy goes out. Ground: `p1-ring-*`.
 * - `hit`, and `freed`: the bands close one by one, the hem comes down, and his feet touch the
 *   ground for the first time. He looks down at them.
 */

const palette: Legend = {
  ".": null,
  Q: "sea.deep",
  b: "sea.dark",
  c: "sea.mid",
  l: "sea.light",
  L: "sea.pale",
  G: "stone.deep",
  g: "stone.mid",
  q: "stone.light",
  p: "stone.pale",
  w: "stone.bright",
  O: "flesh.deep",
  k: "flesh.dark",
  s: "flesh.mid",
  S: "flesh.light",
  y: "flesh.pale",
  X: "ink.deep",
  x: "ink.dark",
  h: "ink.mid",
  H: "ink.light",
  W: "wood.deep",
  o: "wood.mid",
  D: "gold.deep",
  a: "gold.mid",
  A: "gold.light",
  // Lone marks.
  e: "ink.deep",
  "^": "stone.bright",
  m: "flesh.deep",
  "!": "gold.light",
  "+": "stone.bright",
  "~": "sea.light",
  ",": "sea.mid",
};
const lone = "e^m!+~,";

const W = 64;
const H = 64;
const lib = new Parts();

// Head: 20 wide, 17 tall, at [22, 1]. --------------------------------------------------------

const HEAD = `
  .......XXXXXX.......
  .....XXhhHHhhXX.....
  ....XhhHHhhhhhhX....
  ...XhHhhxhhhxhhhX...
  ..XhhhxhhhxhhhxhhX..
  ..XhxhSShSSShShhxX..
  .XhxSSSSSSSSSSSShxX.
  .XhSSSySSSSSSSSSkxX.
  .XhSSSSSSSSSSSSSkxX.
  .XSSSSSSSSSSSSSSSkX.
  .XSSSSSSSSSSSSSSSkX.
  .XSSSSSSSSSSSSSSkkX.
  ..XSSSSSSkkSSSSSkX..
  ..XxSSSSSSSSSSSSxX..
  ...XxxSSSSSSSSxxX...
  ....XxxxxxxxxxxX....
  .....XXXXXXXXXX.....
`;
/** Eyes on head rows 9 and 10, mouth on row 14 (in the beard). */
const FACES: Record<string, string> = {
  calm: `
    .....ee......ee.....
    .....e^......e^.....
    ....................
    ....................
    ....................
    ........mmmm........
  `,
  blink: `
    ....................
    .....ee......ee.....
    ....................
    ....................
    ....................
    ........mmmm........
  `,
  ask: `
    .....ee......ee.....
    .....e^......e^.....
    ....................
    ....................
    ....................
    .........mmm........
  `,
  sharp: `
    ....................
    .....ee......ee.....
    .....ee......ee.....
    ....................
    ....................
    ........mmmm........
  `,
  wide: `
    .....ee......ee.....
    .....e^......e^.....
    .....ee......ee.....
    ....................
    .........mm.........
    .........mm.........
  `,
  down: `
    ....................
    ....................
    .....ee......ee.....
    ....................
    .......m....m.......
    ........mmmm........
  `,
};
lib.add("head", 22, 1, HEAD);
for (const [k, g] of Object.entries(FACES)) lib.add(`face-${k}`, 22, 10, g);
/** Brows raised for a question. */
lib.add("brows", 26, 7, "eee......eee");

// Robe -----------------------------------------------------------------------------------------

const ROBE_LIGHT = { line: "Q", dark: "Q", mid: "b", light: "c" } as const;

/**
 * Linen chiton under a sea-blue himation: the himation over his left shoulder and round the
 * waist, the chiton showing at the right shoulder, the forearms crossed in the sleeves.
 */
function robe(): Pic {
  const p = Pic.blank(W, H);
  const outline: [number, number][] = [
    [26, 17],
    [38, 17],
    [41, 21],
    [43, 42],
    [20, 42],
    [22, 21],
  ];
  poly(p, outline, "p");
  poly(
    p,
    [
      [31, 17],
      [38, 17],
      [41, 21],
      [43, 42],
      [20, 42],
      [21, 31],
    ],
    "b",
  );
  let lit = light(p, "p", { line: "G", dark: "q", mid: "p", light: "w" }, { light: 2, dark: 1 });
  lit = light(lit, "b", { line: "Q", dark: "Q", mid: "b", light: "c" }, { light: 2, dark: 1 });
  // The rolled edge of the himation, falling from the shoulder across the chest.
  line(lit, 31, 18, 21, 31, "l");
  line(lit, 32, 18, 22, 31, "c");
  // Forearms crossed inside the sleeves.
  rect(lit, 23, 28, 18, 4, "c");
  rect(lit, 24, 28, 16, 1, "l");
  rect(lit, 24, 32, 16, 1, "Q");
  line(lit, 31, 28, 32, 31, "Q");
  line(lit, 33, 28, 34, 31, "b");
  // Long folds to the knee.
  line(lit, 26, 33, 25, 41, "c");
  line(lit, 27, 33, 26, 41, "Q");
  line(lit, 34, 33, 35, 41, "Q");
  line(lit, 38, 33, 40, 41, "Q");
  line(lit, 30, 34, 30, 41, "c");
  // A pale border along the hem.
  rect(lit, 21, 40, 22, 1, "L");
  return seal(lit, { p: "G", w: "G", q: "G", b: "Q", c: "Q", l: "Q", L: "Q" }, lone);
}
lib.add("robe", 0, 0, robe());

/** Hem bands: each half as tall as the last, half as far apart, never reaching the floor. */
function bands(spread: number, shrink = 0): Pic {
  const p = Pic.blank(W, H);
  let y = 43 + spread;
  const heights = [6, 3, 2, 1, 1];
  heights.forEach((hgt, i) => {
    const inset = i + shrink;
    for (let k = 0; k < hgt; k++) rect(p, 21 + inset, y + k, 23 - 2 * inset, 1, "b");
    y += hgt + Math.max(1, (2 >> i) + spread);
  });
  return seal(light(p, "b", ROBE_LIGHT, { light: 1, dark: 1 }), { b: "Q", c: "Q" }, lone);
}
lib.add("bands", 0, 0, bands(0));
lib.add("bands-breathe", 0, 0, bands(0, 1));
lib.add("bands-spread", 0, 0, bands(1));
lib.add("bands-flare", 0, 0, bands(2));

/** The freed hem: the bands drawn together into cloth, then the cloth to the floor. */
function hem(to: number): Pic {
  const p = Pic.blank(W, H);
  poly(
    p,
    [
      [20, 40],
      [43, 40],
      [44, to],
      [19, to],
    ],
    "b",
  );
  const lit = light(p, "b", ROBE_LIGHT, { light: 2, dark: 1 });
  line(lit, 26, 41, 25, to - 2, "c");
  line(lit, 35, 41, 36, to - 2, "Q");
  rect(lit, 20, to - 2, 24, 1, "L");
  return seal(lit, { b: "Q", c: "Q", L: "Q" }, lone);
}
lib.add("hem-half", 0, 0, hem(51));
lib.add("hem-full", 0, 0, hem(60));
lib.add(
  "feet",
  22,
  59,
  `
  .OOOO.......OOOO.
  OkSSO.......OSSkO
  OOOOO.......OOOOO
`,
);

// Hands and the arrow --------------------------------------------------------------------------

/** One palm up out of the sleeve: one moment, please. */
lib.add(
  "palm",
  38,
  26,
  `
  ....OOO.
  ...OSSSO
  QQOSSSkO
  lcOOOOO.
  QQ......
`,
);
/** Two fingers raised beside the arrow: it is aimed. */
lib.add(
  "point",
  39,
  14,
  `
  ..O.O.
  .OSOSO
  .OSOSO
  .OSSSO
  .OkkSO
  ..OOO.
  .QccQ.
  .QcbQ.
  .QcbQ.
  .QcbQ.
  ..QQ..
`,
);
/** Both hands out of the sleeves, apart: the dichotomy. */
lib.add(
  "part-l",
  12,
  27,
  `
  .OOO.....
  OSSSOQQQQ
  OkSSOcccc
  .OOO.QQQQ
`,
);
lib.add(
  "part-r",
  42,
  27,
  `
  .....OOO.
  QQQQOSSSO
  bbbbOSSkO
  QQQQ.OOO.
`,
);

const ARROW = `
  GG...............D...
  .GwG.............DD..
  ..GwWWWWWWWWWWWWWD!DD
  .GwG.............DD..
  GG...............D...
`;
lib.add("arrow", 43, 9, ARROW);
lib.add("arrow-low", 43, 12, ARROW);
/** The arrow at the instant before it is somewhere else: white along its whole length. */
lib.add("arrow-hot", 43, 9, ARROW.replace(/[^.\s]/g, "+"));
/** Where the arrow was. */
lib.add(
  "arrow-gone",
  41,
  9,
  `
  .~.......,.......,.....
  .......................
  .~...,.......,......~..
  .......................
  .~.......,.......,.....
`,
);
/** The dichotomy leaving him: a half ring of light around the bands. */
lib.add(
  "pulse",
  12,
  40,
  `
  ..~~................................~~..
  .~....................................~.
  ~......................................~
  ~......................................~
  .~....................................~.
  ..~~................................~~..
  ....~~~~........................~~~~....
  ........~~~~~~~~~~~~~~~~~~~~~~~~........
`,
);
/** Struck: a puff of linen and sea-blue thread. */
lib.add(
  "threads",
  14,
  20,
  `
  ~..........................~.
  ..,......................,...
  .........................~...
  ,.............................
`,
);
/** Dust where his feet touch the ground for the first time. */
lib.add(
  "dust",
  14,
  58,
  `
  ..+....................+...
  .......+..........+........
  +..........................+
`,
);

// Frames ----------------------------------------------------------------------------------------

type Item = string | readonly [string, number, number];
const fig = (o: {
  dy?: number;
  dx?: number;
  face?: string;
  bands?: string;
  arms?: readonly Item[];
  arrow?: string | null;
  extra?: readonly Item[];
  brows?: boolean;
  tilt?: number;
}): Item[] => {
  const dx = o.dx ?? 0;
  const dy = o.dy ?? 0;
  const t = o.tilt ?? 0;
  const out: Item[] = [];
  out.push([o.bands ?? "bands", dx, 0]);
  out.push(["robe", dx, dy]);
  for (const a of o.arms ?? [])
    out.push(typeof a === "string" ? [a, dx, dy] : [a[0], a[1] + dx, a[2] + dy]);
  out.push(["head", dx + t, dy]);
  out.push([`face-${o.face ?? "calm"}`, dx + t, dy]);
  if (o.brows) out.push(["brows", dx + t, dy]);
  if (o.arrow !== null) out.push([o.arrow ?? "arrow", 0, 0]);
  for (const e of o.extra ?? []) out.push(e);
  return out;
};

const plan: Record<string, Item[]> = {
  idle0: fig({}),
  idle1: fig({ bands: "bands-breathe" }),
  idle2: fig({ face: "blink" }),
  idle3: fig({ face: "ask", brows: true, tilt: 1, bands: "bands-breathe" }),

  retreat0: fig({ face: "ask", brows: true, arms: ["palm"], bands: "bands-spread" }),
  retreat1: fig({ face: "calm", arms: [["palm", 0, -1]], bands: "bands-flare", dy: -1 }),
  retreat2: fig({ face: "ask", arms: ["palm"], bands: "bands-spread" }),

  arrow0: fig({ face: "sharp", arms: ["point"] }),
  arrow1: fig({ face: "sharp", arms: ["point"], arrow: "arrow-hot" }),
  arrow2: fig({ face: "calm", arms: [["point", 0, 1]], arrow: "arrow-gone" }),
  arrow3: fig({ face: "calm", arrow: "arrow-low" }),

  halve0: fig({ face: "blink", bands: "bands-breathe" }),
  halve1: fig({ face: "sharp", arms: ["part-l", "part-r"], bands: "bands-spread", dy: -1 }),
  halve2: fig({
    face: "sharp",
    arms: ["part-l", "part-r"],
    bands: "bands-flare",
    dy: -1,
    extra: ["pulse"],
  }),
  halve3: fig({ face: "calm", bands: "bands-spread" }),

  hit: fig({ face: "wide", dx: 1, bands: "bands-flare", arrow: "arrow-low", extra: ["threads"] }),

  freed0: fig({ face: "wide", bands: "bands-spread" }),
  freed1: fig({ face: "wide", bands: "hem-half", arrow: "arrow-low" }),
  freed2: fig({ face: "down", bands: "hem-full", arrow: null, extra: ["feet", "dust"], dy: 1 }),
  freed3: fig({
    face: "calm",
    bands: "hem-full",
    arrow: null,
    arms: ["palm"],
    extra: ["feet"],
    dy: 1,
  }),
};

const DEEP = "QGOXWD";
const DEEP_OF: Record<string, string> = {
  b: "Q",
  c: "Q",
  l: "Q",
  L: "Q",
  g: "G",
  q: "G",
  p: "G",
  w: "G",
  k: "O",
  s: "O",
  S: "O",
  y: "O",
  x: "X",
  h: "X",
  H: "X",
  o: "W",
  a: "D",
  A: "D",
};
const render = (list: readonly Item[]): string =>
  clean(seal(clean(lib.draw(W, H, list), lone, DEEP), DEEP_OF, lone), lone, DEEP).toString();
const frames = Object.fromEntries(Object.entries(plan).map(([k, v]) => [k, render(v)]));

/** No feet on the ground: only a faint ring where he would stand. */
const SHADOW = (() => {
  const p = Pic.blank(W, H);
  ellipse(p, 32, 61, 12, 2.6, "Q");
  return p.toString();
})();

/** Afterimages left at each half of the retreat: the figure in sea-blue, thinning out. */
const ghostPalette: Legend = { ".": null, "~": "sea.light", ",": "sea.mid" };
const ghost = (keep: number) => {
  const src = Pic.of(frames.idle0 as string);
  const p = Pic.blank(W, H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const ch = src.at(x, y) as string;
      if (ch === "." || lone.includes(ch)) continue;
      const edge = [src.at(x - 1, y), src.at(x + 1, y), src.at(x, y - 1), src.at(x, y + 1)].some(
        (n) => n === undefined || n === ".",
      );
      if (edge) {
        if ((x + y * 3) % 4 < keep) p.set(x, y, "~");
      } else if ((x + y) % (keep >= 3 ? 3 : 5) === 0 && (x * 7 + y) % 4 < keep) p.set(x, y, ",");
    }
  return p.toString();
};

export default [
  sprite({
    name: "boss-zeno",
    group: "page1-bosses",
    size: [W, H],
    palette,
    lone,
    shadow: SHADOW,
    frames,
    anim: {
      idle: {
        frames: [
          "idle0",
          "idle0",
          "idle1",
          "idle1",
          "idle0",
          "idle2",
          "idle0",
          "idle1",
          "idle3",
          "idle3",
          "idle3",
          "idle1",
        ],
        fps: 3,
      },
      retreat: { frames: ["retreat0", "retreat1", "retreat1", "retreat2"], fps: 10, loop: false },
      arrow: {
        frames: ["arrow0", "arrow0", "arrow1", "arrow1", "arrow1", "arrow2", "arrow3"],
        fps: 8,
        loop: false,
      },
      halve: {
        frames: ["halve0", "halve1", "halve1", "halve2", "halve2", "halve3"],
        fps: 8,
        loop: false,
      },
      hit: { frames: ["hit"], fps: 1, loop: false },
      freed: {
        frames: ["freed0", "freed0", "freed1", "freed1", "freed2", "freed2", "freed2", "freed3"],
        fps: 3,
        loop: false,
        jump: 0.5,
      },
    },
  }),
  sprite({
    name: "boss-zeno-ghost",
    group: "page1-bosses",
    size: [W, H],
    palette: ghostPalette,
    lone,
    outline: false,
    frames: { fade0: ghost(4), fade1: ghost(2), fade2: ghost(1) },
    anim: { fade: { frames: ["fade0", "fade1", "fade2"], fps: 8, loop: false, jump: 1 } },
  }),
  sprite({
    name: "boss-zeno-drain",
    group: "page1-bosses",
    size: [W, H],
    palette: silhouette(palette, "ink.deep"),
    frames: { drain: frames.idle0 as string },
    anim: { drain: { frames: ["drain"], fps: 1 } },
  }),
];
