import { TILE_SOLID, TILE_WALK } from "@guago/shared";

/**
 * Props standing on the lawn, each blocking the tiles of its footprint. The lawn was written
 * before the map format; these give it walls to slide along, corners to round and a gap to
 * thread, and they are the one source of both its collision rows and what the client draws.
 */
export interface PlacedProp {
  /** Sprite name in the art metadata. */
  readonly sprite: string;
  readonly frame: string;
  /** Top-left tile of the footprint. */
  readonly tx: number;
  readonly ty: number;
  /** Footprint size in tiles; 1×1 when unset. */
  readonly w?: number;
  readonly h?: number;
}

function fence(tx0: number, tx1: number, ty: number): PlacedProp[] {
  const out: PlacedProp[] = [];
  for (let tx = tx0; tx <= tx1; tx++) {
    const post = tx === tx0 || tx === tx1 || (tx - tx0) % 4 === 0;
    out.push({ sprite: "fence", frame: post ? "post" : "run", tx, ty });
  }
  return out;
}

const shrub = (tx: number, ty: number): PlacedProp => ({ sprite: "shrub", frame: "still", tx, ty });
const lamp = (tx: number, ty: number): PlacedProp => ({ sprite: "lamp", frame: "still", tx, ty });

export const LAWN_PROPS: readonly PlacedProp[] = [
  ...fence(19, 31, 4),
  { sprite: "planter", frame: "still", tx: 22, ty: 12, w: 3 },
  shrub(4, 17),
  shrub(5, 17),
  shrub(7, 17),
  shrub(8, 17),
  shrub(27, 17),
  shrub(28, 18),
  lamp(18, 10),
  lamp(13, 17),
  { sprite: "pine", frame: "base", tx: 31, ty: 15 },
];

/** Collision rows of a `w`×`h` map, walkable but for the props' footprints. */
export function footprintRows(w: number, h: number, props: readonly PlacedProp[]): string[] {
  const rows = Array.from({ length: h }, () => Array<string>(w).fill(TILE_WALK));
  for (const p of props) {
    for (let y = p.ty; y < p.ty + (p.h ?? 1); y++) {
      for (let x = p.tx; x < p.tx + (p.w ?? 1); x++) {
        const row = rows[y];
        if (row && x >= 0 && x < w) row[x] = TILE_SOLID;
      }
    }
  }
  return rows.map((r) => r.join(""));
}
