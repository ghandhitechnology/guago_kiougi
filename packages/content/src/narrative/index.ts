/**
 * Every word a player reads in the hub and in Page 1, as one bundle with its Korean locale.
 * Read through `narrative` from `@guago/content`; run `validateNarrative` before shipping.
 */
import { CODEX, CODEX_KO } from "./codex.ts";
import { CUTSCENES, CUTSCENES_KO } from "./cutscenes.ts";
import { EGG_BARKS, EGG_DESCRIPTIONS, EGGS, EGGS_KO } from "./eggs.ts";
import { BARKS, DESCRIPTIONS, HUB_KO } from "./hub.ts";
import { OPENING, OPENING_KO } from "./opening.ts";
import { BOSSES, PAGE1_KO, STORY } from "./page1.ts";
import { QUESTS, QUESTS_KO } from "./quests.ts";
import type { Narrative, Strings } from "./schema.ts";
import { SPEAKERS, SPEAKERS_KO } from "./speakers.ts";
import { ANNOUNCEMENTS, AWARD_FRAME, AWARDS, SYSTEM, SYSTEM_KO } from "./system.ts";

function merge(...tables: Strings[]): Strings {
  const out: Record<string, string> = {};
  for (const t of tables) {
    for (const [k, v] of Object.entries(t)) {
      if (k in out) throw new Error(`text key ${k} is filed by two modules`);
      out[k] = v;
    }
  }
  return out;
}

export const NARRATIVE: Narrative = {
  speakers: SPEAKERS,
  opening: OPENING,
  cutscenes: CUTSCENES,
  story: STORY,
  bosses: BOSSES,
  codex: CODEX,
  barks: [...BARKS, ...EGG_BARKS],
  descriptions: [...DESCRIPTIONS, ...EGG_DESCRIPTIONS],
  quests: QUESTS,
  system: SYSTEM,
  announcements: ANNOUNCEMENTS,
  awards: AWARDS,
  awardFrame: AWARD_FRAME,
  eggs: EGGS,
  ko: merge(
    SPEAKERS_KO,
    OPENING_KO,
    CUTSCENES_KO,
    PAGE1_KO,
    CODEX_KO,
    HUB_KO,
    QUESTS_KO,
    SYSTEM_KO,
    EGGS_KO,
  ),
};

export type * from "./schema.ts";
export { EFFECTS, FIGHT_CUES, MILESTONES, MUSIC, PROMPTS, SLOTS, SOUND_CUES } from "./schema.ts";
export { DIALOGUE_BOX, dialogueRows, fill, registerSlips, wrap } from "./text.ts";
export { type Problem, validateNarrative } from "./validate.ts";
