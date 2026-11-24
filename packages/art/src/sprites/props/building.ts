import { type Legend, sprite } from "../../format.ts";
import { Pic } from "../../paint.ts";

/**
 * 가설관's south face, as 16-pixel pieces that join edge to edge into a facade of any width and
 * height: one 48-pixel floor per row. Cream concrete with slab bands between floors, recessed
 * ribbon windows, a granite plinth. Lit rooms glow in `gold.pale` and `gold.light`, which stay
 * bright at night. Pieces join on every side, so they draw their outline by hand where the
 * building ends (`outline: false`).
 */
const palette: Legend = {
  ".": null,
  d: "stone.deep",
  S: "stone.dark",
  M: "stone.mid",
  K: "stone.light",
  k: "stone.pale",
  w: "stone.bright",
  // lit glass
  Y: "gold.pale",
  y: "gold.light",
  o: "gold.mid",
  O: "gold.dark",
  // dark glass
  v: "navy.dark",
  N: "navy.mid",
  n: "navy.light",
  j: "ink.dark",
  // curtain
  c: "sea.dark",
  C: "sea.mid",
};

const W = 16;
const FLOOR = 48;

/** The slab band at the top of every floor: lit edge, face, shadow underneath. */
const SLAB = ["wwwwwwwwwwwwwwww", "KKKKKKKKKKKKKKKK", "KKKKKKKKKKKKKKKK", "MMMMMMMMMMMMMMMM"];
const WALL = "kkkkkkkkkkkkkkkk";
const JOINT = "kkkkkkkKKkkkkkkk";
const PLINTH = ["MMMMMMMMMMMMMMMM", "SSSSSSSSSSSSSSSS", "SSSSSSSSSSSSSSSS", "dddddddddddddddd"];

type Glass = (row: number) => string;

/** A recessed window opening 12 wide, glass rows supplied by `glass`, with a sill below. */
function windowRows(glass: Glass, rows: number): string[] {
  const out = [`k${"d".repeat(14)}k`];
  for (let r = 0; r < rows; r++) out.push(`kM${glass(r)}Kk`);
  out.push("kwwwwwwwwwwwwwwk".slice(0, W));
  out.push("kKKKKKKKKKKKKKKk".slice(0, W));
  out.push("kSSSSSSSSSSSSSSk".slice(0, W));
  return out;
}

/** Lit classroom glass: the tube's glow at the top, a transom bar, chairs and desks below. */
const lit =
  (dim: boolean): Glass =>
  (r) => {
    const tube = dim ? "y" : "Y";
    const b = dim ? "o" : "y";
    if (r === 0) return tube.repeat(12);
    if (r === 1) return `${b}${tube.repeat(4)}${b}${b}${tube.repeat(4)}${b}`;
    if (r === 6) return "KKKKKKKKKKKK";
    if (r === 7) return "MMMMMMMMMMMM";
    if (r < 6) return b.repeat(12);
    const mullion = (row: string) => `${row.slice(0, 5)}MM${row.slice(7)}`;
    if (r === 13 || r === 14) return mullion(`${b}oo${b}${b}${b}${b}${b}oo${b}${b}`);
    if (r === 15 || r === 18) return mullion("OOOOOOOOOOOO");
    if (r === 16 || r === 17) return mullion(`oOOooOOooOOo`);
    if (r > 18) return mullion("OOOOOOOOOOOO");
    return mullion(b.repeat(12));
  };

/** An empty room's glass: dark, with a moonlit streak running down to the right. */
const dark: Glass = (r) => {
  const streak = (x: number) => x === r || x === r + 1 || x === r - 6 || x === r - 7;
  let row = "";
  for (let x = 0; x < 12; x++)
    row += r === 0 ? "j" : x === 5 || x === 6 ? "M" : streak(x) ? "N" : "v";
  if (r === 4) row = "KKKKKKKKKKKK";
  if (r === 5) row = "MMMMMMMMMMMM";
  return row;
};

/** Curtains half drawn in a lit room. */
const curtained: Glass = (r) => {
  const base = lit(false)(r);
  if (r === 4 || r === 5) return base;
  return `cC${base.slice(2, 9)}Ccc`;
};

const FLOOR_GLASS_ROWS = 20;

/** One floor piece: slab band, wall above, window (or none), wall below, plinth on the ground floor. */
function floor(glass: Glass | null, ground: boolean): string {
  const rows = [...SLAB, WALL, WALL];
  if (glass) rows.push(...windowRows(glass, FLOOR_GLASS_ROWS));
  while (rows.length < FLOOR - (ground ? PLINTH.length : 0))
    rows.push(rows.length === 38 ? JOINT : WALL);
  if (ground) rows.push(...PLINTH);
  return rows.slice(0, FLOOR).join("\n");
}

/** Glass double door: lit corridor behind, steel frame, push bars. Two pieces wide. */
function door(side: "l" | "r"): string {
  const rows = [...SLAB, WALL, WALL];
  const sign = side === "l" ? "kkkdddddddddddddd" : "dddddddddddddkkk";
  rows.push(sign.slice(0, W));
  const glassRows = 37;
  for (let r = 0; r < glassRows; r++) {
    const inner =
      r < 2
        ? "YYYYYYYYYYY"
        : r === 15
          ? "KKKKKKKKKKK"
          : r === 16
            ? "MMMMMMMMMMM"
            : r > 32
              ? "ooooooooooo"
              : "yyyyyyyyyyy";
    const bar = r === 20 || r === 21 ? "KKKK" : null;
    let mid = inner;
    if (bar) mid = side === "l" ? `${inner.slice(0, 7)}${bar}` : `${bar}${inner.slice(4)}`;
    rows.push(side === "l" ? `kkdM${mid}d` : `d${mid}Mdkk`.slice(0, W));
  }
  rows.push(side === "l" ? "kkdddddddddddddd" : "dddddddddddddkkk".padEnd(W, "k").slice(0, W));
  rows.push(side === "l" ? "MMdSSSSSSSSSSSSS" : "SSSSSSSSSSSSSdMM");
  rows.push(side === "l" ? "SSdSSSSSSSSSSSSS" : "SSSSSSSSSSSSSdSS");
  rows.push("dddddddddddddddd");
  return rows.slice(0, FLOOR).join("\n");
}

/** A building corner: a pilaster with its outline, lit on the west side, shaded on the east. */
function corner(piece: string, side: "l" | "r"): string {
  const pic = Pic.of(piece);
  for (let y = 0; y < pic.h; y++) {
    if (side === "l") {
      pic.set(0, y, "d").set(1, y, "w").set(2, y, "k").set(3, y, "K");
    } else {
      pic.set(12, y, "K").set(13, y, "k").set(14, y, "M").set(15, y, "d");
    }
  }
  return pic.toString();
}

/** The roofline: parapet cap closing the top of the facade. */
const PARAPET = [
  "dddddddddddddddd",
  "wwwwwwwwwwwwwwww",
  "kkkkkkkkkkkkkkkk",
  "KKKKKKKKKKKKKKKK",
  "MMMMMMMMMMMMMMMM",
  "SSSSSSSSSSSSSSSS",
].join("\n");

const frames: Record<string, string> = {
  wall: floor(null, true),
  window: floor(lit(false), true),
  "window-dim": floor(lit(true), true),
  "window-dark": floor(dark, true),
  "door-l": door("l"),
  "door-r": door("r"),
  "end-l": corner(floor(null, true), "l"),
  "end-r": corner(floor(null, true), "r"),
  "up-wall": floor(null, false),
  "up-window": floor(lit(false), false),
  "up-window-dim": floor(lit(true), false),
  "up-window-dark": floor(dark, false),
  "up-curtain": floor(curtained, false),
  "up-end-l": corner(floor(null, false), "l"),
  "up-end-r": corner(floor(null, false), "r"),
};

export default [
  sprite({
    name: "facade",
    size: [W, FLOOR],
    origin: [0, FLOOR - 1],
    palette,
    outline: false,
    frames,
    anim: {
      idle: { frames: ["wall"], fps: 1 },
      /** A tube on its last legs. */
      flicker: {
        frames: [
          "up-window",
          "up-window",
          "up-window-dim",
          "up-window",
          "up-window",
          "up-window",
          "up-window-dim",
          "up-window-dim",
          "up-window",
        ],
        fps: 10,
      },
    },
  }),
  sprite({
    name: "parapet",
    size: [W, 6],
    origin: [0, 5],
    palette,
    outline: false,
    frames: { run: PARAPET },
    anim: { idle: { frames: ["run"], fps: 1 } },
  }),
  sprite({
    name: "steps",
    size: [40, 10],
    origin: [20, 9],
    palette,
    frames: {
      still: `
        dddddddddddddddddddddddddddddddddddddddd
        dwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwKd
        dKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKMd
        dMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMd
        dwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwKd
        dkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkKd
        dKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKMd
        dMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMd
        dSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSd
        dddddddddddddddddddddddddddddddddddddddd
      `,
    },
    anim: { idle: { frames: ["still"], fps: 1 } },
  }),
  sprite({
    name: "canopy",
    size: [48, 8],
    origin: [24, 7],
    palette,
    frames: {
      still: `
        dddddddddddddddddddddddddddddddddddddddddddddddd
        dwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwkd
        dwkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkKd
        dKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKMd
        dKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKMd
        dMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMd
        dSSSSSSSSSSSSSSSSdyyyyyyyyyyyydSSSSSSSSSSSSSSSSd
        dddddddddddddddddddddddddddddddddddddddddddddddd
      `,
    },
    anim: { idle: { frames: ["still"], fps: 1 } },
  }),
];
