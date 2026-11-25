import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { type BuiltMap, buildAllMaps, FACE_ROWS, groundRows } from "@guago/content";
import { Rgba } from "../raster.ts";
import { edgeInside, renderGround, type SceneAtlas, type SceneMeta } from "../scene.ts";
import type { Atlas } from "./emit.ts";
import { MAP_DIR } from "./maps.ts";

/**
 * The tiles that stop light. Inside, the walls: cells under a `wall-top` cap and the faces that
 * hang below them, but not desks, counters or carrels. Outside, every solid tile that is not a
 * prop's footprint: buildings, the stands, walls.
 */
function wallTiles(map: BuiltMap, footprints: ReadonlySet<number>): Uint8Array {
  const out = new Uint8Array(map.w * map.h);
  const caps = (map.scene.edges ?? []).filter((e) =>
    (typeof e.overlay === "string" ? [e.overlay] : e.overlay).includes("wall-top"),
  );
  if (caps.length === 0) {
    map.collision.rows.forEach((row, ty) => {
      for (let tx = 0; tx < map.w; tx++) {
        if (row[tx] === "#" && !footprints.has(ty * map.w + tx)) out[ty * map.w + tx] = 1;
      }
    });
    return out;
  }
  const rows = groundRows(map.scene.ground);
  const isWall = (x: number, y: number) => caps.some((e) => e.inside.includes(rows[y]?.[x] ?? " "));
  for (let y = 0; y < map.h; y++) {
    for (let x = 0; x < map.w; x++) {
      if (!isWall(x, y)) continue;
      out[y * map.w + x] = 1;
      if (y + 1 < map.h && !isWall(x, y + 1)) {
        for (let k = 1; k <= FACE_ROWS && y + k < map.h && !isWall(x, y + k); k++)
          out[(y + k) * map.w + x] = 1;
      }
    }
  }
  return out;
}

/** File names of a map's baked images inside the maps directory. */
export function bakedFiles(id: string) {
  return { ground: `${id}-ground.png`, masks: `${id}-masks.png` };
}

/**
 * Bakes what the game draws of a map as images instead of tiles: its ground (terrain, tones,
 * decals, still details, edges and shadows) by the same renderer as the contact sheet, in the
 * theme the game lights (`ambient.unlit`, else the map's theme), and a mask image: red is ground
 * shadow, green is inside a torn edge's region (a rift's cells, cut along the drawn edge), blue
 * is wall: solid tiles that are not a prop's footprint (walls, wall faces, buildings, the
 * stands), which stop light. Returns the bytes written per map.
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
  const footprints = new Map(buildAllMaps().map((r) => [r.map.id, r.footprints]));
  for (const map of maps) {
    const theme = map.ambient.unlit ?? map.scene.theme;
    const img = renderGround({ ...map.scene, theme }, meta, pixels);
    for (const w of img.warnings) console.warn(`${map.id} ground: ${w}`);
    const ground = new Rgba(img.w, img.h);
    ground.data.set(img.data);
    const groundPng = ground.png();
    writeFileSync(join(dir, MAP_DIR, bakedFiles(map.id).ground), groundPng);

    const inside = new Uint8Array(img.w * img.h);
    // Only a torn edge marks an inside; an interior's wall caps are walls, not a rift.
    for (const edge of map.scene.edges ?? []) {
      const names = typeof edge.overlay === "string" ? [edge.overlay] : edge.overlay;
      if (names.includes("wall-top")) continue;
      const m = edgeInside(map.scene, meta, edge);
      for (let i = 0; i < m.length; i++) inside[i] = Math.max(inside[i] as number, m[i] as number);
    }
    const walls = wallTiles(map, footprints.get(map.id) ?? new Set<number>());
    const wall = (px: number, py: number) =>
      walls[Math.floor(py / 16) * map.w + Math.floor(px / 16)] === 1;
    const masks = new Rgba(img.w, img.h);
    for (let i = 0; i < img.w * img.h; i++) {
      masks.data[i * 4] = img.shadow[i] as number;
      masks.data[i * 4 + 1] = inside[i] as number;
      masks.data[i * 4 + 2] = wall(i % img.w, Math.floor(i / img.w)) ? 255 : 0;
      masks.data[i * 4 + 3] = 255;
    }
    const masksPng = masks.png();
    writeFileSync(join(dir, MAP_DIR, bakedFiles(map.id).masks), masksPng);
    sizes.set(map.id, groundPng.length + masksPng.length);
  }
  return sizes;
}
