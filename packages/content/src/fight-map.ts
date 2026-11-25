import type { FieldRule, FightMap, TileRect } from "@guago/shared";
import { FIELDS, type FieldDef } from "./fields.ts";
import { type BuiltMap, buildAllMaps } from "./maps/index.ts";
import { LAWN, type MapDef } from "./maps/lawn.ts";
import { fieldRule } from "./sim-rules.ts";

/**
 * The fight's view of a map: collision, the arrival point, safe ground and spawn zones. Works for
 * a built map and for the lawn; a map's id is all a room needs to run it.
 */
export function fightMapOf(map: BuiltMap | MapDef): FightMap {
  if ("zones" in map) {
    const zones = map.zones as readonly { kind: string; rect: TileRect }[];
    const main = map.spawns.main ?? Object.values(map.spawns)[0];
    return {
      id: map.id,
      collision: map.collision,
      spawn: main ? { x: main.x, y: main.y } : { x: 16, y: 16 },
      safe: zones.filter((z) => z.kind === "safe").map((z) => z.rect),
      spawnZones: map.zones.flatMap((z) =>
        z.kind === "monsters" ? [{ rect: z.rect, monster: z.monster, weight: z.density }] : [],
      ),
      eliteZones: zones.filter((z) => z.kind === "elite").map((z) => z.rect),
      marks: map.marks,
      ...(map.spawns.respawn ? { wake: { x: map.spawns.respawn.x, y: map.spawns.respawn.y } } : {}),
    };
  }
  return {
    id: map.id,
    collision: map.collision,
    spawn: map.spawn,
    safe: [],
    spawnZones: [],
    eliteZones: [],
  };
}

let built: Map<string, BuiltMap> | undefined;

/** A map by id: the lawn or any map in the map format. */
export function mapById(id: string): BuiltMap | MapDef | undefined {
  if (id === LAWN.id) return LAWN;
  built ??= new Map(buildAllMaps().map((r) => [r.map.id, r.map]));
  return built.get(id);
}

/** The hunting field a map runs, by its id; `override` names a field's roster for a map that is
 * not one (a test). */
export function fieldOf(mapId: string, override?: string): FieldRule | null {
  const def: FieldDef | undefined = FIELDS.find((f) => f.id === (override || mapId));
  return def ? fieldRule(def) : null;
}
