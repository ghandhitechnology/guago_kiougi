import { disc, grid, lit, over, stack } from "../../draw.ts";
import { sprite } from "../../format.ts";
import { UI } from "../../ui-legend.ts";

/**
 * The HUD is cut from dark card so the field stays the brightest thing on screen. Colour is
 * kept for what changes: red for health, sea for EXP, gold for the 자습 pool, plum for bosses.
 */
const ui = { group: "ui", origin: [0, 0], anim: {} } as const;

const HUD = {
  ...UI,
  "1": "sea.deep",
  "2": "sea.dark",
  "3": "sea.mid",
  "4": "sea.light",
  "5": "sea.pale",
  "6": "plum.deep",
  "7": "plum.dark",
  "8": "plum.mid",
  "9": "plum.light",
  "0": "plum.pale",
} as const;

/** A dark card for clusters of HUD text. */
const plate = sprite({
  ...ui,
  name: "hud-plate",
  size: [6, 6],
  slice: [2, 2, 2, 2],
  palette: HUD,
  frames: { idle: stack(".oooo.", "ommmmo", ["omkkko", 2], "okkkko", ".oooo.") },
});

/** Bar grooves: fills sit one pixel in. */
const bar = sprite({
  ...ui,
  name: "bar",
  size: [6, 9],
  slice: [2, 2, 4, 4],
  palette: HUD,
  frames: { idle: stack(".oooo.", ["okkkko", 7], ".oooo.") },
});

const barThin = sprite({
  ...ui,
  name: "bar-thin",
  size: [6, 5],
  slice: [2, 2, 2, 2],
  palette: HUD,
  frames: { idle: stack(".oooo.", ["okkkko", 3], ".oooo.") },
});

/** Fills: lit from the top, with a bright leading edge at the right. */
function fill(top: string, body: string, low: string, edge: string): string {
  return stack(`${top}${top}${top}`, [`${body}${body}${edge}`, 4], [`${low}${low}${body}`, 2]);
}

const fills = sprite({
  ...ui,
  name: "fill",
  size: [3, 7],
  slice: [1, 1, 3, 3],
  outline: false,
  palette: HUD,
  frames: {
    hp: fill("R", "r", "x", "R"),
    /** The chunk just lost, trailing the HP fill before it drains. */
    lag: fill("e", "R", "r", "e"),
    boss: fill("9", "8", "7", "9"),
    /** A 논제 still ahead: full, unlit. */
    sealed: fill("l", "m", "k", "m"),
    /** A 논제 already won: struck through in red pen. */
    cleared: stack("kkk", "kkk", "rrr", "xxx", "kkk", "kkk", "kkk"),
  },
});

const fillsThin = sprite({
  ...ui,
  name: "fill-thin",
  size: [3, 3],
  slice: [1, 1, 1, 1],
  outline: false,
  palette: HUD,
  frames: {
    exp: stack("444", "334", "223"),
    pool: stack("YYY", "ggY", "GGg"),
  },
});

/**
 * Boss bar: the raid the whole server shares, so the proudest piece of the HUD. A gilt
 * medallion with the red 오답 X, then a gilt-rimmed groove for the four 논제. The groove
 * stretches; segments are drawn into it with `fill` frames, one pixel apart, a gold tick in
 * each gap.
 */
const MEDAL = 19;
const BOSS_W = MEDAL + 4;
const medal = over(
  disc(
    MEDAL,
    [
      [1, "o"],
      [2, lit("y", "Y", "G")],
      [1, "o"],
    ],
    "k",
  ),
  stack("RR.....RR", ".RR...RR.", "..RR.RR..", "...RRR...", "..rr.rr..", ".rr...rr.", "rr.....rr"),
  5,
  6,
);
const bossBar = sprite({
  ...ui,
  name: "boss-bar",
  size: [BOSS_W, MEDAL],
  slice: [MEDAL, 2, 9, 9],
  palette: HUD,
  frames: {
    idle: over(
      grid(BOSS_W, MEDAL, (x, y) => {
        if (x < 10 || y < 3 || y > 15) return ".";
        if (x === BOSS_W - 1) return y === 3 || y === 15 ? "." : "o";
        if (y === 3 || y === 15) return "o";
        if (x === BOSS_W - 2) return "g";
        if (y === 4) return "Y";
        if (y === 14) return "G";
        return "k";
      }),
      medal,
    ),
  },
});

/** The gold tick between two 논제 in the boss groove. */
const bossTick = sprite({
  ...ui,
  name: "boss-tick",
  size: [1, 9],
  outline: false,
  palette: HUD,
  frames: { idle: stack(["g", 9]) },
});

/** Control-mode chip, one colour per mode, from cool (auto) to hot (manual). */
function chip(deep: string, light: string, mid: string, dark: string): string {
  return stack(
    `.${deep}${deep}${deep}${deep}${deep}.`,
    `${deep}${light}${light}${light}${light}${light}${deep}`,
    [`${deep}${light}${mid}${mid}${mid}${mid}${deep}`, 9],
    `${deep}${dark}${dark}${dark}${dark}${dark}${deep}`,
    `.${deep}${deep}${deep}${deep}${deep}.`,
  );
}

const mode = sprite({
  ...ui,
  name: "mode",
  size: [7, 13],
  slice: [3, 3, 6, 6],
  palette: HUD,
  frames: {
    auto: chip("1", "4", "3", "2"),
    semi: chip("k", "b", "n", "N"),
    skill: chip("u", "y", "Y", "g"),
    manual: chip("X", "R", "r", "x"),
  },
});

/** The mode chip's glyph: a cycle arrow, because a tap moves to the next mode. */
const modeIcon = sprite({
  ...ui,
  name: "mode-icon",
  size: [7, 7],
  outline: false,
  lone: "w",
  palette: { ...HUD, w: "stone.bright" },
  frames: {
    cycle: stack(".www.w.", "w...ww.", "w..www.", "w......", "w.....w", ".w...w.", "..www.."),
  },
});

/** A round book slot. The 16×16 book icon sits at (4, 4). */
const SLOT = 24;
const bookSlot = sprite({
  ...ui,
  name: "book-slot",
  size: [SLOT, SLOT],
  palette: HUD,
  frames: {
    idle: disc(
      SLOT,
      [
        [1, "o"],
        [2, lit("l", "m", "k")],
        [1, "o"],
      ],
      "k",
    ),
    ready: disc(
      SLOT,
      [
        [1, "o"],
        [2, lit("y", "Y", "g")],
        [1, "o"],
      ],
      "k",
    ),
    locked: disc(
      SLOT,
      [
        [1, "o"],
        [2, lit("m", "k", "o")],
        [1, "o"],
      ],
      "o",
    ),
  },
});

/**
 * Cooldown, 16 steps. Under it the book is drawn one palette step darker (`book-dim`), and the
 * bright book is revealed clockwise from 12 o'clock as the cooldown runs out. This overlay is the
 * hand of that clock: a gold line from the centre to the rim at the revealed edge. Frame `cd00`
 * is a fresh cooldown.
 */
const STEPS = 16;
const cooldownFrames = Object.fromEntries(
  Array.from({ length: STEPS }, (_, i) => [
    `cd${String(i).padStart(2, "0")}`,
    grid(SLOT, SLOT, (x, y) => {
      const r = Math.hypot(x + 0.5 - SLOT / 2, y + 0.5 - SLOT / 2);
      if (r > SLOT / 2 - 4.25 || r < 1) return ".";
      const a = (i / STEPS) * 2 * Math.PI;
      // Distance from the hand: the ray from the centre at angle a, clockwise from 12.
      const dx = x + 0.5 - SLOT / 2;
      const dy = y + 0.5 - SLOT / 2;
      const along = dx * Math.sin(a) - dy * Math.cos(a);
      const across = dx * Math.cos(a) + dy * Math.sin(a);
      return along > 0 && Math.abs(across) < 0.75 ? "c" : ".";
    }),
  ]),
);
const cooldown = sprite({
  ...ui,
  name: "cooldown",
  size: [SLOT, SLOT],
  outline: false,
  palette: { ...HUD, c: "gold.pale" },
  lone: "c",
  frames: cooldownFrames,
});

/** A locked slot's padlock: a slot opens at each 전직. */
const lock = sprite({
  ...ui,
  name: "lock",
  size: [9, 10],
  palette: HUD,
  frames: {
    idle: stack(
      "..ooooo..",
      ".oSSSSSo.",
      ".oSoooSo.",
      ".oSo.oSo.",
      "ooooooooo",
      "oWpppppso",
      "oWppoppso",
      "opppoppso",
      "ossssssso",
      "ooooooooo",
    ),
  },
});

/** Minimap frame: dark card around a clear window. */
const minimap = sprite({
  ...ui,
  name: "minimap",
  size: [10, 10],
  slice: [4, 4, 4, 4],
  palette: HUD,
  frames: {
    idle: stack(
      ".oooooooo.",
      "ommmmmmmmo",
      "omkkkkkkko",
      "omkooookko",
      ["omko..okko", 2],
      "omkooookko",
      "omkkkkkkko",
      "okkkkkkkko",
      ".oooooooo.",
    ),
  },
});

/** Minimap marks: you, party members, a portal, the boss. */
const mapDot = sprite({
  ...ui,
  name: "map-dot",
  size: [7, 7],
  palette: HUD,
  frames: {
    me: stack(".......", "...o...", "..oWo..", ".oWWWo.", "oWWWWWo", "ooooooo", "......."),
    party: stack(".......", "..ooo..", ".o444o.", ".o333o.", ".o333o.", "..ooo..", "......."),
    portal: stack(".......", "..666..", ".69996.", ".69986.", ".68886.", "..666..", "......."),
    boss: stack("XX...XX", "XRX.XRX", ".XRXRX.", "..XRX..", ".XRXRX.", "XRX.XRX", "XX...XX"),
  },
});

export default [
  plate,
  bar,
  barThin,
  fills,
  fillsThin,
  bossBar,
  bossTick,
  mode,
  modeIcon,
  bookSlot,
  cooldown,
  lock,
  minimap,
  mapDot,
];
