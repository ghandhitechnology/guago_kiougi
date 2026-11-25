/**
 * Drawing helpers shared by the Page 1 boss files: filled shapes, lines and a top-left light
 * pass on `Pic` pictures, and the one-colour legends used for entrance silhouettes. Everything
 * returns ordinary grid strings, so the output goes through the same parser and checks as a
 * hand-typed grid. This file holds no art of its own.
 */
import type { Legend, Paint, PartGrid, Vec } from "../../format.ts";
import { Pic } from "../../paint.ts";

export { Pic };

type Fill = string | ((x: number, y: number) => string);
const pick = (f: Fill, x: number, y: number) => (typeof f === "string" ? f : f(x, y));

/** A blank picture with hand-typed pieces drawn on it: `[x, y, grid]`. */
export function compose(
  w: number,
  h: number,
  pieces: readonly (readonly [number, number, string | Pic])[],
): Pic {
  const p = Pic.blank(w, h);
  for (const [x, y, g] of pieces) p.put(g, x, y);
  return p;
}

/** Fills every pixel whose centre lies inside the ellipse. `onto` limits which cells change. */
export function ellipse(
  p: Pic,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  ch: Fill,
  onto?: string,
): Pic {
  for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++) {
    for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
      const d = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2;
      if (d > 1) continue;
      const cur = p.at(x, y);
      if (cur === undefined || (onto !== undefined && !onto.includes(cur))) continue;
      p.set(x, y, pick(ch, x, y));
    }
  }
  return p;
}

/** Fills a polygon (even-odd rule, pixel centres). */
export function poly(p: Pic, pts: readonly Vec[], ch: Fill, onto?: string): Pic {
  const ys = pts.map((q) => q[1]);
  for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) {
    const yc = y + 0.5;
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const [x0, y0] = pts[i] as Vec;
      const [x1, y1] = pts[(i + 1) % pts.length] as Vec;
      if (y0 <= yc !== y1 <= yc) xs.push(x0 + ((yc - y0) / (y1 - y0)) * (x1 - x0));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      for (let x = Math.ceil((xs[k] as number) - 0.5); x + 0.5 <= (xs[k + 1] as number); x++) {
        const cur = p.at(x, y);
        if (cur === undefined || (onto !== undefined && !onto.includes(cur))) continue;
        p.set(x, y, pick(ch, x, y));
      }
    }
  }
  return p;
}

/** A one-pixel line (Bresenham). */
export function line(
  p: Pic,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  ch: Fill,
  onto?: string,
): Pic {
  let x = Math.round(x0);
  let y = Math.round(y0);
  const tx = Math.round(x1);
  const ty = Math.round(y1);
  const dx = Math.abs(tx - x);
  const dy = -Math.abs(ty - y);
  const sx = x < tx ? 1 : -1;
  const sy = y < ty ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    const cur = p.at(x, y);
    if (cur !== undefined && (onto === undefined || onto.includes(cur)))
      p.set(x, y, pick(ch, x, y));
    if (x === tx && y === ty) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
  return p;
}

export function rect(
  p: Pic,
  x: number,
  y: number,
  w: number,
  h: number,
  ch: Fill,
  onto?: string,
): Pic {
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      const cur = p.at(xx, yy);
      if (cur === undefined || (onto !== undefined && !onto.includes(cur))) continue;
      p.set(xx, yy, pick(ch, xx, yy));
    }
  }
  return p;
}

/**
 * Light from the top left over every pixel whose character is in `body`: the edge (touching any
 * other character or clear on a side) becomes `line` unless `inner` is set, pixels near an open
 * side below or below-right take `dark`, near an open side above or to the left take `light`,
 * the rest `mid`. `reach` is how deep each band goes. Pixels outside `body` are untouched.
 */
export function light(
  p: Pic,
  body: string,
  c: { line?: string; dark: string; mid: string; light: string; glint?: string },
  reach: { light: number; dark: number } = { light: 2, dark: 2 },
): Pic {
  const isIn = (x: number, y: number) => {
    const ch = p.at(x, y);
    return ch !== undefined && body.includes(ch);
  };
  const open = (x: number, y: number, dx: number, dy: number, n: number) => {
    for (let k = 1; k <= n; k++) if (!isIn(x + dx * k, y + dy * k)) return true;
    return false;
  };
  const out = p.clone();
  for (let y = 0; y < p.h; y++) {
    for (let x = 0; x < p.w; x++) {
      if (!isIn(x, y)) continue;
      const edge = !isIn(x - 1, y) || !isIn(x + 1, y) || !isIn(x, y - 1) || !isIn(x, y + 1);
      let ch = c.mid;
      if (edge && c.line) ch = c.line;
      else if (
        open(x, y, 0, 1, reach.dark) ||
        open(x, y, 1, 1, reach.dark) ||
        open(x, y, 1, 0, reach.dark)
      )
        ch = c.dark;
      else if (c.glint && open(x, y, -1, -1, 1) && open(x, y, 0, -1, 1)) ch = c.glint;
      else if (
        open(x, y, -1, -1, reach.light) ||
        open(x, y, 0, -1, reach.light) ||
        open(x, y, -1, 0, reach.light)
      )
        ch = c.light;
      out.set(x, y, ch);
    }
  }
  return out;
}

/**
 * Turns every opaque pixel that touches clear on a side into the outline for its material:
 * `outlines` maps a fill character to its outline character (`{ w: 'G', s: 'O' }`); others
 * use `fallback`.
 */
export function rim(p: Pic, outlines: Readonly<Record<string, string>>, fallback: string): Pic {
  const out = p.clone();
  const deep = new Set([...Object.values(outlines), fallback]);
  for (let y = 0; y < p.h; y++) {
    for (let x = 0; x < p.w; x++) {
      const ch = p.at(x, y) as string;
      if (ch === "." || deep.has(ch)) continue;
      const open = [p.at(x - 1, y), p.at(x + 1, y), p.at(x, y - 1), p.at(x, y + 1)].some(
        (n) => n === undefined || n === ".",
      );
      if (open) out.set(x, y, outlines[ch] ?? fallback);
    }
  }
  return out;
}

/** Characters of a grid swapped: `swap(g, "ab", "xy")`. */
export function swap(g: string, from: string, to: string): string {
  return Pic.of(g).swap(from, to).toString();
}

/** Mirrors a grid left to right. */
export function mirror(g: string | Pic): string {
  return (typeof g === "string" ? Pic.of(g) : g).flipX().toString();
}

/** A legend with every colour replaced by one paint, and the `drop` characters cleared. */
export function silhouette(legend: Legend, paint: Paint, drop = ""): Legend {
  return Object.fromEntries(
    Object.entries(legend).map(([k, v]) => [k, v === null || drop.includes(k) ? null : paint]),
  );
}

/** A part grid placed at a position. */
export const at = (x: number, y: number, grid: string | Pic): PartGrid => ({
  at: [x, y],
  grid: typeof grid === "string" ? grid : grid.toString(),
});

/** Frame names `prefix0..prefixN-1` built from a list. */
export function series<T>(
  prefix: string,
  list: readonly T[],
  make: (v: T, i: number) => string | readonly (string | readonly [string, number, number])[],
) {
  return Object.fromEntries(list.map((v, i) => [`${prefix}${i}`, make(v, i)]));
}

/** A library of placed grids that frames are composed from. */
export class Parts {
  readonly map = new Map<string, { x: number; y: number; pic: Pic }>();
  add(name: string, x: number, y: number, grid: string | Pic): string {
    this.map.set(name, { x, y, pic: typeof grid === "string" ? Pic.of(grid) : grid });
    return name;
  }
  /** Draws placements back to front onto a `w`×`h` picture: `name` or `[name, dx, dy]`. */
  draw(w: number, h: number, list: readonly (string | readonly [string, number, number])[]): Pic {
    const p = Pic.blank(w, h);
    for (const item of list) {
      const [name, dx, dy] = typeof item === "string" ? [item, 0, 0] : item;
      const part = this.map.get(name);
      if (!part) throw new Error(`no part ${name}`);
      p.put(part.pic, part.x + dx, part.y + dy);
    }
    return p;
  }
}

/**
 * Folds stray single pixels left where pieces overlap into their surroundings: a pixel with no
 * same-character neighbour (8 directions) takes the character most of its neighbours have, and
 * on the silhouette edge it takes one of `deep` (the outline characters) instead. Characters in
 * `keep` (eyes, glints) are left alone.
 */
export function clean(p: Pic, keep: string, deep: string): Pic {
  for (let pass = 0; pass < 3; pass++) {
    let changed = false;
    for (let y = 0; y < p.h; y++) {
      for (let x = 0; x < p.w; x++) {
        const ch = p.at(x, y) as string;
        if (ch === "." || keep.includes(ch)) continue;
        const around = new Map<string, number>();
        let paired = false;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const n = p.at(x + dx, y + dy);
            if (n === ch) paired = true;
            if (n !== undefined && n !== "." && !keep.includes(n))
              around.set(n, (around.get(n) ?? 0) + (dx && dy ? 1 : 2));
          }
        if (paired) continue;
        const edge = [p.at(x - 1, y), p.at(x + 1, y), p.at(x, y - 1), p.at(x, y + 1)].some(
          (n) => n === undefined || n === ".",
        );
        const ranked = [...around].sort((a, b) => b[1] - a[1]).map(([c]) => c);
        const next = edge ? (ranked.find((c) => deep.includes(c)) ?? deep[0]) : ranked[0];
        if (next && next !== ch) {
          p.set(x, y, next);
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
  return p;
}

/**
 * Seals the silhouette: every pixel touching clear on a side whose character is not an outline
 * takes its material's outline from `deepOf` (fill character to outline character).
 */
export function seal(p: Pic, deepOf: Readonly<Record<string, string>>, keep: string): Pic {
  const deep = new Set(Object.values(deepOf));
  const out = p.clone();
  for (let y = 0; y < p.h; y++) {
    for (let x = 0; x < p.w; x++) {
      const ch = p.at(x, y) as string;
      if (ch === "." || keep.includes(ch) || deep.has(ch)) continue;
      const open = [p.at(x - 1, y), p.at(x + 1, y), p.at(x, y - 1), p.at(x, y + 1)].some(
        (n) => n === undefined || n === ".",
      );
      const to = deepOf[ch];
      if (open && to) out.set(x, y, to);
    }
  }
  return out;
}

/** Holds no art: helpers only. */
export default [];
