import { cells, disc, grid, lit, over, stack, turn } from "../../draw.ts";
import { type Paint, type SpriteDef, sprite, variant } from "../../format.ts";
import { UI } from "../../ui-legend.ts";

/**
 * Pieces for the social screens (PLAN §12, §13): the 학생증 a player card is printed on, the
 * emote wheel and its eight icons, the party frame's crown, health fill and mode pips, the
 * trade window's seal, and the 대자보: cork, its wooden frame, paper in four colours, the
 * 층장's notice, thumbtacks and tape, and the furniture years of use left on it: a faded
 * 시간표, a 분실물 slip, the 층장's notice frame and rosette, a torn poster corner, scraps and old tape.
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

/** Where the player's own seal will land: a shallow round dent in the paper, lit from above. */
function sealSlot(): string {
  const shade = (t: number) => t > 0.6 || t < 0.1;
  return disc(
    21,
    [
      [1, (t) => (shade(t) ? "d" : "S")],
      [1, (t) => (shade(t) ? "S" : "p")],
    ],
    "p",
  );
}

const seals = sprite({
  ...ui,
  name: "seal",
  size: [21, 21],
  outline: false,
  palette: UI,
  frames: { on: seal(true), off: seal(false), slot: sealSlot() },
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

// The board's furniture: what has been on the corridor board for years, under the notes.

/**
 * Paper lying flat on the cork from a shape: `at` names each pixel ("." for none), and a
 * one-pixel shadow falls to the bottom right wherever paper does not cover it.
 */
function onCork(w: number, h: number, at: (x: number, y: number) => string): string {
  const has = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && at(x, y) !== ".";
  const shade = (x: number, y: number) => !has(x, y) && has(x - 1, y - 1);
  // A lone speck of shadow in a ragged edge reads as dirt: it is left out.
  const kept = (x: number, y: number) =>
    shade(x, y) &&
    [-1, 0, 1].some((dy) => [-1, 0, 1].some((dx) => (dx || dy) && shade(x + dx, y + dy)));
  return grid(w + 1, h + 1, (x, y) => (has(x, y) ? at(x, y) : kept(x, y) ? "z" : "."));
}

/**
 * The 시간표: a sun-faded grid of five days and seven periods, the subjects told apart by the
 * pale colours someone coloured them in, the day heads and period numbers worn to marks.
 */
function timetable(): string {
  const W = 61;
  const H = 54;
  const cols = [2, 8, 18, 28, 38, 48, 58];
  const rows = [2, 9, 15, 21, 27, 33, 39, 45, 51];
  // Subjects by period (rows) and day (columns); "." left white.
  const plan = ["nrgq.", "cngvr", "qo.nc", "rvqgn", "gcnrq", ".qvc.", "on.r."];
  // Worn day heads: two short strokes and a dot each, none the same.
  const heads = [
    ["...........", "..mm..m....", "..m...mm...", "..mm..m....", "..........."],
    ["...........", "..m.m.mm...", "..mmm..m...", "..m.m.mm...", "..........."],
    ["...........", "..mm.mm....", "...m..m....", "..mm..m....", "..........."],
    ["...........", "..mm..mm...", "..m...m....", "..mm..mm...", "..........."],
    ["...........", "..m..mm....", "..mm..m....", "..m..mm....", "..........."],
  ];
  return onCork(W, H, (x, y) => {
    // The bottom left corner has torn away.
    if (x + (H - 1 - y) < 4) return ".";
    if (x + (H - 1 - y) === 4) return "L";
    if (x === W - 1 || y === H - 1) return "L";
    const c = cols.findIndex((cx, i) => x > cx && x < (cols[i + 1] ?? -1));
    const r = rows.findIndex((ry, i) => y > ry && y < (rows[i + 1] ?? -1));
    const onLine = cols.includes(x) && y >= 2 && y <= 51;
    const onRow = rows.includes(y) && x >= 2 && x <= 58;
    if (onLine || onRow) return "L";
    if (c < 0 || r < 0) return "P";
    if (r === 0) {
      if (c === 0) return "L";
      return heads[c - 1]?.[y - 4]?.[x - (cols[c] as number) - 0] === "m" ? "m" : "L";
    }
    if (c === 0) {
      // Period numbers: a short tick per row.
      return x === 5 && y - (rows[r] as number) >= 2 && y - (rows[r] as number) <= 3 ? "m" : "P";
    }
    const subject = plan[r - 1]?.[c - 1] ?? ".";
    return subject === "." ? "P" : subject;
  });
}

const timetableSprite = sprite({
  ...ui,
  name: "board-timetable",
  size: [62, 55],
  outline: false,
  palette: {
    ".": null,
    P: "stone.pale",
    L: "stone.light",
    m: "stone.mid",
    n: "navy.pale",
    r: "rose.pale",
    g: "gold.pale",
    q: "grass.bright",
    c: "sea.pale",
    v: "plum.pale",
    o: "clay.pale",
    z: "wood.mid",
  },
  frames: { idle: timetable() },
});

/**
 * A 분실물 slip: someone's umbrella drawn in pen, two lines about it, and a fringe of tear-off
 * tabs, two of them taken.
 */
function lostSlip(): string {
  const W = 35;
  const H = 44;
  const umbrella = cells(
    stack(
      "......n......",
      "....nnnnn....",
      "..nnbbbbbnn..",
      ".nbBbbbbbbbn.",
      "nbBbbbbbbbbbn",
      "nnnnnnknnnnnn",
      "n..n..k..n..n",
      "......k......",
      "...k..k......",
      "....kk.......",
    ),
  );
  const taken = [1, 4];
  return onCork(W, H, (x, y) => {
    if (y >= 26) {
      // The fringe: six tabs a pixel apart.
      const tab = Math.floor(x / 6);
      if (x % 6 === 5) return ".";
      if (taken.includes(tab)) return y <= 27 && (x + y) % 3 !== 0 ? "p" : ".";
      if (y === H - 1 || x % 6 === 4) return "p";
      // A number written down the tab.
      const ty = y - 29;
      return x % 6 === 2 && ty >= 0 && ty <= 10 && ty % 4 !== 3 ? "S" : "W";
    }
    // Where the tabs are cut.
    if (y === 25) return x % 3 === 2 ? "W" : "s";
    if (x === W - 1) return "p";
    const u = umbrella[y - 3]?.[x - 11];
    if (u && u !== ".") return u;
    // Two lines in pen, broken into words.
    if ((y === 17 || y === 18) && x >= 5 && x <= 29 && ![11, 12, 20].includes(x)) return "S";
    if ((y === 21 || y === 22) && x >= 5 && x <= 22 && ![9, 10, 16].includes(x)) return "S";
    return "W";
  });
}

const lostSprite = sprite({
  ...ui,
  name: "board-lost",
  size: [36, 45],
  outline: false,
  palette: { ...UI, z: "wood.mid" },
  frames: { idle: lostSlip() },
});

/**
 * The corner of an old 축제 poster, torn off down to its tack: a printed sun and stripes on
 * faded pink, white paper showing along the tear.
 */
function posterCorner(): string {
  const W = 30;
  const H = 22;
  const jag = [0, 1, 1, 0, 2, 1, 0, 1, 2, 2, 1, 0, 1, 0, 2, 1, 1, 0, 2, 1, 0, 1];
  return onCork(W, H, (x, y) => {
    const edge = Math.round(y * 1.25) + (jag[y] ?? 0);
    if (x < edge) return ".";
    if (x === edge || x === edge + 1) return "W";
    if (y === 0 || x === W - 1) return "e";
    if (Math.hypot(x - 23, y - 7) < 6) return "y";
    if ((x + y * 2) % 9 < 2) return "E";
    return "e";
  });
}

const posterSprite = sprite({
  ...ui,
  name: "board-poster",
  size: [31, 23],
  outline: false,
  palette: { ...UI, e: "rose.pale", E: "rose.light", z: "wood.mid" },
  frames: { idle: posterCorner() },
});

/** Bits of paper left under a tack when a note was pulled off. */
const scraps = sprite({
  ...ui,
  name: "board-scrap",
  size: [9, 7],
  outline: false,
  palette: {
    ".": null,
    W: "stone.bright",
    p: "stone.pale",
    y: "gold.pale",
    Y: "gold.light",
    z: "wood.mid",
  },
  frames: {
    white: stack(
      "WWWWWWW..",
      "WWWWWWWz.",
      "WWWWWppz.",
      "WWWWppz..",
      "WWppzz...",
      ".Wzz.....",
      ".........",
    ),
    yellow: stack(
      "..yyyyyy.",
      ".yyyyyyyz",
      "yyyyyyyyz",
      ".yyYyyYzz",
      "..YYzYYz.",
      "...zz.z..",
      ".........",
    ),
  },
});

/** Tape gone yellow, left where a poster was taken down. */
const oldTape = sprite({
  ...ui,
  name: "board-tape",
  size: [12, 6],
  outline: false,
  palette: { ".": null, y: "gold.pale", Y: "gold.light", W: "stone.bright" },
  frames: {
    long: stack(
      "YyyyyyyyyyY.",
      ".YyyyyyyyyYY",
      "YYyyyyyyyyY.",
      ".YyyyyyyyyYY",
      "............",
      "............",
    ),
    stub: stack(
      "....yyyyy...",
      "...yyyyyyy..",
      "...yyWWyyy..",
      "...yWWWyy...",
      "....yyyy....",
      "............",
    ),
  },
});

/**
 * The 층장's notice frame: an aluminium frame screwed to the cork, lit top left, with a lip
 * where the notice sits. Its middle is clear.
 */
const noticeFrame = sprite({
  ...ui,
  name: "notice-frame",
  size: [12, 12],
  slice: [4, 4, 4, 4],
  outline: false,
  palette: {
    ".": null,
    D: "stone.deep",
    d: "stone.dark",
    S: "stone.mid",
    s: "stone.light",
    W: "stone.bright",
  },
  frames: {
    idle: stack(
      "DDDDDDDDDDDD",
      "DWWWWWWWWWsD",
      "DWssssssssSD",
      "DWsDDDDDDDSD",
      ["DWsD....DdSD", 4],
      "DWsDDDDDDdSD",
      "DssddddddSSD",
      "DsSSSSSSSSSD",
      "DDDDDDDDDDDD",
    ),
  },
});

/** The 층장's rosette, pinned to the top of the frame: a gold disc on two red tails. */
const rosette = sprite({
  ...ui,
  name: "floor-rosette",
  size: [9, 13],
  palette: UI,
  frames: {
    idle: over(
      stack([".........", 8], ".XrX.XrX.", ".XrX.XrX.", ".XrX.XrX.", "XrX...XrX", "XX.....XX"),
      disc(
        9,
        [
          [1, "u"],
          [1, lit("y", "Y", "G")],
        ],
        "g",
      ),
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
  timetableSprite,
  lostSprite,
  posterSprite,
  scraps,
  oldTape,
  noticeFrame,
  rosette,
];
