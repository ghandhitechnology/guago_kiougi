import { type BuildResult, buildMap } from "./build.ts";
import cafeteria from "./cafeteria.ts";
import campusField from "./campus-field.ts";
import campusYard from "./campus-yard.ts";
import { type ArtIndex, checkMap, type MapRegistry } from "./check.ts";
import type { BuiltMap, MapSource } from "./format.ts";
import { checkCutsceneMarks, checkIndoor } from "./indoor.ts";
import lounge from "./lounge.ts";

export * from "./build.ts";
export * from "./buildings.ts";
export * from "./check.ts";
export * from "./format.ts";
export * from "./indoor.ts";
export * from "./lawn.ts";
export * from "./layers.ts";
export * from "./props.ts";
export * from "./stamp.ts";

// Campus life: the 급식실, the lounge, 실험동, 새벽관 and home.
const CAMPUS_LIFE: readonly MapSource[] = [cafeteria, lounge];

/** Every map written in the map format, in contact-sheet order. */
export const MAP_SOURCES: readonly MapSource[] = [campusYard, campusField, ...CAMPUS_LIFE];

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
  const maps = results.map((r) => r.map);
  return {
    maps,
    problems: [
      ...results.flatMap((r) => [...checkMap(r, art, registry), ...checkIndoor(r.map, art)]),
      ...checkCutsceneMarks(maps),
    ],
  };
}
