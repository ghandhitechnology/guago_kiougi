/**
 * Small textures the renderer draws with, made once per game: a white pixel, a light pool's
 * falloff, and a halo for things that glow, banded and dithered so it stays pixel art.
 */
import type * as Phaser from "phaser";

export const TEX = {
  px: "render:px",
  pool: "render:pool",
  halo: "render:halo",
} as const;

/** Bayer 4×4 threshold at a pixel, 0 to 15/16. */
export function bayer4(x: number, y: number): number {
  const m = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  return (m[(y & 3) * 4 + (x & 3)] as number) / 16;
}

function canvasTexture(
  scene: Phaser.Scene,
  key: string,
  w: number,
  h: number,
  paint: (data: Uint8ClampedArray) => void,
): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, w, h);
  if (!tex) return;
  const ctx = tex.getContext();
  const img = ctx.createImageData(w, h);
  paint(img.data);
  ctx.putImageData(img, 0, 0);
  tex.refresh();
}

export function makeTextures(scene: Phaser.Scene): void {
  canvasTexture(scene, TEX.px, 2, 2, (d) => d.fill(255));

  // The pool is smooth: the composite bands it, so its steps follow the light's flicker.
  const P = 128;
  canvasTexture(scene, TEX.pool, P, P, (d) => {
    for (let y = 0; y < P; y++) {
      for (let x = 0; x < P; x++) {
        const dx = (x + 0.5) / (P / 2) - 1;
        const dy = (y + 0.5) / (P / 2) - 1;
        const r2 = Math.min(1, dx * dx + dy * dy);
        const v = (1 - r2) ** 2;
        const o = (y * P + x) * 4;
        d[o] = 255;
        d[o + 1] = 255;
        d[o + 2] = 255;
        d[o + 3] = Math.round(v * 255);
      }
    }
  });

  // The halo is drawn unlit over everything, so it carries its own three bands and dither.
  const H = 48;
  canvasTexture(scene, TEX.halo, H, H, (d) => {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < H; x++) {
        const dx = (x + 0.5) / (H / 2) - 1;
        const dy = (y + 0.5) / (H / 2) - 1;
        const r = Math.sqrt(dx * dx + dy * dy);
        const v = Math.max(0, 1 - r) ** 1.6 * 3;
        const band = Math.floor(v) + (v - Math.floor(v) > 0.5 + bayer4(x, y) * 0.5 ? 1 : 0);
        const a = [0, 0.18, 0.34, 0.5][Math.min(3, band)] as number;
        const o = (y * H + x) * 4;
        d[o] = 255;
        d[o + 1] = 255;
        d[o + 2] = 255;
        d[o + 3] = Math.round(a * 255);
      }
    }
  });
}
