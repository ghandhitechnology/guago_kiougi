/** Every id the game can ask for. The content registries are checked against these lists. */

export const SONG_IDS = ["title", "hub", "field-night", "wakeup", "agora", "boss-mid"] as const;
export type SongId = (typeof SONG_IDS)[number];

export const AMBIENT_IDS = ["campus-afternoon", "field-night", "school-interior"] as const;
export type AmbientId = (typeof AMBIENT_IDS)[number];

export const UI_SOUND_IDS = [
  "ui.open",
  "ui.close",
  "ui.hover",
  "ui.select",
  "ui.confirm",
  "ui.error",
  "ui.tab",
  "ui.type",
  "ui.page",
  "ui.stamp",
  "ui.toast",
] as const;
export type UiSoundId = (typeof UI_SOUND_IDS)[number];

export const WORLD_SOUND_IDS = [
  "step.grass",
  "step.dirt",
  "step.stone",
  "step.sand",
  "step.floor",
  "door.open",
  "door.close",
  "vending.hum",
  "vending.can",
  "sagam.whistle",
  "cat.meow",
  "rift.pulse",
] as const;

export const EFFECT_IDS = [...UI_SOUND_IDS, ...WORLD_SOUND_IDS] as const;
export type EffectId = (typeof EFFECT_IDS)[number];

/** Footstep surfaces, for picking `step.<surface>` from a tile. */
export type Surface = "grass" | "dirt" | "stone" | "sand" | "floor";

export type Bus = "master" | "music" | "effects" | "ambient";
export const BUSES: readonly Bus[] = ["master", "music", "effects", "ambient"];
