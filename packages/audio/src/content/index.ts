import type { BedSource } from "../ambient/format.ts";
import type { EffectSource } from "../sfx/format.ts";
import type { SongSource } from "../tracker/format.ts";
import { fieldNight } from "./music/field-night.ts";
import { hub } from "./music/hub.ts";
import { title } from "./music/title.ts";
import { wakeup } from "./music/wakeup.ts";

export const SONGS = { title, hub, "field-night": fieldNight, wakeup } satisfies Record<
  string,
  SongSource
>;
export const EFFECTS: Record<string, EffectSource> = {};
export const BEDS: Record<string, BedSource> = {};
