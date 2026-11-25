/**
 * Authoring helpers for art sources: compose large grids from small hand-drawn pieces. A
 * picture is rows of legend characters; `.` is clear. Everything returns grid strings, so the
 * result goes through the same parser and checks as a hand-typed grid.
 */
import { gridRows } from "./grid.ts";

export class Pic {
  readonly rows: string[][];

  private constructor(rows: string[][]) {
    this.rows = rows;
  }

  static of(src: string): Pic {
    return new Pic(gridRows(src).map((r) => [...r]));
  }

  static blank(w: number, h: number, ch = "."): Pic {
    return new Pic(Array.from({ length: h }, () => new Array<string>(w).fill(ch)));
  }

  get w(): number {
    return this.rows[0]?.length ?? 0;
  }

  get h(): number {
    return this.rows.length;
  }

  at(x: number, y: number): string | undefined {
    return this.rows[y]?.[x];
  }

  set(x: number, y: number, ch: string): this {
    const row = this.rows[y];
    if (row && x >= 0 && x < row.length) row[x] = ch;
    return this;
  }

  /**
   * Draws a piece at (x, y). `.` in the piece is skipped. With `onto`, only cells holding one
   * of those characters change; with `whole`, the piece is drawn only if every one of its
   * pixels lands on such a cell inside the picture.
   */
  put(
    piece: Pic | string,
    x: number,
    y: number,
    opt: { onto?: string; whole?: boolean } = {},
  ): this {
    const p = typeof piece === "string" ? Pic.of(piece) : piece;
    const ok = (cx: number, cy: number): boolean => {
      const cur = this.at(cx, cy);
      return cur !== undefined && (opt.onto === undefined || opt.onto.includes(cur));
    };
    if (opt.whole) {
      for (let py = 0; py < p.h; py++) {
        for (let px = 0; px < p.w; px++) {
          if (p.at(px, py) !== "." && !ok(x + px, y + py)) return this;
        }
      }
    }
    for (let py = 0; py < p.h; py++) {
      for (let px = 0; px < p.w; px++) {
        const ch = p.at(px, py) as string;
        if (ch !== "." && ok(x + px, y + py)) this.set(x + px, y + py, ch);
      }
    }
    return this;
  }

  /** Swaps characters: `swap("ab", "xy")` turns a into x and b into y. */
  swap(from: string, to: string): Pic {
    const map = new Map([...from].map((c, i) => [c, to[i] ?? c]));
    return new Pic(this.rows.map((r) => r.map((c) => map.get(c) ?? c)));
  }

  flipX(): Pic {
    return new Pic(this.rows.map((r) => [...r].reverse()));
  }

  crop(x: number, y: number, w: number, h: number): Pic {
    return new Pic(
      Array.from({ length: h }, (_, yy) =>
        Array.from({ length: w }, (_, xx) => this.at(x + xx, y + yy) ?? "."),
      ),
    );
  }

  clone(): Pic {
    return new Pic(this.rows.map((r) => [...r]));
  }

  toString(): string {
    return this.rows.map((r) => r.join("")).join("\n");
  }
}

/** A mark placed at a position: `[x, y, piece]`. */
export type Mark = readonly [x: number, y: number, piece: Pic];

/**
 * Lays a texture over a picture: each 16×16 cell of the picture gets one mark set (chosen by
 * `pick(cellX, cellY)`), each mark drawn whole onto cells holding `onto` or not at all. Marks
 * never cross a cell edge, so tiles cut from the picture recombine without broken marks.
 */
export function texture(
  pic: Pic,
  sets: readonly (readonly Mark[])[],
  onto: string,
  pick: (cx: number, cy: number) => number = (cx, cy) => cx + cy * 3,
): Pic {
  for (let cy = 0; cy * 16 < pic.h; cy++) {
    for (let cx = 0; cx * 16 < pic.w; cx++) {
      const set = sets[pick(cx, cy) % sets.length] ?? [];
      for (const [x, y, piece] of set) {
        if (x < 0 || y < 0 || x + piece.w > 16 || y + piece.h > 16) continue;
        pic.put(piece, cx * 16 + x, cy * 16 + y, { onto, whole: true });
      }
    }
  }
  return pic;
}

/** A 16×16 tile of `base` with a mark set drawn on it. */
export function tileOf(base: string, marks: readonly Mark[]): string {
  return texture(Pic.blank(16, 16, base), [marks], base).toString();
}

// Raised terrain pictures ---------------------------------------------------------------------

/**
 * How far an edge bulges out of its cell along one tile, 16 offsets in pixels. Ends are zero
 * so every tile meets its neighbours at the same seam point.
 */
export type Wiggle = readonly number[];

export interface Shape {
  /** Edges by the way the upper terrain faces: `top` is an edge with lower terrain above it. */
  readonly top?: Wiggle;
  readonly bottom?: Wiggle;
  readonly left?: Wiggle;
  readonly right?: Wiggle;
  /** Corner rounding of the island (outer) and of the hole (inner). */
  readonly radius?: number;
  readonly holeRadius?: number;
}

const flat: Wiggle = new Array(16).fill(0);
const wig = (w: Wiggle | undefined, i: number): number => (w ?? flat)[((i % 16) + 16) % 16] ?? 0;

function corner(x: number, y: number, cx: number, cy: number, r: number): boolean {
  return (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r;
}

/**
 * Inside tests for the two dual-grid pictures: `outer` is a 2×2-cell island in 48×48, `inner` a
 * one-cell hole in 32×32. Defined beyond the picture too, so edge rules see past its border.
 */
export function inside(kind: "outer" | "inner", s: Shape): (x: number, y: number) => boolean {
  if (kind === "outer") {
    const r = s.radius ?? 3;
    return (x, y) => {
      if (y < 8 - wig(s.top, x) || y >= 40 + wig(s.bottom, x)) return false;
      if (x < 8 - wig(s.left, y) || x >= 40 + wig(s.right, y)) return false;
      if (x < 8 + r && y < 8 + r) return corner(x, y, 8 + r, 8 + r, r);
      if (x >= 40 - r && y < 8 + r) return corner(x, y, 40 - r, 8 + r, r);
      if (x < 8 + r && y >= 40 - r) return corner(x, y, 8 + r, 40 - r, r);
      if (x >= 40 - r && y >= 40 - r) return corner(x, y, 40 - r, 40 - r, r);
      return true;
    };
  }
  const r = s.holeRadius ?? 2;
  return (x, y) => {
    const hole =
      y >= 8 + wig(s.bottom, x) &&
      y < 24 - wig(s.top, x) &&
      x >= 8 + wig(s.right, y) &&
      x < 24 - wig(s.left, y);
    if (!hole) return true;
    if (x < 8 + r && y < 8 + r) return !corner(x, y, 8 + r, 8 + r, r);
    if (x >= 24 - r && y < 8 + r) return !corner(x, y, 24 - r, 8 + r, r);
    if (x < 8 + r && y >= 24 - r) return !corner(x, y, 8 + r, 24 - r, r);
    if (x >= 24 - r && y >= 24 - r) return !corner(x, y, 24 - r, 24 - r, r);
    return false;
  };
}

/**
 * Edge rules for a raised terrain lit from the top left. Inside pixels take `band` by distance
 * from the edge, then `top`, `left`, `right` or `bottom` where that side is open, else `fill`.
 * Outside pixels take `lip` rows straight below the terrain (its front face), `under` below the
 * lip (cast shadow), `beside` right of the terrain or its lip, else stay clear.
 */
export interface Rim {
  readonly fill: string;
  readonly band?: readonly string[];
  readonly top?: string;
  readonly left?: string;
  readonly right?: string;
  readonly bottom?: readonly string[];
  readonly lip?: readonly string[];
  readonly under?: string;
  readonly beside?: string;
  /** Outside pixels touching the terrain on any side that nothing else claimed. */
  readonly ring?: string;
}

export function paint(
  w: number,
  h: number,
  isIn: (x: number, y: number) => boolean,
  rim: Rim,
): Pic {
  const pic = Pic.blank(w, h);
  const lip = rim.lip ?? [];
  const bottom = rim.bottom ?? [];
  const dist = (x: number, y: number): number => {
    let best = 9;
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        if (!isIn(x + dx, y + dy)) best = Math.min(best, Math.hypot(dx, dy));
      }
    }
    return best;
  };
  /** Rows of lip directly under terrain at (x, y), or -1. */
  const lipRow = (x: number, y: number): number => {
    for (let k = 0; k < lip.length; k++) {
      if (isIn(x, y - k - 1)) return k;
      if (isIn(x, y - k)) return -1;
    }
    return -1;
  };
  const isLip = (x: number, y: number): boolean => !isIn(x, y) && lipRow(x, y) >= 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (isIn(x, y)) {
        let ch = rim.fill;
        const d = dist(x, y);
        const b = bottom.findIndex((_, k) => !isIn(x, y + k + 1));
        if (rim.band && d <= rim.band.length) ch = rim.band[Math.ceil(d) - 1] ?? ch;
        else if (b >= 0) ch = bottom[b] as string;
        else if (rim.top && !isIn(x, y - 1)) ch = rim.top;
        else if (rim.left && !isIn(x - 1, y)) ch = rim.left;
        else if (rim.right && !isIn(x + 1, y)) ch = rim.right;
        pic.set(x, y, ch);
        continue;
      }
      const k = lipRow(x, y);
      if (k >= 0) pic.set(x, y, lip[k] as string);
      else if (rim.under && lip.length > 0 && isIn(x, y - lip.length - 1) && isLip(x, y - 1))
        pic.set(x, y, rim.under);
      else if (rim.under && lip.length === 0 && isIn(x, y - 1)) pic.set(x, y, rim.under);
      else if (rim.beside && (isIn(x - 1, y) || isLip(x - 1, y))) pic.set(x, y, rim.beside);
      else if (rim.ring && (isIn(x, y + 1) || isIn(x + 1, y) || isIn(x - 1, y)))
        pic.set(x, y, rim.ring);
    }
  }
  return despeckle(pic, isIn, rim.fill);
}

/**
 * Corners and cut marks leave single pixels: inside ones fold into `fill`, outside ones clear.
 * Run after every step that draws over a painted picture.
 */
export function despeckle(pic: Pic, isIn: (x: number, y: number) => boolean, fill: string): Pic {
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < pic.h; y++) {
      for (let x = 0; x < pic.w; x++) {
        const ch = pic.at(x, y) as string;
        if (ch === "." || ch === fill) continue;
        let paired = false;
        for (let dy = -1; dy <= 1 && !paired; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if ((dx || dy) && pic.at(x + dx, y + dy) === ch) paired = true;
          }
        }
        if (!paired) pic.set(x, y, isIn(x, y) ? fill : ".");
      }
    }
  }
  return pic;
}

// Rounded forms --------------------------------------------------------------------------------

/** An ellipse in pixels. Bumps along its top give foliage a broken silhouette. */
export interface Lobe {
  readonly x: number;
  readonly y: number;
  readonly rx: number;
  readonly ry: number;
}

export function lobes(list: readonly Lobe[]): (x: number, y: number) => boolean {
  return (x, y) =>
    list.some((l) => ((x + 0.5 - l.x) / l.rx) ** 2 + ((y + 0.5 - l.y) / l.ry) ** 2 <= 1);
}

/**
 * Shades a rounded form lit from the top left: `outline` on the silhouette, then `light` where
 * the form's edge is within `reach` up-left, `dark` where it is within `reach` down (and
 * down-right), `mid` elsewhere. Optional `glint` marks the very top-left rim inside the light.
 */
export function shade(
  w: number,
  h: number,
  isIn: (x: number, y: number) => boolean,
  ramp: { outline: string; dark: string; mid: string; light: string; glint?: string },
  reach: { light: number; dark: number } = { light: 2, dark: 2 },
): Pic {
  const pic = Pic.blank(w, h);
  const open = (x: number, y: number, dx: number, dy: number, n: number): boolean => {
    for (let k = 1; k <= n; k++) if (!isIn(x + dx * k, y + dy * k)) return true;
    return false;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!isIn(x, y)) continue;
      const edge = !isIn(x - 1, y) || !isIn(x + 1, y) || !isIn(x, y - 1) || !isIn(x, y + 1);
      let ch = ramp.mid;
      if (edge) ch = ramp.outline;
      else if (open(x, y, 0, 1, reach.dark) || open(x, y, 1, 1, reach.dark)) ch = ramp.dark;
      else if (ramp.glint && open(x, y, -1, -1, 1) && open(x, y, 0, -1, 1)) ch = ramp.glint;
      else if (open(x, y, -1, -1, reach.light) || open(x, y, 0, -1, reach.light)) ch = ramp.light;
      pic.set(x, y, ch);
    }
  }
  return pic;
}

/** Turns every opaque pixel that touches clear on a side into `outline`, unless it is in `keep`. */
export function seal(pic: Pic, outline: string, keep = ""): Pic {
  const out = pic.clone();
  for (let y = 0; y < pic.h; y++) {
    for (let x = 0; x < pic.w; x++) {
      const ch = pic.at(x, y) as string;
      if (ch === "." || ch === outline || keep.includes(ch)) continue;
      const open = [pic.at(x - 1, y), pic.at(x + 1, y), pic.at(x, y - 1), pic.at(x, y + 1)].some(
        (n) => n === undefined || n === ".",
      );
      if (open) out.set(x, y, outline);
    }
  }
  return out;
}

/**
 * Replaces single pixels (no same-character neighbour) with `fill`, except characters in `keep`.
 * A single pixel of `fill` itself takes the colour most of its opaque neighbours have.
 */
export function tidy(pic: Pic, fill: string, keep = ""): Pic {
  for (let y = 0; y < pic.h; y++) {
    for (let x = 0; x < pic.w; x++) {
      const ch = pic.at(x, y) as string;
      if (ch === "." || keep.includes(ch)) continue;
      const around = new Map<string, number>();
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const n = dx || dy ? pic.at(x + dx, y + dy) : undefined;
          if (n !== undefined && n !== ".") around.set(n, (around.get(n) ?? 0) + 1);
        }
      if (around.has(ch)) continue;
      if (ch !== fill) pic.set(x, y, fill);
      else {
        const best = [...around].sort((a, b) => b[1] - a[1])[0];
        if (best) pic.set(x, y, best[0]);
      }
    }
  }
  return pic;
}

/** Every single pixel (no same-character neighbour) takes the character most of its neighbours have. */
export function smooth(pic: Pic, keep = ""): Pic {
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < pic.h; y++) {
      for (let x = 0; x < pic.w; x++) {
        const ch = pic.at(x, y) as string;
        if (ch === "." || keep.includes(ch)) continue;
        const around = new Map<string, number>();
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const n = dx || dy ? pic.at(x + dx, y + dy) : undefined;
            if (n !== undefined) around.set(n, (around.get(n) ?? 0) + 1);
          }
        if (around.has(ch)) continue;
        const best = [...around].sort((a, b) => b[1] - a[1])[0];
        if (best) pic.set(x, y, best[0]);
      }
    }
  }
  return pic;
}
