import { type CollisionMap, MAX_MAP_PX, TILE_SIZE } from "@guago/shared";
import { type MapDef, mapSize } from "./maps.ts";

/**
 * A stand-in collision source until the map format carries its own grid: props that stand on a
 * map, each blocking the tiles of its footprint. `collisionOf` is the one place the simulation's
 * grid comes from, so the real format replaces its body and nothing else.
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

/** Props by map id. */
const PROPS: Readonly<Record<string, readonly PlacedProp[]>> = {
  lawn: [
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
  ],
};

export function propsOf(map: MapDef): readonly PlacedProp[] {
  return PROPS[map.id] ?? [];
}

const grids = new WeakMap<MapDef, CollisionMap>();

/** The map's tile collision grid. Built once per map. */
export function collisionOf(map: MapDef): CollisionMap {
  const cached = grids.get(map);
  if (cached) return cached;
  const { w, h } = mapSize(map);
  if (w * TILE_SIZE > MAX_MAP_PX || h * TILE_SIZE > MAX_MAP_PX) {
    throw new Error(`map ${map.id} is larger than positions can address (${MAX_MAP_PX} px)`);
  }
  const solid = new Uint8Array(w * h);
  for (const p of propsOf(map)) {
    for (let y = p.ty; y < p.ty + (p.h ?? 1); y++) {
      for (let x = p.tx; x < p.tx + (p.w ?? 1); x++) {
        if (x >= 0 && y >= 0 && x < w && y < h) solid[y * w + x] = 1;
      }
    }
  }
  const grid: CollisionMap = { width: w, height: h, solid };
  grids.set(map, grid);
  return grid;
}
