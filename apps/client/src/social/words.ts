import { MAP_SOURCES, narrative } from "@guago/content";
import { t, tMaybe } from "../i18n/index.ts";

/**
 * Words for the social screens. In-character lines (toasts, refusals, empty boards) come from the
 * narrative by id; the client's own labels and verbs come from `i18n`. A line the narrative has
 * not written yet is `undefined`, and the screen shows its state with art instead of a sentence.
 */

const KO = narrative.NARRATIVE.ko;
const SYSTEM = new Map(narrative.NARRATIVE.system.map((m) => [m.id, m]));

type Params = Readonly<Record<string, string | number>>;

/** A narrative line by its system message id (or text key), filled; undefined until written. */
export function line(id: string, params: Params = {}): string | undefined {
  const msg = SYSTEM.get(id);
  const text = msg ? KO[msg.text] : KO[id];
  return text ? narrative.fill(text, params) : undefined;
}

/**
 * Why a request was not carried out, in the voice the narrative gives the code: the world's
 * refusals (`refusal.world.<code>`), then trading's (`refusal.trade.<code>`), then chat's own.
 */
export function refusal(code: string, extra: { need?: number; until?: number } = {}): string {
  const params: Record<string, string | number> = {};
  if (extra.need !== undefined) params.level = extra.need;
  if (extra.until !== undefined) params.time = clock(extra.until);
  return (
    line(`refusal.world.${code}`, params) ??
    line(`refusal.trade.${code}`, params) ??
    line(`refusal.op.${code}`, params) ??
    tMaybe(`chat.refused.${code}`) ??
    t("chat.refused.other")
  );
}

/** `HH:MM` local time. */
export function clock(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

const MAP_NAMES = new Map<string, string>(MAP_SOURCES.map((m) => [m.id, m.name]));
MAP_NAMES.set("lawn", "본관 앞 잔디");

/** A map's Korean name, or nothing for a map without one (between maps, offline). */
export function mapName(id: string): string {
  return MAP_NAMES.get(id) ?? "";
}

/** Time left until `at`, as the largest unit that fits: `2일`, `5시간`, `12분`. */
export function timeLeft(at: number, now = Date.now()): string {
  const ms = Math.max(0, at - now);
  const minutes = Math.ceil(ms / 60_000);
  if (minutes >= 60 * 24) return t("time.days", { n: Math.floor(minutes / (60 * 24)) });
  if (minutes >= 60) return t("time.hours", { n: Math.floor(minutes / 60) });
  return t("time.minutes", { n: Math.max(1, minutes) });
}

/** A whole number of 솔방울 with thousands separators, from a number or a decimal string. */
export function amount(n: number | bigint | string): string {
  const s = typeof n === "string" ? n : String(n);
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
