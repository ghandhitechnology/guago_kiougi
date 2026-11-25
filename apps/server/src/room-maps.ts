import { buildAllMaps, LAWN } from "@guago/content";
import type { Collidable, SpawnGroup } from "@guago/shared";

/** What a map room needs of a map: its walls, where players appear and what it spawns. */
export interface RoomMap extends Collidable {
  readonly id: string;
  /** Player spawn in world pixels. */
  readonly spawn: { readonly x: number; readonly y: number };
  readonly monsters: readonly SpawnGroup[];
}

let maps: Map<string, RoomMap> | undefined;

function all(): Map<string, RoomMap> {
  if (!maps) {
    maps = new Map<string, RoomMap>([[LAWN.id, LAWN]]);
    for (const { map } of buildAllMaps()) {
      const spawn = map.spawns.main ?? Object.values(map.spawns)[0];
      if (spawn) maps.set(map.id, { id: map.id, collision: map.collision, spawn, monsters: [] });
    }
  }
  return maps;
}

/**
 * Whether a joining client may name the map and monster count of the room it opens. Only for
 * development and load tests (`ALLOW_MAP_OPTION=1`): until portals route players, every
 * character lives on the lawn, and letting a client pick a map would be a teleport.
 */
export const mapOptionAllowed = () => process.env.ALLOW_MAP_OPTION === "1";

/** The map a room runs: the lawn unless a load test or a developer asked for another. */
export function roomMapFor(options: { map?: unknown; monsters?: unknown } | undefined): RoomMap {
  if (!mapOptionAllowed() || !options) return LAWN;
  const base = (typeof options.map === "string" && all().get(options.map)) || LAWN;
  const count = options.monsters;
  if (typeof count !== "number" || !Number.isInteger(count) || count < 0 || count > 300)
    return base;
  return { ...base, monsters: [{ kind: "odap", count }] };
}
