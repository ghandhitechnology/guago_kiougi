import { disc, over } from "../../draw.ts";
import { sprite } from "../../format.ts";
import { blob, cut, form, mend, swap } from "../../forms.ts";

/**
 * 4원소 정령: Aristotle's elements, each sure it is the one true substance. Haughty: the eyes look
 * down the nose. Each has its own silhouette and its own job in a horde:
 *
 * - fire, 자폭형: a flame of three tongues. Armed, it swallows its tongues, swells into a white-hot
 *   ball that flashes faster and faster, and bursts.
 * - water, 치유형: a droplet under a halo of water, the one thing in the pack to hit first. It
 *   casts by gathering itself and throwing a fountain up through the halo.
 * - air, 돌진형: a curl of wind with a hooked tail and gust lines running round it. It coils back
 *   before a charge and stretches into a streak along the line.
 * - earth, 분열형: a lopsided boulder with a moss cap and a crack down its middle. It dies by
 *   breaking along the crack into the two pebbles that carry on.
 */

/** The haughty face all four share: eyes down the nose, a small flat mouth. */
const FACE = `
  **..**
  .*..*.
  ......
  ..**..
`;
const BLINK = `
  ......
  **..**
  ......
  ..**..
`;

// Fire ----------------------------------------------------------------------------------------

/** Every fire grid is drawn in a 16×16 box and placed at this offset in its 24×24 frame. */
const F: readonly [number, number] = [4, 8];
const at = (x: number, y: number): [number, number] => [x + F[0], y + F[1]];

const fireBody = `
  .oRooRrrrooRro.
  .oRrRrraArrRro.
  oRrrrraAAarrrro
  oRrraaYYYAarrdo
  oRrrAYYYYYAardo
  oRrrAYYYYYAardo
  .oRraAYYYAaardo
  ..oddaaaaadddo.
  ...oooooooooo..
`;
/** The body with its top closed, for frames whose tongues do not cover it. */
const fireClosed = mend(fireBody.replace(".oRooRrrrooRro.", ".oooooRrRooooo."), "rR");
/** White-hot: every step one brighter, the core gone white. */
const hot = (g: string) => swap(g, "drRaAY", "RPPAYw");

const crown = `
  ........o......
  .......oRo.....
  ......oRRo..o..
  ..o...oRro.oRo.
  .oRo.oRrro.oRo.
`;
const crown2 = `
  .......o.......
  ......oRo......
  ..o...oRRo.....
  .oRo..oRro..o..
  .oRo.oRrro.oRo.
`;
/** Rushing in: the whole flame leaning into it, tongues streaming back. */
const FIRE_RAMP = { outline: "o", dark: "d", mid: "r", light: "R" } as const;
const fireMask = fireBody.replace(/[^.\s]/g, "#");
const fireCore = fireBody.replace(/[^aAY\s]/g, ".");
const rushing = mend(
  over(
    form(
      `
    .###...........
    ..###....###...
    ...###....###..
    ...####...####.
    ....####.#####.
    ....###########
    ${fireMask.trim()}
  `,
      FIRE_RAMP,
    ),
    fireCore,
    0,
    6,
  ),
  "aAY",
);
/** Armed: the tongues pulled down into the body, one stub left. */
const crownLow = `
  ...............
  .......o.......
  ......oRo......
  .....oRrRo.....
  .....oRrRo.....
`;

/** Swollen into a ball, the last beats of the fuse. */
const big = form(
  `
  ........##........
  .......####.......
  ......######......
  ....##########....
  ...############...
  ..##############..
  .######aaaa######.
  .#####aAAAAa#####.
  #####aAYYYYAa#####
  #####aAYYYYAa#####
  #####aAYYYYAa#####
  .#####aAAAAa#####.
  .######aaaa######.
  ..##############..
  ....##########....
  ......######......
`,
  { outline: "o", dark: "d", mid: "r", light: "R" },
);

const fire = sprite({
  name: "element-fire",
  size: [24, 24],
  palette: {
    ".": null,
    o: "red.deep",
    d: "red.dark",
    r: "red.mid",
    R: "red.light",
    P: "red.pale",
    a: "gold.mid",
    A: "gold.light",
    Y: "gold.pale",
    w: "stone.bright",
    "*": "ink.deep",
    "~": "gold.pale",
    "+": "stone.bright",
  },
  lone: "*~+",
  parts: {
    body: { at: at(0, 6), grid: fireBody },
    closed: { at: at(0, 6), grid: fireClosed },
    closedHot: { at: at(0, 6), grid: hot(fireClosed) },
    face: { at: at(4, 9), grid: FACE },
    blink: { at: at(4, 9), grid: BLINK },
    // Eyes wide and mouth open: it knows what comes next.
    manic: {
      at: at(4, 9),
      grid: `
        **..**
        **..**
        ......
        ..**..
        ..**..
      `,
    },
    // Eyes narrowed on the target.
    intent: {
      at: at(4, 9),
      grid: `
        **..**
        ......
        ......
        ..**..
      `,
    },
    crown: { at: at(0, 1), grid: crown },
    crown2: { at: at(0, 1), grid: crown2 },
    rushing: { at: at(0, 0), grid: rushing },
    crownLow: { at: at(0, 2), grid: crownLow },
    crownLowHot: { at: at(0, 2), grid: hot(crownLow) },
    big: { at: [3, 8], grid: big },
    bigHot: { at: [3, 8], grid: hot(big) },
    bigFace: {
      at: [9, 15],
      grid: `
        **..**
        **..**
        ......
        ..**..
        ..**..
      `,
    },
    // Embers drifting off the sides, and trailing behind on a rush.
    skirt: {
      at: at(0, 11),
      grid: `
        ~..............
        ...............
        .............~.
      `,
    },
    skirt2: {
      at: at(0, 11),
      grid: `
        ...............
        ~..............
        ..............~
      `,
    },
    trail: {
      at: at(-4, 8),
      grid: `
        ~......
        ...~...
        .~.....
        .....~.
      `,
    },
    // The burst: a white-hot ball tearing, then a ring of fire flying apart.
    flash: {
      at: [2, 4],
      grid: disc(
        20,
        [
          [1, "o"],
          [2, "R"],
          [2, "P"],
        ],
        "w",
      ),
    },
    ring: {
      at: [0, 0],
      grid: `
        ........oooooooo........
        ......ooRRRRRRRRoo......
        ....ooRRoooooooRRRoo....
        ...oRRoo.......ooRRo....
        ..oRRo...........oRRo...
        ..oRo.............oRo...
        .oRo...............oRo..
        .oRo...............oRo..
        oRo.................oRo.
        oRo.................oRo.
        oRo.................oRo.
        oRo.................oRo.
        oRo.................oRo.
        oRo.................oRo.
        .oRo...............oRo..
        .oRo...............oRo..
        ..oRo.............oRo...
        ..oRRo...........oRRo...
        ...oRRoo.......ooRRo....
        ....ooRRoooooooRRoo.....
        ......ooRRRRRRRRoo......
        ........oooooooo........
        ........................
        ........................
      `,
    },
    embers: {
      at: [0, 0],
      grid: `
        ..~...........+.......~.
        ........................
        ~.......................
        ...........~............
        ......................+.
        ..+.....................
        ........................
        ......................~.
        ~.......................
        ........................
        ........................
        .....................~..
        ..~.....................
        ........................
        ........................
        ...................+....
        .~......................
        ........................
        .......~.........~......
        ........................
        ...+....................
        ............~...........
        ........................
        ........................
      `,
    },
    puff: {
      at: at(3, 4),
      grid: `
        ..oooooo..
        .oPPPPPPo.
        oPPPPPPPPo
        oPPPPPPPPo
        oPPPPPPPPo
        oPPPPPPPPo
        .oPPPPPPo.
        ..oooooo..
      `,
    },
    motes: {
      at: at(0, 0),
      grid: `
        .~............~.
        ................
        ......~.........
        ..~.........~...
        ................
        ...............~
        ~...............
        ................
        .....~......~...
        ................
        ..~.............
        ...........~....
        ................
        ......~.........
        ................
        ................
      `,
    },
  },
  frames: {
    idle0: ["skirt", "body", "crown", "face"],
    idle1: [
      ["skirt2", 0, -1],
      ["body", 0, -1],
      ["crown", 0, -1],
      ["face", 0, -1],
    ],
    idle2: [
      ["skirt", 0, -1],
      ["body", 0, -1],
      ["crown2", 0, -1],
      ["blink", 0, -1],
    ],
    move0: ["skirt2", "body", "crown", "face"],
    move1: [
      ["skirt", 0, -1],
      ["body", 0, -1],
      ["crown2", 0, -1],
      ["face", 0, -1],
    ],
    move2: ["skirt2", "body", "crown", "face"],
    move3: [
      ["skirt", 0, 1],
      ["body", 0, 1],
      ["crown", 0, 1],
      ["face", 0, 1],
    ],
    rush0: ["trail", "rushing", "intent"],
    rush1: [
      ["trail", 1, -1],
      ["rushing", 0, -1],
      ["intent", 0, -1],
    ],
    fuse0: ["closed", "crownLow", "manic"],
    fuse1: ["closedHot", "crownLowHot", "manic"],
    fuse2: ["big", "bigFace"],
    fuse3: ["bigHot", "bigFace"],
    burst0: ["flash"],
    burst1: ["ring", "embers"],
    burst2: ["embers"],
    hit: [
      ["skirt", 1, 0],
      ["body", 1, 0],
      ["crown2", 1, 0],
      ["blink", 1, 0],
    ],
    die0: ["puff"],
    die1: [["puff", 0, -1], "motes"],
    die2: ["motes"],
  },
  anim: {
    idle: { frames: ["idle0", "idle1", "idle0", "idle1", "idle2", "idle2", "idle1"], fps: 5 },
    move: { frames: ["move0", "move1", "move2", "move3"], fps: 8 },
    rush: { frames: ["rush0", "rush1"], fps: 10 },
    // 0.8 s at 10 fps: two slow flashes, then the swollen ball flashing faster.
    fuse: {
      frames: ["fuse0", "fuse1", "fuse0", "fuse1", "fuse2", "fuse3", "fuse2", "fuse3"],
      fps: 10,
      loop: false,
      jump: 0.6,
    },
    burst: { frames: ["burst0", "burst1", "burst2"], fps: 12, loop: false, jump: 1 },
    hit: { frames: ["hit"], fps: 1, loop: false },
    die: { frames: ["die0", "die1", "die2"], fps: 12, loop: false, jump: 1 },
  },
});

// Water ---------------------------------------------------------------------------------------

const halo = `
  ...ooooo...
  .ooRRPPPoo.
  oRRoooooPPo
  .ooRRRRRoo.
  ...ooooo...
`;
const haloWide = `
  ....ooooooooo....
  ..ooRRRPPPPPPoo..
  .oRRoooooooooPPo.
  .oRRooooooooPPPo.
  ..ooRRRRRRRRRoo..
  ....ooooooooo....
`;

const water = sprite({
  name: "element-water",
  size: [16, 22],
  palette: {
    ".": null,
    o: "sea.deep",
    d: "sea.dark",
    r: "sea.mid",
    R: "sea.light",
    P: "sea.pale",
    n: "navy.deep",
    m: "navy.dark",
    "*": "ink.deep",
    "~": "sea.pale",
    "+": "stone.bright",
  },
  lone: "*~+",
  parts: {
    halo: { at: [2, 1], grid: halo },
    haloWide: { at: [0, 1], grid: haloWide },
    // A glint running round the halo, one stop per frame.
    g0: { at: [6, 1], grid: "+" },
    g1: { at: [11, 2], grid: "+" },
    g2: { at: [10, 5], grid: "+" },
    g3: { at: [4, 4], grid: "+" },
    body: {
      at: [3, 11],
      grid: `
        ..oooooo..
        .oPPrrrro.
        oPPRrrrrdo
        oRRrrrrrdo
        orrrrrrddo
        .orrrrddo.
        ..oooooo..
      `,
    },
    squat: {
      at: [2, 12],
      grid: `
        ...oooooo...
        .ooPPrrrroo.
        oPPRRrrrrrdo
        oRRrrrrrrrdo
        orrrrrrrrddo
        .oorrrrrddo.
        ...oooooo...
      `,
    },
    peak: {
      at: [3, 7],
      grid: `
        .....o....
        ....oRo...
        ...oRRro..
        ..oRRrrro.
        .orrrrrrro
      `,
    },
    peak2: {
      at: [3, 7],
      grid: `
        ....oo....
        ...oRRo...
        ...oRRro..
        ..oRRrrro.
        .orrrrrrro
      `,
    },
    // Cast: the peak opens into a spout that throws water up through the halo.
    spout: {
      at: [3, 4],
      grid: `
        ...~..~...
        ....oo....
        ....oRo...
        ....oRo...
        ...oRRo...
        ...oRRro..
        ..oRRrrro.
        .orrrrrrro
      `,
    },
    spray: {
      at: [0, 0],
      grid: `
        ..~...~....~..~.
        ................
        ................
        ................
        ................
        ................
        ................
        ~..............~
      `,
    },
    face: { at: [5, 12], grid: FACE },
    blink: { at: [5, 12], grid: BLINK },
    // Eyes shut in benediction.
    bless: {
      at: [5, 12],
      grid: `
        ......
        **..**
        ......
        .*..*.
        ..**..
      `,
    },
    hem: {
      at: [3, 17],
      grid: `
        .oddddddo.
        oddddddddo
        oooooooooo
      `,
    },
    hem2: {
      at: [3, 17],
      grid: `
        .oddddddo.
        oddddddddo
        .ooooooooo
      `,
    },
    drip: { at: [2, 16], grid: "~" },
    drip2: { at: [2, 18], grid: "~" },
    puff: {
      at: [3, 10],
      grid: `
        ..oooooo..
        .oPPPPPPo.
        oPPPPPPPPo
        oPPPPPPPPo
        oPPPPPPPPo
        oPPPPPPPPo
        .oPPPPPPo.
        ..oooooo..
      `,
    },
    motes: {
      at: [0, 4],
      grid: `
        .~............~.
        ................
        ......~.........
        ..~.........~...
        ................
        ...............~
        ~...............
        ................
        .....~......~...
        ................
        ..~.............
        ...........~....
        ................
        ......~.........
      `,
    },
  },
  frames: {
    idle0: ["halo", "g0", "hem", "body", "peak", "face", "drip"],
    idle1: [
      ["halo", 0, -1],
      ["g1", 0, -1],
      ["hem2", 0, -1],
      ["body", 0, -1],
      ["peak", 0, -1],
      ["face", 0, -1],
      "drip2",
    ],
    idle2: [
      ["halo", 0, -1],
      ["g2", 0, -1],
      ["hem", 0, -1],
      ["body", 0, -1],
      ["peak2", 0, -1],
      ["blink", 0, -1],
    ],
    idle3: ["halo", "g3", "hem2", "body", "peak", "face"],
    move0: ["halo", "g0", "hem2", "body", "peak", "face"],
    move1: [
      ["halo", 0, -1],
      ["g1", 0, -1],
      ["hem", 0, -1],
      ["body", 0, -1],
      ["peak2", 0, -1],
      ["face", 0, -1],
    ],
    move2: ["halo", "g2", "hem2", "body", "peak", "face"],
    move3: [
      ["halo", 0, 1],
      ["g3", 0, 1],
      ["hem", 0, 1],
      ["body", 0, 1],
      ["peak", 0, 1],
      ["face", 0, 1],
    ],
    cast0: [["halo", 0, 1], ["g0", 0, 1], ["hem", 0, 1], "squat", ["peak", 0, 2], ["bless", 0, 1]],
    cast1: ["haloWide", ["hem", 0, -1], ["body", 0, -2], "spout", ["bless", 0, -2], "spray"],
    cast2: ["haloWide", "hem", ["body", 0, -1], ["spout", 0, 1], ["bless", 0, -1]],
    hit: [
      ["halo", 1, 0],
      ["hem", 1, 0],
      ["body", 1, 0],
      ["peak2", 1, 0],
      ["blink", 1, 0],
    ],
    die0: ["puff"],
    die1: [["puff", 0, -1], "motes"],
    die2: ["motes"],
  },
  anim: {
    idle: {
      frames: ["idle0", "idle1", "idle0", "idle1", "idle2", "idle2", "idle1", "idle3"],
      fps: 5,
    },
    move: { frames: ["move0", "move1", "move2", "move3"], fps: 8 },
    cast: { frames: ["cast0", "cast0", "cast1", "cast2", "cast2", "idle0"], fps: 8, loop: false },
    hit: { frames: ["hit"], fps: 1, loop: false },
    die: { frames: ["die0", "die1", "die2"], fps: 12, loop: false, jump: 1 },
  },
});

// Air -----------------------------------------------------------------------------------------

const AIR = { outline: "o", dark: "L", mid: "P", light: "w" } as const;
type L = { x: number; y: number; rx: number; ry: number };
/** Grown by a fifth about its face, so the charger is as big a target as the rest of the pack. */
const gust = (list: readonly L[], cx = 22.5, cy = 10) =>
  form(
    blob(
      30,
      16,
      list.map((l) => ({
        x: cx + (l.x - cx) * 1.2,
        y: cy + (l.y - cy) * 1.2,
        rx: l.rx * 1.2,
        ry: l.ry * 1.2,
      })),
    ),
    AIR,
    { light: 1, dark: 1 },
  );

/** A puff of cloud, three bumps high, a little curl of a tail at the back. */
const PUFF: readonly L[] = [
  { x: 20.5, y: 10.4, rx: 6.6, ry: 3.4 },
  { x: 16, y: 8.2, rx: 2.8, ry: 2.6 },
  { x: 20.2, y: 6, rx: 3.4, ry: 3.2 },
  { x: 24.6, y: 7.6, rx: 3, ry: 2.8 },
  { x: 13.4, y: 11, rx: 2, ry: 1.8 },
];
const shift = (list: readonly L[], dx: number, dy: number, sx = 1, sy = 1): L[] =>
  list.map((l) => ({ x: l.x + dx, y: l.y + dy, rx: l.rx * sx, ry: l.ry * sy }));

const curl = gust(PUFF);
const curl2 = gust([...shift(PUFF.slice(0, 4), 0, 0), { x: 14.6, y: 9.6, rx: 2.4, ry: 2.2 }]);
/** Coiled back before a charge: squeezed narrow and tall, reared away from the target. */
const coil = gust(
  [
    { x: 15.4, y: 11, rx: 6, ry: 2.8 },
    { x: 11.6, y: 8, rx: 2.8, ry: 2.6 },
    { x: 15, y: 7.6, rx: 3, ry: 2.6 },
    { x: 19.4, y: 9.4, rx: 2.4, ry: 2 },
  ],
  17,
  10,
);
/** The charge: stretched long and low along the line. */
const streak = gust(
  [
    { x: 22, y: 9.6, rx: 7.4, ry: 3.2 },
    { x: 18, y: 7.6, rx: 3.6, ry: 2 },
    { x: 23, y: 6.8, rx: 3.6, ry: 2.2 },
    { x: 26.6, y: 8.4, rx: 2.4, ry: 2 },
    { x: 13.6, y: 10, rx: 3, ry: 1.8 },
  ],
  24,
  9,
);
/** Spent after a charge: blown out round and dizzy. */
const spent = gust(
  [
    { x: 17, y: 10, rx: 6.4, ry: 4.2 },
    { x: 14, y: 6.6, rx: 3, ry: 2.2 },
    { x: 19.4, y: 6.4, rx: 3, ry: 2.2 },
  ],
  16,
  10,
);

/** The swirl inside the puff, and the streaks of air it leaves behind. */
const SWIRL = `
  .mmm.
  m...m
  m.m.m
  .mm..
`;

const air = sprite({
  name: "element-air",
  size: [30, 16],
  palette: {
    ".": null,
    o: "plum.deep",
    m: "plum.mid",
    L: "plum.light",
    P: "plum.pale",
    w: "stone.bright",
    "*": "ink.deep",
    "-": "plum.light",
    "~": "plum.mid",
    "+": "stone.bright",
  },
  lone: "*-~+",
  parts: {
    curl,
    curl2,
    coil,
    // Flashing white while it coils: the body's own telegraph, matching the line on the ground.
    coilHot: swap(coil, "LP", "Pw"),
    streak,
    spent,
    swirl: { at: [14, 7], grid: SWIRL },
    swirl2: {
      at: [14, 7],
      grid: `
        .mm..
        m..m.
        m.m.m
        .m..m
        ..mm.
      `,
    },
    trailA: {
      at: [1, 4],
      grid: `
        .....----~.....
        ...............
        ..~----------..
        ...............
        ...........----
        ......~-----...
        ...............
        ..........--...
      `,
    },
    trailB: {
      at: [1, 4],
      grid: `
        ...~----.......
        ...............
        .....~---------
        ...............
        .~------.......
        ............---
        ...............
        ....~---.......
      `,
    },
    face: {
      at: [21, 8],
      grid: `
        *..*
        *..*
        ....
        .**.
      `,
    },
    blink: {
      at: [21, 8],
      grid: `
        ....
        *..*
        ....
        .**.
      `,
    },
    squint: {
      at: [15, 8],
      grid: `
        **..**
        ......
        ......
        ..**..
      `,
    },
    streakFace: {
      at: [24, 8],
      grid: `
        **.**
        .....
        ..**.
      `,
    },
    dizzy: {
      at: [13, 8],
      grid: `
        +.+..+.+
        .+....+.
        +.+..+.+
        ........
        ...**...
      `,
    },
    // Air pulled in toward it while it coils, and speed lines behind the streak.
    suck: {
      at: [0, 0],
      grid: `
        ..............................
        ......................-.......
        ..........................~...
        ............................-.
        ........................-.....
        ..............................
        .........................~....
        ...........................-..
        ..............................
        ........................-.....
        ............................~.
        ..............................
      `,
    },
    speed: {
      at: [0, 3],
      grid: `
        ...~----------......
        ....................
        ~------.............
        .......~-------.....
        ....................
        ..~--------.........
        ....................
        ......~------.......
      `,
    },
    wisps: {
      at: [10, 1],
      grid: `
        +.....................
        ......................
        ...................+..
      `,
    },
    puff: {
      at: [12, 4],
      grid: `
        ..oooooooo..
        .oPPPPPPPPo.
        oPPPPPPPPPPo
        oPPPPPPPPPPo
        oPPPPPPPPPPo
        oPPPPPPPPPPo
        .oPPPPPPPPo.
        ..oooooooo..
      `,
    },
    motes: {
      at: [8, 0],
      grid: `
        .+............+.
        ................
        ......-.........
        ..-.........-...
        ................
        ...............+
        +...............
        ................
        .....-......-...
        ................
        ..+.............
        ...........-....
        ................
        ......+.........
        ................
        ................
      `,
    },
  },
  frames: {
    idle0: ["trailA", "curl", "swirl", "face"],
    idle1: [["trailB", 0, -1], ["curl2", 0, -1], ["swirl2", 0, -1], ["face", 0, -1], "wisps"],
    idle2: [
      ["trailA", 1, -1],
      ["curl", 0, -1],
      ["swirl", 0, -1],
      ["blink", 0, -1],
    ],
    move0: ["trailA", "curl", "swirl", "face"],
    move1: [
      ["trailB", 0, -1],
      ["curl2", 0, -1],
      ["swirl2", 0, -1],
      ["face", 0, -1],
    ],
    move2: [["trailA", -1, 0], "curl", "swirl", "face", "wisps"],
    move3: [
      ["trailB", -1, 1],
      ["curl2", 0, 1],
      ["swirl2", 0, 1],
      ["face", 0, 1],
    ],
    windup0: ["coil", ["swirl", -4, 1], "squint"],
    windup1: [["coilHot", -1, 0], ["swirl2", -5, 0], ["squint", -1, 0], "suck"],
    charge0: ["speed", "streak", "streakFace"],
    charge1: [
      ["speed", -2, 0],
      ["streak", 0, -1],
      ["streakFace", 0, -1],
    ],
    recover0: ["spent", "dizzy"],
    recover1: [
      ["spent", 0, 1],
      ["dizzy", 0, 1],
    ],
    hit: [
      ["curl2", -2, 0],
      ["swirl2", -2, 0],
      ["blink", -2, 0],
    ],
    die0: ["puff"],
    die1: [["puff", 0, -1], "motes"],
    die2: ["motes"],
  },
  anim: {
    idle: { frames: ["idle0", "idle1", "idle0", "idle1", "idle2", "idle2", "idle1"], fps: 6 },
    move: { frames: ["move0", "move1", "move2", "move3"], fps: 10 },
    windup: { frames: ["windup0", "windup1"], fps: 8 },
    charge: { frames: ["charge0", "charge1"], fps: 12 },
    recover: { frames: ["recover0", "recover1"], fps: 5 },
    hit: { frames: ["hit"], fps: 1, loop: false },
    die: { frames: ["die0", "die1", "die2"], fps: 12, loop: false, jump: 1 },
  },
});

// Earth ---------------------------------------------------------------------------------------

/** The boulder, 15×13, with its crack (`k`) down the middle. */
const boulder = `
  .....ooo.......
  ....oRRRoo.....
  ...oRRRRkro....
  ..oRRRRrkrroo..
  ..oRRRrrrkrrdo.
  .oRRRrrrkrrrdo.
  .oRRrrrrkrrrddo
  oRRrrrrrrkrrddo
  oRrrrrrrrkrdddo
  oRrrrrrrkrrdddo
  orrrrrrrkrrdddo
  oddddrrrkddddo.
  ooooooooooooooo
`;
/** Column of the crack in each row of the boulder, the line the halves break along. */
const CRACK = [7, 7, 8, 8, 9, 8, 8, 9, 9, 8, 8, 8, 8];
const half = (left: boolean) =>
  cut(boulder, (x, y) => (left ? x < (CRACK[y] ?? 8) : x > (CRACK[y] ?? 8)), "o");

/** A chunk of the boulder: a lit top face, a shaded front, a patch of moss on its shoulder. */
const pebbleBody = `
  ...DDDoo..
  ..DAAaDRo.
  .oRDaDRRro
  oRRRRRRrro
  orrrrrrrdo
  orrrrrrddo
  oddrrrdddo
  .oooooooo.
`;
/** The pebble landing, flattened. */
const PEBBLE_SQUASH = `
  ....DDDooo..
  ..ooDAAaDRo.
  .oRRDDaDRRro
  oRRRRRRRRrro
  orrrrrrrrddo
  .oooooooooo.
`;

const EARTH_LEGEND = {
  ".": null,
  o: "clay.deep",
  d: "clay.dark",
  r: "clay.mid",
  R: "clay.light",
  k: "clay.deep",
  K: "gold.light",
  D: "grass.deep",
  g: "grass.dark",
  a: "grass.mid",
  A: "grass.light",
  "*": "ink.deep",
  "~": "clay.pale",
} as const;

const moss = `
  ..DDD..
  .DAAaD.
  DAaaaaD
  DgggggD
`;
const moss2 = `
  ..DDD..
  .DaAAD.
  DaaaAAD
  DgggggD
`;

const earth = sprite({
  name: "element-earth",
  size: [30, 16],
  palette: EARTH_LEGEND,
  lone: "*~K",
  parts: {
    body: { at: [7, 2], grid: boulder },
    glow: { at: [7, 2], grid: swap(boulder, "k", "K") },
    left: { at: [7, 2], grid: half(true) },
    right: { at: [7, 2], grid: half(false) },
    face: { at: [10, 8], grid: FACE },
    blink: { at: [10, 8], grid: BLINK },
    shock: {
      at: [10, 8],
      grid: `
        **..**
        **..**
        ......
        ..**..
      `,
    },
    crown: { at: [10, 1], grid: moss },
    crown2: { at: [10, 1], grid: moss2 },
    mossLoose: {
      at: [10, 1],
      grid: `
        ..DDD..
        .DAAaD.
        DAaaaaD
        .DDDDD.
      `,
    },
    rock: {
      at: [18, 2],
      grid: `
        .oo.
        oRRo
        .oo.
      `,
    },
    rock2: {
      at: [19, 1],
      grid: `
        .oo.
        oRRo
        .oo.
      `,
    },
    // The two pebbles it breaks into, where the client puts them: 7 px either side.
    squashL: { at: [2, 9], grid: PEBBLE_SQUASH },
    squashR: { at: [16, 9], grid: PEBBLE_SQUASH },
    pebL: { at: [3, 7], grid: pebbleBody },
    pebR: { at: [17, 7], grid: pebbleBody },
    eyesL: {
      at: [6, 11],
      grid: `
        *..*
        *..*
      `,
    },
    eyesR: {
      at: [20, 11],
      grid: `
        *..*
        *..*
      `,
    },
    dust: {
      at: [0, 2],
      grid: `
        ..............................
        ...~.....................~....
        ..............................
        .~.........................~..
        ..............................
        ..............................
        ..............................
        ..............................
        ..............................
        ..............................
        ~............................~
        ..............................
        ..~.........................~.
      `,
    },
  },
  frames: {
    idle0: ["rock", "body", "crown", "face"],
    idle1: [
      ["rock2", 0, -1],
      ["body", 0, -1],
      ["crown", 0, -1],
      ["face", 0, -1],
    ],
    idle2: [
      ["rock", 0, -1],
      ["body", 0, -1],
      ["crown2", 0, -1],
      ["blink", 0, -1],
    ],
    move0: ["rock2", "body", "crown", "face"],
    move1: [
      ["rock", 0, -1],
      ["body", 0, -1],
      ["crown2", 0, -1],
      ["face", 0, -1],
    ],
    move2: ["rock2", "body", "crown", "face"],
    move3: [
      ["rock", 0, 1],
      ["body", 0, 1],
      ["crown", 0, 1],
      ["face", 0, 1],
    ],
    hit: [
      ["rock", 1, 0],
      ["body", 1, 0],
      ["crown2", 1, 0],
      ["blink", 1, 0],
    ],
    // The split: the crack lights, the halves fall apart, two pebbles stand up out of the dust.
    die0: [
      ["glow", 0, -1],
      ["crown", 0, -1],
      ["shock", 0, -1],
    ],
    die1: [
      ["left", -2, 0],
      ["right", 2, 0],
      ["mossLoose", -1, -1],
    ],
    die2: ["squashL", "squashR", "dust"],
    die3: ["pebL", "pebR", "eyesL", "eyesR", "dust"],
  },
  anim: {
    idle: { frames: ["idle0", "idle1", "idle0", "idle1", "idle2", "idle2", "idle1"], fps: 5 },
    move: { frames: ["move0", "move1", "move2", "move3"], fps: 6 },
    hit: { frames: ["hit"], fps: 1, loop: false },
    die: { frames: ["die0", "die1", "die2", "die3"], fps: 10, loop: false, jump: 1 },
  },
});

/**
 * 흙의 정령 조각: half a boulder that still means to get back to its place. Indignant and in a
 * hurry: it rocks on the spot, glaring, and bounces along in short hops.
 */
const pebble = sprite({
  name: "element-earth-pebble",
  size: [12, 12],
  palette: EARTH_LEGEND,
  lone: "*~",
  parts: {
    body: { at: [1, 4], grid: pebbleBody },
    squash: { at: [0, 6], grid: PEBBLE_SQUASH },
    eyes: {
      at: [4, 8],
      grid: `
        *..*
        *..*
      `,
    },
    // Brows down: still not where it belongs.
    glare: {
      at: [3, 8],
      grid: `
        **..**
        .*..*.
      `,
    },
    shut: {
      at: [3, 9],
      grid: `
        **..**
      `,
    },
    dust: {
      at: [0, 2],
      grid: `
        .~........~.
        ............
        ~..........~
        ............
        ....~..~....
        ............
        .~........~.
      `,
    },
    crumbs: {
      at: [1, 8],
      grid: `
        .oo....oo.
        oRRo..oRRo
        .oo....oo.
      `,
    },
  },
  frames: {
    idle0: ["body", "eyes"],
    idle1: [
      ["body", -1, 0],
      ["glare", -1, 0],
    ],
    idle2: ["body", "eyes"],
    idle3: [
      ["body", 1, 0],
      ["glare", 1, 0],
    ],
    move0: ["squash", ["glare", 0, 1]],
    move1: [
      ["body", 0, -2],
      ["glare", 0, -2],
    ],
    move2: [
      ["body", 0, -1],
      ["glare", 0, -1],
    ],
    move3: ["body", "glare"],
    hit: [
      ["body", 1, 0],
      ["shut", 1, 0],
    ],
    die0: ["squash", ["shut", 0, 1]],
    die1: ["crumbs", "dust"],
    die2: ["dust"],
  },
  anim: {
    idle: { frames: ["idle0", "idle1", "idle2", "idle3"], fps: 6 },
    move: { frames: ["move0", "move1", "move2", "move3"], fps: 10 },
    hit: { frames: ["hit"], fps: 1, loop: false },
    die: { frames: ["die0", "die1", "die2"], fps: 12, loop: false, jump: 1 },
  },
});

export default [fire, water, air, earth, pebble];
