import type { ArtMetadata } from "@guago/art";
import { pickTiles, scatterDecals } from "@guago/art";
import { type MapDef, mapCells, mapSize } from "@guago/content";
import { TILE_SIZE } from "@guago/shared";
import type * as Phaser from "phaser";

export const GROUND_DEPTH = 0;
export const DECAL_DEPTH = 1;

/**
 * Draws a map's ground: dual-grid terrain tiles on a layer offset half a tile up and left, then
 * the terrain's decals scattered over cells that are one terrain all round.
 */
export function drawGround(scene: Phaser.Scene, meta: ArtMetadata, map: MapDef): void {
  const tileset = meta.tilesets[map.terrain];
  if (!tileset) throw new Error(`art has no terrain ${map.terrain}`);
  const atlas = `tiles-${map.theme}`;
  const { w, h } = mapSize(map);
  const grid = { w, h, cells: mapCells(map) };
  const UPPER = 1;

  const picked = pickTiles(grid, UPPER, tileset.masks, map.seed);
  const data: number[][] = [];
  for (let j = 0; j <= h; j++)
    data.push(Array.from(picked.subarray(j * (w + 1), (j + 1) * (w + 1))));

  const { tile, margin, spacing } = meta.tileGrid;
  const tilemap = scene.make.tilemap({ data, tileWidth: tile, tileHeight: tile });
  const tiles = tilemap.addTilesetImage("ground", atlas, tile, tile, margin, spacing);
  if (!tiles) throw new Error(`tileset ${atlas} failed to load`);
  const half = TILE_SIZE / 2;
  tilemap.createLayer(0, tiles, -half, -half)?.setDepth(GROUND_DEPTH);

  const decals = scatterDecals(grid, UPPER, tileset.decals, map.seed);
  for (const d of decals) {
    const decal = tileset.decals[d.decal];
    if (decal) scene.add.image(d.x, d.y, atlas, decal.frame).setOrigin(0).setDepth(DECAL_DEPTH);
  }
}
