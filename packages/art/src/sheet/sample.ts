import { type DecalPlacement, dualMask, pickTiles, pickTone, scatterDecals } from "../dualgrid.ts";
import { resolveRemap, type Theme } from "../palette.ts";
import { type Indexed, indexed, remap, stamp } from "../raster.ts";
import type { CompiledOverlay, CompiledTerrain } from "../terrain.ts";
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
  for (const tone of t.tones) {
    pickTone(grid, 1, tone, seed).forEach((index, k) => {
      if (index < 0) return;
      const i = k % (grid.w + 1);
      const j = Math.floor(k / (grid.w + 1));
      stamp(out, remap(t.tiles[index] as Indexed, map), i * 16 - 8, j * 16 - 8);
    });
  }
  const rules = t.decals.map((d) => ({ on: d.on, density: d.density, w: d.img.w, h: d.img.h }));
  const placed: DecalPlacement[] = scatterDecals(grid, 1, rules, seed);
  for (const p of placed) {
    const d = t.decals[p.decal];
    if (d) stamp(out, remap(d.img, map), p.x, p.y);
  }
  return out;
}

/** Renders an overlay around the sample grid's lower cells, over a terrain's upper fill. */
export function renderOverlayPatch(
  o: CompiledOverlay,
  under: CompiledTerrain,
  theme: Theme,
  grid = sampleGrid(),
): Indexed {
  const map = resolveRemap(theme.remap);
  const out = indexed(grid.w * 16, grid.h * 16);
  const fill = under.tiles[under.masks[15]?.[0] as number] as Indexed;
  for (let j = 0; j <= grid.h; j++) {
    for (let i = 0; i <= grid.w; i++) {
      stamp(out, remap(fill, map), i * 16 - 8, j * 16 - 8);
      const index = o.masks[dualMask(grid, 0, i, j)]?.[0];
      if (index !== undefined)
        stamp(out, remap(o.tiles[index] as Indexed, map), i * 16 - 8, j * 16 - 8);
    }
  }
  return out;
}
