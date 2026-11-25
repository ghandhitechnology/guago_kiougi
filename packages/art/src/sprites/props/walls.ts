import { sprite } from "../../format.ts";
import {
  clean,
  finish,
  frames,
  hline,
  IL,
  mounted,
  rect,
  rim,
  vline,
  WALL_H,
} from "../../interior.ts";
import { Pic } from "../../paint.ts";

/**
 * The school's walls from inside: back wall faces as 16-pixel pieces that join edge to edge
 * under the `wall-top` cap, and the things set into them. A face is three tiles tall and casts
 * a four-pixel shadow band on the floor in front of it. Faces anchor on their floor line;
 * windows, doors, boards and signs anchor one pixel in front of it (see `mounted`).
 */

const W = 16;
/** Rows of floor shadow a face brings below itself. */
const SHADE_ROWS = 4;

/** One step darker, along each material's ramp. */
const DARKER: Readonly<Record<string, string>> = {
  w: "k",
  k: "K",
  K: "M",
  M: "S",
  S: "I",
  L: "V",
  V: "M",
  W: "u",
  u: "U",
  U: "b",
  b: "B",
  "6": "D",
  D: "5",
  "5": "Z",
  P: "p",
  p: "t",
  t: "T",
  T: "C",
  m: "n",
  n: "N",
  N: "v",
};
const darker = (ch: string): string => DARKER[ch] ?? ch;

type Rows = readonly string[];

/** A scheme: 48 rows of one 16-pixel piece, top (under the cap) to floor line. */
function scheme(rows: (y: number, x: number) => string): Rows {
  return Array.from({ length: WALL_H }, (_, y) =>
    Array.from({ length: W }, (_, x) => rows(y, x)).join(""),
  );
}

/** 교실 and 자습실: cream plaster over a beadboard wainscot, a dark skirting. */
const CREAM = scheme((y, x) => {
  if (y === 0) return "M";
  if (y < 30) return "k";
  if (y === 30) return "W";
  if (y === 31) return "u";
  if (y === 32) return "U";
  if (y < 43) return x % 4 === 3 ? "U" : "u";
  if (y === 43) return "U";
  if (y < 47) return "b";
  return "B";
});

/** 복도: cream over the green lower half every school corridor has, a stripe between. */
const CORRIDOR = scheme((y) => {
  if (y === 0) return "M";
  if (y < 21) return "k";
  if (y === 21) return "K";
  if (y === 22) return "D";
  if (y < 43) return "6";
  if (y === 43) return "D";
  if (y < 47) return "5";
  return "Z";
});

/** 새벽관: striped wallpaper, a white skirting. */
const DORM = scheme((y, x) => {
  if (y === 0) return "p";
  if (y < 41) return x % 8 === 3 ? "p" : "P";
  if (y === 41) return "K";
  if (y === 42) return "w";
  if (y < 47) return "k";
  return "K";
});

/** 급식실 and labs: cream above, white tile below, a grey skirting. */
const TILED = scheme((y, x) => {
  if (y === 0) return "M";
  if (y < 18) return "k";
  if (y === 18) return "K";
  if (y < 43) return (y - 19) % 8 === 7 || x % 8 === 7 ? "K" : "w";
  if (y === 43) return "M";
  if (y < 47) return "S";
  return "I";
});

/** Draws rows into a picture with room for the floor shadow below. */
function face(rows: Rows, edit?: (p: Pic) => void): Pic {
  const p = Pic.blank(W, WALL_H + SHADE_ROWS);
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      p.set(x, y, ch);
    });
  });
  edit?.(p);
  return clean(p);
}

/** A corner where a side wall's shadow falls on the face: the first three columns darken. */
function shadeLeft(p: Pic): void {
  for (let y = 0; y < WALL_H; y++) {
    const a = p.at(0, y) as string;
    p.set(0, y, darker(darker(a)));
    p.set(1, y, darker(p.at(1, y) as string));
    p.set(2, y, darker(p.at(2, y) as string));
  }
}
/** The inside corner on the right: one darker column where the two walls meet. */
function shadeRight(p: Pic): void {
  for (let y = 0; y < WALL_H; y++) p.set(W - 1, y, darker(p.at(W - 1, y) as string));
}

const FLOOR_SHADE = (() => {
  const p = Pic.blank(W, WALL_H + SHADE_ROWS);
  rect(p, 0, WALL_H, W, SHADE_ROWS, "J");
  return p.toString();
})();

/**
 * One wall sprite per scheme, with frames `run`, `worn` (a mark of use), `outlet`, `end-l` and
 * `end-r` (the pieces at a room's corners).
 */
function wall(name: string, rows: Rows, worn: (p: Pic) => void) {
  const outlet = (p: Pic) => {
    rect(p, 6, 36, 4, 4, "w");
    hline(p, 6, 40, 4, "M");
    vline(p, 10, 36, 5, "M");
    p.set(7, 37, "S").set(7, 38, "S").set(8, 37, "S").set(8, 38, "S");
  };
  return sprite({
    name,
    group: "interior",
    size: [W, WALL_H + SHADE_ROWS],
    origin: [0, WALL_H - 1],
    palette: IL,
    outline: false,
    shadow: FLOOR_SHADE,
    frames: {
      run: face(rows).toString(),
      worn: face(rows, worn).toString(),
      outlet: face(rows, outlet).toString(),
      "end-l": face(rows, shadeLeft).toString(),
      "end-r": face(rows, shadeRight).toString(),
    },
    anim: { idle: { frames: ["run"], fps: 1 } },
  });
}

const walls = [
  // A chair knocked into the wainscot one too many times.
  wall("wall-cream", CREAM, (p) => {
    rect(p, 5, 35, 5, 2, "U");
    rect(p, 6, 37, 3, 1, "U");
  }),
  // Shoe scuffs along the green.
  wall("wall-corridor", CORRIDOR, (p) => {
    hline(p, 3, 39, 3, "D");
    hline(p, 9, 41, 4, "D");
    hline(p, 6, 36, 2, "D");
  }),
  // A sticker someone did not peel off when they moved rooms.
  wall("wall-dorm", DORM, (p) => {
    rect(p, 9, 22, 4, 4, "m");
    rect(p, 10, 23, 2, 2, "n");
  }),
  // One cracked tile.
  wall("wall-tiled", TILED, (p) => {
    p.set(9, 28, "K").set(10, 29, "K").set(10, 30, "K").set(11, 31, "K");
  }),
];

/** Shadow shapes for the floor beside a side wall: a band on the lit room's west edge. */
const wallShade = sprite({
  name: "wall-shade",
  group: "interior",
  size: [16, 16],
  origin: [0, 15],
  palette: IL,
  outline: false,
  frames: {
    v: Pic.blank(16, 16)
      .put(Pic.blank(4, 16, "J"), 0, 0)
      .toString(),
    corner: (() => {
      const p = Pic.blank(16, 16);
      rect(p, 0, 0, 4, 16, "J");
      rect(p, 0, 0, 16, 4, "J");
      return p.toString();
    })(),
  },
  anim: { idle: { frames: ["v"], fps: 1 } },
});

// Windows ---------------------------------------------------------------------------------------

const WIN_W = 32;
const WIN_H = 32;
/** Glass, in window pixels: two sashes, an upper fixed light above the transom. */
const isGlass = (x: number, y: number): boolean =>
  ((x >= 3 && x <= 14) || (x >= 17 && x <= 28)) && ((y >= 3 && y <= 9) || (y >= 12 && y <= 25));

type View = (x: number, y: number) => string;

/**
 * The skyline across the water, as the row each column's roof starts on. Shared by every view
 * so the city is the same city at every hour. View columns 12 and 13 sit behind the mullion.
 */
const SKYLINE = [
  14, 14, 14, 12, 12, 15, 15, 15, 13, 13, 14, 11, 11, 11, 11, 14, 13, 13, 13, 15, 15, 12, 12, 12,
  14, 14,
];
const roof = (x: number): number => SKYLINE[x] ?? 15;
/** Rows of the view: sea from 16, the sea wall at 19, the field from 20. */
const SEA = 16;
const WALL_ROW = 19;

/** 23:38 over the field: stars, the city across the water still awake, the dark 운동장. */
const NIGHT: View = (x, y) => {
  const stars = [
    [3, 2],
    [9, 5],
    [17, 1],
    [23, 4],
    [20, 10],
  ];
  if (stars.some(([sx, sy]) => sx === x && sy === y)) return "*";
  const lit = [
    [3, 13],
    [8, 14],
    [11, 12],
    [15, 15],
    [17, 14],
    [22, 13],
    [24, 15],
  ];
  if (y < roof(x)) return y < 5 ? "J" : "j";
  if (y < SEA) return lit.some(([lx, ly]) => lx === x && ly === y) ? "y" : "I";
  if (y < WALL_ROW) return (x === 3 || x === 11 || x === 22) && y === SEA + 1 ? "o" : "v";
  if (y === WALL_ROW) return "I";
  return "j";
};

/** Late afternoon: a low sun over the sea, the city dark against it, the field warm. */
const GOLD: View = (x, y) => {
  const dx = x - 19;
  const dy = y - 13;
  const d = dx * dx + dy * dy;
  if (y < roof(x) || y >= SEA) {
    if (y < SEA && d <= 4) return "w";
    if (y < SEA && d <= 9) return "Y";
  }
  if (y < roof(x)) return y < 4 ? "p" : y < 10 ? "P" : "Y";
  if (y < SEA) return "T";
  if (y < WALL_ROW) return Math.abs(x - 19) <= 1 && y !== SEA ? "Y" : "t";
  if (y === WALL_ROW) return "C";
  return "p";
};

/** Noon: clouds, the sea bright, the field pale. */
const DAY: View = (x, y) => {
  const cloud =
    (y === 4 && x >= 3 && x <= 9) ||
    (y === 3 && x >= 5 && x <= 8) ||
    (y === 10 && x >= 17 && x <= 23) ||
    (y === 9 && x >= 18 && x <= 21);
  if (cloud) return "w";
  if (y < roof(x)) return "m";
  if (y < SEA) return x % 4 === 1 && y > roof(x) ? "M" : "K";
  if (y < WALL_ROW) return y === SEA + 1 && x % 7 < 3 ? "~" : "9";
  if (y === WALL_ROW) return "M";
  return "P";
};

/** 23:40: a column of daylight standing on the field, marble rising inside it. */
const RIFT: View = (x, y) => {
  const c = Math.abs(x - 6.5);
  const spread = 1.5 + Math.max(0, (y - 4) / 5);
  if (c <= spread) {
    if (y > 14 && (x === 5 || x === 8)) return "w";
    return c <= spread - 1.5 ? "Y" : "y";
  }
  return NIGHT(x, y);
};

/** 19:20 in the rain: a dusk sky the colour of slate, the city's lights smeared, streaks on the glass. */
const RAIN =
  (f: number): View =>
  (x, y) => {
    const lit = [
      [3, 13],
      [8, 14],
      [11, 12],
      [15, 15],
      [22, 13],
      [24, 15],
    ];
    let base: string;
    if (y < roof(x)) base = y < 6 ? "v" : "N";
    else if (y < SEA) base = lit.some(([lx, ly]) => lx === x && ly === y) ? "y" : "j";
    else if (y < WALL_ROW) base = (x === 8 || x === 22) && y === SEA + 1 ? "o" : "v";
    else if (y === WALL_ROW) base = "I";
    else base = "j";
    // Rain: short dashes falling a little to the right, moving down each frame.
    const d = (x * 3 - y + f * 4 + 90) % 11;
    if ((d === 0 || d === 1) && (x + f) % 3 !== 1) return "n";
    // Drops beaded on the glass.
    if ((x === 4 && y === 8) || (x === 18 && y === 3) || (x === 21 && y === 18)) return "m";
    if ((x === 4 && y === 9) || (x === 18 && y === 4) || (x === 21 && y === 19)) return "m";
    return base;
  };

/** Reflections: one diagonal streak across each sash, in a tone the view decides. */
const glare = (x: number, y: number): boolean => {
  const d = (x - y + 64) % 32;
  return (d === 4 || d === 5) && y > 3;
};

function window(view: View, glint: string | null, curtain: boolean): Pic {
  const p = Pic.blank(WIN_W, WIN_H);
  // Recess shadow, aluminium frame, transom and mullions.
  rect(p, 0, 0, WIN_W, 27, "d");
  rect(p, 1, 1, WIN_W - 2, 25, "K");
  vline(p, WIN_W - 2, 1, 25, "M");
  hline(p, 1, 25, WIN_W - 2, "M");
  for (let y = 0; y < WIN_H; y++) {
    for (let x = 0; x < WIN_W; x++) {
      if (!isGlass(x, y)) continue;
      const v = view(x - 3, y - 3);
      p.set(x, y, glint && glare(x, y) && v !== "*" ? glint : v);
    }
  }
  // Shadow on the glass under the frame's top and inside its right edge.
  for (let x = 3; x <= 28; x++) if (isGlass(x, 3)) p.set(x, 3, darker(p.at(x, 3) as string));
  vline(p, 15, 2, 24, "K");
  vline(p, 16, 2, 24, "M");
  hline(p, 2, 10, 28, "K");
  hline(p, 2, 11, 28, "M");
  // Sill: lit top, front, the shadow it casts on the wall.
  hline(p, 0, 26, WIN_W, "w");
  hline(p, 0, 27, WIN_W, "k");
  hline(p, 0, 28, WIN_W, "K");
  hline(p, 0, 29, WIN_W, "M");
  hline(p, 1, 30, WIN_W - 2, "d");
  if (curtain) {
    for (const [x0, x1] of [
      [1, 5],
      [26, 30],
    ] as const) {
      rect(p, x0, 0, x1 - x0 + 1, 27, "n");
      for (let y = 0; y < 27; y++) {
        p.set(x0 + 1, y, "m");
        p.set(x0 + 3, y, "N");
      }
      hline(p, x0, 26, x1 - x0 + 1, "N");
    }
    hline(p, 0, 0, WIN_W, "N");
    hline(p, 0, 1, WIN_W, "n");
  }
  return finish(p, "*yo");
}

const VIEWS: readonly [string, View, string | null][] = [
  ["night", NIGHT, null],
  ["gold", GOLD, null],
  ["day", DAY, "w"],
  ["rift", RIFT, null],
  ["rain0", RAIN(0), null],
  ["rain1", RAIN(1), null],
  ["rain2", RAIN(2), null],
];

const windows = sprite({
  name: "window",
  group: "interior",
  size: [WIN_W, WIN_H],
  origin: mounted([WIN_W, WIN_H], 10),
  palette: { ...IL, "*": "stone.pale" },
  lone: "*yo",
  frames: Object.fromEntries(
    VIEWS.flatMap(([name, view, glint]) => [
      [name, window(view, glint, false).toString()],
      [`${name}-curtain`, window(view, glint, true).toString()],
    ]),
  ),
  anim: {
    idle: { frames: ["night"], fps: 1 },
    rain: { frames: ["rain0", "rain1", "rain2"], fps: 6 },
    "rain-curtain": { frames: ["rain0-curtain", "rain1-curtain", "rain2-curtain"], fps: 6 },
  },
});

// Doors -----------------------------------------------------------------------------------------

/** 교실 sliding door: a wooden leaf with a tall window, slid on a steel track. */
function slideDoor(open: boolean): Pic {
  const p = Pic.blank(20, 38);
  rect(p, 0, 0, 20, 38, "S");
  rect(p, 1, 1, 18, 37, "M");
  // The doorway behind.
  rect(p, 2, 2, 16, 36, "J");
  rect(p, 2, 30, 16, 8, "j");
  const x0 = open ? -9 : 2;
  // Leaf.
  rect(p, x0, 2, 16, 36, "u");
  vline(p, x0, 2, 36, "W");
  vline(p, x0 + 15, 2, 36, "U");
  hline(p, x0, 2, 16, "W");
  // Window.
  rect(p, x0 + 3, 5, 7, 14, "n");
  rect(p, x0 + 3, 5, 7, 1, "U");
  vline(p, x0 + 3, 5, 14, "U");
  for (let y = 7; y < 18; y++) {
    const d = (y + 64) % 6;
    if (d === 0 || d === 1) p.set(x0 + 4 + ((y * 2) % 5), y, "m");
  }
  rect(p, x0 + 4, 7, 2, 2, "m");
  rect(p, x0 + 7, 12, 2, 2, "m");
  hline(p, x0 + 3, 19, 7, "W");
  // Lower panel and the handle recess.
  rect(p, x0 + 3, 23, 10, 11, "U");
  rect(p, x0 + 4, 24, 8, 9, "u");
  rect(p, x0 + 12, 15, 2, 4, "b");
  // Clear what the leaf left outside the frame when slid open.
  if (open) for (let y = 0; y < 38; y++) for (let x = 0; x < 2; x++) p.set(x, y, "S");
  // Track at the floor.
  hline(p, 0, 37, 20, "K");
  return rim(clean(p));
}

/** Double doors: steel leaves, wired glass, push plates. */
function doubleDoor(open: boolean): Pic {
  const p = Pic.blank(36, 40);
  rect(p, 0, 0, 36, 40, "S");
  rect(p, 1, 1, 34, 39, "M");
  rect(p, 2, 3, 32, 37, "J");
  rect(p, 2, 32, 32, 8, "j");
  // Transom.
  rect(p, 2, 2, 32, 1, "K");
  if (!open) {
    for (const x0 of [2, 18]) {
      rect(p, x0, 3, 16, 37, "K");
      vline(p, x0, 3, 37, "k");
      vline(p, x0 + 15, 3, 37, "M");
      rect(p, x0 + 3, 6, 10, 16, "n");
      for (let y = 7; y < 21; y += 3) hline(p, x0 + 3, y, 10, "N");
      for (let x = x0 + 4; x < x0 + 13; x += 3) vline(p, x, 6, 16, "N");
      rect(p, x0 + 4, 7, 2, 2, "m");
      rect(p, x0 + 3, 25, 10, 2, "w");
      hline(p, x0 + 3, 27, 10, "M");
      hline(p, x0, 38, 16, "M");
    }
  } else {
    // Swung inward: only their edges show, the hall lit beyond.
    rect(p, 2, 3, 3, 37, "K");
    rect(p, 31, 3, 3, 37, "M");
    rect(p, 6, 30, 24, 10, "I");
  }
  hline(p, 0, 39, 36, "K");
  return rim(clean(p));
}

/** 새벽관 room door: a number plate nobody can read from here, the 점검 card slot. */
function dormDoor(card: "none" | "green" | "open"): Pic {
  const p = Pic.blank(20, 38);
  rect(p, 0, 0, 20, 38, "U");
  rect(p, 1, 1, 18, 37, "u");
  rect(p, 2, 2, 16, 36, "J");
  if (card !== "open") {
    rect(p, 2, 2, 16, 36, "W");
    vline(p, 2, 2, 36, "P");
    vline(p, 17, 2, 36, "u");
    // Panels.
    rect(p, 5, 6, 10, 12, "u");
    rect(p, 6, 7, 8, 10, "W");
    rect(p, 5, 22, 10, 12, "u");
    rect(p, 6, 23, 8, 10, "W");
    // Number plate.
    rect(p, 6, 3, 8, 3, "w");
    p.set(8, 4, "S").set(9, 4, "S").set(11, 4, "S").set(12, 4, "S");
    // Handle.
    rect(p, 14, 19, 3, 2, "K");
    p.set(14, 21, "M").set(15, 21, "M");
    if (card === "green") {
      rect(p, 7, 9, 6, 4, "g");
      hline(p, 7, 12, 6, "G");
      hline(p, 8, 10, 4, "h");
    }
  } else {
    rect(p, 2, 30, 16, 8, "j");
    rect(p, 2, 2, 3, 36, "W");
  }
  hline(p, 0, 37, 20, "U");
  return rim(clean(p));
}

const doors = [
  frames(
    "door-slide",
    { shut: slideDoor(false), open: slideDoor(true) },
    { origin: mounted([20, 38], 0) },
  ),
  frames(
    "door-double",
    { shut: doubleDoor(false), open: doubleDoor(true) },
    { origin: mounted([36, 40], 0) },
  ),
  frames(
    "door-dorm",
    { shut: dormDoor("none"), card: dormDoor("green"), open: dormDoor("open") },
    { origin: mounted([20, 38], 0) },
  ),
];

// Stairs ----------------------------------------------------------------------------------------

/**
 * Stairs down, seen from the landing: each tread a step lower and darker than the one before,
 * its nosing catching the light, until the flight turns out of sight. Low walls on both sides
 * with a handrail. Ground art: lay it in `details`.
 */
function stairsDown(): Pic {
  const p = Pic.blank(32, 48);
  const tread = ["k", "K", "K", "V", "M", "M", "S", "S", "I", "I", "j", "J"];
  const nose = ["w", "w", "k", "k", "K", "V", "M", "M", "S", "S", "I", "I"];
  for (let k = 0; k < 12; k++) {
    const y0 = 48 - (k + 1) * 4;
    rect(p, 4, y0, 24, 4, tread[k] as string);
    hline(p, 4, y0, 24, nose[k] as string);
    // The anti-slip strip just behind each nosing.
    if (k < 9) hline(p, 4, y0 + 1, 24, k < 3 ? "M" : (tread[k + 2] as string));
  }
  // Low walls on both sides seen from above: a pale cap, its inner face in shadow.
  for (const x of [0, 28]) {
    rect(p, x, 0, 4, 48, "K");
    vline(p, x, 0, 48, "d");
    vline(p, x + 3, 0, 48, "d");
    vline(p, x + 1, 0, 48, "w");
  }
  // The handrail along the left wall, on brackets.
  vline(p, 5, 0, 48, "w");
  vline(p, 6, 0, 48, "M");
  for (let y = 6; y < 48; y += 12) p.set(4, y, "S").set(4, y + 1, "S");
  return clean(p);
}

/** Stairs up, rising away from the corridor: lit treads, risers facing us, the flight above. */
function stairsUp(): Pic {
  const p = Pic.blank(32, 48);
  rect(p, 4, 0, 24, 48, "J");
  for (let k = 0; k < 9; k++) {
    const y0 = 48 - (k + 1) * 5;
    const far = k > 6;
    rect(p, 4, y0, 24, 2, far ? "K" : "k");
    hline(p, 4, y0 + 2, 24, far ? "k" : "w");
    rect(p, 4, y0 + 3, 24, 2, far ? "S" : "M");
  }
  rect(p, 4, 0, 24, 3, "J");
  for (const x of [0, 28]) {
    rect(p, x, 0, 4, 48, "K");
    vline(p, x, 0, 48, "d");
    vline(p, x + 3, 0, 48, "d");
    vline(p, x + 1, 0, 48, "w");
  }
  vline(p, 25, 0, 48, "w");
  vline(p, 26, 0, 48, "M");
  for (let y = 6; y < 48; y += 10) p.set(27, y, "S").set(27, y + 1, "S");
  return clean(p);
}

const stairs = sprite({
  name: "stairs",
  group: "interior",
  size: [32, 48],
  origin: [0, 0],
  palette: IL,
  outline: false,
  frames: { down: stairsDown().toString(), up: stairsUp().toString() },
  anim: { idle: { frames: ["down"], fps: 1 } },
});

// The corridor notice strip --------------------------------------------------------------------

/**
 * 복도 게시판: a cork strip in a wooden frame, any length from its pieces: `l`, then `a`, `b`
 * and `c` in any order, then `r`. Notices are shapes, never words.
 */
function noticePiece(kind: "l" | "a" | "b" | "c" | "r"): Pic {
  const p = Pic.blank(16, 20);
  rect(p, 0, 0, 16, 20, "t");
  hline(p, 0, 0, 16, "B");
  hline(p, 0, 1, 16, "W");
  hline(p, 0, 2, 16, "U");
  hline(p, 0, 17, 16, "U");
  hline(p, 0, 18, 16, "b");
  hline(p, 0, 19, 16, "B");
  // Cork grain.
  for (const [x, y] of [
    [3, 5],
    [10, 8],
    [6, 13],
    [13, 4],
    [1, 10],
  ] as const)
    p.set(x, y, "T").set(x + 1, y, "T");
  if (kind === "l") {
    vline(p, 0, 0, 20, "B");
    vline(p, 1, 1, 18, "W");
    vline(p, 2, 3, 14, "U");
  }
  if (kind === "r") {
    vline(p, 15, 0, 20, "B");
    vline(p, 14, 1, 18, "b");
    vline(p, 13, 3, 14, "U");
  }
  const sheet = (x: number, y: number, w: number, h: number, paper: string, ink: string) => {
    rect(p, x, y, w, h, paper);
    vline(p, x + w - 1, y + 1, h - 1, darker(paper));
    hline(p, x + 1, y + h - 1, w - 1, darker(paper));
    for (let ly = y + 2; ly < y + h - 2; ly += 2) hline(p, x + 1, ly, w - 3, ink);
    p.set(x + Math.floor(w / 2), y, "r");
  };
  if (kind === "a") {
    sheet(2, 4, 7, 10, "w", "K");
    sheet(10, 6, 5, 7, "Y", "o");
  }
  if (kind === "b") {
    sheet(1, 5, 6, 8, "m", "n");
    sheet(8, 3, 7, 12, "w", "M");
  }
  if (kind === "c") {
    sheet(3, 4, 10, 6, "P", "p");
    sheet(5, 11, 6, 5, "w", "K");
  }
  if (kind === "l") sheet(4, 5, 9, 9, "w", "K");
  if (kind === "r") sheet(3, 5, 8, 10, "k", "M");
  return clean(p, "r");
}

const notice = sprite({
  name: "notice",
  group: "interior",
  size: [16, 20],
  origin: [0, 20 + 18],
  palette: IL,
  lone: "r",
  outline: false,
  frames: Object.fromEntries(
    (["l", "a", "b", "c", "r"] as const).map((k) => [k, noticePiece(k).toString()]),
  ),
  anim: { idle: { frames: ["a"], fps: 1 } },
});

export default [...walls, wallShade, windows, ...doors, stairs, notice];
