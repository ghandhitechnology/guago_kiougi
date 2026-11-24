import { type DecalPlacement, pickTiles, scatterDecals } from "../dualgrid.ts";
import { resolveRemap, type Theme } from "../palette.ts";
import { type Indexed, indexed, remap, stamp } from "../raster.ts";
import type { CompiledTerrain } from "../terrain.ts";
import { sampleGrid } from "./sample-grid.ts";

/** Renders a terrain over a grid with the shared picking functions, as the game will. */
export function renderPatch(
  t: CompiledTerrain,
  theme: Theme,
  grid = sampleGrid(),
  seed = 7,
): Indexed {
  const map = resolveRemap(theme.remap);
  const picks = pickTiles(grid, 1, t.masks, seed);
  const out = indexed(grid.w * 16, grid.h * 16);
  for (let j = 0; j <= grid.h; j++) {
    for (let i = 0; i <= grid.w; i++) {
      const tile = t.tiles[picks[j * (grid.w + 1) + i] as number] as Indexed;
      stamp(out, remap(tile, map), i * 16 - 8, j * 16 - 8);
    }
  }
  const rules = t.decals.map((d) => ({ on: d.on, density: d.density, w: d.img.w, h: d.img.h }));
  const placed: DecalPlacement[] = scatterDecals(grid, 1, rules, seed);
  for (const p of placed) {
    const d = t.decals[p.decal];
    if (d) stamp(out, remap(d.img, map), p.x, p.y);
  }
  return out;
}
