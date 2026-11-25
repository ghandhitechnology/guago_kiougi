/**
 * Every sound name the library answers to, for tools that check content against it (the balance
 * sanity check lists content cues that do not resolve). Node-safe: no browser APIs.
 */
import { STORY_SOUNDS } from "./aliases.ts";
import { EFFECTS } from "./content/effects/index.ts";
import { JINGLES } from "./content/jingles.ts";

export { resolveCue, STORY_SOUNDS } from "./aliases.ts";

export function cueIds(): string[] {
  return [...Object.keys(EFFECTS), ...Object.keys(JINGLES), ...Object.keys(STORY_SOUNDS)].sort();
}

export function hasCue(name: string): boolean {
  const id = STORY_SOUNDS[name] ?? name;
  return id in EFFECTS || id in JINGLES;
}
