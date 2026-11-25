import { type BuiltMap, type MapDef, mapCells, mapSize } from "@guago/content";
import { surfaceOf } from "../sound/steps.ts";
import type { MapView } from "./view.ts";

/** Korean names for maps written before the map format, which carry none of their own. */
const OLD_NAMES: Readonly<Record<string, string>> = { lawn: "본관 앞 잔디" };

/** The first walking map: its upper terrain is the lawn, the lower the worn path. */
export function lawnView(map: MapDef): MapView {
  const cells = mapCells(map);
  const { w } = mapSize(map);
  return {
    id: map.id,
    name: OLD_NAMES[map.id] ?? map.id,
    collision: map.collision,
    surfaceAt: (tx, ty) => (cells[ty * w + tx] === 1 ? "grass" : "dirt"),
    portals: [],
  };
}

/** A map in the map format. */
export function builtView(map: BuiltMap): MapView {
  const rows =
    typeof map.scene.ground === "string"
      ? map.scene.ground
          .split("\n")
          .map((r) => r.trim())
          .filter((r) => r.length > 0)
      : map.scene.ground;
  const legend = map.scene.legend;
  return {
    id: map.id,
    name: map.name,
    collision: map.collision,
    surfaceAt: (tx, ty) => surfaceOf(legend[rows[ty]?.[tx] ?? ""]?.terrain),
    portals: map.portals
      .filter((p) => p.built)
      .map((p) => ({ x: p.rect.x, y: p.rect.y, w: p.rect.w, h: p.rect.h })),
  };
}
