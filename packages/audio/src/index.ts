/**
 * @guago/audio: everything a player hears, synthesised from source in the browser.
 *
 * ```ts
 * import { audio } from "@guago/audio";
 *
 * audio.unlock();                          // once at start-up; sound starts on the first tap
 * audio.music("hub", { fade: 2 });         // crossfade to a song
 * audio.stem("melody", 0);                 // fade a layer of it out, e.g. under a menu
 * audio.music("boss-era", { part: "thesis-1" }); audio.part("thesis-2"); // boss phases
 * audio.ambient("campus-afternoon");       // crossfade the ambient bed
 * audio.play("ui.open");                   // an interface or world effect
 * audio.cue(book.cues.cast, { own: false, dx, dy }); // any id the content or story names
 * audio.hit({ cls, own, heavy, crit, kill, impact: book.cues.impact,
 *   material: monster.cues.hit, death: monster.cues.die, dx, dy }); // every hit event
 * audio.proof(stacks); audio.collide(link); audio.forecast({ delay }); // class signatures
 * audio.preload("page1");                  // on entering a Page 1 rift
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
