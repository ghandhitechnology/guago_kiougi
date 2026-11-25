/**
 * Paints whole maps off the main thread with the contact sheet's renderer, so warming the maps
 * next door never costs a frame. Two images per map: everything under the players, and what
 * stands over them (overhead art, atmosphere), as the pixels the full paint adds on top.
 * Part of the stand-in map drawing (`map-draw.ts`).
 */
import type { SceneDef } from "@guago/content";
import { renderScene, type SceneAtlas, type SceneMeta } from "../../../packages/art/src/scene.ts";

export interface BakeInit {
  readonly t: "init";
  readonly meta: SceneMeta;
  readonly atlases: readonly {
    readonly name: string;
    readonly png: string;
    readonly json: string;
  }[];
}
export interface BakeRequest {
  readonly t: "bake";
  readonly id: string;
  readonly def: SceneDef;
}
export interface BakeResult {
  readonly id: string;
  readonly under: ImageBitmap;
  readonly over: ImageBitmap | null;
  readonly ms: number;
}

const scope = self as unknown as {
  addEventListener(type: "message", fn: (e: MessageEvent<BakeInit | BakeRequest>) => void): void;
  postMessage(message: unknown, transfer: Transferable[]): void;
};

let meta: SceneMeta | undefined;
let ready: Promise<Map<string, SceneAtlas>> | undefined;

async function loadAtlas(png: string, json: string): Promise<SceneAtlas> {
  const [bitmap, frames] = await Promise.all([
    fetch(png)
      .then((r) => r.blob())
      .then((b) => createImageBitmap(b)),
    fetch(json)
      .then((r) => r.json())
      .then((j: { frames: SceneAtlas["frames"] }) => j.frames),
  ]);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d") as OffscreenCanvasRenderingContext2D;
  ctx.drawImage(bitmap, 0, 0);
  const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
  return { w: bitmap.width, h: bitmap.height, data, frames };
}

function bitmap(w: number, h: number, data: Uint8ClampedArray<ArrayBuffer>): ImageBitmap {
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d") as OffscreenCanvasRenderingContext2D;
  ctx.putImageData(new ImageData(data, w, h), 0, 0);
  return canvas.transferToImageBitmap();
}

async function bake(req: BakeRequest): Promise<void> {
  const atlases = await (ready as Promise<Map<string, SceneAtlas>>);
  const start = performance.now();
  const def = req.def;
  const full = renderScene(def, meta as SceneMeta, atlases, 0);
  const base = renderScene(
    { ...def, overhead: [], atmosphere: [], emitters: [] },
    meta as SceneMeta,
    atlases,
    0,
  );
  const { w, h } = full;
  const over = new Uint8ClampedArray(w * h * 4);
  let any = false;
  for (let i = 0; i < w * h * 4; i += 4) {
    if (
      full.data[i] === base.data[i] &&
      full.data[i + 1] === base.data[i + 1] &&
      full.data[i + 2] === base.data[i + 2] &&
      full.data[i + 3] === base.data[i + 3]
    ) {
      continue;
    }
    over[i] = full.data[i] as number;
    over[i + 1] = full.data[i + 1] as number;
    over[i + 2] = full.data[i + 2] as number;
    over[i + 3] = full.data[i + 3] as number;
    any = true;
  }
  const under = bitmap(w, h, new Uint8ClampedArray(base.data));
  const top = any ? bitmap(w, h, over) : null;
  const result: BakeResult = { id: req.id, under, over: top, ms: performance.now() - start };
  scope.postMessage(result, top ? [under, top] : [under]);
}

scope.addEventListener("message", (e) => {
  const m = e.data;
  if (m.t === "init") {
    meta = m.meta;
    ready = Promise.all(
      m.atlases.map(async (a) => [a.name, await loadAtlas(a.png, a.json)] as const),
    ).then((list) => new Map(list));
    return;
  }
  void bake(m);
});
