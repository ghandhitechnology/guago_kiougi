/**
 * Art and sound the combat content names but the atlases and the audio bank do not have yet.
 * Art ids are a sprite, `sprite/frame` or `sprite/anim`; sounds start with `sfx.`.
 *
 *   pnpm art:build && pnpm --filter @guago/balance-sim cues
 */
import { existsSync, readFileSync } from "node:fs";
import { hasCue } from "@guago/audio/cues";
import { checkCombatContent, combatCues } from "@guago/content";

const problems = checkCombatContent();
console.log(
  problems.length
    ? `Content problems:\n  ${problems.join("\n  ")}`
    : "Content references are consistent",
);

const artPath = new URL("../../../packages/art/dist/art.json", import.meta.url);
const { art: ids, sounds } = combatCues();
if (existsSync(artPath)) {
  const art = JSON.parse(readFileSync(artPath, "utf8")) as {
    sprites: Record<string, { frames: string[]; anims?: Record<string, unknown> }>;
  };
  const exists = (id: string) => {
    const [sprite = "", part] = id.split("/");
    const def = art.sprites[sprite];
    if (!def) return false;
    return part === undefined || def.frames.includes(id) || part in (def.anims ?? {});
  };
  const missing = ids.filter((id) => !exists(id));
  console.log(
    `\nArt not in the atlases (${missing.length} of ${ids.length}):\n  ${missing.join(", ")}`,
  );
} else {
  console.log("\nRun pnpm art:build to check art");
}
const unheard = sounds.filter((id) => !hasCue(id));
console.log(
  `\nSound cues the audio library lacks (${unheard.length} of ${sounds.length}):\n  ${unheard.join(", ")}`,
);
