import { narrative } from "@guago/content";

/**
 * The narrative's lines by id, as the client says them: system messages, server announcements,
 * every refusal (`refusal.<protocol>.<code>`), rule and award lines. Each comes with its speaker,
 * so a screen can deliver it the way that speaker would: the 자판기 on its display, 권 사감 in
 * her ledger voice, the narrator plain.
 */

export interface Spoken {
  readonly id: string;
  readonly text: string;
  /** A speaker id from the voice bible: `sagam`, `vending`, `store`, `narrator`, `principal`… */
  readonly voice: string;
  readonly channel: "system" | "toast" | "dialogue";
  /** A server announcement, which deserves more presence than a chat line. */
  readonly announcement: boolean;
}

const N = narrative.NARRATIVE;
const ANNOUNCED = new Set(N.announcements.map((m) => m.id));
const BY_ID = new Map([...N.system, ...N.announcements].map((m) => [m.id, m]));

/** `HH:MM` in the player's clock, for a time a line names. */
export function clock(ms: number): string {
  const d = new Date(ms);
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  // A time on another day carries its date: a three-day ban never reads as tonight.
  const now = new Date();
  const today =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  return today ? hm : `${d.getMonth() + 1}월 ${d.getDate()}일 ${hm}`;
}

/** The line filed under `id`, filled from `params`; undefined when the narrative has none. */
export function spoken(
  id: string,
  params: Record<string, string | number> = {},
): Spoken | undefined {
  const m = BY_ID.get(id);
  if (!m) return undefined;
  const raw = N.ko[m.text];
  if (raw === undefined) return undefined;
  return {
    id,
    text: narrative.fill(raw, params),
    voice: m.voice,
    channel: m.channel,
    announcement: ANNOUNCED.has(id),
  };
}

export type RefusalProtocol = "live" | "world" | "op";

/** A refusal in its speaker's words. `until` fills a mute's end, `need` a level gate. */
export function refusal(
  protocol: RefusalProtocol,
  code: string,
  fields: { until?: number; need?: number } = {},
): Spoken | undefined {
  const params: Record<string, string | number> = {};
  if (fields.until !== undefined) params.time = clock(fields.until);
  if (fields.need !== undefined) params.level = fields.need;
  return spoken(`refusal.${protocol}.${code}`, params);
}

/** A name or description by narrative key, or the key's own fallback when it is missing. */
export function text(key: string): string | undefined {
  return N.ko[key];
}
