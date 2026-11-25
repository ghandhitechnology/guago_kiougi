import { type BuildResult, buildMap } from "./build.ts";
import cafeteria from "./cafeteria.ts";
import campusField from "./campus-field.ts";
import campusYard from "./campus-yard.ts";
import { type ArtIndex, checkMap, checkScenes, type MapRegistry } from "./check.ts";
import ecoPark from "./eco-park.ts";
import type { BuiltMap, MapSource } from "./format.ts";
// 가설관 and 증명관 interiors.
import gaseol1f from "./gaseol-1f.ts";
import gaseol2f from "./gaseol-2f.ts";
import gaseol4f from "./gaseol-4f.ts";
import gaseolgwanStairs from "./gaseolgwan-stairs.ts";
// Campus life interiors.
import home from "./home.ts";
import jeungmyeong from "./jeungmyeong.ts";
import lounge from "./lounge.ts";
// Page 1 hunting fields.
import p1AgoraEdge from "./p1-agora-edge.ts";
import p1CaveMouth from "./p1-cave-mouth.ts";
import p1Colonnade from "./p1-colonnade.ts";
import p1OliveRoad from "./p1-olive-road.ts";
import saebyeok from "./saebyeok.ts";
import silheom from "./silheom.ts";

export * from "./build.ts";
export * from "./buildings.ts";
export * from "./check.ts";
export * from "./format.ts";
export * from "./interior.ts";
export * from "./lawn.ts";
export * from "./lawn-props.ts";
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
  gaseol2f,
  gaseol4f,
  jeungmyeong,
  // Campus life interiors: the 급식실, the lounge, 실험동, 새벽관 and home.
  cafeteria,
  lounge,
  silheom,
  saebyeok,
  home,
  // Page 1 hunting fields and the 생태공원.
  p1Colonnade,
  p1OliveRoad,
  p1CaveMouth,
  p1AgoraEdge,
  ecoPark,
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
  // 가설관 and 증명관 interiors: rooms and places their doors lead to before they exist.
  "gaseol-roof",
  "gaseol-b1",
  "club-1",
  "club-2",
  "club-3",
  "club-4",
  "club-5",
  "club-6",
  // Page 1: the era town, the 위험 구역, the two lairs and the arena (narrative place ids).
  "p1-agora",
  "p1-shadow-cave",
  "p1-croton-school",
  "p1-elea-track",
  "p1-lyceum",
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
    problems: [...results.flatMap((r) => checkMap(r, art, registry)), ...checkScenes(maps)],
  };
}
