import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { type BuiltMap, buildAllMaps, FACE_ROWS, groundRows } from "@guago/content";
import { Rgba } from "../raster.ts";
import { edgeInside, renderGround, type SceneAtlas, type SceneMeta } from "../scene.ts";
import type { Atlas } from "./emit.ts";
import { MAP_DIR } from "./maps.ts";

/** Cells under a prop no taller than two tiles: a low wall, a bench or a fence lets light over. */
function lowProps(map: BuiltMap, meta: SceneMeta): Set<number> {
  const out = new Set<number>();
  for (const o of map.scene.objects) {
    if (!("prop" in o)) continue;
    const s = meta.sprites[o.prop];
    if (!s?.size || s.size[1] > 32) continue;
    const ty = Math.floor(o.at[1] / 16);
    const x0 = Math.floor((o.at[0] - s.origin[0]) / 16);
    const x1 = Math.ceil((o.at[0] - s.origin[0] + s.size[0]) / 16);
    for (let tx = x0; tx < x1; tx++) out.add(ty * map.w + tx);
  }
  return out;
}

/**
 * The tiles that stop light. Inside, the walls: cells under a `wall-top` cap and the faces that
 * hang below them, but not desks, counters or carrels. Outside, every solid tile that is not a
 * prop's footprint or under a low prop: buildings, the stands, walls, rock.
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

/**
 * A rift drawn whole as one piece of art rather than torn along an edge: the detail placed on
 * the map's `wound` mark. Its inside is every pixel the art changes, with any holes filled.
 */
function drawnWound(
  map: BuiltMap,
  theme: string,
  meta: SceneMeta,
  pixels: ReadonlyMap<string, SceneAtlas>,
  ground: ArrayLike<number>,
): Uint8Array | null {
  const mark = map.marks.wound;
  if (!mark) return null;
  const details = map.scene.details ?? [];
  const piece = details.find(
    (d) => "prop" in d && Math.hypot(d.at[0] - mark.x, d.at[1] - mark.y) < 24,
  );
  if (!piece) return null;
  const bare = renderGround(
    { ...map.scene, theme, details: details.filter((d) => d !== piece) },
    meta,
    pixels,
  );
  const { w, h } = bare;
  const changed = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    for (let c = 0; c < 4; c++) {
      if (bare.data[i * 4 + c] !== ground[i * 4 + c]) changed[i] = 1;
    }
  }
  // Fill the holes: whatever the outside cannot reach without crossing the art is inside.
  const outside = new Uint8Array(w * h);
  const stack: number[] = [];
  for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
  while (stack.length) {
    const i = stack.pop() as number;
    if (outside[i] || changed[i]) continue;
    outside[i] = 1;
    const x = i % w;
    if (x > 0) stack.push(i - 1);
    if (x < w - 1) stack.push(i + 1);
    if (i >= w) stack.push(i - w);
    if (i < w * (h - 1)) stack.push(i + w);
  }
  const inside = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) inside[i] = outside[i] ? 0 : 255;
  return inside;
}

/** File names of a map's baked images inside the maps directory. */
export function bakedFiles(id: string) {
  return { ground: `${id}-ground.png`, masks: `${id}-masks.png` };
}

/**
 * Bakes what the game draws of a map as images instead of tiles: its ground (terrain, tones,
 * decals, still details, edges and shadows) by the same renderer as the contact sheet, in the
 * theme the game lights (`ambient.unlit`, else the map's theme), and a mask image: red is ground
 * shadow, green is inside a rift (a torn edge's cells cut along the drawn edge, or the art drawn
 * whole on the map's `wound` mark), blue
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
    const drawn = drawnWound(map, theme, meta, pixels, img.data);
    if (drawn)
      for (let i = 0; i < drawn.length; i++)
        inside[i] = Math.max(inside[i] as number, drawn[i] as number);
    const open = new Set([...(footprints.get(map.id) ?? []), ...lowProps(map, meta)]);
    const walls = wallTiles(map, open);
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
