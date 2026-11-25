import type { ArtMetadata } from "@guago/art";
import { type BuiltMap, buildAllMaps } from "@guago/content";
import type * as Phaser from "phaser";
import { renderScene, type SceneAtlas, type SceneMeta } from "../../../packages/art/src/scene.ts";
import { GROUND_DEPTH } from "./ground.ts";

/**
 * Development only: `?map=<id>` puts the player on a built map before the layered map renderer
 * exists, to try movement and collision against real layouts. The map is drawn as one picture
 * under everyone, the way the contact sheet renders it; tall art does not sort with players.
 */
export function devMap(): BuiltMap | undefined {
  if (!import.meta.env.DEV) return undefined;
  const id = new URLSearchParams(location.search).get("map");
  return id ? buildAllMaps().find((r) => r.map.id === id)?.map : undefined;
}

const files = import.meta.glob<string>("../../../packages/art/dist/*.json", {
  query: "?url",
  import: "default",
  eager: true,
});

/** Draws a built map as one image; resolves once it is on screen. */
export async function drawDevMap(scene: Phaser.Scene, meta: ArtMetadata, map: BuiltMap) {
  const atlases = new Map<string, SceneAtlas>();
  for (const name of meta.atlases) {
    const url = Object.entries(files).find(([p]) => p.endsWith(`/${name}.json`))?.[1];
    if (!url || !scene.textures.exists(name)) continue;
    const json = (await (await fetch(url)).json()) as { frames: SceneAtlas["frames"] };
    const img = scene.textures.get(name).getSourceImage() as CanvasImageSource & {
      width: number;
      height: number;
    };
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext("2d") as CanvasRenderingContext2D;
    ctx.drawImage(img, 0, 0);
    const { data } = ctx.getImageData(0, 0, c.width, c.height);
    atlases.set(name, { w: c.width, h: c.height, data, frames: json.frames });
  }
  const pic = renderScene(map.scene, meta as unknown as SceneMeta, atlases, 0);
  const canvas = document.createElement("canvas");
  canvas.width = pic.w;
  canvas.height = pic.h;
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  ctx.putImageData(new ImageData(new Uint8ClampedArray(pic.data), pic.w, pic.h), 0, 0);
  scene.textures.addCanvas(`dev-map-${map.id}`, canvas);
  scene.add.image(0, 0, `dev-map-${map.id}`).setOrigin(0).setDepth(GROUND_DEPTH);
}
