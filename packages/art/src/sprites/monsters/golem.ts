import { grid, over } from "../../draw.ts";
import { sprite } from "../../format.ts";
import { blob, cut, form, mend } from "../../forms.ts";

/**
 * 오답노트 골렘: the tutorial mini-boss, a spiral notebook of wrong answers that stood up. Earnest
 * and stubborn: between steps it lifts a page to re-read its own marks, squints, and keeps the
 * wrong answer anyway.
 *
 * Seen three-quarter on, facing right. The notebook leans forward over its spiral spine, so the
 * hunch is in the back, and the crumpled-paper head hangs in front of and below the top edge.
 * The page is ruled sparsely, with pencil answers on the lines and red-pen X marks through them;
 * the page block shows down the front edge. One heavy rolled-up arm hangs in front and drags its
 * eraser fist; the thin one stays behind. A pencil is stuck in its head.
 *
 * Parts move on their own: torso, head, both arms, legs and the lifted page. The slam rears back
 * with the fists overhead and the eyes lit, smears down, and lands with a shock ring.
 */

// The notebook: a hunched hump, 26×28. ------------------------------------------------------

const TW = 26;
const TH = 28;
const HUMP = [
  { x: 12, y: 12.5, rx: 10, ry: 10 },
  { x: 13, y: 20, rx: 10.5, ry: 7.6 },
  { x: 19.5, y: 13.5, rx: 5.6, ry: 6 },
] as const;
/** Rounded over the back, square at the bottom like the notebook it is. */
const inHump = (x: number, y: number) =>
  (x >= 3 && x <= 23 && y >= 16 && y <= 26) ||
  HUMP.some((l) => ((x + 0.5 - l.x) / l.rx) ** 2 + ((y + 0.5 - l.y) / l.ry) ** 2 <= 1);
/** The spine and cover run along the curved back: the strip within two pixels of the back edge. */
const onSpine = (x: number, y: number) =>
  x < 15 && (!inHump(x - 2, y) || !inHump(x - 1, y - 2) || (!inHump(x, y - 2) && x < 10));

/** Red-pen marks, page coordinates of their top left. */
const MARKS: readonly (readonly [number, number, string])[] = [
  [12, 8, "r.r/.r./r.r"],
  [8, 15, ".rrr./r...r/.rrr."],
  [16, 19, "r.r/.r./r.r"],
];
/** Pencil answers: short dashes sitting on the lines, never a full stripe. */
const ANSWERS: readonly (readonly [number, number, number])[] = [
  [8, 7, 3],
  [9, 11, 5],
  [15, 11, 3],
  [7, 15, 0],
  [14, 15, 4],
  [6, 19, 7],
  [7, 23, 4],
  [13, 23, 5],
];

function page(lifted: boolean): string {
  const rows: string[][] = [];
  for (let y = 0; y < TH; y++) {
    const row: string[] = [];
    for (let x = 0; x < TW; x++) {
      if (!inHump(x, y)) row.push(".");
      else if (onSpine(x, y)) row.push(y < 12 ? "n" : "N");
      // The page block shows along the front-bottom edge: the notebook's thickness.
      else if (!inHump(x + 2, y) || !inHump(x + 1, y + 2)) row.push(y % 2 === 0 ? "C" : "c");
      else if (y % 4 === 2 && inHump(x + 3, y) && !onSpine(x - 2, y)) row.push("b");
      else if (onSpine(x - 2, y) || onSpine(x - 1, y - 1)) row.push("M");
      else if (!inHump(x - 4, y - 3) || y < 8) row.push("w");
      else if (!inHump(x + 4, y + 2)) row.push("C");
      else row.push("p");
    }
    rows.push(row);
  }
  const put = (x: number, y: number, ch: string) => {
    const r = rows[y];
    if (r && r[x] !== undefined && "wpCb".includes(r[x] as string)) r[x] = ch;
  };
  for (const [x0, y, n] of ANSWERS) for (let k = 0; k < n; k++) put(x0 + k, y - 1, "c");
  for (const [mx, my, mark] of MARKS) {
    mark.split("/").forEach((line, dy) => {
      [...line].forEach((ch, dx) => {
        if (ch !== ".") put(mx + dx, my + dy, ch);
      });
    });
  }
  // A lifted page: the bottom-front corner peeled up and folded over.
  if (lifted) {
    const flap = ["......SS", ".....SwS", "....SwpS", "...SwpCS", "..SwpCCS", ".SSSSSSS"];
    flap.forEach((line, dy) => {
      [...line].forEach((ch, dx) => {
        const r = rows[17 + dy];
        if (ch !== "." && r && r[11 + dx] !== undefined && r[11 + dx] !== ".") r[11 + dx] = ch;
      });
    });
  }
  const sealed = cut(rows.map((r) => r.join("")).join("\n"), () => true, "S");
  return mend(sealed, "wpCcbMrnN");
}

/** The spiral down the back: wire loops standing out of the spine every third pixel. */
function spiral(): string {
  const loops = new Set<string>();
  for (let y = 1; y < TH - 6; y++) {
    for (let x = 0; x < 14; x++) {
      const edge = inHump(x, y) && (!inHump(x - 1, y) || !inHump(x, y - 1));
      if (edge && onSpine(x, y) && (x + 2 * y) % 4 === 0) {
        const dx = !inHump(x - 1, y) ? -1 : 0;
        const dy = dx === 0 ? -1 : 0;
        loops.add(`${x + dx},${y + dy}`);
        loops.add(`o${x},${y}`);
      }
    }
  }
  return grid(TW, TH, (x, y) =>
    loops.has(`o${x},${y}`) ? "o" : loops.has(`${x},${y}`) ? "S" : ".",
  );
}

// Head, arms, legs. ----------------------------------------------------------------------------

const PAPER = { outline: "S", dark: "C", mid: "p", light: "w" } as const;
const ERASER = { outline: "&", dark: "f", mid: "f", light: "F" } as const;

/** A crumpled ball of paper with creases. */
const headShape = form(
  blob(13, 12, [
    { x: 6.5, y: 6.4, rx: 6.2, ry: 5.2 },
    { x: 4.2, y: 3.4, rx: 3.4, ry: 2.8 },
    { x: 9.2, y: 3.2, rx: 3, ry: 2.6 },
  ]),
  PAPER,
);
const withFace = (face: string) => mend(over(headShape, face), "wpC");

/** Faces drawn over the head, 12×11, `.` keeps the paper. */
const FACES = {
  head: `
    .............
    ....c.....c..
    ...c...c.....
    .....e...e...
    ....ee..ee...
    .............
    .....c.......
    ......eeee...
    .............
    .......c.....
    .............
    .............
  `,
  squint: `
    .............
    ....c.....c..
    ...c...c.....
    .............
    ....eee.eee..
    .............
    .....c.......
    .......ee....
    .............
    .......c.....
    .............
    .............
  `,
  glare: `
    .............
    ....c.....c..
    ...eee..eee..
    ....MM...MM..
    ....MM...MM..
    .............
    ......eeee...
    .....eMMMMe..
    .............
    .......c.....
    .............
    .............
  `,
  torn: `
    .............
    ....c.S...c..
    ...c..S.c....
    .....eS..e...
    ....eeS.ee...
    ......S......
    .....cS......
    ......Seee...
    ......S......
    .......c.....
    .............
    .............
  `,
} as const;

/** The heavy arm: a rolled-up page, the roll's edge spiralling round it. */
const ROLL = `
  .SSSS.
  SwwpCS
  SwbbCS
  SwwpCS
  SbbpCS
  SwwpCS
  SwwbbS
  SwwpCS
  SbbpCS
  SwwpCS
  SwwbbS
  SwwpCS
  .SSSS.
`;
const ROLL_UP = `
  .SSSS.
  SwwpCS
  SwwbbS
  SwwpCS
  SbbpCS
  SwwpCS
  SwwbbS
  SwwpCS
  .SSSS.
`;
const THIN = `
  .SS.
  SwCS
  SbbS
  SwCS
  SwCS
  SbbS
  SwCS
  SwCS
  .SS.
`;
/** Eraser fists: pink rubber in a paper sleeve. */
const FIST = form(
  `
  ########
  ########
  ########
  ########
  ########
  ########
  ########
`,
  ERASER,
)
  .split("\n")
  .map((r, y) => (y >= 4 ? r.replace(/f/g, "p").replace(/F/g, "w") : r))
  .join("\n");
const FIST_SMALL = form(
  `
  ######
  ######
  ######
  ######
  ######
`,
  ERASER,
)
  .split("\n")
  .map((r, y) => (y >= 3 ? r.replace(/f/g, "p").replace(/F/g, "w") : r))
  .join("\n");

const LEGS = `
  SSSSS....SSSSS.
  SwpCS....SwpCS.
  SwpCS....SwpCS.
  SwpCS....SwpCS.
  SSSSSS...SSSSSS
  SCCCCS...SCCCCS
  SSSSSS...SSSSSS
`;
const STEP_A = `
  SSSSS..........
  SwpCS....SSSSS.
  SwpCS....SwpCS.
  SSSSSS...SwpCS.
  SCCCCS...SwpCS.
  SSSSSS...SSSSSS
  .........SCCCCS
  .........SSSSSS
`;
const STEP_B = `
  .........SSSSS.
  SSSSS....SwpCS.
  SwpCS....SwpCS.
  SwpCS....SSSSSS
  SwpCS....SCCCCS
  SSSSSS...SSSSSS
  SCCCCS.........
  SSSSSS.........
`;

/** Pencil stuck in the head, point down, eraser end up and back. */
const PENCIL = `
  .&&....
  &FF&...
  &ff&...
  .WccW..
  ..WaAW.
  ...WaAW
  ....WWW
`;

type Grid = { readonly at: readonly [number, number]; readonly grid: string };
type Place = string | readonly [string, number, number];

const PARTS: Readonly<Record<string, Grid>> = {
  torso: { at: [4, 8], grid: page(false) },
  reading: { at: [4, 8], grid: page(true) },
  spiral: { at: [4, 8], grid: spiral() },
  head: { at: [29, 12], grid: withFace(FACES.head) },
  squint: { at: [29, 12], grid: withFace(FACES.squint) },
  glare: { at: [29, 12], grid: withFace(FACES.glare) },
  torn: { at: [29, 12], grid: withFace(FACES.torn) },
  pencil: { at: [29, 7], grid: PENCIL },
  legs: { at: [9, 33], grid: LEGS },
  stepA: { at: [9, 32], grid: STEP_A },
  stepB: { at: [9, 32], grid: STEP_B },
  // The heavy arm hangs in front, its eraser fist knuckling the ground.
  arm: { at: [27, 20], grid: ROLL },
  fist: { at: [26, 32], grid: FIST },
  // The thin arm stays behind the notebook; only its fist shows.
  armBack: { at: [5, 23], grid: THIN },
  fistBack: { at: [2, 30], grid: FIST_SMALL },
  // Slam: reared up, both fists over the head, then down in front.
  armUp: { at: [26, 5], grid: ROLL_UP },
  fistUp: { at: [25, 0], grid: FIST },
  armBackUp: { at: [19, 5], grid: THIN },
  fistBackUp: { at: [17, 1], grid: FIST_SMALL },
  smear: {
    at: [25, 0],
    grid: `
        ..~~~~~.........
        .......~~.......
        .........~~.....
        ...........~....
        ............~...
        .............~..
        .............~..
        ..............~.
        ..............~.
      `,
  },
  fistMid: { at: [34, 16], grid: FIST },
  fistsDown: { at: [31, 32], grid: FIST },
  fistDown2: { at: [37, 34], grid: FIST_SMALL },
  shock: {
    at: [2, 33],
    grid: `
        ........................................
        ^......................................^
        .^....................................^.
        ...^...............................^^...
        ......~~.........................~~.....
      `,
  },
  pages: {
    at: [0, 0],
    grid: `
        ..~.........................^...........
        .~~..........................~~.........
        ........................................
        ....^..........................~........
      `,
  },
  scraps: {
    at: [0, 10],
    grid: `
        ..........~.........^...................
        ...~....................................
        ........................~...........^...
        ......^.................................
        ..............................~.........
        ...........^...........~................
      `,
  },
  heap: {
    at: [8, 28],
    grid: mend(
      cut(
        `
          ............&&&&...........
          ...SSSS....&FFff&..........
          ..SwppCS...&ffff&...SSSS...
          .SwpbbCSSSSSpppp&S.SwpCS...
          SwwppprrppppSSSSSpSSbbCSSS.
          SwpbbbbbbbbbbbbbbbbbbbbCCS.
          SwpppppppprrpppppppppppCCCS
          SCCCCCCCCCCCCCCCCCCCCCCCCCS
          .SSSSSSSSSSSSSSSSSSSSSSSSS.
        `,
        () => true,
        "S",
      ),
      "wpCbrf&",
    ),
  },
};

const POSES: Readonly<Record<string, readonly Place[]>> = {
  idle0: ["armBack", "fistBack", "legs", "spiral", "torso", "pencil", "head", "arm", "fist"],
  idle1: [
    ["armBack", 0, 1],
    "fistBack",
    "legs",
    ["spiral", 0, 1],
    ["torso", 0, 1],
    ["pencil", 0, 1],
    ["head", 0, 1],
    ["arm", 0, 1],
    "fist",
  ],
  idle2: [
    ["armBack", 0, 1],
    "fistBack",
    "legs",
    ["spiral", 0, 1],
    ["reading", 0, 1],
    ["pencil", -1, 2],
    ["squint", -1, 2],
    ["arm", 0, 1],
    "fist",
  ],
  idle3: [
    "armBack",
    "fistBack",
    "legs",
    "spiral",
    "reading",
    ["pencil", -1, 1],
    ["squint", -1, 1],
    "arm",
    "fist",
  ],
  walk0: [
    ["armBack", -1, 0],
    ["fistBack", -1, 1],
    "stepA",
    ["spiral", 0, -1],
    ["torso", 0, -1],
    ["pencil", 1, -1],
    ["head", 1, -1],
    ["arm", 0, -1],
    ["fist", 1, -1],
  ],
  walk1: [
    ["armBack", 0, 1],
    "fistBack",
    "legs",
    ["spiral", 0, 1],
    ["torso", 0, 1],
    ["pencil", 0, 1],
    ["head", 0, 1],
    ["arm", 0, 1],
    "fist",
  ],
  walk2: [
    ["armBack", 1, 0],
    ["fistBack", 1, -1],
    "stepB",
    ["spiral", 0, -1],
    ["torso", 0, -1],
    ["pencil", 1, -1],
    ["head", 1, -1],
    ["arm", 0, -1],
    ["fist", -1, 1],
  ],
  walk3: [
    ["armBack", 0, 1],
    "fistBack",
    "legs",
    ["spiral", 0, 1],
    ["torso", 0, 1],
    ["pencil", 0, 1],
    ["head", 0, 1],
    ["arm", 0, 1],
    "fist",
  ],
  // Anticipation: reared back, fists climbing over the head, eyes lit.
  slam0: [
    "armBackUp",
    ["fistBackUp", 0, 3],
    "legs",
    ["spiral", -1, 0],
    ["torso", -1, 0],
    ["pencil", -2, -4],
    ["glare", -2, -4],
    ["armUp", 0, 3],
    ["fistUp", 0, 3],
  ],
  slam1: [
    "armBackUp",
    "fistBackUp",
    "legs",
    ["spiral", -2, -1],
    ["torso", -2, -1],
    ["pencil", -3, -6],
    ["glare", -3, -6],
    "armUp",
    "fistUp",
  ],
  // The smear: fists whipping down in front.
  slam2: [
    "legs",
    "spiral",
    "torso",
    ["pencil", 1, 1],
    ["glare", 1, 1],
    ["arm", 2, -2],
    "smear",
    "fistMid",
  ],
  // Impact: squashed down, head thrown forward, fists in the ground, the ring going out.
  slam3: [
    ["armBack", 2, 2],
    "legs",
    ["spiral", 0, 2],
    ["torso", 0, 2],
    ["pencil", 2, 6],
    ["glare", 2, 6],
    ["arm", 4, 2],
    "fistsDown",
    "fistDown2",
    "shock",
  ],
  slam4: [
    ["armBack", 0, 1],
    "fistBack",
    "legs",
    ["spiral", 0, 1],
    ["torso", 0, 1],
    ["pencil", 0, 1],
    ["squint", 0, 1],
    ["arm", 0, 1],
    "fist",
  ],
  hit: [
    ["armBack", -1, -1],
    ["fistBack", -1, 0],
    "legs",
    ["spiral", -2, -1],
    ["torso", -2, -1],
    ["pencil", -2, -2],
    ["squint", -2, -2],
    ["arm", -1, -1],
    ["fist", -1, 0],
    "pages",
  ],
  die0: ["armBack", "fistBack", "legs", "spiral", "reading", "pencil", "torn", "arm", "fist"],
  die1: [
    ["armBack", 0, 4],
    ["fistBack", 0, 2],
    "legs",
    ["spiral", 0, 3],
    ["torso", 0, 3],
    ["pencil", 2, 8],
    ["torn", 2, 8],
    ["arm", 1, 4],
    "fist",
    "scraps",
  ],
  die2: ["heap"],
};

/** Every pose composited into one grid and mended, so overlapping parts never strand a pixel. */
function compose(places: readonly Place[]): string {
  let out = grid(44, 40, () => ".");
  for (const p of places) {
    const [name, dx, dy] = typeof p === "string" ? [p, 0, 0] : p;
    const part = PARTS[name];
    if (!part) throw new Error(`golem: no part ${name}`);
    out = over(out, part.grid, part.at[0] + dx, part.at[1] + dy);
  }
  return mend(out, "wpCcbMrnNfFaAWe");
}

export default sprite({
  name: "golem",
  size: [44, 40],
  origin: [20, 39],
  palette: {
    ".": null,
    S: "ink.deep",
    c: "stone.mid",
    C: "stone.light",
    p: "stone.pale",
    w: "stone.bright",
    b: "navy.pale",
    n: "navy.mid",
    N: "navy.dark",
    r: "red.mid",
    M: "red.light",
    "&": "rose.deep",
    f: "rose.mid",
    F: "rose.light",
    W: "wood.deep",
    a: "gold.mid",
    A: "gold.light",
    e: "ink.deep",
    // Lone marks: the wire glint on each coil, eye glints, flying scraps and the shock ring.
    o: "ink.light",
    "^": "stone.bright",
    "~": "stone.pale",
    "!": "red.light",
  },
  lone: "o^~!",
  frames: Object.fromEntries(
    Object.entries(POSES).map(([name, places]) => [name, compose(places)]),
  ),
  anim: {
    idle: {
      frames: ["idle0", "idle1", "idle0", "idle1", "idle2", "idle3", "idle3", "idle0"],
      fps: 4,
    },
    walk: { frames: ["walk0", "walk1", "walk2", "walk3"], fps: 6 },
    move: { frames: ["walk0", "walk1", "walk2", "walk3"], fps: 6 },
    slam: {
      frames: ["slam0", "slam1", "slam1", "slam1", "slam2", "slam3", "slam3", "slam4"],
      fps: 10,
      loop: false,
    },
    hit: { frames: ["hit"], fps: 1, loop: false },
    die: { frames: ["die0", "die1", "die2"], fps: 6, loop: false, jump: 1 },
  },
});
