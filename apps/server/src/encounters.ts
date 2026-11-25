/** Every encounter a map room may run, first match wins (`encounter.ts`). */
import type { BuiltMap } from "@guago/content";
import type { MapRoomOptions } from "./channels.ts";
import type { EncounterKind } from "./encounter.ts";

const KINDS: readonly EncounterKind[] = [];

/** The encounter a room on `def` made with `options` runs, if any. */
export function encounterFor(def: BuiltMap, options: MapRoomOptions): EncounterKind | undefined {
  return KINDS.find((k) => k.matches(def, options));
}
