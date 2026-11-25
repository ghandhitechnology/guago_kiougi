/**
 * Who each portrait belongs to, for the portrait grid: the speaker's name as the narrative
 * writes it, keyed by portrait sprite (`portrait-<speaker>`). Node only; the sheet server hands
 * the same table to the page.
 */
import { narrative } from "@guago/content";

export function portraitNames(): Record<string, string> {
  const { NARRATIVE } = narrative;
  const out: Record<string, string> = {};
  for (const s of NARRATIVE.speakers) {
    const sprite = s.portrait ?? `portrait-${s.id}`;
    if (!(sprite in out)) out[sprite] = NARRATIVE.ko[s.name] ?? s.id;
  }
  return out;
}
