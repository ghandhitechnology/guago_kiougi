/**
 * @guago/audio: everything a player hears, synthesised from source in the browser.
 *
 * ```ts
 * import { audio } from "@guago/audio";
 *
 * audio.unlock();                          // once at start-up; sound starts on the first tap
 * audio.music("hub", { fade: 2 });         // crossfade to a song
 * audio.stem("melody", 0);                 // fade a layer of it out, e.g. under a menu
 * audio.ambient("campus-afternoon");       // crossfade the ambient bed
 * audio.play("ui.open");                   // an effect, with ±6% pitch variation
 * audio.play("step.grass", { pan: -0.3 }); // positioned
 * const hum = audio.play("vending.hum");   // loops until hum.stop()
 * audio.setVolume("music", 0.6);           // the caller saves volumes
 * ```
 */

import { GameAudio } from "./engine/audio.ts";

export type {
  AudioOptions,
  CueOptions,
  ForecastOptions,
  HitEvent,
  MusicOptions,
  PlayOptions,
  Sound,
} from "./engine/audio.ts";
export { GameAudio } from "./engine/audio.ts";
export { HIT_RULES, type HitClass } from "./engine/hits.ts";
export * from "./ids.ts";

/** The game's one audio instance. Nothing is created until the first call. */
export const audio = new GameAudio();
