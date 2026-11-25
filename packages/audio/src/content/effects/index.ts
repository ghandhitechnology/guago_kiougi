import type { EffectSource } from "../../sfx/format.ts";
import { UI_EFFECTS } from "./ui.ts";
import { WORLD_EFFECTS } from "./world.ts";

/** Every effect by id. Kept apart from the songs so the main thread can load it alone. */
export const EFFECTS = { ...UI_EFFECTS, ...WORLD_EFFECTS } satisfies Record<string, EffectSource>;
