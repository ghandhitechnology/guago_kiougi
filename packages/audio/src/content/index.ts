import type { BedSource } from "../ambient/format.ts";
import type { AmbientId, EffectId, SongId } from "../ids.ts";
import type { EffectSource } from "../sfx/format.ts";
import type { SongSource } from "../tracker/format.ts";
import { BEDS_SOURCE } from "./beds.ts";
import { EFFECTS as ALL_EFFECTS } from "./effects/index.ts";
import { fieldNight } from "./music/field-night.ts";
import { hub } from "./music/hub.ts";
import { title } from "./music/title.ts";
import { wakeup } from "./music/wakeup.ts";

export const SONGS: Record<SongId, SongSource> = { title, hub, "field-night": fieldNight, wakeup };
export const EFFECTS: Readonly<Record<string, EffectSource>> &
  Readonly<Record<EffectId, EffectSource>> = ALL_EFFECTS;
export { JINGLES } from "./jingles.ts";
export const BEDS: Record<AmbientId, BedSource> = BEDS_SOURCE;
