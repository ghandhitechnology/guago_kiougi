import type { BedSource } from "../ambient/format.ts";
import type { AmbientId, EffectId, SongId } from "../ids.ts";
import type { EffectSource } from "../sfx/format.ts";
import type { SongSource } from "../tracker/format.ts";
import { BEDS_SOURCE } from "./beds.ts";
import { EFFECTS as ALL_EFFECTS } from "./effects/index.ts";
import { agora } from "./music/agora.ts";
import { bossEra } from "./music/boss-era.ts";
import { bossMid } from "./music/boss-mid.ts";
import { fieldNight } from "./music/field-night.ts";
import { home } from "./music/home.ts";
import { hub } from "./music/hub.ts";
import { nightStudy } from "./music/night-study.ts";
import { riftFirst } from "./music/rift-first.ts";
import { schoolTheme } from "./music/school-theme.ts";
import { title } from "./music/title.ts";
import { wakeup } from "./music/wakeup.ts";

export const SONGS: Record<SongId, SongSource> = {
  title,
  hub,
  "field-night": fieldNight,
  wakeup,
  agora,
  "boss-mid": bossMid,
  "boss-era": bossEra,
  "rift-first": riftFirst,
  "night-study": nightStudy,
  "school-theme": schoolTheme,
  home,
};
export const EFFECTS = ALL_EFFECTS as Readonly<Record<string, EffectSource>> &
  Readonly<Record<EffectId, EffectSource>>;
export { JINGLES } from "./jingles.ts";
export const BEDS: Record<AmbientId, BedSource> = BEDS_SOURCE;
