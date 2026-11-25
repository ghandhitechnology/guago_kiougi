/**
 * Dual-grid terrain picking, shared by the map generator, the client and the contact sheet.
 *
 * World cells hold terrain ids. Display tiles sit on cell corners, offset half a tile up and
 * left: display tile (i, j) is drawn at pixel (i·16 − 8, j·16 − 8) and covers the corners of
 * cells (i−1, j−1), (i, j−1), (i−1, j), (i, j). Its mask has a bit per corner cell that is the
 * upper terrain. Cells outside the map repeat the nearest edge cell.
 */

export const TL = 1;
export const TR = 2;
export const BL = 4;
export const BR = 8;

export interface TerrainGrid {
  readonly w: number;
  readonly h: number;
  /** Terrain id per cell, row major. */
  readonly cells: ArrayLike<number>;
}

function cellAt(grid: TerrainGrid, x: number, y: number): number {
  const cx = Math.min(grid.w - 1, Math.max(0, x));
  const cy = Math.min(grid.h - 1, Math.max(0, y));
  return grid.cells[cy * grid.w + cx] as number;
}

/** Mask of display tile (i, j) for one upper terrain id. */
export function dualMask(grid: TerrainGrid, upper: number, i: number, j: number): number {
  return (
    (cellAt(grid, i - 1, j - 1) === upper ? TL : 0) |
    (cellAt(grid, i, j - 1) === upper ? TR : 0) |
    (cellAt(grid, i - 1, j) === upper ? BL : 0) |
    (cellAt(grid, i, j) === upper ? BR : 0)
  );
}

/** A stable 32-bit hash of a position and seed. */
export function hash2(x: number, y: number, seed: number): number {
  let h =
    (Math.imul(x | 0, 0x27d4eb2d) ^
      Math.imul(y | 0, 0x165667b1) ^
      Math.imul(seed | 0, 0x9e3779b9)) >>>
    0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * Picks a tile for every display tile: `(w + 1) × (h + 1)` indices, row major. `masks[m]` lists
 * the tile indices that draw mask m; one is chosen per position by hash.
 */
export function pickTiles(
  grid: TerrainGrid,
  upper: number,
  masks: readonly (readonly number[])[],
  seed: number,
): Uint16Array {
  const out = new Uint16Array((grid.w + 1) * (grid.h + 1));
  for (let j = 0; j <= grid.h; j++) {
    for (let i = 0; i <= grid.w; i++) {
      const options = masks[dualMask(grid, upper, i, j)];
      if (!options || options.length === 0) throw new Error("every mask needs at least one tile");
      out[j * (grid.w + 1) + i] = options[hash2(i, j, seed) % options.length] as number;
    }
  }
  return out;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Value noise in [0, 1) with features about `scale` cells across. */
export function valueNoise(x: number, y: number, scale: number, seed: number): number {
  const fx = x / scale;
  const fy = y / scale;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = smooth(fx - x0);
  const ty = smooth(fy - y0);
  const v = (a: number, b: number): number => hash2(a, b, seed) / 2 ** 32;
  const top = v(x0, y0) + (v(x0 + 1, y0) - v(x0, y0)) * tx;
  const bottom = v(x0, y0 + 1) + (v(x0 + 1, y0 + 1) - v(x0, y0 + 1)) * tx;
  return top + (bottom - top) * ty;
}

/** Whether a cell and its whole 3×3 neighbourhood are on the same side of `upper`. */
export function uniformAt(grid: TerrainGrid, upper: number, x: number, y: number): boolean {
  const isUpper = cellAt(grid, x, y) === upper;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if ((cellAt(grid, x + dx, y + dy) === upper) !== isUpper) return false;
    }
  }
  return true;
}

/** Cells across one feature of tone noise. */
export const TONE_SCALE = 6;

/** Low-frequency noise in [0, 1) that picks tone patches; two octaves to break up the lattice. */
export function toneNoise(x: number, y: number, seed: number): number {
  return (
    0.7 * valueNoise(x, y, TONE_SCALE, seed + 31) +
    0.3 * valueNoise(x + 17, y + 5, TONE_SCALE / 2, seed + 57)
  );
}

export interface ToneRule {
  readonly on: "upper" | "lower";
  readonly band: readonly [number, number];
  readonly masks: readonly (readonly number[])[];
}

/**
 * Picks a tone's overlay tile for every display tile, like `pickTiles`, or -1 where it draws
 * nothing. A cell joins the tone when its noise falls in the band and its 3×3 neighbourhood is
 * all on the tone's side, so patches never reach a terrain edge.
 */
export function pickTone(
  grid: TerrainGrid,
  upper: number,
  tone: ToneRule,
  seed: number,
): Int32Array {
  const cells = new Uint8Array(grid.w * grid.h);
  for (let y = 0; y < grid.h; y++) {
    for (let x = 0; x < grid.w; x++) {
      const side = cellAt(grid, x, y) === upper ? "upper" : "lower";
      const n = toneNoise(x, y, seed);
      if (side === tone.on && n >= tone.band[0] && n < tone.band[1] && uniformAt(grid, upper, x, y))
        cells[y * grid.w + x] = 1;
    }
  }
  const toned: TerrainGrid = { w: grid.w, h: grid.h, cells };
  const out = new Int32Array((grid.w + 1) * (grid.h + 1)).fill(-1);
  for (let j = 0; j <= grid.h; j++) {
    for (let i = 0; i <= grid.w; i++) {
      const options = tone.masks[dualMask(toned, 1, i, j)];
      if (!options || options.length === 0) continue;
      out[j * (grid.w + 1) + i] = options[hash2(i, j, seed + 3) % options.length] as number;
    }
  }
  return out;
}

export interface DecalRule {
  readonly on: "upper" | "lower";
  readonly density: number;
  /** Decal size in pixels, for the jitter range inside a 16 px cell. */
  readonly w: number;
  readonly h: number;
}

export interface DecalPlacement {
  /** Index into the rules list. */
  readonly decal: number;
  /** Top-left pixel of the decal in world pixels. */
  readonly x: number;
  readonly y: number;
}

/**
 * Scatters decals over cells whose whole 3×3 neighbourhood is one terrain, clumped by value
 * noise. At most one decal per cell; earlier rules win.
 */
export function scatterDecals(
  grid: TerrainGrid,
  upper: number,
  rules: readonly DecalRule[],
  seed: number,
): DecalPlacement[] {
  const out: DecalPlacement[] = [];
  for (let y = 0; y < grid.h; y++) {
    for (let x = 0; x < grid.w; x++) {
      if (!uniformAt(grid, upper, x, y)) continue;
      const isUpper = cellAt(grid, x, y) === upper;
      for (let d = 0; d < rules.length; d++) {
        const rule = rules[d] as DecalRule;
        if ((rule.on === "upper") !== isUpper || rule.density <= 0) continue;
        const n = valueNoise(x, y, 4, seed + 101 * d);
        const roll = hash2(x, y, seed + 7919 * (d + 1)) / 2 ** 32;
        if (roll >= rule.density * 3 * n * n) continue;
        const jitter = hash2(y, x, seed + d);
        const spanX = 16 - rule.w;
        const spanY = 16 - rule.h;
        out.push({
          decal: d,
          x: x * 16 + (spanX > 0 ? jitter % (spanX + 1) : 0),
          y: y * 16 + (spanY > 0 ? (jitter >>> 8) % (spanY + 1) : 0),
        });
        break;
      }
    }
  }
  return out;
}
