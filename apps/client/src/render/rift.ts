/**
 * Light that pours out of a region instead of a point: a rift's tear. Built once per map from
 * the baked mask: inside the tear the era's daylight shows the art as drawn; outside it the
 * light spills across the ground in shafts, its edge broken by the same seeded noise as the
 * contact sheet's painted bands; the torn lip glows; and the composite gets a mask for the
 * shimmer inside and the colour split at the lip.
 */
import { valueNoise } from "@guago/art";
import type { LightSource } from "@guago/content";
import type * as Phaser from "phaser";
import { bayer4 } from "./textures.ts";

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** The baked mask image, read back on the CPU once. */
export interface MapMasks {
  readonly w: number;
  readonly h: number;
  /** 255 where the ground lies in a shadow. */
  readonly shadow: Uint8Array;
  /** 255 inside an edge region (a rift's tear). */
  readonly inside: Uint8Array;
  /** 255 on wall tiles: walls, faces, buildings, which stop light. */
  readonly wall: Uint8Array;
}

export function readMasks(scene: Phaser.Scene, key: string): MapMasks {
  const image = scene.textures.get(key).getSourceImage() as HTMLImageElement;
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
  ctx.drawImage(image, 0, 0);
  const d = ctx.getImageData(0, 0, image.width, image.height).data;
  const n = image.width * image.height;
  const shadow = new Uint8Array(n);
  const inside = new Uint8Array(n);
  const wall = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    shadow[i] = d[i * 4] as number;
    inside[i] = d[i * 4 + 1] as number;
    wall[i] = d[i * 4 + 2] as number;
  }
  return { w: image.width, h: image.height, shadow, inside, wall };
}

/** Two-pass chamfer distance to the nearest seed pixel, over `rect` of a `w`-wide mask. */
function distanceField(mask: Uint8Array, w: number, rect: Rect): Float32Array {
  const big = 1e6;
  const d = new Float32Array(rect.w * rect.h).fill(big);
  for (let y = 0; y < rect.h; y++) {
    for (let x = 0; x < rect.w; x++) {
      const mx = rect.x + x;
      const my = rect.y + y;
      if (mx >= 0 && my >= 0 && mx < w && (mask[my * w + mx] ?? 0) > 0) d[y * rect.w + x] = 0;
    }
  }
  const W = rect.w;
  const H = rect.h;
  const at = (x: number, y: number) =>
    x < 0 || y < 0 || x >= W || y >= H ? big : (d[y * W + x] as number);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      d[y * W + x] = Math.min(
        at(x, y),
        at(x - 1, y) + 1,
        at(x, y - 1) + 1,
        at(x - 1, y - 1) + 1.41,
        at(x + 1, y - 1) + 1.41,
      );
  for (let y = H - 1; y >= 0; y--)
    for (let x = W - 1; x >= 0; x--)
      d[y * W + x] = Math.min(
        at(x, y),
        at(x + 1, y) + 1,
        at(x, y + 1) + 1,
        at(x + 1, y + 1) + 1.41,
        at(x - 1, y + 1) + 1.41,
      );
  return d;
}

/** A box blur of a distance field, `r` pixels each way, in two passes. */
function blurField(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const a = new Float32Array(w * h);
  const b = new Float32Array(w * h);
  const cap = 4096;
  for (let y = 0; y < h; y++) {
    let sum = 0;
    for (let x = -r; x <= r; x++)
      sum += Math.min(cap, src[y * w + Math.max(0, Math.min(w - 1, x))] as number);
    for (let x = 0; x < w; x++) {
      a[y * w + x] = sum / (2 * r + 1);
      const add = src[y * w + Math.min(w - 1, x + r + 1)] as number;
      const sub = src[y * w + Math.max(0, x - r)] as number;
      sum += Math.min(cap, add) - Math.min(cap, sub);
    }
  }
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let y = -r; y <= r; y++) sum += a[Math.max(0, Math.min(h - 1, y)) * w + x] as number;
    for (let y = 0; y < h; y++) {
      b[y * w + x] = sum / (2 * r + 1);
      sum +=
        (a[Math.min(h - 1, y + r + 1) * w + x] as number) -
        (a[Math.max(0, y - r) * w + x] as number);
    }
  }
  return b;
}

/** Ragged-edge noise in pixels, as the contact sheet breaks its painted bands. */
function ragged(x: number, y: number, amount: number, seed: number): number {
  const n = 0.65 * valueNoise(x, y, 7, seed) + 0.35 * valueNoise(x, y, 2.5, seed + 9);
  return (n - 0.5) * 2 * amount;
}

function makeCanvasTexture(
  scene: Phaser.Scene,
  key: string,
  w: number,
  h: number,
  paint: (d: Uint8ClampedArray) => void,
): string {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.createCanvas(key, w, h);
  if (!tex) throw new Error(`could not create ${key}`);
  const ctx = tex.getContext();
  const img = ctx.createImageData(w, h);
  paint(img.data);
  ctx.putImageData(img, 0, 0);
  tex.refresh();
  return key;
}

export interface RegionLight {
  readonly source: LightSource;
  /** Where the light's textures sit in the world. */
  readonly rect: Rect;
  /** White where the region is, for writing neutral light (the art as drawn) inside it. */
  readonly insideKey: string;
  readonly insideRect: Rect;
  /** The spill outside, in two ray patterns crossfaded so the shafts drift. */
  readonly spillKeys: readonly [string, string];
  /** The same spills on the CPU, one byte per pixel of `rect`, for lighting sprites. */
  readonly spill: readonly [Uint8Array, Uint8Array];
  /** Banded glow hugging the torn lip, drawn additively. */
  readonly glowKey: string;
  readonly glowRect: Rect;
  /** For the composite: red inside, green at the lip. */
  readonly fxKey: string;
  readonly fxRect: Rect;
  /** Pixels just outside the lip, where inward motes are born. */
  readonly lip: Float32Array;
  /** Where the light gathers: shafts radiate from here and motes fly to it. */
  readonly core: readonly [number, number];
  /** Every texture this region made, to remove on leaving. */
  readonly keys: readonly string[];
}

/**
 * Builds a region light for `source` (a light whose contact-sheet paint names a `region`) from
 * the mask of the region's pixels.
 */
export function buildRegionLight(
  scene: Phaser.Scene,
  id: string,
  masks: MapMasks,
  source: LightSource,
  seed: number,
): RegionLight | null {
  const paint = source.paint;
  if (!paint?.region) return null;
  const { w, h, inside } = masks;
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!inside[y * w + x]) continue;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return null;

  const reachMax = Math.max(...(paint.reach ?? [source.radius]));
  const rays = paint.rays;
  const swell = 1 + (rays?.amount ?? 0);
  const margin = Math.ceil(reachMax * swell + (paint.ragged ?? 3) + 4);
  const rect: Rect = {
    x: x0 - margin,
    y: y0 - margin,
    w: x1 - x0 + 1 + 2 * margin,
    h: y1 - y0 + 1 + 2 * margin,
  };
  const field = distanceField(inside, w, rect);
  const core: [number, number] = rays ? [rays.at[0], rays.at[1]] : [(x0 + x1) / 2, (y0 + y1) / 2];
  const amount = paint.ragged ?? 3;
  const phase = (seed % 97) * 0.37;

  const shaft = (x: number, y: number, shift: number) => {
    if (!rays) return 1;
    const a = Math.atan2(y + 0.5 - rays.at[1], x + 0.5 - rays.at[0]);
    const p = phase + shift;
    const wave =
      0.6 * Math.sin(rays.count * a + p) +
      0.4 * Math.sin(Math.round(rays.count * 1.618) * a + p * 2.3);
    return 1 + rays.amount * wave;
  };
  const spillAlpha: [Uint8Array, Uint8Array] = [
    new Uint8Array(rect.w * rect.h),
    new Uint8Array(rect.w * rect.h),
  ];
  // The spill measures distance from a softened lip, so its bands sweep in broad arcs instead
  // of copying every tooth of the torn edge; its edges break on large, slow noise.
  const soft = blurField(field, rect.w, rect.h, 10);
  const swell2 = (x: number, y: number, s: number) =>
    (0.7 * valueNoise(x, y, 26, s) + 0.3 * valueNoise(x, y, 11, s + 7) - 0.5) * 2 * amount * 0.7;
  const spill = (variant: 0 | 1) =>
    makeCanvasTexture(scene, `rift:${id}:spill${variant}`, rect.w, rect.h, (d) => {
      for (let y = 0; y < rect.h; y++) {
        for (let x = 0; x < rect.w; x++) {
          const dist = field[y * rect.w + x] as number;
          const smooth = soft[y * rect.w + x] as number;
          const wx = rect.x + x;
          const wy = rect.y + y;
          let v = 0;
          if (dist > 0) {
            const reach = reachMax * shaft(wx, wy, variant * 1.7);
            const f =
              1 - (Math.max(dist * 0.35, smooth) + swell2(wx, wy, seed + variant * 31)) / reach;
            v = f <= 0 ? 0 : f ** 1.35;
          }
          const o = (y * rect.w + x) * 4;
          const a = Math.round(Math.min(1, v) * 255);
          d[o] = 255;
          d[o + 1] = 255;
          d[o + 2] = 255;
          d[o + 3] = a;
          spillAlpha[variant][y * rect.w + x] = a;
        }
      }
    });

  const insideRect: Rect = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  const insideKey = makeCanvasTexture(
    scene,
    `rift:${id}:inside`,
    insideRect.w,
    insideRect.h,
    (d) => {
      for (let y = 0; y < insideRect.h; y++) {
        for (let x = 0; x < insideRect.w; x++) {
          const on = inside[(insideRect.y + y) * w + insideRect.x + x] ? 255 : 0;
          const o = (y * insideRect.w + x) * 4;
          d[o] = 255;
          d[o + 1] = 255;
          d[o + 2] = 255;
          d[o + 3] = on;
        }
      }
    },
  );

  const G = 6;
  const glowRect: Rect = { x: x0 - G, y: y0 - G, w: insideRect.w + 2 * G, h: insideRect.h + 2 * G };
  const lipPoints: number[] = [];
  const glowKey = makeCanvasTexture(scene, `rift:${id}:glow`, glowRect.w, glowRect.h, (d) => {
    for (let y = 0; y < glowRect.h; y++) {
      for (let x = 0; x < glowRect.w; x++) {
        const fx = glowRect.x + x - rect.x;
        const fy = glowRect.y + y - rect.y;
        const dist = field[fy * rect.w + fx] as number;
        let a = 0;
        if (dist > 0 && dist <= G) {
          // Two bands, the seam between them dithered.
          const v = 1 - dist / G;
          a = v > 0.55 ? 0.55 : v > 0.25 + bayer4(glowRect.x + x, glowRect.y + y) * 0.2 ? 0.28 : 0;
          if (dist <= 2.5) lipPoints.push(glowRect.x + x, glowRect.y + y);
        }
        const o = (y * glowRect.w + x) * 4;
        d[o] = 255;
        d[o + 1] = 255;
        d[o + 2] = 255;
        d[o + 3] = Math.round(a * 255);
      }
    }
  });

  // How deep inside the tear each pixel is: the distance to the nearest pixel outside it.
  const outside = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) outside[i] = inside[i] ? 0 : 1;
  const depth = distanceField(outside, w, insideRect);
  const DEEP = 28;
  const F = 4;
  const fxRect: Rect = { x: x0 - F, y: y0 - F, w: insideRect.w + 2 * F, h: insideRect.h + 2 * F };
  const fxKey = makeCanvasTexture(scene, `rift:${id}:fx`, fxRect.w, fxRect.h, (d) => {
    for (let y = 0; y < fxRect.h; y++) {
      for (let x = 0; x < fxRect.w; x++) {
        const wx = fxRect.x + x;
        const wy = fxRect.y + y;
        const ix = wx - insideRect.x;
        const iy = wy - insideRect.y;
        const inRect = ix >= 0 && iy >= 0 && ix < insideRect.w && iy < insideRect.h;
        const deep = inRect ? (depth[iy * insideRect.w + ix] as number) : 0;
        const o = (y * fxRect.w + x) * 4;
        // Red: shimmer, none at the lip and full deep inside. Green: the inner rim of the lip.
        d[o] = Math.round(Math.max(0, Math.min(1, (deep - 8) / (DEEP - 8))) * 255);
        d[o + 1] = deep > 0 && deep <= 2.5 ? 255 : 0;
        d[o + 2] = 0;
        d[o + 3] = 255;
      }
    }
  });

  const spillKeys: [string, string] = [spill(0), spill(1)];
  return {
    source,
    rect,
    insideKey,
    insideRect,
    spillKeys,
    spill: spillAlpha,
    glowKey,
    glowRect,
    fxKey,
    fxRect,
    lip: new Float32Array(lipPoints),
    core,
    keys: [insideKey, ...spillKeys, glowKey, fxKey],
  };
}
