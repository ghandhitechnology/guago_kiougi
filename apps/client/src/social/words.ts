import { MAP_SOURCES, narrative } from "@guago/content";
import { refusal as lineRefusal, spoken } from "../copy/lines.ts";
import { t } from "../i18n/index.ts";

/**
 * Words for the social screens. In-character lines (toasts, refusals, empty boards) come from the
 * narrative by id; the client's own labels and verbs come from `i18n`. A line the narrative has
 * not written yet is `undefined`, and the screen shows its state with art instead of a sentence.
 */

const KO = narrative.NARRATIVE.ko;

type Params = Readonly<Record<string, string | number>>;

const TERMS = new Map((narrative.NARRATIVE.terms ?? []).map((x) => [`${x.kind}:${x.id}`, x.name]));

/** A narrative term's name (an emote, a board section, a rank, a join rule), or the id. */
export function term(kind: string, id: string): string {
  const key = TERMS.get(`${kind}:${id}`);
  return (key && KO[key]) || id;
}

/** A narrative line by its system message id (or text key), filled; undefined until written. */
export function line(id: string, params: Params = {}): string | undefined {
  const said = spoken(id, { ...params });
  if (said) return said.text;
  const raw = KO[id];
  return raw ? narrative.fill(raw, params) : undefined;
}

/**
 * Why a request was not carried out, in the voice the narrative gives the code: the world's
 * refusals, then trading's, then item operations'. Undefined for a code with no line (the
 * client's own `offline` and `timeout`): the shake and the error sound say it alone.
 */
export function refusal(
  code: string,
  extra: { need?: number; until?: number } = {},
): string | undefined {
  return (
    lineRefusal("world", code, extra)?.text ??
    spoken(`refusal.trade.${code}`)?.text ??
    lineRefusal("op", code, extra)?.text
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
  // Hours until three days are left, so a 48-hour post counts down by the hour.
  if (minutes >= 60 * 72) return t("time.days", { n: Math.floor(minutes / (60 * 24)) });
  if (minutes >= 60) return t("time.hours", { n: Math.floor(minutes / 60) });
  return t("time.minutes", { n: Math.max(1, minutes) });
}

/** A whole number of 솔방울 with thousands separators, from a number or a decimal string. */
export function amount(n: number | bigint | string): string {
  const s = typeof n === "string" ? n : String(n);
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
