/**
 * A building kit: facade bays, east faces and flat-roof pieces for any material, in 16-pixel
 * pieces that join edge to edge (so they draw their outer outline by hand). A floor is 48 pixels:
 * a slab band, wall, a recessed window with its sill, and a plinth on the ground floor.
 *
 * Grids are written in role letters (wall, slab, sill, plinth); a material is a legend for the
 * roles, so one drawing serves concrete, brick and panel buildings. Glass is daylight glass in
 * several states: sky reflection, blinds, open with a curtain out, lights on, a poster taped up,
 * a plant on the sill, someone looking out.
 */
import type { Legend } from "./format.ts";
import { Pic, smooth } from "./paint.ts";

export const BAY = 16;
export const FLOOR = 48;
const GLASS_W = 12;
const GLASS_H = 20;

/** Colours every material shares: glass, frames, things seen through the glass. */
export const GLASS: Legend = {
  ".": null,
  n: "navy.pale",
  N: "navy.light",
  v: "navy.mid",
  j: "navy.dark",
  J: "ink.dark",
  I: "ink.mid",
  w: "stone.bright",
  M: "stone.mid",
  K: "stone.light",
  k: "stone.pale",
  Y: "gold.pale",
  y: "gold.light",
  O: "gold.mid",
  c: "sea.mid",
  C: "sea.light",
  g: "grass.light",
  G: "grass.mid",
  u: "clay.mid",
  U: "clay.dark",
  q: "stone.pale",
  Q: "red.mid",
  z: "navy.mid",
  b: "wood.mid",
  B: "wood.dark",
};

export type GlassState = "sky" | "blind" | "dark" | "open" | "lit" | "poster" | "plant" | "face";

/** One row of glass, 12 wide, for row `r` of `h`. */
type Glass = (r: number, h: number) => string;

const mullion = (row: string): string => `${row.slice(0, 5)}MK${row.slice(7)}`;

/** Sky in the glass: bright at the top, darker lower down, one diagonal glint. */
const sky: Glass = (r, h) => {
  if (r === 6) return "KKKKKKKKKKKK";
  if (r === 7) return "MMMMMMMMMMMM";
  let row = "";
  for (let x = 0; x < GLASS_W; x++) {
    const glint = (x + r) % 13 === 0 || (x + r) % 13 === 1;
    const far = (x + r) % 13 === 4;
    let ch = r < 3 ? "n" : r < 6 ? "N" : r < h * 0.62 ? "N" : "v";
    if (glint && r < h - 2) ch = r < 6 ? "w" : "n";
    else if (far && r > 8 && r < h - 3) ch = "n";
    row += ch;
  }
  return r > 7 ? mullion(row) : row;
};

/** Venetian blinds let down over the top half. */
const blind: Glass = (r, h) => {
  const stop = Math.floor(h * 0.55);
  if (r < stop) return r % 2 === 0 ? "kkkkkkkkkkkk" : "KKKKKKKKKKKK";
  if (r === stop) return "MMMMMMMMMMMM";
  return sky(r, h);
};

/** An empty room in shade, the far wall's window a pale square. */
const dark: Glass = (r) => {
  if (r === 6) return "KKKKKKKKKKKK";
  if (r === 7) return "MMMMMMMMMMMM";
  const row =
    r < 6 ? "vvvvvvvvvvvv" : r < 10 ? "jjjjjjjjjjjj" : r < 14 ? "jjNNjjjjjjjj" : "JJJJJJJJJJJJ";
  const streak = (x: number) => (x + r) % 11 === 0;
  const out = [...row].map((ch, x) => (streak(x) && r < 6 ? "N" : ch)).join("");
  return r > 7 ? mullion(out) : out;
};

/** A pane slid open, the room dark behind, a curtain pushed out by the wind. */
const open: Glass = (r, h) => {
  const base = dark(r, h);
  const curtain = r < 3 ? 2 : r < 10 ? 3 : r < 15 ? 2 : 1;
  const cells = [...base];
  for (let x = 0; x < curtain; x++) cells[GLASS_W - 1 - x] = x === 0 ? "c" : "C";
  if (r > 7) cells[5] = "M";
  return cells.join("");
};

/** The same open pane a moment later, the curtain sucked back in. */
const open2: Glass = (r, h) => {
  const base = dark(r, h);
  const curtain = r < 4 ? 1 : r < 12 ? 2 : r < 16 ? 3 : 2;
  const cells = [...base];
  for (let x = 0; x < curtain; x++) cells[GLASS_W - 1 - x] = x === 0 ? "c" : "C";
  if (r > 7) cells[5] = "M";
  return cells.join("");
};

/** Lights on inside: fluorescent tubes at the top, the room warm below. */
const lit: Glass = (r) => {
  if (r === 0) return "YYYYYYYYYYYY";
  if (r === 1) return "yYYYYyyYYYYy";
  if (r === 6) return "KKKKKKKKKKKK";
  if (r === 7) return "MMMMMMMMMMMM";
  if (r < 6) return "yyyyyyyyyyyy";
  if (r > 15) return mullion("OOOOOOOOOOOO");
  if (r === 13 || r === 14) return mullion("yOOyyyyyyOOy");
  return mullion("yyyyyyyyyyyy");
};

/** A research poster taped inside, its title and figures too small to read. */
const poster: Glass = (r, h) => {
  const base = sky(r, h);
  const rows = [
    "qqqqqq",
    "qQQQQq",
    "qqqqqq",
    "qzzqQq",
    "qzzqQq",
    "qqqqqq",
    "qzzqqq",
    "qzzqqq",
    "qqqqqq",
  ];
  const p = rows[r - 9];
  if (!p) return base;
  return `${base.slice(0, 1)}${p}${base.slice(7)}`;
};

/** A potted plant on the inside sill. */
const plant: Glass = (r, h) => {
  const base = sky(r, h);
  const rows = ["..gg..", ".gGgg.", "gGggGg", ".gGGg.", "..GG..", ".uuuu.", ".uUUu.", "..uu.."];
  const p = rows[r - (h - 8)];
  if (!p) return base;
  return [...base]
    .map((ch, x) => (x >= 6 && x < 12 && p[x - 6] !== "." ? (p[x - 6] as string) : ch))
    .join("");
};

/** Somebody at the window, chin on hand, looking out at the yard. */
const face: Glass = (r, h) => {
  const base = dark(r, h);
  const rows = ["...JJ...", "..JIIJ..", "..JIIJ..", "...JJ...", ".JIIIIJ.", "JIIIIIIJ", "JIIIIIIJ"];
  const p = rows[r - (h - 7)];
  if (!p) return base;
  return [...base]
    .map((ch, x) => (x >= 2 && x < 10 && p[x - 2] !== "." ? (p[x - 2] as string) : ch))
    .join("");
};

const GLASSES: Record<GlassState, Glass> = {
  sky,
  open2,
  blind,
  dark,
  open,
  lit,
  poster,
  plant,
  face,
};

// Facade bays ------------------------------------------------------------------------------------

/**
 * Role letters: `o` outline, `L` slab lit edge, `H` slab face, `h` slab shade, `F` wall, `f`
 * wall joint, `E` reveal in shade, `e` reveal in light, `T` sill top, `t` sill face, `s` sill
 * shade, `P` plinth, `p` plinth shade.
 */
const SLAB = ["LLLLLLLLLLLLLLLL", "HHHHHHHHHHHHHHHH", "HHHHHHHHHHHHHHHH", "hhhhhhhhhhhhhhhh"];
const WALL = "FFFFFFFFFFFFFFFF";
const JOINT = "FFFFFFFffFFFFFFF";
const PLINTH = ["PPPPPPPPPPPPPPPP", "pppppppppppppppp", "pppppppppppppppp", "oooooooooooooooo"];

function windowRows(glass: Glass): string[] {
  const out = [`F${"o".repeat(14)}F`];
  for (let r = 0; r < GLASS_H; r++) out.push(`FE${glass(r, GLASS_H)}eF`);
  out.push("FTTTTTTTTTTTTTTF", "FttttttttttttttF", "FssssssssssssssF");
  return out;
}

function floorGrid(glass: Glass | null, ground: boolean): string[] {
  const rows = [...SLAB, WALL, WALL];
  if (glass) rows.push(...windowRows(glass));
  while (rows.length < FLOOR - (ground ? PLINTH.length : 0))
    rows.push(rows.length === 38 ? JOINT : WALL);
  if (ground) rows.push(...PLINTH);
  return rows.slice(0, FLOOR);
}

/** Glass double door, two bays: the corridor's light behind sky glass, push bars, a step. */
function doorGrid(side: "l" | "r"): string[] {
  const rows = [...SLAB, WALL, WALL];
  rows.push(side === "l" ? "FFFooooooooooooo" : "oooooooooooooFFF");
  for (let r = 0; r < 37; r++) {
    let inner: string;
    if (r < 2) inner = "nnnnnnnnnnn";
    else if (r === 15) inner = "KKKKKKKKKKK";
    else if (r === 16) inner = "MMMMMMMMMMM";
    else if (r < 15) inner = [...Array(11)].map((_, x) => ((x + r) % 9 < 2 ? "n" : "N")).join("");
    else if (r > 32) inner = "vvvvvvvvvvv";
    else
      inner = [...Array(11)].map((_, x) => ((x + r) % 9 < 2 ? "N" : r > 25 ? "v" : "N")).join("");
    if (r === 20 || r === 21)
      inner = side === "l" ? `${inner.slice(0, 7)}KKKK` : `KKKK${inner.slice(4)}`;
    rows.push(side === "l" ? `FFoE${inner}o` : `o${inner}eoFF`);
  }
  rows.push(side === "l" ? "FFoooooooooooooo" : "ooooooooooooooFF");
  rows.push(side === "l" ? "PPoppppppppppppp" : "ppppppppppppppPP");
  rows.push("pppppppppppppppp", "oooooooooooooooo");
  return smoothRows(rows.slice(0, FLOOR));
}

/** Folds stray single pixels into their neighbours. */
function smoothRows(rows: string[]): string[] {
  return smooth(Pic.of(rows.join("\n")), "o")
    .toString()
    .split("\n");
}

/** A single steel side door with a wired glass light, one bay. */
function sideDoorGrid(): string[] {
  const rows = [...SLAB, WALL, WALL, WALL, WALL];
  rows.push("FFoooooooooooFFF");
  for (let r = 0; r < 30; r++) {
    let inner = "KKKKKKKKK";
    if (r < 10 && r > 1) inner = r === 2 || r === 9 ? "KMMMMMMMK" : "KMvNvNvMK";
    if (r === 16) inner = "KKKKKKKMM";
    if (r > 26) inner = "MMMMMMMMM";
    rows.push(`FFo${inner}oFFF`.slice(0, 15).padEnd(16, "F"));
  }
  rows.push("FFoooooooooooFFF", ...PLINTH.slice(0, 3), "oooooooooooooooo");
  while (rows.length < FLOOR) rows.splice(rows.length - 4, 0, WALL);
  return rows.slice(0, FLOOR);
}

/** A building corner: the outline, a lit arris on the west end, a shaded one on the east. */
function corner(grid: string[], side: "l" | "r"): string[] {
  return grid.map((row) => {
    const cells = [...row];
    if (side === "l") {
      cells[0] = "o";
      cells[1] = "L";
      cells[2] = cells[2] === "o" ? "o" : "F";
    } else {
      cells[14] = "h";
      cells[15] = "o";
    }
    return cells.join("");
  });
}

/** Brick: four-pixel courses in running bond over every wall pixel. */
function brick(grid: string[], floorTop: number): string[] {
  return grid.map((row, y) =>
    [...row]
      .map((ch, x) => {
        if (ch !== "F") return ch;
        const yy = y + floorTop;
        if (yy % 4 === 3) return "f";
        const shift = Math.floor(yy / 4) % 2 ? 4 : 0;
        if ((x + shift) % 8 === 7) return "f";
        // A few darker bricks.
        const id = Math.floor((x + shift) / 8) * 7 + Math.floor(yy / 4) * 3;
        return id % 11 === 0 ? "d" : "F";
      })
      .join(""),
  );
}

/**
 * A pier: a column standing a hand proud of the wall between window groups, lit on its west
 * edge, shaded on its east, so a long facade reads in bays instead of as a flat sheet.
 */
function pier(grid: string[]): string[] {
  return grid.map((row, y) => {
    if (y < 4) return row;
    const cells = [...row];
    cells[4] = "o";
    cells[5] = "L";
    for (let x = 6; x < 10; x++) if (cells[x] !== "p" && cells[x] !== "o") cells[x] = "F";
    cells[10] = "E";
    cells[11] = "o";
    if (cells[12] === "F" || cells[12] === "f") cells[12] = "e";
    return cells.join("");
  });
}

export interface FacadeOptions {
  readonly texture?: "plain" | "brick";
  /** Glass states to draw. Every state gets a ground (`g-`) and an upper (`u-`) frame. */
  readonly glass: readonly GlassState[];
}

/** Every facade frame for one material: walls, windows, doors and corners, ground and upper. */
export function facadeFrames(opt: FacadeOptions): Record<string, string> {
  const finish = (rows: string[]): string =>
    smoothRows(opt.texture === "brick" ? brick(rows, 0) : rows).join("\n");
  const frames: Record<string, string> = {};
  for (const ground of [true, false]) {
    const p = ground ? "g" : "u";
    frames[`${p}-wall`] = finish(floorGrid(null, ground));
    frames[`${p}-end-l`] = finish(corner(floorGrid(null, ground), "l"));
    frames[`${p}-end-r`] = finish(corner(floorGrid(null, ground), "r"));
    frames[`${p}-pier`] = finish(pier(floorGrid(null, ground)));
    for (const state of opt.glass)
      frames[`${p}-${state}`] = finish(floorGrid(GLASSES[state], ground));
  }
  frames["door-l"] = finish(doorGrid("l"));
  frames["door-r"] = finish(doorGrid("r"));
  frames["door-side"] = finish(sideDoorGrid());
  return frames;
}

/**
 * The east face at a slant, in shade: slab bands, a narrow stair window per floor, closed by
 * its outline on the far edge. Role letters as the facade, all in their shaded steps.
 */
export function sideFrames(): Record<string, string> {
  const side = (ground: boolean): string => {
    const rows: string[] = [];
    for (let y = 0; y < FLOOR; y++) {
      let row: string;
      if (y === 0 || y === 3) row = "ppppppppp";
      else if (y < 3) row = "hhhhhhhhh";
      else if (ground && y === FLOOR - 1) row = "ooooooooo";
      else if (ground && y >= FLOOR - 4) row = "ppppppppp";
      else if (y === 12) row = "hhhoooohh";
      else if (y > 12 && y < 30) row = "hhhojjohh";
      else row = "hhhhhhhhh";
      rows.push(`${row}o`);
    }
    return rows.join("\n");
  };
  return { ground: side(true), up: side(false) };
}

/**
 * Curtain glass, a whole bay of it: sky glass between thin mullions, a spandrel at each slab.
 * For lobbies, stair towers and the ends of a skybridge.
 */
export function curtainFrames(state: "sky" | "lit"): Record<string, string> {
  const bay = (ground: boolean): string => {
    const rows: string[] = [];
    for (let y = 0; y < FLOOR; y++) {
      if (y === 0) rows.push("LLLLLLLLLLLLLLLL");
      else if (y < 3) rows.push("HHHHHHHHHHHHHHHH");
      else if (y === 3) rows.push("oooooooooooooooo");
      else if (ground && y >= FLOOR - 4) rows.push(PLINTH[y - (FLOOR - 4)] as string);
      else {
        const r = y - 4;
        const glass = state === "lit" ? lit(r % 20, 20) : sky(r % 20, 20);
        const cells = [...`${glass}${glass.slice(0, 2)}`.slice(0, 14)];
        if (r === 21) cells.fill("K");
        rows.push(`M${cells.join("")}K`);
      }
    }
    return smooth(Pic.of(rows.join("\n")), "oLHMK").toString();
  };
  return { g: bay(true), u: bay(false) };
}

// Flat roof ----------------------------------------------------------------------------------------

/**
 * Flat roof pieces, 16×16, seen from above: a parapet around a roof painted green against the
 * rain the way every school roof is, with seams, a drain, stains and a patch. The west parapet
 * throws a shadow east across the paint; the east parapet's inner face catches the sun.
 * Role letters: `o` outline, `L` parapet top lit, `H` parapet top, `h` parapet face in shade,
 * `e` parapet face in light, `R` roof paint, `r` paint in shadow, `x` seam, `X` stain, `D` drain.
 */
export const ROOF_ROLES = "oLHheRrxXD";

function roofFill(v: number): Pic {
  const pic = Pic.blank(16, 16, "R");
  // Seams every 8 pixels, running bond, one row each way.
  for (let x = 0; x < 16; x++) pic.set(x, 7, "x");
  for (let y = 0; y < 16; y++) if (y !== 7) pic.set(y < 7 ? 3 : 11, y, "x");
  if (v === 1) {
    for (const [x, y] of [
      [6, 10],
      [7, 10],
      [6, 11],
      [7, 11],
      [8, 11],
      [7, 12],
    ])
      pic.set(x as number, y as number, "X");
  }
  if (v === 2) {
    pic.put("DDD\nDDD", 6, 2);
  }
  if (v === 3) {
    for (let x = 12; x < 16; x++) for (let y = 12; y < 16; y++) if ((x + y) % 3) pic.set(x, y, "X");
  }
  return smooth(pic);
}

export function roofFrames(): Record<string, string> {
  const fills = [0, 1, 2, 3].map(roofFill);
  const frames: Record<string, string> = {};
  fills.forEach((f, i) => {
    frames[`fill${i}`] = f.toString();
  });
  const north = (base: Pic): Pic => {
    const p = base.clone();
    for (let x = 0; x < 16; x++) {
      p.set(x, 0, "o").set(x, 1, "L").set(x, 2, "H").set(x, 3, "e").set(x, 4, "r");
    }
    return p;
  };
  const west = (base: Pic): Pic => {
    const p = base.clone();
    for (let y = 0; y < 16; y++) {
      p.set(0, y, "o").set(1, y, "L").set(2, y, "H").set(3, y, "h");
      for (let x = 4; x < 7; x++) if (p.at(x, y) === "R") p.set(x, y, "r");
    }
    return p;
  };
  const east = (base: Pic): Pic => {
    const p = base.clone();
    for (let y = 0; y < 16; y++) p.set(15, y, "o").set(14, y, "H").set(13, y, "L").set(12, y, "e");
    return p;
  };
  const south = (base: Pic): Pic => {
    const p = base.clone();
    for (let x = 0; x < 16; x++) p.set(x, 12, "h").set(x, 13, "L").set(x, 14, "H").set(x, 15, "o");
    return p;
  };
  const plain = fills[0] as Pic;
  frames.n = north(plain).toString();
  frames.s = south(plain).toString();
  frames.w = west(plain).toString();
  frames.e = east(plain).toString();
  frames.nw = west(north(plain)).toString();
  frames.ne = east(north(plain)).toString();
  frames.sw = west(south(plain)).toString();
  frames.se = east(south(plain)).toString();
  // Fix the corners where two parapets meet.
  for (const k of ["nw", "ne", "sw", "se"]) {
    const p = Pic.of(frames[k] as string);
    const left = k.endsWith("w");
    const top = k.startsWith("n");
    const cx = left ? 0 : 15;
    const cy = top ? 0 : 15;
    p.set(cx, cy, "o");
    frames[k] = p.toString();
  }
  return frames;
}
