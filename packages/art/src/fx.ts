/**
 * Raster helpers for combat effects. Effects are mostly geometry in motion (polygons, rings,
 * bolts, waves, cracks), so they are drawn here by rule into a `Pic` and come out as ordinary
 * grids that go through the same parser and checks as typed ones. Nothing here knows colours:
 * every call names legend characters.
 */
import { Pic } from "./paint.ts";

export { Pic };

export type Pt = readonly [x: number, y: number];

/** A picture painted per pixel; the function gets the pixel's centre. `null` leaves it clear. */
export function paintAt(
  w: number,
  h: number,
  f: (x: number, y: number, px: number, py: number) => string | null | undefined,
): Pic {
  const p = Pic.blank(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = f(x + 0.5, y + 0.5, x, y);
      if (ch) p.set(x, y, ch);
    }
  }
  return p;
}

/** Paints over `p` wherever `f` returns a character, optionally only onto some characters. */
export function paintOver(
  p: Pic,
  f: (x: number, y: number, px: number, py: number) => string | null | undefined,
  onto?: string,
): Pic {
  for (let y = 0; y < p.h; y++) {
    for (let x = 0; x < p.w; x++) {
      const ch = f(x + 0.5, y + 0.5, x, y);
      if (ch && (onto === undefined || onto.includes(p.at(x, y) as string))) p.set(x, y, ch);
    }
  }
  return p;
}

/** Sets one pixel at a rounded position. */
export function dot(p: Pic, x: number, y: number, ch: string, onto?: string): Pic {
  const rx = Math.round(x);
  const ry = Math.round(y);
  if (onto === undefined || onto.includes(p.at(rx, ry) ?? "")) p.set(rx, ry, ch);
  return p;
}

/** A one-pixel line between two pixel positions (Bresenham), every step 8-connected. */
export function line(
  p: Pic,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  ch: string,
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
    dot(p, x, y, ch, onto);
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

/** Lines through a list of points. */
export function path(p: Pic, pts: readonly Pt[], ch: string, closed = false, onto?: string): Pic {
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i] as Pt;
    const b = pts[i + 1] as Pt;
    line(p, a[0], a[1], b[0], b[1], ch, onto);
  }
  if (closed && pts.length > 2) {
    const a = pts[pts.length - 1] as Pt;
    const b = pts[0] as Pt;
    line(p, a[0], a[1], b[0], b[1], ch, onto);
  }
  return p;
}

/** Distance from (x, y) to the segment a–b. */
export function segDist(x: number, y: number, a: Pt, b: Pt): number {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const len = vx * vx + vy * vy;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((x - a[0]) * vx + (y - a[1]) * vy) / len));
  return Math.hypot(x - a[0] - vx * t, y - a[1] - vy * t);
}

/** Vertices of a regular polygon with circumradius `r`, first vertex at angle `rot` (radians, 0 = right). */
export function regular(n: number, cx: number, cy: number, r: number, rot = 0): Pt[] {
  return Array.from({ length: n }, (_, i) => {
    const a = rot + (i * 2 * Math.PI) / n;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r] as Pt;
  });
}

/**
 * Signed distance to a regular polygon (negative inside), and the outward angle of the nearest
 * edge, for lighting. `n` 0 is a circle.
 */
export function polySdf(
  n: number,
  r: number,
  rot: number,
): (dx: number, dy: number) => { d: number; a: number } {
  if (n === 0) return (dx, dy) => ({ d: Math.hypot(dx, dy) - r, a: Math.atan2(dy, dx) });
  const apothem = r * Math.cos(Math.PI / n);
  const normals = Array.from({ length: n }, (_, i) => rot + ((i + 0.5) * 2 * Math.PI) / n);
  return (dx, dy) => {
    let best = -Infinity;
    let a = 0;
    for (const na of normals) {
      const v = dx * Math.cos(na) + dy * Math.sin(na) - apothem;
      if (v > best) {
        best = v;
        a = na;
      }
    }
    return { d: best, a };
  };
}

/** Normalised ellipse distance: 1 on the ellipse. */
export function ell(x: number, y: number, cx: number, cy: number, rx: number, ry: number): number {
  return Math.hypot((x - cx) / rx, (y - cy) / ry);
}

/** Whether a direction (angle in radians, 0 = right, y down) faces the top-left light. */
export function facesLight(a: number): boolean {
  return -(Math.cos(a) + Math.sin(a)) * Math.SQRT1_2 > 0.05;
}

/** Rotates a square-ish picture a quarter turn clockwise. */
export function turnCw(src: Pic): Pic {
  const out = Pic.blank(src.h, src.w);
  for (let y = 0; y < src.h; y++) {
    for (let x = 0; x < src.w; x++) out.set(src.h - 1 - y, x, src.at(x, y) as string);
  }
  return out;
}

export function flipY(src: Pic): Pic {
  const out = Pic.blank(src.w, src.h);
  for (let y = 0; y < src.h; y++) {
    for (let x = 0; x < src.w; x++) out.set(x, src.h - 1 - y, src.at(x, y) as string);
  }
  return out;
}

/**
 * Grows every pixel holding a character of `from` by one pixel into clear cells (4 or 8
 * neighbours), painting the new pixels `ch`.
 */
export function grow(p: Pic, from: string, ch: string, eight = false): Pic {
  const add: [number, number][] = [];
  const dirs = eight
    ? [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ]
    : [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ];
  for (let y = 0; y < p.h; y++) {
    for (let x = 0; x < p.w; x++) {
      if (p.at(x, y) !== ".") continue;
      if (
        dirs.some(([dx, dy]) => from.includes(p.at(x + (dx as number), y + (dy as number)) ?? "!"))
      )
        add.push([x, y]);
    }
  }
  for (const [x, y] of add) p.set(x, y, ch);
  return p;
}

/**
 * Removes single pixels: a pixel with no same-character neighbour (8 directions) takes the
 * character most of its opaque neighbours have, or is cleared when it has none. Characters in
 * `keep` stay as they are (sparks and motes that are meant to stand alone).
 */
export function clean(p: Pic, keep = ""): Pic {
  for (let pass = 0; pass < 3; pass++) {
    let changed = false;
    for (let y = 0; y < p.h; y++) {
      for (let x = 0; x < p.w; x++) {
        const ch = p.at(x, y) as string;
        if (ch === "." || keep.includes(ch)) continue;
        const around = new Map<string, number>();
        let same = false;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const n = p.at(x + dx, y + dy);
            if (n === undefined || n === ".") continue;
            if (n === ch) same = true;
            around.set(n, (around.get(n) ?? 0) + 1);
          }
        }
        if (same) continue;
        const best = [...around].sort((a, b) => b[1] - a[1])[0];
        p.set(x, y, best ? best[0] : ".");
        changed = true;
      }
    }
    if (!changed) break;
  }
  return p;
}

/** A small deterministic random stream, so drawn effects are the same every build. */
export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

/** Frame names `prefix0..prefix{n-1}` mapped to drawn grids. */
export function framesOf(prefix: string, pics: readonly Pic[]): Record<string, string> {
  return Object.fromEntries(pics.map((p, i) => [`${prefix}${i}`, p.toString()]));
}

export function names(prefix: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => `${prefix}${i}`);
}

/** Draws `src` onto `dst` at (x, y), clear pixels skipped. */
export function put(dst: Pic, src: Pic | string, x: number, y: number, onto?: string): Pic {
  return dst.put(src, Math.round(x), Math.round(y), onto === undefined ? {} : { onto });
}

/** Swaps characters of a picture: `recolor(p, "ab", "xy")`. */
export function recolor(p: Pic, from: string, to: string): Pic {
  return p.swap(from, to);
}

/**
 * Directional frames: `n` drawings round the circle, frame `k` aimed at `k / n` of a turn
 * (0 = right, clockwise with y down). For shapes that must not be rotated by the client, so
 * thin lines never alias: the client picks the frame nearest its aim instead.
 */
export function aimed(n: number, draw: (angle: number) => Pic): Pic[] {
  return Array.from({ length: n }, (_, k) => draw((k / n) * Math.PI * 2));
}

/** Frame names and anims for `aimed` sets: frames `${prefix}${dir}-${step}`, one anim per direction. */
export function aimedFrames(
  prefix: string,
  sets: readonly (readonly Pic[])[],
): Record<string, string> {
  const out: Record<string, string> = {};
  sets.forEach((steps, dir) => {
    steps.forEach((p, k) => {
      out[`${prefix}${dir}-${k}`] = p.toString();
    });
  });
  return out;
}
