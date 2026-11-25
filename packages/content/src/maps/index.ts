import { type BuildResult, buildMap } from "./build.ts";
import campusField from "./campus-field.ts";
import campusYard from "./campus-yard.ts";
import { type ArtIndex, checkMap, type MapRegistry } from "./check.ts";
import type { BuiltMap, MapSource } from "./format.ts";
// 가설관 and 증명관 interiors.
import gaseol1f from "./gaseol-1f.ts";
import gaseol4f from "./gaseol-4f.ts";
import gaseolgwanStairs from "./gaseolgwan-stairs.ts";

export * from "./build.ts";
export * from "./buildings.ts";
export * from "./check.ts";
export * from "./format.ts";
export * from "./interior.ts";
export * from "./lawn.ts";
export * from "./layers.ts";
export * from "./props.ts";
export * from "./stamp.ts";

/** Every map written in the map format, in contact-sheet order. */
export const MAP_SOURCES: readonly MapSource[] = [
  campusYard,
  campusField,
  // 가설관 and 증명관 interiors.
  gaseolgwanStairs,
  gaseol1f,
  gaseol4f,
];

/**
 * Maps that portals may lead to before they are built. A portal to one of these is declared,
 * marked `built: false`, and goes nowhere yet.
 */
export const PLANNED_MAPS: ReadonlySet<string> = new Set([
  "gaseol-1f",
  "gaseol-2f",
  "gaseol-4f",
  "jeungmyeong",
  "silheom",
  "cafeteria",
  "lounge",
  "saebyeok",
  "agora",
  "eco-park",
  // 가설관 and 증명관 interiors: rooms and places their doors lead to before they exist.
  "gaseol-roof",
  "gaseol-b1",
]);

/** Builds every map. */
export function buildAllMaps(): BuildResult[] {
  const built = new Set(MAP_SOURCES.map((m) => m.id));
  return MAP_SOURCES.map((m) => buildMap(m, built));
}

/** Builds every map and checks each against the art build and the others. */
export function checkAllMaps(art: ArtIndex): { maps: BuiltMap[]; problems: string[] } {
  const results = buildAllMaps();
  const registry: MapRegistry = {
    built: new Map(results.map((r) => [r.map.id, Object.keys(r.map.spawns)])),
    planned: PLANNED_MAPS,
  };
  return {
    maps: results.map((r) => r.map),
    problems: results.flatMap((r) => checkMap(r, art, registry)),
  };
}
