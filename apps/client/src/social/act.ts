import type { SocialRequests, SocialType } from "@guago/shared";
import { toast } from "../ui/overlay.ts";
import { sound } from "../ui/sound.ts";
import type { RequestResult, WorldLink } from "../world-link.ts";
import { line, refusal } from "./words.ts";

/** When each request type was last sent, so news can tell a leave from a kick. */
const asked = new Map<string, number>();

/** True when this player sent `type` in the last few seconds. */
export function askedLately(type: SocialType, ms = 8000): boolean {
  return Date.now() - (asked.get(type) ?? 0) < ms;
}

/**
 * One social request with its feedback: a refusal is a toast in the voice of whoever refused,
 * with the error sound; a success plays `confirm` and, when the narrative has a line for it,
 * toasts `said`. Screens redraw from the `social` events the server sends after a change, never
 * from a guess made before the answer.
 */
export async function ask<K extends SocialType>(
  link: WorldLink,
  type: K,
  req: SocialRequests[K]["req"],
  said?: { id: string; params?: Readonly<Record<string, string | number>> },
): Promise<RequestResult<K>> {
  asked.set(type, Date.now());
  const r = await link.request(type, req);
  if (!r.ok) {
    sound("error");
    {
      const said = refusal(r.code, r.need === undefined ? {} : { need: r.need });
      if (said) toast(said);
    }
    return r;
  }
  sound("confirm");
  const text = said ? line(said.id, said.params) : undefined;
  if (text) toast(text);
  return r;
}
