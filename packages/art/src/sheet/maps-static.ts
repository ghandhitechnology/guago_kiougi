/**
 * Maps on the static sheet: each map whole at ×1, a screen at ×3 around each spawn and the
 * landmark, and the overlay view at ×2.
 */
import type { BuiltMap } from "@guago/content";
import type { Atlas } from "../build/emit.ts";
import { COLORS, colorIndex, hexToRgb } from "../palette.ts";
import { Rgba } from "../raster.ts";
import { renderScene, type SceneAtlas, type SceneMeta } from "../scene.ts";
import { drawText } from "./font.ts";
import { mapViews, overlay } from "./map-view.ts";
import type { Fonts } from "./static.ts";

const OUTLINE = hexToRgb(COLORS[colorIndex("ink.deep")] as string);

function scaled(src: Rgba, x: number, y: number, w: number, h: number, k: number): Rgba {
  const out = new Rgba(w * k, h * k);
  for (let yy = 0; yy < h; yy++) {
    for (let xx = 0; xx < w; xx++) {
      const o = ((y + yy) * src.w + x + xx) * 4;
      out.rect(xx * k, yy * k, k, k, [
        src.data[o] as number,
        src.data[o + 1] as number,
        src.data[o + 2] as number,
      ]);
    }
  }
  return out;
}

export function mapSheets(
  f: Fonts,
  meta: SceneMeta,
  atlases: readonly Atlas[],
  maps: readonly BuiltMap[],
): Record<string, Rgba> {
  const pixels = new Map<string, SceneAtlas>(
    atlases.map((a) => [a.name, { w: a.png.w, h: a.png.h, data: a.png.data, frames: a.frames }]),
  );
  const out: Record<string, Rgba> = {};
  for (const map of maps) {
    const img = renderScene(map.scene, meta, pixels, 0);
    for (const w of img.warnings) console.warn(`${map.id}: ${w}`);
    const whole = new Rgba(img.w, img.h);
    whole.data.set(img.data);
    out[`map-${map.id}`] = whole;
    for (const v of mapViews(map)) {
      out[`map-${map.id}-${v.name}@3`] = scaled(whole, v.rect.x, v.rect.y, v.rect.w, v.rect.h, 3);
    }
    const o = overlay(map, whole, 2, meta.palette.ramps);
    const view = new Rgba(o.w, o.h);
    view.data.set(o.data);
    for (const l of o.labels) {
      for (const [dx, dy] of [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ] as const)
        drawText(view, f.label, l.text, l.x + dx, l.y + dy, OUTLINE);
      drawText(view, f.label, l.text, l.x, l.y, l.color);
    }
    out[`map-${map.id}-overlay`] = view;
  }
  return out;
}
