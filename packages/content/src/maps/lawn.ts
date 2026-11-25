import type { SpawnGroup, TileCollision } from "@guago/shared";
import { TILE_SIZE } from "@guago/shared";

/**
 * The first walking map, written before the map format: one terrain pair, one spawn. Kept as is
 * for the movement work, with a collision grid so it reads like any built map.
 */
export interface MapDef {
  readonly id: string;
  /** Terrain pair from the art package; `#` cells are its upper terrain, `.` its lower. */
  readonly terrain: string;
  /** Tile theme the terrain is baked under. */
  readonly theme: string;
  readonly rows: readonly string[];
  /** Seed for tile variants and decals, so every client draws the same ground. */
  readonly seed: number;
  /** Player spawn in world pixels. */
  readonly spawn: { readonly x: number; readonly y: number };
  readonly monsters: readonly SpawnGroup[];
  /** Every tile walkable; the map edge is the wall. */
  readonly collision: TileCollision;
}

const LAWN_ROWS = [
  "####################################",
  "####################################",
  "#############..#####################",
  "#############..#####################",
  "#############...####################",
  "##############...###################",
  "###############...##################",
  "################.....###############",
  "#################.......############",
  "###########.......###.......########",
  "#########.........###########...####",
  "########....##...#############......",
  "########....##...###################",
  "#########.......####################",
  "##########....######################",
  "###########..#######################",
  "###########..#######################",
  "##########...#######################",
  "##########..########################",
  "#########...########################",
  "#########..#########################",
  "#########..#########################",
];

/** 본관 앞 잔디: the lawn in front of the main building, crossed by a worn path. */
export const LAWN: MapDef = {
  id: "lawn",
  terrain: "lawn-path",
  theme: "campus",
  rows: LAWN_ROWS,
  seed: 20261125,
  spawn: { x: 12 * TILE_SIZE, y: 13 * TILE_SIZE },
  monsters: [
    { kind: "odap", count: 6 },
    { kind: "odap-pencil", count: 3 },
  ],
  collision: {
    w: LAWN_ROWS[0]?.length ?? 0,
    h: LAWN_ROWS.length,
    rows: LAWN_ROWS.map((r) => ".".repeat(r.length)),
  },
};

export function mapSize(map: MapDef): { w: number; h: number } {
  return { w: map.rows[0]?.length ?? 0, h: map.rows.length };
}

/** Terrain cells, row major: 1 for the upper terrain, 0 for the lower. */
export function mapCells(map: MapDef): Uint8Array {
  const { w, h } = mapSize(map);
  const cells = new Uint8Array(w * h);
  map.rows.forEach((row, y) => {
    if (row.length !== w)
      throw new Error(`map ${map.id}: row ${y} is ${row.length} wide, not ${w}`);
    for (let x = 0; x < w; x++) cells[y * w + x] = row[x] === "#" ? 1 : 0;
  });
  return cells;
}
