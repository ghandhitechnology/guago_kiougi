import { type BuildResult, buildMap } from "./build.ts";
import campusField from "./campus-field.ts";
import campusYard from "./campus-yard.ts";
import { type ArtIndex, checkMap, type MapRegistry } from "./check.ts";
import type { BuiltMap, MapSource } from "./format.ts";
// Page 1 hunting fields and the 생태공원.
import p1Colonnade from "./p1-colonnade.ts";

export * from "./build.ts";
export * from "./buildings.ts";
export * from "./check.ts";
export * from "./format.ts";
export * from "./lawn.ts";
export * from "./layers.ts";
export * from "./props.ts";
export * from "./stamp.ts";

/** Every map written in the map format, in contact-sheet order. */
export const MAP_SOURCES: readonly MapSource[] = [
  campusYard,
  campusField,
  // Page 1 hunting fields and the 생태공원.
  p1Colonnade,
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
  // Page 1: the era town, the 위험 구역, the two lairs and the arena (narrative place ids).
  "p1-agora",
  "p1-shadow-cave",
  "p1-croton-school",
  "p1-elea-track",
  "p1-lyceum",
  "p1-olive-road",
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
