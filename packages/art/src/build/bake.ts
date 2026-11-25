import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { BuiltMap } from "@guago/content";
import { Rgba } from "../raster.ts";
import { edgeInside, renderGround, type SceneAtlas, type SceneMeta } from "../scene.ts";
import type { Atlas } from "./emit.ts";
import { MAP_DIR } from "./maps.ts";

/** File names of a map's baked images inside the maps directory. */
export function bakedFiles(id: string) {
  return { ground: `${id}-ground.png`, masks: `${id}-masks.png` };
}

/**
 * Bakes what the game draws of a map as images instead of tiles: its ground (terrain, tones,
 * decals, still details, edges and shadows) by the same renderer as the contact sheet, in the
 * theme the game lights (`ambient.unlit`, else the map's theme), and a mask image: red is ground
 * shadow, green is inside an edge's region (a rift's torn cells, cut along the drawn edge).
 * Returns the bytes written per map.
 */
export function bakeMaps(
  dir: string,
  meta: SceneMeta,
  atlases: readonly Atlas[],
  maps: readonly BuiltMap[],
): Map<string, number> {
  const pixels = new Map<string, SceneAtlas>(
    atlases.map((a) => [a.name, { w: a.png.w, h: a.png.h, data: a.png.data, frames: a.frames }]),
  );
  const sizes = new Map<string, number>();
  for (const map of maps) {
    const theme = map.ambient.unlit ?? map.scene.theme;
    const img = renderGround({ ...map.scene, theme }, meta, pixels);
    for (const w of img.warnings) console.warn(`${map.id} ground: ${w}`);
    const ground = new Rgba(img.w, img.h);
    ground.data.set(img.data);
    const groundPng = ground.png();
    writeFileSync(join(dir, MAP_DIR, bakedFiles(map.id).ground), groundPng);

    const inside = new Uint8Array(img.w * img.h);
    for (const edge of map.scene.edges ?? []) {
      const m = edgeInside(map.scene, meta, edge);
      for (let i = 0; i < m.length; i++) inside[i] = Math.max(inside[i] as number, m[i] as number);
    }
    const masks = new Rgba(img.w, img.h);
    for (let i = 0; i < img.w * img.h; i++) {
      masks.data[i * 4] = img.shadow[i] as number;
      masks.data[i * 4 + 1] = inside[i] as number;
      masks.data[i * 4 + 3] = 255;
    }
    const masksPng = masks.png();
    writeFileSync(join(dir, MAP_DIR, bakedFiles(map.id).masks), masksPng);
    sizes.set(map.id, groundPng.length + masksPng.length);
  }
  return sizes;
}
