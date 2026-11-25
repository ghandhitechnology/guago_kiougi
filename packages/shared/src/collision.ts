import { TILE_SIZE } from "./constants.ts";

/**
 * Tile collision (PLAN §6 "Physics": a tile collision grid per map). One character per tile,
 * row major, so a built map's grid stays readable in its JSON:
 *
 * - `.` walkable
 * - `#` solid: walls, building footprints, prop footprints
 * - `~` water or void: blocks walking, not what flies over it
 */
export const TILE_WALK = ".";
export const TILE_SOLID = "#";
export const TILE_WATER = "~";

export interface TileCollision {
  /** Size in tiles. */
  readonly w: number;
  readonly h: number;
  /** `h` rows of `w` characters. */
  readonly rows: readonly string[];
}

/** Anything that carries a collision grid: a built map, or a hand-written one like the lawn. */
export interface Collidable {
  readonly collision: TileCollision;
}

/**
 * Whether a tile stops a walker. Tiles outside the map are solid. The simulation reads collision
 * through this one function and nothing else.
 */
export function isSolidTile(map: Collidable, tx: number, ty: number): boolean {
  const { w, h, rows } = map.collision;
  if (tx < 0 || ty < 0 || tx >= w || ty >= h) return true;
  return rows[ty]?.charCodeAt(tx) !== 46; // "."
}

/** A map of `w`×`h` tiles with the `solid` ones blocked, for tests and tools. */
export function gridOf(
  w: number,
  h: number,
  solid: readonly (readonly [number, number])[] = [],
): Collidable {
  const rows = Array.from({ length: h }, () => Array<string>(w).fill(TILE_WALK));
  for (const [tx, ty] of solid) {
    const row = rows[ty];
    if (row && tx >= 0 && tx < w) row[tx] = TILE_SOLID;
  }
  return { collision: { w, h, rows: rows.map((r) => r.join("")) } };
}

const T = TILE_SIZE;

/**
 * Pushes a circle out of every solid tile it overlaps and returns where it ends up.
 *
 * A tile's side shared with another solid tile is not a face: the tile is treated as reaching on
 * through its neighbour. A circle sliding along a wall built from many tiles therefore meets one
 * flat face and never snags on the seams between them, while a free-standing corner stays a real
 * corner the circle rolls around.
 */
export function pushOut(
  map: Collidable,
  x: number,
  y: number,
  r: number,
): { x: number; y: number; hit: boolean } {
  let hit = false;
  for (let pass = 0; pass < 4; pass++) {
    let pushed = false;
    const tx0 = Math.floor((x - r) / T);
    const tx1 = Math.floor((x + r) / T);
    const ty0 = Math.floor((y - r) / T);
    const ty1 = Math.floor((y + r) / T);
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        if (!isSolidTile(map, tx, ty)) continue;
        const left = isSolidTile(map, tx - 1, ty) ? -Infinity : tx * T;
        const right = isSolidTile(map, tx + 1, ty) ? Infinity : (tx + 1) * T;
        const top = isSolidTile(map, tx, ty - 1) ? -Infinity : ty * T;
        const bottom = isSolidTile(map, tx, ty + 1) ? Infinity : (ty + 1) * T;
        const cx = Math.min(right, Math.max(left, x));
        const cy = Math.min(bottom, Math.max(top, y));
        const dx = x - cx;
        const dy = y - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 >= r * r) continue;
        if (d2 > 0) {
          const d = Math.sqrt(d2);
          const k = (r - d) / d;
          x += dx * k;
          y += dy * k;
        } else {
          // The centre is inside: leave through the nearest real face, if the tile has one.
          let best = Infinity;
          let nx = 0;
          let ny = 0;
          if (left !== -Infinity && x - left < best) {
            best = x - left;
            nx = left - r - x;
            ny = 0;
          }
          if (right !== Infinity && right - x < best) {
            best = right - x;
            nx = right + r - x;
            ny = 0;
          }
          if (top !== -Infinity && y - top < best) {
            best = y - top;
            nx = 0;
            ny = top - r - y;
          }
          if (bottom !== Infinity && bottom - y < best) {
            best = bottom - y;
            nx = 0;
            ny = bottom + r - y;
          }
          if (best === Infinity) continue;
          x += nx;
          y += ny;
        }
        pushed = true;
        hit = true;
      }
    }
    if (!pushed) break;
  }
  return { x, y, hit };
}

/** Whether a circle overlaps any solid tile, with slack for positions snapped to the 1/8 px grid. */
export function overlapsSolid(map: Collidable, x: number, y: number, r: number): boolean {
  const rr = r - 1 / 8;
  const tx0 = Math.floor((x - rr) / T);
  const tx1 = Math.floor((x + rr) / T);
  const ty0 = Math.floor((y - rr) / T);
  const ty1 = Math.floor((y + rr) / T);
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      if (!isSolidTile(map, tx, ty)) continue;
      const cx = Math.min((tx + 1) * T, Math.max(tx * T, x));
      const cy = Math.min((ty + 1) * T, Math.max(ty * T, y));
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy < rr * rr) return true;
    }
  }
  return false;
}
