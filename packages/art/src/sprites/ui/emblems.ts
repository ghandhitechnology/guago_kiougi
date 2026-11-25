import { body, cells, grid, inStar, stack } from "../../draw.ts";
import { sprite } from "../../format.ts";

/**
 * The 과잠 emblem parts (PLAN §12): the shapes and symbols a club builds its back emblem from,
 * ids as in `EMBLEM_SHAPES` and `EMBLEM_SYMBOLS` of the content. Every part is drawn in the stone
 * ramp as a key: the client repaints deep, dark, mid and light with the deep, dark, mid and light
 * steps of the colour the club picked, so one drawing serves every colour.
 *
 * Two sizes: 24×24 shapes with 12×12 symbols for the editor, the club page and the card, and
 * 11×11 shapes with 5×5 symbols for lists, nameplates and party rows. Also the 과잠 hanging in the
 * editor, drawn from the back in the `jacket` swap slot so it takes the club's colour.
 */
const ui = { group: "ui", origin: [0, 0], anim: {} } as const;

const KEY = {
  ".": null,
  o: "stone.deep",
  d: "stone.dark",
  m: "stone.mid",
  l: "stone.light",
} as const;

type Inside = (x: number, y: number) => boolean;

/** A shape lit from the top left, outlined in its own deep step. */
function solid(size: number, inside: Inside): string {
  return despeck(body(size, size, inside, { line: "o", light: "l", mid: "m", dark: "d" }, 0.12));
}

/**
 * Fill pixels left alone by the lighting split (a lone light pixel on a leaf tip) take the fill
 * colour most of their neighbours have. Outline pixels are never touched.
 */
function despeck(src: string): string {
  const g = cells(src);
  const at = (x: number, y: number) => g[y]?.[x] ?? ".";
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < g.length; y++) {
      const row = g[y] as string[];
      for (let x = 0; x < row.length; x++) {
        const v = row[x] as string;
        if (v === "." || v === "o") continue;
        const around: string[] = [];
        for (const dy of [-1, 0, 1])
          for (const dx of [-1, 0, 1]) if (dx || dy) around.push(at(x + dx, y + dy));
        if (around.includes(v)) continue;
        const fills = around.filter((c) => c !== "." && c !== "o");
        if (fills.length === 0) {
          // A sliver one pixel wide between outlines is outline too.
          row[x] = "o";
          continue;
        }
        const count = (c: string) => fills.filter((f) => f === c).length;
        row[x] = fills.reduce((a, b) => (count(b) > count(a) ? b : a));
      }
    }
  }
  return g.map((r) => r.join("")).join("\n");
}

/** Inside tests for each shape on a `s`-pixel square; `c` is the centre. */
function shapes(s: number): Readonly<Record<string, Inside>> {
  const c = s / 2;
  const px = (x: number) => x + 0.5 - c;
  const py = (y: number) => y + 0.5 - c;
  return {
    shield: (x, y) => {
      const u = Math.abs(px(x));
      const v = py(y);
      const half = c - 0.6;
      if (v < -half) return false;
      if (v < 0.1 * s) return u <= half;
      // Narrows to a point at the bottom along a soft curve.
      const k = (v - 0.1 * s) / (half - 0.1 * s);
      return k <= 1 && u <= half * Math.sqrt(Math.max(0, 1 - k * k));
    },
    circle: (x, y) => Math.hypot(px(x), py(y)) <= c - 0.4,
    diamond: (x, y) => Math.abs(px(x)) + Math.abs(py(y)) <= c - 0.2,
    banner: (x, y) => {
      const u = Math.abs(px(x));
      const v = py(y);
      const half = c - 0.6;
      if (u > half * 0.84 || v < -half) return false;
      // A pennant: the bottom edge cut in a V.
      return v <= half - (half * 0.84 - u) * 0.62;
    },
    hexagon: (x, y) => {
      const u = Math.abs(px(x));
      const v = Math.abs(py(y));
      const r = c - 0.4;
      return v <= r * 0.88 && u <= r - v * 0.56;
    },
    star: (x, y) => inStar(x, y, s, 0.46),
    laurel: (x, y) => {
      const u = px(x);
      const v = py(y);
      const r = Math.hypot(u, v);
      const outer = c - 0.4;
      // Open at the top where the two branches meet.
      const a = Math.atan2(u, -v);
      if (Math.abs(a) < 0.5) return false;
      if (s < 16) return r <= outer && r >= outer * 0.52;
      // A wreath: a thick ring whose outer edge is notched between leaves.
      if (r < outer * 0.52 || r > outer) return false;
      const leaf = (Math.abs(a) * 7) / Math.PI;
      return r < outer - 2.2 || leaf - Math.floor(leaf) > 0.28;
    },
    crown: (x, y) => {
      const u = px(x);
      const v = py(y);
      const half = c - 0.6;
      if (Math.abs(u) > half) return false;
      const base = half * 0.62;
      if (v > base || v < -half) return false;
      // Three points: the band below, and teeth rising to the left, middle and right.
      if (v >= 0) return true;
      const teeth = [-half * 0.86, 0, half * 0.86];
      return teeth.some((t) => Math.abs(u - t) <= (v + half) * 0.62);
    },
  };
}

const SHAPE_IDS = [
  "shield",
  "circle",
  "diamond",
  "banner",
  "hexagon",
  "star",
  "laurel",
  "crown",
] as const;

function shapeSprite(name: string, size: number) {
  const inside = shapes(size);
  const frames: Record<string, string> = {};
  for (const id of SHAPE_IDS) frames[id] = solid(size, inside[id] as Inside);
  return sprite({ ...ui, name, size: [size, size], palette: KEY, frames });
}

/**
 * Symbol masks on a 10×10 square (`#` inside), drawn by hand, one per subject and a few for
 * school life. The large symbol wraps each in a one-pixel outline to 12×12.
 */
const SYMBOLS: Readonly<Record<string, string>> = {
  pi: stack(
    "..........",
    "##########",
    "##########",
    "..##..##..",
    "..##..##..",
    "..##..##..",
    "..##..##..",
    "..##..##..",
    ".##...###.",
    ".##....##.",
  ),
  atom: stack(
    "...####...",
    ".##....##.",
    ".#......##",
    "#...##...#",
    "#..####..#",
    "#..####..#",
    "#...##...#",
    "##......#.",
    ".##....##.",
    "...####...",
  ),
  flask: stack(
    "...####...",
    "....##....",
    "....##....",
    "....##....",
    "...####...",
    "..######..",
    ".########.",
    ".########.",
    "##########",
    ".########.",
  ),
  leaf: stack(
    "......####",
    "....######",
    "...#######",
    "..#####.##",
    ".#####.###",
    ".####.####",
    ".###.####.",
    "..#.####..",
    ".#.####...",
    "#.........",
  ),
  planet: stack(
    "........##",
    "...####.##",
    "..######..",
    ".########.",
    "##########",
    "##########",
    ".########.",
    "..######..",
    "##.####...",
    "##........",
  ),
  pencil: stack(
    "........##",
    ".......###",
    "......###.",
    ".....###..",
    "....###...",
    "...###....",
    "..###.....",
    ".###......",
    ".##.......",
    "#.........",
  ),
  book: stack(
    "..........",
    "####..####",
    "#####.####",
    "#####.####",
    "#####.####",
    "#####.####",
    "#####.####",
    "##########",
    "....##....",
    "..........",
  ),
  gear: stack(
    "...#..#...",
    "..######..",
    "##########",
    ".###..###.",
    "###....###",
    "###....###",
    ".###..###.",
    "##########",
    "..######..",
    "...#..#...",
  ),
  dna: stack(
    "##......##",
    ".##bbbb##.",
    "..##..##..",
    "...####...",
    "..##..##..",
    ".##bbbb##.",
    "##......##",
    ".##bbbb##.",
    "..##..##..",
    "...####...",
  ),
  magnet: stack(
    "..######..",
    ".########.",
    "###....###",
    "##......##",
    "##......##",
    "##......##",
    "##......##",
    "##......##",
    "##......##",
    "##......##",
  ),
  comet: stack(
    ".........#",
    "........##",
    "......###.",
    "....####..",
    ".######...",
    "######....",
    "######....",
    "######....",
    ".####.....",
    "..........",
  ),
  pinecone: stack(
    "....##....",
    "...####...",
    "..#b##b#..",
    "..##bb##..",
    ".#b####b#.",
    ".##b##b##.",
    ".###bb###.",
    "..#b##b#..",
    "...####...",
    "....##....",
  ),
  infinity: stack(
    "..........",
    "..........",
    ".###..###.",
    "##..##..##",
    "#....#...#",
    "#...#....#",
    "##..##..##",
    ".###..###.",
    "..........",
    "..........",
  ),
  lightning: stack(
    ".....####.",
    "....####..",
    "...####...",
    "..####....",
    ".########.",
    ".......##.",
    "......##..",
    ".....##...",
    "....##....",
    "...#......",
  ),
};

/** 5×5 masks for the small emblem: the same symbols, as few pixels as still read. */
const MINI: Readonly<Record<string, string>> = {
  pi: stack("#####", ".#.#.", ".#.#.", ".#.#.", "#..##"),
  atom: stack("#.#.#", ".###.", "##.##", ".###.", "#.#.#"),
  flask: stack(".###.", "..#..", ".###.", "#####", "#####"),
  leaf: stack("..###", ".####", "###.#", "##.#.", "#...."),
  planet: stack("...##", ".###.", "#####", ".###.", "##..."),
  pencil: stack("...##", "..##.", ".##..", "##...", "#...."),
  book: stack("##.##", "##.##", "##.##", "#####", "..#.."),
  gear: stack(".#.#.", "#####", "##.##", "#####", ".#.#."),
  dna: stack("#...#", ".###.", ".#.#.", ".###.", "#...#"),
  magnet: stack(".###.", "#...#", "#...#", "#...#", "#...#"),
  comet: stack("...##", "..###", ".###.", "###..", "#...."),
  pinecone: stack("..#..", ".###.", "#####", ".###.", "..#.."),
  infinity: stack(".....", "##.##", "#.#.#", "##.##", "....."),
  lightning: stack("..##.", ".##..", "####.", "..##.", ".#..."),
};

/** Wraps a 10×10 mask in a one-pixel outline: top rows light, the rest mid. */
function symbol(mask: string): string {
  const m = cells(mask);
  const n = m.length + 2;
  const at = (x: number, y: number) => m[y - 1]?.[x - 1] === "#";
  const solidAt = (x: number, y: number) => at(x, y) || m[y - 1]?.[x - 1] === "b";
  return grid(n, n, (x, y) => {
    if (at(x, y)) return y <= n / 2 ? "l" : "m";
    if (m[y - 1]?.[x - 1] === "b") return "d";
    const near = [-1, 0, 1].some((dy) => [-1, 0, 1].some((dx) => solidAt(x + dx, y + dy)));
    return near ? "o" : ".";
  });
}

const symbolsLarge = sprite({
  ...ui,
  name: "emblem-symbol",
  size: [12, 12],
  palette: KEY,
  frames: Object.fromEntries(Object.entries(SYMBOLS).map(([id, mask]) => [id, symbol(mask)])),
});

/** Small symbols have no room for an outline: the shape's colour is their edge. */
const symbolsSmall = sprite({
  ...ui,
  name: "emblem-symbol-s",
  size: [5, 5],
  palette: KEY,
  outline: false,
  lone: "l",
  frames: Object.fromEntries(
    Object.entries(MINI).map(([id, mask]) => [id, mask.replaceAll("#", "l")]),
  ),
});

// The 과잠 on a hanger ------------------------------------------------------------------------

const JW = 48;
const JH = 54;

/**
 * Drawn from the back: the body in the club colour, cream leather sleeves, ribbed collar, cuffs
 * and hem with two stripes of the club colour, and a wooden hanger. The emblem goes on the
 * back at (12, 14), 24×24.
 */
function hangingJacket(): string {
  const cx = JW / 2;
  const top = 9;
  const hem = JH - 1;
  const inBody = (x: number, y: number) => {
    if (y < top + 2 || y > hem - 5) return false;
    const u = Math.abs(x + 0.5 - cx);
    // Shoulders slope down from the collar.
    const shoulder = top + 2 + Math.max(0, (u - 5) * 0.35);
    return u <= 15 && y >= shoulder;
  };
  // Sleeves hang from the shoulder seam and flare a little to the cuff.
  const reach = (y: number) => 15 + 5 + Math.min(3, Math.max(0, (y - top - 8) * 0.1));
  const inSleeve = (x: number, y: number) => {
    const u = Math.abs(x + 0.5 - cx);
    const shoulder = top + 2 + Math.max(0, (u - 5) * 0.35);
    return u > 15 && u <= reach(y) && y >= shoulder && y <= hem - 6;
  };
  const inCuff = (x: number, y: number) => {
    const u = Math.abs(x + 0.5 - cx);
    return u > 15 && u <= reach(hem - 6) && y > hem - 6 && y <= hem - 3;
  };
  const inHem = (x: number, y: number) =>
    Math.abs(x + 0.5 - cx) <= 15 && y > hem - 5 && y <= hem - 1;
  const inCollar = (x: number, y: number) =>
    Math.abs(x + 0.5 - cx) <= 7 && y >= top - 1 && y <= top + 2;
  const hanger = (x: number, y: number) => {
    const u = Math.abs(x + 0.5 - cx);
    if (y <= 4) {
      // The hook: up from the bar and curling over to the left.
      if (x === Math.floor(cx) - 1 || x === Math.floor(cx)) return y >= 2;
      if (y <= 1) return x >= Math.floor(cx) - 4 && x <= Math.floor(cx) && y === 1;
      return x === Math.floor(cx) - 4 && y === 2;
    }
    return y >= 5 && y <= 6 && u <= 17 - (6 - y) * 0;
  };
  const any = (x: number, y: number) =>
    inBody(x, y) || inSleeve(x, y) || inCuff(x, y) || inHem(x, y) || inCollar(x, y);

  return grid(JW, JH, (x, y) => {
    if (any(x, y)) {
      const edge = [
        [0, -1],
        [-1, 0],
        [1, 0],
        [0, 1],
      ].some(([dx, dy]) => !any(x + (dx as number), y + (dy as number)));
      if (inCollar(x, y)) return edge ? "q" : y === top ? "W" : y === top + 1 ? "J" : "s";
      if (inHem(x, y) || inCuff(x, y)) {
        if (edge) return "q";
        const row = inHem(x, y) ? y - (hem - 5) : y - (hem - 6);
        return row === 2 ? "J" : row === 1 ? "p" : "s";
      }
      if (inSleeve(x, y)) {
        if (edge) return "q";
        const u = Math.abs(x + 0.5 - cx);
        // Leather catches the light on the outer side of each arm.
        return u > reach(y) - 2 ? "s" : u < 18 ? "W" : "p";
      }
      if (edge) return "q";
      // The body: lit from the top left, a seam down the middle, the back panel left plain.
      const t = (x - cx) / JW + (y - JH / 2) / JH;
      if (Math.abs(x + 0.5 - cx) < 1 && y > top + 34) return "J";
      return t < -0.28 ? "U" : t > 0.24 ? "J" : "T";
    }
    if (hanger(x, y)) return y <= 4 ? "C" : y === 5 ? "E" : "C";
    return ".";
  });
}

const jacketHang = sprite({
  ...ui,
  name: "jacket-hang",
  size: [JW, JH],
  palette: {
    ".": null,
    q: "jacket.deep",
    J: "jacket.dark",
    T: "jacket.mid",
    U: "jacket.light",
    W: "stone.bright",
    p: "stone.pale",
    s: "stone.light",
    C: "wood.deep",
    E: "wood.mid",
  },
  outline: false,
  frames: { idle: hangingJacket() },
});

export default [
  shapeSprite("emblem-shape", 24),
  shapeSprite("emblem-shape-s", 11),
  symbolsLarge,
  symbolsSmall,
  jacketHang,
];
