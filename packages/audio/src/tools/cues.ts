/**
 * `pnpm --filter @guago/audio cues` checks every sound and music name the content uses against
 * the library and prints the table: combat cues from the books, monsters, reactions, drops and
 * field pacing, and the story's sound and music cues. Exits 1 if any name does not resolve.
 */

import { combatCues, narrative } from "@guago/content";
import { SONGS } from "../content/index.ts";
import { hasCue, STORY_SOUNDS } from "../cues.ts";

const rows: string[] = [];
let missing = 0;

rows.push("| Story sound | Plays |", "|---|---|");
for (const id of narrative.SOUND_CUES) {
  const ok = hasCue(id);
  if (!ok) missing++;
  rows.push(`| ${id} | ${ok ? (STORY_SOUNDS[id] ?? id) : "MISSING"} |`);
}
rows.push("", "| Story music | Plays |", "|---|---|");
for (const id of narrative.MUSIC) {
  const ok = id in SONGS;
  if (!ok) missing++;
  rows.push(`| ${id} | ${ok ? `${id} (${SONGS[id as keyof typeof SONGS].title})` : "MISSING"} |`);
}
const combat = combatCues().sounds;
const lacking = combat.filter((id) => !hasCue(id));
missing += lacking.length;
rows.push("", `Combat cues named by the content: ${combat.length}, missing: ${lacking.length}`);
for (const id of lacking) rows.push(`- ${id}`);

console.log(rows.join("\n"));
process.exit(missing > 0 ? 1 : 0);
