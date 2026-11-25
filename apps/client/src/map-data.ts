/**
 * Loading maps for the world scene through the renderer (`render/`): what a map needs, loaded on
 * the scene's loader while the curtain is closing, and a few maps kept loaded so walking back
 * through a door is instant. The collision a room walks on is the map's own with doors to
 * unbuilt maps shut, exactly as the server makes it.
 */
import type { BuiltMap } from "@guago/content";
import { type Collidable, shutDoors } from "@guago/shared";
import * as Phaser from "phaser";
import { artMetadata, KEYS, mapAtlases, mapData } from "./render/assets.ts";
import { loadMap, unloadMap } from "./render/index.ts";

/** Maps kept loaded: the one the player is on and the last two they left. */
const KEEP = 3;

const walls = new Map<string, Collidable>();
const recent: string[] = [];

/** Whether everything map `id` draws with is in the scene's caches. */
export function mapReady(scene: Phaser.Scene, id: string): boolean {
  const { cache, textures } = scene;
  if (!cache.json.exists(KEYS.meta) || !cache.json.exists(KEYS.map(id))) return false;
  if (!textures.exists(KEYS.ground(id)) || !textures.exists(KEYS.masks(id))) return false;
  const map = cache.json.get(KEYS.map(id)) as BuiltMap;
  return mapAtlases(artMetadata(scene), map).every((a) => textures.exists(a));
}

const loading = new Map<string, Promise<BuiltMap>>();

/** Loads map `id` if it is not yet; resolves with it once it can be drawn at once. */
export function ensureMap(scene: Phaser.Scene, id: string): Promise<BuiltMap> {
  if (mapReady(scene, id)) return Promise.resolve(mapData(scene, id));
  const pending = loading.get(id);
  if (pending) return pending;
  const load = scene.load;
  const p = new Promise<BuiltMap>((resolve, reject) => {
    const check = () => {
      if (mapReady(scene, id)) {
        off();
        resolve(mapData(scene, id));
      }
    };
    const done = () => {
      check();
      if (!loading.has(id)) return;
      // The atlases are queued once the map's JSON is in; a finished run may need another.
      loadMap(scene, id);
      if (load.list.size > 0) load.start();
      else {
        off();
        reject(new Error(`map ${id} did not load`));
      }
    };
    const off = () => {
      loading.delete(id);
      load.off(Phaser.Loader.Events.FILE_COMPLETE, check);
      load.off(Phaser.Loader.Events.COMPLETE, done);
    };
    load.on(Phaser.Loader.Events.FILE_COMPLETE, check);
    load.on(Phaser.Loader.Events.COMPLETE, done);
    loadMap(scene, id);
    if (!load.isLoading()) load.start();
  });
  loading.set(id, p);
  return p;
}

/** Records that the player is on `id` now and lets go of maps left long enough ago. */
export function enteredMap(scene: Phaser.Scene, id: string): void {
  const i = recent.indexOf(id);
  if (i >= 0) recent.splice(i, 1);
  recent.unshift(id);
  while (recent.length > KEEP) {
    const old = recent.pop() as string;
    unloadMap(scene, old, recent);
  }
}

/** What the player's prediction walks on in `map`. */
export function roomCollision(map: BuiltMap): Collidable {
  let c = walls.get(map.id);
  if (!c) {
    c = { collision: shutDoors(map.collision, map.portals) };
    walls.set(map.id, c);
  }
  return c;
}
