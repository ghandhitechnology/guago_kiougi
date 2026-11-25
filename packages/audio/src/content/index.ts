import type { BedSource } from "../ambient/format.ts";
import type { EffectSource } from "../sfx/format.ts";
import type { SongSource } from "../tracker/format.ts";
import { BEDS_SOURCE } from "./beds.ts";
import { UI_EFFECTS } from "./effects/ui.ts";
import { WORLD_EFFECTS } from "./effects/world.ts";
import { fieldNight } from "./music/field-night.ts";
import { hub } from "./music/hub.ts";
import { title } from "./music/title.ts";
import { wakeup } from "./music/wakeup.ts";

export const SONGS = { title, hub, "field-night": fieldNight, wakeup } satisfies Record<
  string,
  SongSource
>;
export const EFFECTS = { ...UI_EFFECTS, ...WORLD_EFFECTS } satisfies Record<string, EffectSource>;
export const BEDS = BEDS_SOURCE satisfies Record<string, BedSource>;
