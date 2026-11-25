import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type BuiltMap, checkAllMaps } from "@guago/content";
import type { ArtMetadata } from "../meta.ts";

/** Where built maps go inside the build directory. The client loads them as static files. */
export const MAP_DIR = "maps";

/**
 * Builds every map, checks it against this art build (frames, terrains, themes, colours) and the
 * other maps (portals, spawns, reachability), and writes `maps/<id>.json` plus `maps/index.json`.
 * Nothing is written when a map has problems.
 */
export function buildMaps(
  dir: string,
  meta: ArtMetadata,
): { maps: BuiltMap[]; problems: string[] } {
  const { maps, problems } = checkAllMaps(meta);
  if (problems.length > 0) return { maps, problems };
  const out = join(dir, MAP_DIR);
  mkdirSync(out, { recursive: true });
  for (const m of maps) writeFileSync(join(out, `${m.id}.json`), `${JSON.stringify(m)}\n`);
  writeFileSync(join(out, "index.json"), `${JSON.stringify(maps.map((m) => m.id))}\n`);
  return { maps, problems };
}
