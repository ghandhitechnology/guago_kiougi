/**
 * Emotes on a body (PLAN §12): the student rig's own animation of the emote, by its content id;
 * the emote wheel puts the icon over the head.
 */
export function playEmote(actor: { emote(id: string): void } | undefined, id: string): void {
  actor?.emote(id);
}
