/**
 * Sound names the story scripts use (`packages/content/src/narrative`, `SOUND_CUES`), mapped to
 * the library's own ids. Music names in the scripts are song ids as they are.
 */
export const STORY_SOUNDS: Readonly<Record<string, string>> = {
  fluorescent: "story.fluorescent",
  "floor-hum": "story.floor-hum",
  "page-flutter": "story.page-flutter",
  "odap-swarm": "story.odap-swarm",
  whistle: "sagam.whistle",
  "wake-song": "jingle.wake-song",
  chalk: "story.chalk",
  sea: "story.sea",
  ice: "story.ice",
  "stone-land": "story.stone-land",
};

/** The library id a name plays. */
export function resolveCue(name: string): string {
  return STORY_SOUNDS[name] ?? name;
}
