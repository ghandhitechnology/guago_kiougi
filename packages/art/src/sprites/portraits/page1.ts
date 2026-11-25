import type { Vec } from "../../format.ts";
import { type Legend, sprite } from "../../format.ts";
import { clean, ellipse, light, line, Pic, poly, rect, seal } from "../bosses/kit.ts";

/**
 * Page 1 in dialogue: the three bosses, 아리스토텔레스 once freed, and the ally who was right.
 * Frame names are the face ids the narrative uses for each speaker, plus `neutral` and a blink
 * for the idle loop.
 *
 * - `portrait-aristotle`: certain, heavy-browed, mid-lecture. `neutral`, `lecture`, `stunned`.
 * - `portrait-aristotle-freed`: the same face, unclenched, the 방과후 강사 lanyard at his chest.
 *   `neutral`, `curious`.
 * - `portrait-zeno`: polite and maddening, the arrow at his shoulder. `neutral`, and `arrived`
 *   for the first time he says 도착.
 * - `portrait-pythagoreans`: the speaker with two of the ten behind him. `chorus`, all chanting
 *   with eyes shut; `one`, the speaker alone with his eyes open and the others gone.
 * - `portrait-aristarchus`: sun hat, squint lines, an easy half smile. `neutral`, and `measure`
 *   with the stick up to his eye.
 */

const palette: Legend = {
  ".": null,
  O: "flesh.deep",
  k: "flesh.dark",
  s: "flesh.mid",
  S: "flesh.light",
  y: "flesh.pale",
  X: "ink.deep",
  x: "ink.dark",
  h: "ink.mid",
  H: "ink.light",
  G: "stone.deep",
  g: "stone.mid",
  q: "stone.light",
  p: "stone.pale",
  w: "stone.bright",
  K: "plum.deep",
  P: "plum.dark",
  Q: "plum.mid",
  Y: "plum.light",
  D: "gold.deep",
  a: "gold.mid",
  A: "gold.light",
  N: "sea.deep",
  n: "sea.dark",
  b: "sea.mid",
  l: "sea.light",
  T: "clay.deep",
  t: "clay.dark",
  u: "clay.mid",
  U: "clay.light",
  z: "clay.pale",
  W: "wood.deep",
  c: "wood.mid",
  C: "wood.light",
  R: "red.deep",
  m: "red.mid",
  // Lone marks: eyes, glints, mouths, blush.
  e: "ink.deep",
  "^": "stone.bright",
  "'": "flesh.dark",
  "~": "rose.light",
};
const lone = "e^'~";
const DEEP = "OXGKDNTWR";
const DEEP_OF: Record<string, string> = {
  k: "O",
  s: "O",
  S: "O",
  y: "O",
  x: "X",
  h: "X",
  H: "X",
  g: "G",
  q: "G",
  p: "G",
  w: "G",
  P: "K",
  Q: "K",
  Y: "K",
  a: "D",
  A: "D",
  n: "N",
  b: "N",
  l: "N",
  t: "T",
  u: "T",
  U: "T",
  z: "T",
  c: "W",
  C: "W",
  m: "R",
};
const finish = (p: Pic): string =>
  clean(seal(clean(p, lone, DEEP), DEEP_OF, lone), lone, DEEP).toString();
const S = 48;
const SKIN = { line: "O", dark: "k", mid: "s", light: "S" } as const;

type Ramp = readonly [deep: string, dark: string, mid: string, light: string];
const PLUM: Ramp = ["K", "P", "Q", "Y"];
const SEA: Ramp = ["N", "n", "b", "l"];
const LINEN: Ramp = ["G", "q", "p", "w"];
const OCHRE: Ramp = ["T", "u", "U", "z"];
const GREY: Ramp = ["X", "h", "H", "g"];
const DARK: Ramp = ["X", "x", "h", "H"];
const BROWN: Ramp = ["W", "W", "c", "C"];
const lit = (r: Ramp) => ({ line: r[0], dark: r[1], mid: r[2], light: r[3] });
/** Hair and beards take no inner outline: they meet the face in shade, not in a drawn line. */
const soft = (r: Ramp) => ({ dark: r[1], mid: r[2], light: r[3] });

/** Shoulders and chest: a garment in one ramp, optionally a second over one shoulder. */
function bust(p: Pic, base: Ramp, drape?: Ramp, trim = false): void {
  const b = Pic.blank(S, S);
  poly(
    b,
    [
      [1, 48],
      [4, 40],
      [12, 36],
      [36, 36],
      [44, 40],
      [47, 48],
    ],
    base[2],
  );
  p.put(light(b, base[2], lit(base), { light: 3, dark: 2 }), 0, 0);
  if (drape) {
    const d = Pic.blank(S, S);
    poly(
      d,
      [
        [26, 36],
        [36, 36],
        [44, 40],
        [47, 48],
        [8, 48],
      ],
      drape[2],
    );
    const dl = light(d, drape[2], lit(drape), { light: 3, dark: 2 });
    if (trim) {
      line(dl, 26, 36, 8, 47, "A");
      line(dl, 27, 36, 9, 47, "D");
      line(dl, 28, 36, 10, 47, "a");
    }
    p.put(dl, 0, 0);
  }
}

/** Neck, face and ears lit from the top left. */
function face(p: Pic, wide = 0): void {
  const f = Pic.blank(S, S);
  rect(f, 19, 30, 10, 8, "s");
  ellipse(f, 24, 20, 12.5 + wide, 13.5, "s");
  ellipse(f, 11 - wide, 22, 2.5, 3.5, "s");
  ellipse(f, 37 + wide, 22, 2.5, 3.5, "s");
  p.put(light(f, "s", SKIN, { light: 3, dark: 3 }), 0, 0);
  // Nose.
  rect(p, 24, 22, 1, 4, "S");
  rect(p, 25, 23, 1, 3, "k");
  rect(p, 23, 26, 3, 1, "k");
}

/** Hair as a lit mass from a mask: inside the cap ellipse, outside the face's bare part. */
function hair(
  p: Pic,
  r: Ramp,
  keep: (x: number, y: number) => boolean,
  cap: [number, number, number, number],
): void {
  const h = Pic.blank(S, S);
  ellipse(h, cap[0], cap[1], cap[2], cap[3], r[2]);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) if (h.at(x, y) !== "." && !keep(x, y)) h.set(x, y, ".");
  p.put(light(h, r[2], soft(r), { light: 2, dark: 2 }), 0, 0);
}
function beard(p: Pic, r: Ramp, pts: readonly Vec[]): void {
  const b = Pic.blank(S, S);
  poly(b, pts, r[2]);
  p.put(light(b, r[2], soft(r), { light: 1, dark: 3 }), 0, 0);
}
/** Little curl marks on a mass of hair. */
function curls(p: Pic, r: Ramp, spots: readonly Vec[]): void {
  for (const [x, y] of spots) {
    if (p.at(x, y) !== r[2] && p.at(x, y) !== r[1]) continue;
    p.set(x, y, r[3]);
    p.set(x + 1, y, r[3]);
    p.set(x + 1, y + 1, r[1]);
    p.set(x + 2, y + 1, r[1]);
  }
}

type Mark = readonly [x: number, y: number, w: number, h: number, ch: string];
function marks(p: Pic, list: readonly Mark[]): Pic {
  const out = p.clone();
  for (const [x, y, w, h, ch] of list) rect(out, x, y, w, h, ch);
  return out;
}

// 아리스토텔레스 ---------------------------------------------------------------------------------

function aristotleBase(freed: boolean): Pic {
  const p = Pic.blank(S, S);
  bust(p, LINEN, PLUM, true);
  if (freed) {
    // The lanyard he wears like a chain of office.
    line(p, 17, 37, 22, 44, "m");
    line(p, 31, 37, 26, 44, "m");
    rect(p, 21, 43, 7, 5, "w");
    rect(p, 21, 43, 7, 1, "G");
    rect(p, 23, 45, 3, 1, "x");
  }
  face(p, 1);
  hair(
    p,
    GREY,
    (x, y) => {
      const dx = Math.abs(x + 0.5 - 24);
      const line = dx < 3 ? 10 : dx < 8 ? 8 : dx < 11 ? 12 : 22;
      return y < line || (dx > 13 && y < 22);
    },
    [24, 17, 15, 14],
  );
  beard(p, GREY, [
    [11, 22],
    [14, 28],
    [19, 30],
    [29, 30],
    [34, 28],
    [37, 22],
    [37, 31],
    [34, 39],
    [30, 43],
    [18, 43],
    [14, 39],
    [11, 31],
  ]);
  curls(p, GREY, [
    [14, 5],
    [20, 3],
    [27, 3],
    [33, 6],
    [11, 11],
    [36, 12],
    [15, 35],
    [21, 37],
    [27, 37],
    [32, 35],
    [18, 41],
    [25, 41],
    [12, 31],
    [35, 31],
  ]);
  // Mustache.
  rect(p, 18, 30, 12, 1, "H");
  rect(p, 17, 31, 14, 1, "g");
  return p;
}
const ARI_FACES: Record<string, readonly Mark[]> = {
  neutral: [
    [15, 16, 7, 2, "x"],
    [27, 16, 7, 2, "x"],
    [17, 20, 5, 1, "X"],
    [27, 20, 5, 1, "X"],
    [18, 21, 3, 1, "e"],
    [28, 21, 3, 1, "e"],
    [21, 33, 7, 1, "e"],
  ],
  blink: [
    [15, 16, 7, 2, "x"],
    [27, 16, 7, 2, "x"],
    [17, 21, 5, 1, "X"],
    [27, 21, 5, 1, "X"],
    [21, 33, 7, 1, "e"],
  ],
  lecture: [
    [15, 13, 7, 2, "x"],
    [27, 16, 7, 2, "x"],
    [17, 19, 5, 1, "X"],
    [27, 20, 5, 1, "X"],
    [18, 20, 3, 2, "e"],
    [28, 21, 3, 2, "e"],
    [20, 20, 1, 1, "^"],
    [30, 21, 1, 1, "^"],
    [20, 32, 9, 3, "e"],
    [22, 35, 5, 1, "e"],
  ],
  stunned: [
    [15, 12, 7, 2, "x"],
    [27, 12, 7, 2, "x"],
    [16, 18, 6, 5, "e"],
    [27, 18, 6, 5, "e"],
    [17, 19, 4, 3, "w"],
    [28, 19, 4, 3, "w"],
    [18, 20, 2, 1, "e"],
    [29, 20, 2, 1, "e"],
    [22, 32, 5, 4, "e"],
  ],
  curious: [
    [15, 14, 7, 2, "x"],
    [27, 14, 7, 2, "x"],
    [18, 19, 3, 3, "e"],
    [28, 19, 3, 3, "e"],
    [20, 19, 1, 1, "^"],
    [30, 19, 1, 1, "^"],
    [20, 32, 1, 1, "e"],
    [21, 33, 7, 1, "e"],
    [28, 32, 1, 1, "e"],
    [14, 25, 2, 1, "~"],
    [33, 25, 2, 1, "~"],
  ],
};

// 제논 ----------------------------------------------------------------------------------------------

function zenoBase(): Pic {
  const p = Pic.blank(S, S);
  bust(p, LINEN, SEA);
  // The arrow, hanging at his shoulder, pointed at whoever he is talking to.
  line(p, 30, 40, 47, 40, "W");
  rect(p, 27, 38, 3, 1, "q");
  rect(p, 27, 42, 3, 1, "q");
  rect(p, 28, 39, 2, 3, "p");
  face(p);
  hair(
    p,
    DARK,
    (x, y) => {
      const dx = Math.abs(x + 0.5 - 24);
      return y < 9 + (dx > 9 ? 4 : 0) || (dx > 12.5 && y < 20);
    },
    [24, 15, 15, 12],
  );
  curls(p, DARK, [
    [15, 4],
    [21, 3],
    [27, 3],
    [32, 5],
    [12, 9],
    [36, 10],
    [18, 7],
    [29, 7],
  ]);
  beard(p, DARK, [
    [12, 24],
    [15, 29],
    [20, 31],
    [28, 31],
    [33, 29],
    [36, 24],
    [36, 30],
    [33, 35],
    [27, 37],
    [21, 37],
    [15, 35],
    [12, 30],
  ]);
  return p;
}
const ZENO_FACES: Record<string, readonly Mark[]> = {
  // Brows lifted a little: a polite question is always on the way.
  neutral: [
    [16, 15, 6, 1, "x"],
    [27, 15, 6, 1, "x"],
    [18, 19, 3, 3, "e"],
    [28, 19, 3, 3, "e"],
    [20, 19, 1, 1, "^"],
    [30, 19, 1, 1, "^"],
    [21, 34, 6, 1, "e"],
    [27, 33, 1, 1, "e"],
  ],
  blink: [
    [16, 15, 6, 1, "x"],
    [27, 15, 6, 1, "x"],
    [18, 21, 3, 1, "e"],
    [28, 21, 3, 1, "e"],
    [21, 34, 6, 1, "e"],
    [27, 33, 1, 1, "e"],
  ],
  arrived: [
    [16, 16, 6, 1, "x"],
    [27, 16, 6, 1, "x"],
    [18, 20, 3, 1, "e"],
    [28, 20, 3, 1, "e"],
    [17, 19, 1, 1, "e"],
    [31, 19, 1, 1, "e"],
    [20, 33, 1, 1, "e"],
    [21, 34, 7, 1, "e"],
    [28, 33, 1, 1, "e"],
    [14, 25, 2, 1, "~"],
    [33, 25, 2, 1, "~"],
  ],
};

// 피타고라스 학파 -----------------------------------------------------------------------------------

function memberBehind(p: Pic, dx: number): void {
  // A chorus member behind the speaker: head and fillet, white shoulder.
  const m = Pic.blank(S, S);
  ellipse(m, 24 + dx, 20, 9, 10, "s");
  const ml = light(m, "s", SKIN, { light: 1, dark: 3 });
  const h = Pic.blank(S, S);
  ellipse(h, 24 + dx, 17, 10.5, 10, "h");
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++)
      if (h.at(x, y) !== "." && y > 12 && Math.abs(x - 24 - dx) < 8) h.set(x, y, ".");
  ml.put(light(h, "h", lit(DARK), { light: 1, dark: 2 }), 0, 0);
  rect(ml, 15 + dx, 11, 18, 2, "p");
  rect(ml, 19 + dx, 19, 3, 1, "e");
  rect(ml, 27 + dx, 19, 3, 1, "e");
  rect(ml, 23 + dx, 24, 2, 2, "e");
  const b = Pic.blank(S, S);
  poly(
    b,
    [
      [12 + dx, 48],
      [16 + dx, 31],
      [32 + dx, 31],
      [36 + dx, 48],
    ],
    "p",
  );
  ml.put(light(b, "p", lit(LINEN), { light: 1, dark: 2 }), 0, 0);
  p.put(ml, 0, 0);
}
function pythagoreanBase(chorus: boolean): Pic {
  const p = Pic.blank(S, S);
  if (chorus) {
    memberBehind(p, -17);
    memberBehind(p, 17);
  }
  bust(p, LINEN);
  rect(p, 4, 46, 40, 2, "a");
  face(p);
  hair(
    p,
    DARK,
    (x, y) => {
      const dx = Math.abs(x + 0.5 - 24);
      return y < 10 || (dx > 12 && y < 34);
    },
    [24, 18, 15.5, 17],
  );
  // The white fillet.
  rect(p, 10, 8, 28, 3, "p");
  rect(p, 10, 8, 28, 1, "w");
  rect(p, 10, 10, 28, 1, "q");
  return p;
}
const PY_FACES: Record<string, readonly Mark[]> = {
  // Eyes shut, mouth open on the count, the two behind him chanting with him.
  chorus: [
    [16, 16, 6, 1, "x"],
    [27, 16, 6, 1, "x"],
    [17, 21, 5, 1, "e"],
    [27, 21, 5, 1, "e"],
    [22, 30, 4, 3, "e"],
  ],
  // Alone, eyes open, saying 나는 for the first time.
  one: [
    [16, 14, 6, 1, "x"],
    [27, 14, 6, 1, "x"],
    [18, 19, 3, 3, "e"],
    [28, 19, 3, 3, "e"],
    [20, 19, 1, 1, "^"],
    [30, 19, 1, 1, "^"],
    [22, 31, 5, 1, "e"],
  ],
  blink: [
    [16, 14, 6, 1, "x"],
    [27, 14, 6, 1, "x"],
    [18, 21, 3, 1, "e"],
    [28, 21, 3, 1, "e"],
    [22, 31, 5, 1, "e"],
  ],
};

// 아리스타르코스 -------------------------------------------------------------------------------------

function aristarchusBase(stick: boolean): Pic {
  const p = Pic.blank(S, S);
  bust(p, OCHRE);
  rect(p, 22, 36, 4, 12, "z");
  face(p);
  hair(
    p,
    BROWN,
    (x, y) => {
      const dx = Math.abs(x + 0.5 - 24);
      return y < 14 || (dx > 11 && y < 24);
    },
    [24, 18, 14.5, 14],
  );
  // The sun hat: a low crown and a wide brim.
  const hat = Pic.blank(S, S);
  ellipse(hat, 24, 9, 11, 6, "U");
  for (let y = 9; y < S; y++) for (let x = 0; x < S; x++) hat.set(x, y, ".");
  ellipse(hat, 24, 11, 23, 3.5, "U");
  p.put(light(hat, "U", lit(OCHRE), { light: 2, dark: 1 }), 0, -1);
  rect(p, 13, 7, 22, 1, "t");
  // Sun-browned cheeks.
  rect(p, 14, 25, 3, 1, "~");
  rect(p, 31, 25, 3, 1, "~");
  if (stick) {
    rect(p, 39, 4, 3, 44, "c");
    rect(p, 39, 4, 1, 44, "W");
    rect(p, 41, 4, 1, 44, "W");
    for (let y = 8; y < 48; y += 5) rect(p, 39, y, 3, 1, "W");
    rect(p, 36, 30, 6, 5, "s");
  }
  return p;
}
const AR_FACES: Record<string, readonly Mark[]> = {
  // Eyes narrowed from years of looking at the sun, a half smile.
  neutral: [
    [16, 16, 6, 1, "x"],
    [27, 16, 6, 1, "x"],
    [18, 20, 3, 2, "e"],
    [28, 20, 3, 2, "e"],
    [20, 20, 1, 1, "^"],
    [30, 20, 1, 1, "^"],
    [16, 22, 2, 1, "'"],
    [31, 22, 2, 1, "'"],
    [21, 30, 6, 1, "e"],
    [27, 29, 1, 1, "e"],
  ],
  blink: [
    [16, 16, 6, 1, "x"],
    [27, 16, 6, 1, "x"],
    [18, 21, 3, 1, "e"],
    [28, 21, 3, 1, "e"],
    [21, 30, 6, 1, "e"],
    [27, 29, 1, 1, "e"],
  ],
  measure: [
    [16, 15, 6, 1, "x"],
    [27, 17, 6, 1, "x"],
    [18, 20, 3, 1, "e"],
    [28, 20, 3, 2, "e"],
    [30, 20, 1, 1, "^"],
    [22, 30, 4, 1, "e"],
  ],
};

// Sprites ----------------------------------------------------------------------------------------

const portrait = (
  name: string,
  faces: Record<string, readonly Mark[]>,
  base: (face: string) => Pic,
  anim: Record<string, { frames: string[]; fps: number }>,
) =>
  sprite({
    name,
    group: "portraits",
    size: [S, S],
    palette,
    lone,
    frames: Object.fromEntries(
      Object.entries(faces).map(([k, m]) => [k, finish(marks(base(k), m))]),
    ),
    anim,
  });

const idle = (face: string) => ({ frames: [face, face, face, face, face, "blink"], fps: 2 });

export default [
  portrait(
    "portrait-aristotle",
    {
      neutral: ARI_FACES.neutral,
      blink: ARI_FACES.blink,
      lecture: ARI_FACES.lecture,
      stunned: ARI_FACES.stunned,
    } as Record<string, readonly Mark[]>,
    () => aristotleBase(false),
    {
      neutral: idle("neutral"),
      lecture: { frames: ["lecture", "neutral"], fps: 3 },
      stunned: { frames: ["stunned"], fps: 1 },
    },
  ),
  portrait(
    "portrait-aristotle-freed",
    { neutral: ARI_FACES.neutral, blink: ARI_FACES.blink, curious: ARI_FACES.curious } as Record<
      string,
      readonly Mark[]
    >,
    () => aristotleBase(true),
    { neutral: idle("neutral"), curious: { frames: ["curious"], fps: 1 } },
  ),
  portrait("portrait-zeno", ZENO_FACES, () => zenoBase(), {
    neutral: idle("neutral"),
    arrived: { frames: ["arrived"], fps: 1 },
  }),
  portrait(
    "portrait-pythagoreans",
    {
      neutral: PY_FACES.chorus,
      chorus: PY_FACES.chorus,
      one: PY_FACES.one,
      blink: PY_FACES.blink,
    } as Record<string, readonly Mark[]>,
    (k) => pythagoreanBase(k === "chorus" || k === "neutral"),
    {
      neutral: { frames: ["chorus"], fps: 1 },
      chorus: { frames: ["chorus"], fps: 1 },
      one: idle("one"),
    },
  ),
  portrait("portrait-aristarchus", AR_FACES, (k) => aristarchusBase(k === "measure"), {
    neutral: idle("neutral"),
    measure: { frames: ["measure"], fps: 1 },
  }),
];
