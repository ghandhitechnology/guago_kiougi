import type { ArtMetadata, RigMeta } from "@guago/art";
import type * as Phaser from "phaser";

/** Every file `pnpm art:build` writes, by file name. */
const files = import.meta.glob<string>("../../../packages/art/dist/*.{png,json}", {
  query: "?url",
  import: "default",
  eager: true,
});

function url(name: string): string {
  const hit = Object.entries(files).find(([path]) => path.endsWith(`/${name}`));
  if (!hit) throw new Error(`art build output has no ${name}; run pnpm art:build`);
  return hit[1];
}

const META = "art";

/** Queues the metadata, then every atlas it lists, on the scene's loader. */
export function loadArt(scene: Phaser.Scene): void {
  scene.load.json(META, url("art.json"));
  scene.load.once(`filecomplete-json-${META}`, (_key: string, _type: string, meta: ArtMetadata) => {
    for (const atlas of meta.atlases) {
      scene.load.atlas(atlas, url(`${atlas}.png`), url(`${atlas}.json`));
    }
  });
}

export function artMeta(scene: Phaser.Scene): ArtMetadata {
  return scene.cache.json.get(META) as ArtMetadata;
}

/** Animation key for a sprite's animation, e.g. `odap/hop`. */
export function spriteAnim(sprite: string, anim: string): string {
  return `${sprite}/${anim}`;
}

/** Texture key of a composited rig look, e.g. `student:blazer`. */
export function lookTexture(rig: string, look: string): string {
  return `${rig}:${look}`;
}

/** Animation key for a look facing one direction, e.g. `student:blazer/down/idle`. */
export function lookAnim(rig: string, look: string, dir: string, anim: string): string {
  return `${lookTexture(rig, look)}/${dir}/${anim}`;
}

/** The layer every rig draws its ground shadow on. */
export const SHADOW_LAYER = "shadow";
/** Frame of a look texture holding its ground shadow alone. */
export const SHADOW_FRAME = "shadow";

/** Creates every sprite animation the metadata lists. */
export function createSpriteAnims(scene: Phaser.Scene, meta: ArtMetadata): void {
  for (const [name, sprite] of Object.entries(meta.sprites)) {
    for (const [anim, a] of Object.entries(sprite.anims)) {
      scene.anims.create({
        key: spriteAnim(name, anim),
        frames: a.frames.map((frame) => ({ key: sprite.atlas, frame })),
        frameRate: a.fps,
        repeat: a.loop ? -1 : 0,
      });
    }
  }
}

function hexToRgb(hex: string): number {
  return Number.parseInt(hex.slice(1), 16);
}

/**
 * Composites one look of a rig into its own texture: every direction and frame with its layers
 * stacked back to front and slot key colours swapped for the look's options. The ground shadow
 * layer is left out of the body frames and gets one frame of its own, drawn soft by the caller.
 */
export function composeLook(scene: Phaser.Scene, meta: ArtMetadata, rigName: string, look: string) {
  const rig = meta.rigs[rigName] as RigMeta;
  const chosen = rig.looks[look];
  if (!chosen) throw new Error(`rig ${rigName} has no look ${look}`);
  const atlas = scene.textures.get(rig.atlas);
  const image = atlas.getSourceImage() as CanvasImageSource;
  const [w, h] = rig.size;
  const cols = rig.frames.length;
  const rows = rig.directions.length + 1;

  const canvas = document.createElement("canvas");
  canvas.width = cols * w;
  canvas.height = rows * h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
  ctx.imageSmoothingEnabled = false;

  const stamp = (layer: string, dir: string, frame: string, cx: number, cy: number): void => {
    const part = chosen.parts[layer];
    if (!part) return;
    const key = rig.frameKey
      .replace("{layer}", layer)
      .replace("{part}", part)
      .replace("{dir}", dir)
      .replace("{frame}", frame);
    if (!atlas.has(key)) return;
    const f = atlas.get(key);
    ctx.drawImage(
      image,
      f.cutX,
      f.cutY,
      f.cutWidth,
      f.cutHeight,
      cx + f.x,
      cy + f.y,
      f.cutWidth,
      f.cutHeight,
    );
  };

  rig.directions.forEach((dir, row) => {
    rig.frames.forEach((frame, col) => {
      for (const layer of rig.layers) {
        if (layer !== SHADOW_LAYER) stamp(layer, dir, frame, col * w, row * h);
      }
    });
  });
  const shadowRow = rig.directions.length;
  stamp(SHADOW_LAYER, rig.directions[0] ?? "down", rig.frames[0] ?? "", 0, shadowRow * h);

  // Swap slot key colours for the look's chosen options (the first option when unset).
  const swap = new Map<number, number>();
  for (const [slotName, slot] of Object.entries(meta.slots)) {
    const option = chosen.slots[slotName] ?? Object.keys(slot.options)[0];
    const colors = option === undefined ? undefined : slot.options[option];
    if (!colors) continue;
    for (const [step, key] of Object.entries(slot.keys)) {
      const to = colors[step];
      if (to) swap.set(hexToRgb(key), hexToRgb(to));
    }
  }
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = pixels.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const to = swap.get(
      ((d[i] as number) << 16) | ((d[i + 1] as number) << 8) | (d[i + 2] as number),
    );
    if (to === undefined) continue;
    d[i] = to >> 16;
    d[i + 1] = (to >> 8) & 0xff;
    d[i + 2] = to & 0xff;
  }
  ctx.putImageData(pixels, 0, 0);

  const key = lookTexture(rigName, look);
  const texture = scene.textures.addCanvas(key, canvas) as Phaser.Textures.CanvasTexture;
  const pivot = (f: Phaser.Textures.Frame | null): void => {
    if (!f) return;
    f.customPivot = true;
    f.pivotX = rig.origin[0] / w;
    f.pivotY = rig.origin[1] / h;
  };
  rig.directions.forEach((dir, row) => {
    rig.frames.forEach((frame, col) => {
      pivot(texture.add(`${dir}/${frame}`, 0, col * w, row * h, w, h));
    });
    for (const [anim, a] of Object.entries(rig.anims)) {
      scene.anims.create({
        key: lookAnim(rigName, look, dir, anim),
        frames: a.frames.map((frame) => ({ key, frame: `${dir}/${frame}` })),
        frameRate: a.fps,
        repeat: a.loop ? -1 : 0,
      });
    }
  });
  pivot(texture.add(SHADOW_FRAME, 0, 0, shadowRow * h, w, h));
  return { texture: key, look };
}

/** The look a rig shows when nothing else is chosen: its first. */
export function defaultLook(meta: ArtMetadata, rigName: string): string {
  const look = Object.keys(meta.rigs[rigName]?.looks ?? {})[0];
  if (!look) throw new Error(`rig ${rigName} has no looks`);
  return look;
}
