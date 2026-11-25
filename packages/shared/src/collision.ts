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

/** Whether a tile stops a walker. Tiles outside the map are solid. */
export function isSolidTile(map: Collidable, tx: number, ty: number): boolean {
  const { w, h, rows } = map.collision;
  if (tx < 0 || ty < 0 || tx >= w || ty >= h) return true;
  return rows[ty]?.charCodeAt(tx) !== 46; // "."
}
