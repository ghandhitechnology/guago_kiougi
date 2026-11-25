/**
 * Maps on the static sheet: each map whole at ×1, a screen at ×3 around each spawn and the
 * landmark, and the overlay view at ×2.
 */
import { type BuiltMap, CAST_ART, patrolPose } from "@guago/content";
import type { Atlas } from "../build/emit.ts";
import { COLORS, colorIndex, hexToRgb } from "../palette.ts";
import { Rgba } from "../raster.ts";
import {
  type Actor,
  type Doll,
  renderScene,
  type SceneAtlas,
  type SceneDef,
  type SceneMeta,
} from "../scene.ts";
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

/**
 * The map as it is lived in: its scene, plus everyone the game stands in it, each in their cast
 * art at their spot (idle), and every patrol and walk's walker where their round starts. The
 * server places these at run time; the sheet shows them so a map is judged with its people.
 */
function peopled(map: BuiltMap): SceneDef {
  const people: (Actor | Doll)[] = [];
  const who = (id: string, x: number, y: number, facing: string, anim: string) => {
    const cast = CAST_ART[id];
    if (!cast) return;
    const flip = facing === "left";
    const dir = facing === "up" ? "up" : facing === "down" ? "down" : "side";
    if (cast.kind === "rig")
      people.push({ rig: cast.art, dir, anim, play: true, at: [x, y], flip });
    else people.push({ actor: cast.art, anim: "idle", play: true, at: [x, y], flip });
  };
  for (const n of map.npcs) who(n.speaker, n.x, n.y, n.facing, "idle");
  for (const r of [...map.patrols, ...(map.walks ?? [])]) {
    const pose = patrolPose(r, 0);
    const facing =
      Math.abs(Math.cos(pose.facing)) > 0.7
        ? Math.cos(pose.facing) < 0
          ? "left"
          : "right"
        : Math.sin(pose.facing) < 0
          ? "up"
          : "down";
    who(r.walker, pose.x, pose.y + 4, facing, "walk");
  }
  return { ...(map.scene as SceneDef), objects: [...(map.scene.objects ?? []), ...people] };
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
    const img = renderScene(peopled(map), meta, pixels, 0);
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
