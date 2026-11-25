import type { ArtMetadata } from "@guago/art";
import { type MapDef, propsOf } from "@guago/content";
import { TILE_SIZE } from "@guago/shared";
import type * as Phaser from "phaser";
import { ENTITY_DEPTH, SHADOW_ALPHA, SHADOW_DEPTH } from "./actors.ts";
import { spriteAnim } from "./art.ts";

/**
 * Draws a map's props standing on their footprints: feet on the footprint's bottom edge, sorted
 * with everything else by those feet, a soft shadow under each, and a crown on top for the art
 * that has one. A stand-in until the layered map renderer takes over.
 */
export function drawProps(scene: Phaser.Scene, meta: ArtMetadata, map: MapDef): void {
  for (const p of propsOf(map)) {
    const sprite = meta.sprites[p.sprite];
    if (!sprite) throw new Error(`art has no sprite ${p.sprite}`);
    const x = (p.tx + (p.w ?? 1) / 2) * TILE_SIZE;
    const y = (p.ty + (p.h ?? 1)) * TILE_SIZE - 1;
    scene.add.image(x, y, sprite.atlas, `${p.sprite}/${p.frame}`).setDepth(ENTITY_DEPTH + y);
    const shadow = `${p.sprite}/shadow`;
    if (sprite.frames.includes(shadow)) {
      scene.add.image(x, y, sprite.atlas, shadow).setAlpha(SHADOW_ALPHA).setDepth(SHADOW_DEPTH);
    }
    const crown = meta.sprites[`${p.sprite}-crown`];
    const sway = crown && Object.keys(crown.anims)[0];
    if (crown && sway) {
      scene.add
        .sprite(x, y, crown.atlas)
        .play(spriteAnim(`${p.sprite}-crown`, sway))
        .setDepth(ENTITY_DEPTH + y + 0.5);
    }
  }
}
