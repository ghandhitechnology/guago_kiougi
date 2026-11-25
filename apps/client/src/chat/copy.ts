import { narrative } from "@guago/content";
import type { SystemLine } from "@guago/shared";
import { t, tMaybe } from "../i18n/index.ts";
import type { SendResult } from "../world-link.ts";

/**
 * What chat says back. Refusals come from the dorm supervisor's ledger voice, in 합니다체 like
 * every other line she files; system lines are worded from the narrative's system messages.
 */

/** `HH:MM`, for when a mute ends. */
function clock(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** A refused message, as one short line. */
export function refusalText(r: Extract<SendResult, { ok: false }>): string {
  switch (r.code) {
    case "muted":
      return r.until
        ? t("chat.refused.muted_until", { time: clock(r.until) })
        : t("chat.refused.muted");
    case "rate_limited": {
      const s = Math.max(1, Math.ceil((r.retryMs ?? 1000) / 1000));
      return t("chat.refused.rate_limited", { s });
    }
    case "level":
      return t("chat.refused.level", { need: r.need ?? 5 });
    default:
      // Chat answers with a handful of codes; anything else gets the plain line.
      return tMaybe(`chat.refused.${r.code}`) ?? t("chat.refused.other");
  }
}

const SYSTEM = new Map(narrative.NARRATIVE.system.map((m) => [m.id, m]));

/** A system line in words, or undefined for a key the client has no words for yet. */
export function systemText(line: SystemLine): string | undefined {
  if (line.text) return line.text;
  if (line.key === "muted" && typeof line.params?.until === "number") {
    return t("chat.system.muted", { time: clock(line.params.until) });
  }
  const msg = SYSTEM.get(line.key);
  if (!msg) return undefined;
  const text = narrative.NARRATIVE.ko[msg.text];
  return text ? narrative.fill(text, line.params ?? {}) : undefined;
}
