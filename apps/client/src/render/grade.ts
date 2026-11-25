/**
 * Colour helpers and the per-map grade (PLAN §16 "Era color grading"): a 32×32×32 lookup table
 * the light composite reads last. The grade leans darks toward the palette's cool end and lights
 * toward its warm end, the way the palette's own ramps are hue-shifted, then pulls every colour
 * part of the way to its nearest 해솔 64 colour so lit art stays in the palette's family.
 */
import type { ArtMetadata } from "@guago/art";
import type { BuiltMap } from "@guago/content";
import type * as Phaser from "phaser";

export type Rgb = readonly [number, number, number];

/** A palette name like `clay.dust` as 0xrrggbb. Unknown names are magenta, loudly. */
export function paletteColor(meta: ArtMetadata, name: string): number {
  const [ramp, step] = name.split(".") as [string, string];
  const hex = meta.palette.ramps[ramp]?.[step];
  return hex ? Number.parseInt(hex.slice(1), 16) : 0xff00ff;
}

export function rgbOf(color: number): Rgb {
  return [((color >> 16) & 255) / 255, ((color >> 8) & 255) / 255, (color & 255) / 255];
}

export function colorOf(c: Rgb): number {
  const b = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)));
  return (b(c[0]) << 16) | (b(c[1]) << 8) | b(c[2]);
}

export function luma(c: Rgb): number {
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

/** sRGB to OKLab, for nearest-colour search. */
function oklab(c: Rgb): Rgb {
  const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const r = lin(c[0]);
  const g = lin(c[1]);
  const b = lin(c[2]);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export interface Grade {
  /** Colour the darks lean toward, and how far at black. */
  readonly cool: number;
  readonly coolAmount: number;
  /** Colour the lights lean toward, and how far at white. */
  readonly warm: number;
  readonly warmAmount: number;
  readonly saturation: number;
  readonly contrast: number;
  /** How far each colour moves to its nearest palette colour: 0 none, 1 all the way. */
  readonly snap: number;
}

/** The grade for each stopped time of day. */
export function gradeFor(meta: ArtMetadata, map: BuiltMap): Grade {
  const c = (name: string) => paletteColor(meta, name);
  switch (map.time.phase) {
    case "night":
      return {
        cool: c("navy.dark"),
        coolAmount: 0.22,
        warm: c("gold.pale"),
        warmAmount: 0.06,
        saturation: 1.08,
        contrast: 1.06,
        snap: 0.15,
      };
    case "golden":
      return {
        cool: c("plum.dark"),
        coolAmount: 0.12,
        warm: c("gold.pale"),
        warmAmount: 0.035,
        saturation: 1.03,
        contrast: 1.04,
        snap: 0.12,
      };
    case "dusk":
      return {
        cool: c("plum.mid"),
        coolAmount: 0.18,
        warm: c("rose.light"),
        warmAmount: 0.06,
        saturation: 1.0,
        contrast: 1.05,
        snap: 0.15,
      };
    default:
      return {
        cool: c("navy.mid"),
        coolAmount: 0.08,
        warm: c("gold.pale"),
        warmAmount: 0.04,
        saturation: 1.0,
        contrast: 1.0,
        snap: 0.1,
      };
  }
}

/** The identity grade, for comparing against the art as drawn. */
export const NO_GRADE: Grade = {
  cool: 0,
  coolAmount: 0,
  warm: 0xffffff,
  warmAmount: 0,
  saturation: 1,
  contrast: 1,
  snap: 0,
};

export const LUT_SIZE = 32;

/**
 * Writes the grade into a canvas texture: 32 slices of 32×32 side by side, blue picks the
 * slice, red runs across it, green runs down. Rebuilt in place when `key` exists.
 */
export function buildLut(scene: Phaser.Scene, key: string, meta: ArtMetadata, grade: Grade): void {
  const N = LUT_SIZE;
  const palette = meta.palette.colors.map((hex) => {
    const rgb = rgbOf(Number.parseInt(hex.slice(1), 16));
    return { rgb, lab: oklab(rgb) };
  });
  const cool = rgbOf(grade.cool);
  const warm = rgbOf(grade.warm);
  const existing = scene.textures.exists(key)
    ? (scene.textures.get(key) as Phaser.Textures.CanvasTexture)
    : null;
  const tex = existing ?? scene.textures.createCanvas(key, N * N, N);
  if (!tex) throw new Error("could not create the grade texture");
  const ctx = tex.getContext();
  const img = ctx.createImageData(N * N, N);
  const d = img.data;
  for (let b = 0; b < N; b++) {
    for (let g = 0; g < N; g++) {
      for (let r = 0; r < N; r++) {
        let c: [number, number, number] = [r / (N - 1), g / (N - 1), b / (N - 1)];
        const y = luma(c);
        // Contrast around mid grey, then saturation around the pixel's own grey.
        c = c.map((v) => (v - 0.5) * grade.contrast + 0.5) as [number, number, number];
        const y2 = luma(c);
        c = c.map((v) => y2 + (v - y2) * grade.saturation) as [number, number, number];
        // Darks lean cool, lights lean warm, like the palette's own ramps.
        const kc = grade.coolAmount * (1 - y) ** 2;
        const kw = grade.warmAmount * y ** 2;
        c = c.map(
          (v, i) => v + ((cool[i] as number) - v) * kc + ((warm[i] as number) - v) * kw,
        ) as [number, number, number];
        c = c.map((v) => Math.max(0, Math.min(1, v))) as [number, number, number];
        if (grade.snap > 0) {
          const lab = oklab(c);
          let best = palette[0];
          let bestD = Number.POSITIVE_INFINITY;
          for (const p of palette) {
            const dl = (p.lab[0] - lab[0]) * 1.4;
            const da = p.lab[1] - lab[1];
            const db = p.lab[2] - lab[2];
            const dist = dl * dl + da * da + db * db;
            if (dist < bestD) {
              bestD = dist;
              best = p;
            }
          }
          if (best) c = c.map((v, i) => v + ((best.rgb[i] as number) - v) * grade.snap) as typeof c;
        }
        const o = (g * N * N + b * N + r) * 4;
        d[o] = Math.round(c[0] * 255);
        d[o + 1] = Math.round(c[1] * 255);
        d[o + 2] = Math.round(c[2] * 255);
        d[o + 3] = 255;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  tex.refresh();
}
