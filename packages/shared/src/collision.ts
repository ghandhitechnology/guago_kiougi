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

/** Passes of contact resolution per call; an inside corner needs two, a notch a few more. */
const PASSES = 8;
/** How far to look for open ground when a centre has ended up inside a solid tile, in tiles. */
const RESCUE_TILES = 4;

/**
 * The walkable point nearest (x, y) at which a circle of radius `r` touches no solid tile: the
 * nearest spot at least `r` inside a walkable tile. For a centre that is inside a solid tile,
 * which only a spawn or a teleport can cause.
 */
function rescue(map: Collidable, x: number, y: number, r: number): { x: number; y: number } {
  const cx = Math.floor(x / T);
  const cy = Math.floor(y / T);
  let best: { x: number; y: number } | undefined;
  let bestD = Infinity;
  for (let ring = 1; ring <= RESCUE_TILES && !best; ring++) {
    for (let ty = cy - ring; ty <= cy + ring; ty++) {
      for (let tx = cx - ring; tx <= cx + ring; tx++) {
        if (isSolidTile(map, tx, ty)) continue;
        const px = Math.min((tx + 1) * T - r, Math.max(tx * T + r, x));
        const py = Math.min((ty + 1) * T - r, Math.max(ty * T + r, y));
        const d = (px - x) ** 2 + (py - y) ** 2;
        if (d < bestD) {
          bestD = d;
          best = { x: px, y: py };
        }
      }
    }
  }
  return best ?? { x, y };
}

/**
 * Pushes a circle out of the solid tiles it overlaps and returns where it ends up.
 *
 * Each pass finds the single nearest solid point among the overlapped tiles, each tile taken as
 * the square it is, and pushes straight away from it. Along a wall built from many tiles the
 * nearest point always lies on the flat face, never on a corner at a seam, so a sliding body
 * meets one smooth wall; a free-standing corner is a point the body rolls around; and in an
 * inside corner the two faces push in turn, so nothing is ever pushed through a wall.
 */
export function pushOut(
  map: Collidable,
  x: number,
  y: number,
  r: number,
): { x: number; y: number; hit: boolean } {
  let hit = false;
  if (isSolidTile(map, Math.floor(x / T), Math.floor(y / T))) {
    ({ x, y } = rescue(map, x, y, r));
    hit = true;
  }
  for (let pass = 0; pass < PASSES; pass++) {
    let bestD2 = r * r;
    let nx = 0;
    let ny = 0;
    const tx0 = Math.floor((x - r) / T);
    const tx1 = Math.floor((x + r) / T);
    const ty0 = Math.floor((y - r) / T);
    const ty1 = Math.floor((y + r) / T);
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        if (!isSolidTile(map, tx, ty)) continue;
        const px = Math.min((tx + 1) * T, Math.max(tx * T, x));
        const py = Math.min((ty + 1) * T, Math.max(ty * T, y));
        let dx = x - px;
        let dy = y - py;
        const d2 = dx * dx + dy * dy;
        if (d2 >= bestD2) continue;
        if (d2 === 0) {
          // On the tile's edge exactly: away from its middle.
          dx = x - (tx + 0.5) * T;
          dy = y - (ty + 0.5) * T;
        }
        bestD2 = d2;
        nx = dx;
        ny = dy;
      }
    }
    if (bestD2 >= r * r) break;
    const d = Math.sqrt(bestD2);
    const len = Math.sqrt(nx * nx + ny * ny);
    if (len === 0) break;
    x += (nx / len) * (r - d);
    y += (ny / len) * (r - d);
    hit = true;
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
