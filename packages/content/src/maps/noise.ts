/**
 * Seeded hash and value noise for map generation. Same results on every machine, so a map built
 * on the server, in the client and on the contact sheet is the same map.
 */

/** A stable 32-bit hash of a position and seed. */
export function hash(x: number, y: number, seed: number): number {
  let h =
    (Math.imul(x | 0, 0x2c1b3c6d) ^
      Math.imul(y | 0, 0x297a2d39) ^
      Math.imul(seed | 0, 0x7feb352d)) >>>
    0;
  h = Math.imul(h ^ (h >>> 16), 0x846ca68b) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** A hash as a fraction in [0, 1). */
export function unit(x: number, y: number, seed: number): number {
  return hash(x, y, seed) / 2 ** 32;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Value noise in [0, 1) with features about `scale` cells across. */
export function noise(x: number, y: number, scale: number, seed: number): number {
  const fx = x / scale;
  const fy = y / scale;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = smooth(fx - x0);
  const ty = smooth(fy - y0);
  const top = unit(x0, y0, seed) + (unit(x0 + 1, y0, seed) - unit(x0, y0, seed)) * tx;
  const bottom =
    unit(x0, y0 + 1, seed) + (unit(x0 + 1, y0 + 1, seed) - unit(x0, y0 + 1, seed)) * tx;
  return top + (bottom - top) * ty;
}

/** Two octaves, so patches do not line up on the noise lattice. */
export function fractal(x: number, y: number, scale: number, seed: number): number {
  return 0.68 * noise(x, y, scale, seed) + 0.32 * noise(x + 13, y + 7, scale / 2.3, seed + 1);
}
