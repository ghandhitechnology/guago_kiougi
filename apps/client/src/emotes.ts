/**
 * Emotes on a body (PLAN §12): the student rig's own animation of the emote, by its content id,
 * played on the sprite the fight view draws the student with; the emote wheel puts the icon
 * bubble over the head. The fight view hands the frame back once the student moves or is hit.
 */
import type * as Phaser from "phaser";

export function playEmote(body: Phaser.GameObjects.Sprite | undefined, id: string): void {
  if (!body) return;
  // Frames are `<dir>/<frame>` on the look's texture, whose animations are `<texture>/<dir>/<anim>`.
  const dir = String(body.frame.name).split("/")[0];
  const key = `${body.texture.key}/${dir}/${id}`;
  if (body.scene.anims.exists(key)) body.play(key);
}
