/** Every encounter a map room may run, first match wins (`encounter.ts`). */
import type { BuiltMap } from "@guago/content";
import type { MapRoomOptions } from "./channels.ts";
import type { EncounterKind } from "./encounter.ts";
import { openingGolem } from "./opening/golem.ts";
import { openingStairs } from "./opening/stairs.ts";
import { raidArena } from "./raid/arena.ts";
import { raidReplay } from "./raid/replay.ts";

const KINDS: readonly EncounterKind[] = [openingStairs, openingGolem, raidReplay, raidArena];

/** The encounter a room on `def` made with `options` runs, if any. */
export function encounterFor(def: BuiltMap, options: MapRoomOptions): EncounterKind | undefined {
  return KINDS.find((k) => k.matches(def, options));
}
