import { cells, disc, grid, lit, stack, turn } from "../../draw.ts";
import { type Paint, type SpriteDef, sprite, variant } from "../../format.ts";
import { UI } from "../../ui-legend.ts";

/**
 * Pieces for the social screens (PLAN §12, §13): the 학생증 a player card is printed on, the
 * emote wheel and its eight icons, the party frame's crown, health fill and mode pips, the
 * trade window's seal, and the 대자보: cork, its wooden frame, paper in four colours, the
 * 층장's notice, thumbtacks and tape.
 */
const ui = { group: "ui", origin: [0, 0], anim: {} } as const;

// 학생증 --------------------------------------------------------------------------------------

/** A student ID: a navy band with a red stripe over cream card, corners rounded. */
const idcard = sprite({
  ...ui,
  name: "idcard",
  size: [12, 26],
  slice: [3, 3, 22, 3],
  palette: UI,
  frames: {
    idle: stack(
      ".oooooooooo.",
      "obbbbbbbbbbo",
      ["onnnnnnnnnno", 16],
      "oNNNNNNNNNNo",
      "orrrrrrrrrro",
      "oWWWWWWWWWWo",
      ["oWppppppppso", 3],
      "osssssssssso",
      ".oooooooooo.",
    ),
  },
});

// Emotes ----------------------------------------------------------------------------------------

/** Sparkles and the calendar's red mark: they stand alone and take no outline. */
const EMOTE_LONE = "+!";

/**
 * A 12×12 bubble frame from a fill mask: every clear pixel touching the fill (8 ways) becomes
 * ink, sparkles aside (`ink` off for a drawing inked by hand). The mask is centred, then moved
 * by (dx, dy) for a second frame.
 */
function icon(mask: string, dx = 0, dy = 0, ink = true): string {
  const m = cells(mask);
  const h = m.length;
  const w = m[0]?.length ?? 0;
  const ox = Math.floor((12 - w) / 2) + dx;
  const oy = Math.floor((12 - h) / 2) + dy;
  const at = (x: number, y: number) => {
    const c = m[y - oy]?.[x - ox];
    return c !== undefined && c !== "." ? c : undefined;
  };
  return grid(12, 12, (x, y) => {
    const c = at(x, y);
    if (c) return c;
    if (!ink) return ".";
    const near = [-1, 0, 1].some((ny) =>
      [-1, 0, 1].some((nx) => {
        const n = at(x + nx, y + ny);
        return n !== undefined && !EMOTE_LONE.includes(n);
      }),
    );
    return near ? "o" : ".";
  });
}

/**
 * The emote bubbles (PLAN §12), named by the content ids in `EMOTES`, two frames each: the
 * wheel shows frame 0, the bubble over a head plays both. 화이팅, 절 and 멘붕 are the emote
 * artist's drawings, which match the body animations of the same names.
 */
const EMOTE_MASKS: Readonly<Record<string, readonly [string, string]>> = (() => {
  const wave = stack(
    ".y.y.y....",
    ".y.y.y....",
    ".y.y.y..y.",
    ".yyyyy.yz.",
    ".yyyyyyyz.",
    ".yyyyyyz..",
    ".yyyyyz...",
    "..yyyzz...",
    "..yyzz....",
  );
  const lol = stack("RRRR.RRRR", "...R....R", "RRRR.RRRR", "...r....r", "...r....r", "...r....r");
  const sleepy = stack(
    "bbbbb.....",
    "...bb.....",
    "..bb......",
    ".bb..nnnn.",
    "bbbbb..nn.",
    "......nn..",
    ".....nnnn.",
  );
  const dance = stack(
    "...ffffff",
    "...ffffff",
    "...f....f",
    "...f....f",
    "...f....f",
    ".fff..fff",
    "ffff.ffff",
    "ffff.ffff",
    ".ff...ff.",
  );
  /** D-1 on the calendar, after the emote artist's 16×16; drawn whole, ink included. */
  const meltdown = stack(
    "..o.....o...",
    ".oooooooooo.",
    ".oxxxxxxxxo.",
    ".orrrrrrrro.",
    ".oooooooooo.",
    ".oWWWWWWWWo.",
    ".oooWWWWooo.",
    ".ooWoW!WWoo.",
    ".ooWoWWWWoo.",
    ".oooWWWWWoo.",
    ".oppppppppo.",
    ".oooooooooo.",
  );
  return {
    // 인사: an open hand raised, waving.
    wave: [icon(wave), icon(wave, 1, 0)],
    // 박수: two palms, apart and meeting.
    clap: [
      icon(
        stack(
          ".y.y..y.y.",
          ".y.y..y.y.",
          ".yyy..yyy.",
          "yyyy..yyyy",
          "yyyy..yyyy",
          ".yyy..yyz.",
          ".yyy..yyz.",
          "..yyyyzz..",
        ),
      ),
      icon(
        stack(
          "+.........+",
          "...y.yy.y..",
          "...y.yy.y..",
          "...yyyyyy..",
          "..yyyyyyyy.",
          "..yyyyyyyy.",
          "...yyyyyz..",
          "...yyyyyz..",
          "....yyzz...",
        ),
      ),
    ],
    // ㅋㅋ, shaking with laughter.
    lol: [icon(lol), icon(lol, 1, -1)],
    // 졸림: Z and a small z, drifting up.
    sleepy: [icon(sleepy), icon(sleepy, 0, -1)],
    // 화이팅: a raised fist, punched up with sparkles.
    fighting: [
      icon(
        stack(
          "............",
          "............",
          "..vvvvv.....",
          "..VVVVVV....",
          "..vvvvvV....",
          "..VVVVVi....",
          "...iiii.....",
          "...NnnN.....",
          "...NnnN.....",
          "............",
          "............",
          "............",
        ),
      ),
      icon(
        stack(
          "+.......+...",
          "..vvvvv.....",
          "..VVVVVV....",
          "..vvvvvV....",
          "..VVVVVi....",
          "...iiii.....",
          "...NnnN.....",
          "...NnnN.....",
          "............",
          "............",
          "............",
          "............",
        ),
      ),
    ],
    // 절: bowed to the floor, then lower.
    bow: [
      icon(
        stack(
          "............",
          "............",
          "............",
          "....bbnn....",
          "..bbnnnnNN..",
          ".bnnnnnnkk..",
          ".kknnnnkkk..",
          ".kk...VVk...",
          "............",
          ".SSSSSSSSS..",
          "............",
          "............",
        ),
      ),
      icon(
        stack(
          "............",
          "............",
          "............",
          "............",
          "...bbnnNN...",
          ".bbnnnnnkk..",
          ".kknnnnkkk..",
          ".kk...VVk...",
          "............",
          ".SSSSSSSSS..",
          "............",
          "............",
        ),
      ),
    ],
    // 춤: two beamed notes, bouncing.
    dance: [icon(dance), icon(dance, 0, 1)],
    // 멘붕: the calendar shakes.
    meltdown: [meltdown, icon(meltdown, 1, 0, false)],
  };
})();

const emoteBubbles = sprite({
  ...ui,
  name: "emote-bubble",
  size: [12, 12],
  palette: {
    ...UI,
    y: "flesh.pale",
    z: "flesh.light",
    v: "clay.pale",
    V: "clay.light",
    i: "clay.dark",
    f: "plum.light",
    "+": "gold.pale",
    "!": "red.mid",
  },
  lone: EMOTE_LONE,
  frames: Object.fromEntries(
    Object.entries(EMOTE_MASKS).flatMap(([id, [a, b]]) => [
      [`${id}0`, a],
      [`${id}1`, b],
    ]),
  ),
  anim: Object.fromEntries(
    Object.keys(EMOTE_MASKS).map((id) => [id, { frames: [`${id}0`, `${id}1`], fps: 4 }]),
  ),
});

/** A slot of the emote wheel, and the slot under the pointer. */
const wheelSlot = sprite({
  ...ui,
  name: "wheel-slot",
  size: [24, 24],
  palette: UI,
  frames: {
    idle: disc(
      24,
      [
        [1, "o"],
        [1, lit("W", "p", "s")],
      ],
      "p",
    ),
    hot: disc(
      24,
      [
        [1, "o"],
        [2, lit("y", "Y", "g")],
      ],
      "y",
    ),
  },
});

/** The hub the wheel turns about. */
const wheelHub = sprite({
  ...ui,
  name: "wheel-hub",
  size: [14, 14],
  palette: UI,
  frames: {
    idle: disc(
      14,
      [
        [1, "o"],
        [1, lit("b", "n", "N")],
      ],
      "n",
    ),
  },
});

// Party ----------------------------------------------------------------------------------------

const crown = sprite({
  ...ui,
  name: "crown",
  size: [7, 5],
  outline: false,
  palette: UI,
  frames: { idle: stack("Y..Y..Y", "YY.Y.YY", "YYYYYYY", "ggggggg", "GGGGGGG") },
});

/** The thin health fill of a party frame, and the empty groove of a member who is away. */
const partyFill = sprite({
  ...ui,
  name: "party-fill",
  size: [3, 3],
  slice: [1, 1, 1, 1],
  outline: false,
  palette: UI,
  frames: {
    hp: stack("RRR", "rrR", "xxr"),
    low: stack("eee", "RRe", "rrR"),
  },
});

/** One pip per control mode, in the colour of the HUD's mode chip. */
function pip(deep: string, light: string, mid: string): string {
  return stack(
    `.${deep}${deep}${deep}.`,
    `${deep}${light}${light}${mid}${deep}`,
    `${deep}${light}${mid}${mid}${deep}`,
    `${deep}${mid}${mid}${mid}${deep}`,
    `.${deep}${deep}${deep}.`,
  );
}

const modePips = sprite({
  ...ui,
  name: "mode-pip",
  size: [5, 5],
  palette: { ...UI, "1": "sea.deep", "3": "sea.mid", "4": "sea.light" },
  frames: {
    auto: pip("1", "4", "3"),
    semi: pip("o", "b", "n"),
    skill: pip("u", "Y", "g"),
    manual: pip("X", "R", "r"),
  },
});

/** Away from the game: the power mark. */
const offline = sprite({
  ...ui,
  name: "offline",
  size: [7, 7],
  outline: false,
  palette: UI,
  frames: {
    idle: stack("...d...", ".d.d.d.", "d..d..d", "d.....d", "d.....d", ".d...d.", "..ddd.."),
  },
});

// Trade ------------------------------------------------------------------------------------------

/** The red seal a side presses to confirm, and the dashed ring where it will land. */
function seal(on: boolean): string {
  const d = 21;
  const ring = disc(d, [[2, "r"]], ".");
  if (!on) {
    // Dashes of three pixels round a thin ring.
    return grid(d, d, (x, y) => {
      const r = Math.hypot(x + 0.5 - d / 2, y + 0.5 - d / 2);
      if (r > d / 2 - 0.3 || r < d / 2 - 1.4) return ".";
      return Math.floor(turn(x, y, d) * 16) % 2 === 0 ? "s" : ".";
    });
  }
  const tick = cells(
    stack(
      ".............",
      "...........rr",
      "..........rrr",
      ".........rrr.",
      "rr......rrr..",
      "rrr....rrr...",
      ".rrr..rrr....",
      "..rrrrrr.....",
      "...rrrr......",
      "....rr.......",
    ),
  );
  const base = cells(ring);
  tick.forEach((row, y) => {
    row.forEach((c, x) => {
      const line = base[y + 5];
      if (c !== "." && line) line[x + 4] = c;
    });
  });
  return base.map((r) => r.join("")).join("\n");
}

const seals = sprite({
  ...ui,
  name: "seal",
  size: [21, 21],
  outline: false,
  palette: UI,
  frames: { on: seal(true), off: seal(false) },
});

/** Two arrows passing each other: what goes, what comes. */
const swap = sprite({
  ...ui,
  name: "swap",
  size: [13, 11],
  outline: false,
  palette: UI,
  frames: {
    idle: stack(
      ".........m...",
      "..........m..",
      "mmmmmmmmmmmm.",
      "..........m..",
      ".........m...",
      ".............",
      "...m.........",
      "..m..........",
      ".mmmmmmmmmmmm",
      "..m..........",
      "...m.........",
    ),
  },
});

// 대자보 ---------------------------------------------------------------------------------------

/** Cork, tiled under the board: tan with dark and pale flecks scattered by a hash. */
function cork(): string {
  const hash = (x: number, y: number) => {
    let h = (x * 374761393 + y * 668265263) ^ 0x5bf03635;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  // Flecks come in pairs, as cork crumbs do, and leave most of the board plain.
  return grid(32, 32, (x, y) => {
    const n = hash(x >> 1, y);
    const m = hash(x, y >> 1);
    if (n < 0.035) return "a";
    if (m < 0.03) return "c";
    if (hash(x + 7, y + 3) < 0.025) return "f";
    return "E";
  });
}

const corkTile = sprite({
  ...ui,
  name: "cork",
  size: [32, 32],
  outline: false,
  lone: "acf",
  palette: { ".": null, E: "wood.light", a: "wood.mid", c: "wood.pale", f: "clay.mid" },
  frames: { idle: cork() },
});

/** The board's wooden frame: lit top left, a dark lip where it meets the cork. */
const boardFrame = sprite({
  ...ui,
  name: "board-frame",
  size: [12, 12],
  slice: [4, 4, 4, 4],
  palette: {
    ".": null,
    A: "wood.deep",
    C: "wood.dark",
    F: "wood.mid",
    H: "wood.pale",
  },
  frames: {
    idle: stack(
      ".AAAAAAAAAA.",
      "AHHHHHHHHHHA",
      "AHFFFFFFFFCA",
      "AHFAAAAAAFCA",
      ["AHFA....AFCA", 4],
      "AHFAAAAAAFCA",
      "AHFFFFFFFFCA",
      "ACCCCCCCCCCA",
      ".AAAAAAAAAA.",
    ),
  },
});

/** Paper: fill, then the shade along the right and bottom edges, a fold or a tear. */
function paper(style: "plain" | "fold" | "torn"): string {
  return grid(12, 12, (x, y) => {
    if (style === "fold" && x >= 8 && y <= 3) {
      const u = x - 8;
      if (u > y) return ".";
      if (u === y) return "D";
      return "S";
    }
    if (style === "torn" && x >= 8 && y >= 8) {
      const cut = [11, 10, 10, 9][y - 8] as number;
      if (x >= cut) return ".";
      if (x === cut - 1) return "S";
    }
    if (x === 11 || y === 11) return "S";
    return "F";
  });
}

function paperSprite(name: string, fill: Paint, shade: Paint, edge: Paint): SpriteDef {
  return sprite({
    ...ui,
    name,
    size: [12, 12],
    slice: [4, 4, 4, 4],
    outline: false,
    palette: { ".": null, F: fill, S: shade, D: edge },
    frames: { plain: paper("plain"), fold: paper("fold"), torn: paper("torn") },
  });
}

const papers = [
  paperSprite("note-white", "stone.bright", "stone.pale", "stone.light"),
  paperSprite("note-yellow", "gold.pale", "gold.light", "gold.mid"),
  paperSprite("note-pink", "rose.pale", "rose.light", "rose.mid"),
  paperSprite("note-blue", "navy.pale", "navy.light", "navy.mid"),
];

/** The 층장's notice: white paper ruled round in red, twice. */
const notice = sprite({
  ...ui,
  name: "notice-paper",
  size: [12, 12],
  slice: [4, 4, 4, 4],
  outline: false,
  palette: UI,
  frames: {
    idle: stack(
      "WWWWWWWWWWWp",
      "WrrrrrrrrrrW".replace(/W$/, "p"),
      "WrWWWWWWWWrp",
      "WrWxxxxxxWrp",
      ["WrWxWWWWxWrp", 4],
      "WrWxxxxxxWrp",
      "WrWWWWWWWWrp",
      "Wrrrrrrrrrrp",
      "pppppppppppp",
    ),
  },
});

/** A thumbtack seen from above: a round head lit top left. */
const tackRed = sprite({
  ...ui,
  name: "tack-red",
  size: [7, 6],
  palette: { ".": null, o: "red.deep", L: "red.pale", M: "red.light", D: "red.mid" },
  frames: {
    idle: stack("..ooo..", ".oLMMo.", "oLLMMDo", "oMMMDDo", ".oDDDo.", "..ooo.."),
  },
});
const tacks = [
  tackRed,
  variant(tackRed, { name: "tack-blue", recolor: { "red.*": "navy.*" } }),
  variant(tackRed, { name: "tack-gold", recolor: { "red.*": "gold.*" } }),
  variant(tackRed, { name: "tack-green", recolor: { "red.*": "grass.*" } }),
];

/** A strip of tape with torn ends. */
const tape = sprite({
  ...ui,
  name: "tape",
  size: [14, 6],
  outline: false,
  palette: UI,
  frames: {
    idle: stack(
      "..pppppppppp..",
      ".ppppppppppppp",
      "pWWWWWWWWWWWWp",
      ".ppppppppppppp",
      "pppppppppppp..",
      ".ssssssssss...",
    ),
  },
});

export default [
  idcard,
  emoteBubbles,
  wheelSlot,
  wheelHub,
  crown,
  partyFill,
  modePips,
  offline,
  seals,
  swap,
  corkTile,
  boardFrame,
  ...papers,
  notice,
  ...tacks,
  tape,
];
