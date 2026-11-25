import type { EffectSource } from "../../sfx/format.ts";
import { BOOK_EFFECTS } from "./books.ts";
import { CLASS_IMPACTS, CLASS_SIGNATURES } from "./classes.ts";
import { EVENT_EFFECTS } from "./events.ts";
import { MONSTER_EFFECTS } from "./monsters.ts";
import { STORY_EFFECTS } from "./story.ts";
import { UI_EFFECTS } from "./ui.ts";
import { WORLD_EFFECTS } from "./world.ts";

/** Every effect by id. Kept apart from the songs so tools can load it alone. */
export const EFFECTS: Readonly<Record<string, EffectSource>> = {
  ...UI_EFFECTS,
  ...WORLD_EFFECTS,
  ...CLASS_IMPACTS,
  ...CLASS_SIGNATURES,
  ...BOOK_EFFECTS,
  ...MONSTER_EFFECTS,
  ...EVENT_EFFECTS,
  ...STORY_EFFECTS,
};
