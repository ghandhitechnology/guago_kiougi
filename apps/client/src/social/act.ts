import type { SocialRequests, SocialType } from "@guago/shared";
import { toast } from "../ui/overlay.ts";
import { sound } from "../ui/sound.ts";
import type { RequestResult, WorldLink } from "../world-link.ts";
import { line, refusal } from "./words.ts";

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
  const r = await link.request(type, req);
  if (!r.ok) {
    sound("error");
    toast(refusal(r.code, r.need === undefined ? {} : { need: r.need }));
    return r;
  }
  sound("confirm");
  const text = said ? line(said.id, said.params) : undefined;
  if (text) toast(text);
  return r;
}
