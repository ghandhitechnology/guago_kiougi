/**
 * Loading maps for the world scene through the renderer (`render/`): what a map needs, loaded on
 * the scene's loader while the curtain is closing, and a few maps kept loaded so walking back
 * through a door is instant. The collision a room walks on is the map's own with doors to
 * unbuilt maps shut, exactly as the server makes it.
 */
import type { ArtMetadata } from "@guago/art";
import { type BuiltMap, CAST_ART } from "@guago/content";
import { type Collidable, shutDoors } from "@guago/shared";
import * as Phaser from "phaser";
import { loadArt } from "./art.ts";
import { artMetadata, KEYS, mapAtlases, mapData } from "./render/assets.ts";
import { loadMap, unloadMap } from "./render/index.ts";
import { storyAtlases } from "./story/atlases.ts";

/** Maps kept loaded: the one the player is on and the last two they left. */
const KEEP = 3;

const recent: string[] = [];

/**
 * Atlases the people a map can hold are drawn from: its cast spots, its patrols' and its walks'
 * walkers, and what the story's scenes staged on it bring.
 */
function castAtlases(meta: ArtMetadata, map: BuiltMap): string[] {
  const out = new Set<string>(storyAtlases(meta, map));
  const people = [
    ...map.npcs.map((n) => n.speaker),
    ...map.patrols.map((p) => p.walker),
    ...map.walks.map((w) => w.walker),
  ];
  for (const who of people) {
    const cast = CAST_ART[who];
    const atlas =
      cast?.kind === "rig" ? meta.rigs[cast.art]?.atlas : meta.sprites[cast?.art ?? ""]?.atlas;
    if (atlas) out.add(atlas);
  }
  return [...out];
}

/** Whether everything map `id` draws with is in the scene's caches, its people included. */
export function mapReady(scene: Phaser.Scene, id: string): boolean {
  const { cache, textures } = scene;
  if (!cache.json.exists(KEYS.meta) || !cache.json.exists(KEYS.map(id))) return false;
  if (!textures.exists(KEYS.ground(id)) || !textures.exists(KEYS.masks(id))) return false;
  const map = cache.json.get(KEYS.map(id)) as BuiltMap;
  const meta = artMetadata(scene);
  return [...mapAtlases(meta, map), ...castAtlases(meta, map)].every((a) => textures.exists(a));
}

/** Queues the map's own art through the renderer, and its people's atlases once the map is in. */
function queue(scene: Phaser.Scene, id: string): void {
  loadMap(scene, id);
  const map = scene.cache.json.get(KEYS.map(id)) as BuiltMap | undefined;
  if (map && scene.cache.json.exists(KEYS.meta)) {
    loadArt(scene, { atlases: castAtlases(artMetadata(scene), map) });
  }
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
      queue(scene, id);
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
    queue(scene, id);
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

/**
 * What the player's prediction walks on in `map`: its walls with doors to unbuilt maps shut, and
 * those in `closed` (maps the Page clock has not opened). One object per stay on a map, whose
 * grid `shut` swaps when the server closes or opens a door, so the predictor sees it at once.
 */
export function wallsOf(
  map: BuiltMap,
  closed: ReadonlySet<string>,
): { collision: Collidable["collision"] } {
  return { collision: shutDoors(map.collision, map.portals, closed) };
}
