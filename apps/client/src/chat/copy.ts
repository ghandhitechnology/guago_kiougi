import type { SystemLine } from "@guago/shared";
import { clock, refusal, type Spoken, spoken } from "../copy/lines.ts";
import type { SendResult } from "../world-link.ts";

/**
 * What chat says back, in the narrative's words: each refusal in its speaker's voice, and system
 * lines and server announcements by their narrative id.
 */

/**
 * A refused message as one line. The client's own `offline` and `timeout` have no line in the
 * narrative yet; they answer with the shake and the error sound alone.
 */
export function refusalText(r: Extract<SendResult, { ok: false }>): string | undefined {
  if (r.code === "offline" || r.code === "timeout") return undefined;
  return refusal("world", r.code, {
    ...(r.until === undefined ? {} : { until: r.until }),
    ...(r.need === undefined ? {} : { need: r.need }),
  })?.text;
}

/** A system line in words: an operator's own text, or the narrative line its key names. */
export function systemLine(line: SystemLine): Spoken | undefined {
  if (line.text) {
    return {
      id: line.key,
      text: line.text,
      voice: "office",
      channel: "system",
      announcement: false,
    };
  }
  const params: Record<string, string | number> = { ...(line.params ?? {}) };
  // Times arrive as server ms; lines name them as HH:MM.
  for (const k of ["until", "time"]) {
    const v = params[k];
    if (typeof v === "number" && v > 1e11) params.time = clock(v);
  }
  return spoken(line.key, params);
}
