import type { ArtMetadata } from "@guago/art";
import type * as Phaser from "phaser";

/**
 * Environment art in a palette theme (night, lamp light), the way the art package's scenes draw
 * it: every frame of the listed sprites copied into one texture with the theme's colour swaps
 * applied, keeping frame names, trims and pivots. Returns the texture key.
 */
export function themedSprites(
  scene: Phaser.Scene,
  meta: ArtMetadata,
  theme: string,
  sprites: readonly string[],
  atlas = "core",
): string {
  const key = `${atlas}@${theme}`;
  if (scene.textures.exists(key)) return key;
  const src = scene.textures.get(atlas);
  const image = src.getSourceImage() as CanvasImageSource;
  const names = sprites.flatMap((s) => meta.sprites[s]?.frames ?? []);
  const frames = names.map((n) => src.get(n));

  // Shelf-pack the frames into one canvas.
  const W = 1024;
  let x = 0;
  let y = 0;
  let row = 0;
  const at = frames.map((f) => {
    if (x + f.cutWidth > W) {
      x = 0;
      y += row + 1;
      row = 0;
    }
    const p = { x, y };
    x += f.cutWidth + 1;
    row = Math.max(row, f.cutHeight);
    return p;
  });
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = y + row + 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
  ctx.imageSmoothingEnabled = false;
  frames.forEach((f, i) => {
    const p = at[i] as { x: number; y: number };
    ctx.drawImage(
      image,
      f.cutX,
      f.cutY,
      f.cutWidth,
      f.cutHeight,
      p.x,
      p.y,
      f.cutWidth,
      f.cutHeight,
    );
  });

  const swap = new Map<number, number>();
  for (const [from, to] of Object.entries(meta.recolor[theme] ?? {})) {
    swap.set(Number.parseInt(from.slice(1), 16), Number.parseInt(to.slice(1), 16));
  }
  const px = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = px.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const c = ((d[i] as number) << 16) | ((d[i + 1] as number) << 8) | (d[i + 2] as number);
    const to = swap.get(c);
    if (to === undefined) continue;
    d[i] = to >> 16;
    d[i + 1] = (to >> 8) & 0xff;
    d[i + 2] = to & 0xff;
  }
  ctx.putImageData(px, 0, 0);

  const tex = scene.textures.addCanvas(key, canvas);
  if (!tex) throw new Error(`could not create ${key}`);
  frames.forEach((f, i) => {
    const p = at[i] as { x: number; y: number };
    const out = tex.add(names[i] as string, 0, p.x, p.y, f.cutWidth, f.cutHeight);
    if (!out) return;
    if (f.trimmed) out.setTrim(f.realWidth, f.realHeight, f.x, f.y, f.cutWidth, f.cutHeight);
    if (f.customPivot) {
      out.customPivot = true;
      out.pivotX = f.pivotX;
      out.pivotY = f.pivotY;
    }
  });
  return key;
}
