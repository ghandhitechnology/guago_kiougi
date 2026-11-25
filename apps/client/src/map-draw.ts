/**
 * Stand-in map drawing until the lit map renderer (`render/`, the world renderer lane) lands:
 * each map is painted whole by the contact sheet's renderer in a worker, once, then shown as
 * two images, the ground and everything on it under the players and the overhead art over
 * them. Props do not sort against players yet and nothing is lit live.
 *
 * The world scene only calls `warmMap` and `showMap`; swapping in the renderer means
 * replacing this file and those two calls (`MapView.create`, `addEntity` for actors).
 */
import type { ArtMetadata } from "@guago/art";
import type { BuiltMap } from "@guago/content";
import type * as Phaser from "phaser";
import type { BakeInit, BakeRequest, BakeResult } from "./map-bake.worker.ts";

/** Depth of what stands over the players: above every entity, under bubbles and prompts. */
export const OVERHEAD_DEPTH = 100_000;

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

let worker: Worker | undefined;
const waiting = new Map<string, (r: BakeResult) => void>();
const baked = new Map<string, Promise<void>>();

const keyOf = (id: string, layer: "under" | "over") => `map-${layer}:${id}`;

function start(meta: ArtMetadata): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("./map-bake.worker.ts", import.meta.url), { type: "module" });
  worker.addEventListener("message", (e: MessageEvent<BakeResult>) => {
    waiting.get(e.data.id)?.(e.data);
    waiting.delete(e.data.id);
  });
  const init: BakeInit = {
    t: "init",
    meta: meta as unknown as BakeInit["meta"],
    atlases: meta.atlases.map((name) => ({
      name,
      png: url(`${name}.png`),
      json: url(`${name}.json`),
    })),
  };
  worker.postMessage(init);
  return worker;
}

function addTexture(scene: Phaser.Scene, key: string, image: ImageBitmap): void {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  (canvas.getContext("2d") as CanvasRenderingContext2D).drawImage(image, 0, 0);
  image.close();
  scene.textures.addCanvas(key, canvas);
}

/** Paints `map` if it has not been yet; resolves once it can be shown at once. */
export function warmMap(scene: Phaser.Scene, meta: ArtMetadata, map: BuiltMap): Promise<void> {
  let p = baked.get(map.id);
  if (p) return p;
  const w = start(meta);
  p = new Promise<void>((resolve) => {
    waiting.set(map.id, (r) => {
      addTexture(scene, keyOf(map.id, "under"), r.under);
      if (r.over) addTexture(scene, keyOf(map.id, "over"), r.over);
      if (import.meta.env.DEV) console.debug(`painted ${map.id} in ${Math.round(r.ms)} ms`);
      resolve();
    });
  });
  baked.set(map.id, p);
  w.postMessage({ t: "bake", id: map.id, def: map.scene } satisfies BakeRequest);
  return p;
}

export interface MapView {
  readonly map: BuiltMap;
  destroy(): void;
}

/** Shows a warmed map: its ground under everything, its overhead art over the players. */
export function showMap(scene: Phaser.Scene, map: BuiltMap): MapView {
  const objects: Phaser.GameObjects.Image[] = [];
  const under = keyOf(map.id, "under");
  const over = keyOf(map.id, "over");
  if (scene.textures.exists(under))
    objects.push(scene.add.image(0, 0, under).setOrigin(0).setDepth(0));
  if (scene.textures.exists(over)) {
    objects.push(scene.add.image(0, 0, over).setOrigin(0).setDepth(OVERHEAD_DEPTH));
  }
  return {
    map,
    destroy: () => {
      for (const o of objects) o.destroy();
    },
  };
}
