/**
 * Built maps as the art build wrote them (`packages/art/dist/maps/<id>.json`, the same data the
 * server builds from the map sources), fetched once each and kept. The collision a room walks
 * on is the map's own with doors to unbuilt maps shut, exactly as the server makes it.
 */
import type { BuiltMap } from "@guago/content";
import { type Collidable, shutDoors } from "@guago/shared";

const files = import.meta.glob<string>("../../../packages/art/dist/maps/*.json", {
  query: "?url",
  import: "default",
  eager: true,
});

function urlOf(id: string): string | undefined {
  return Object.entries(files).find(([path]) => path.endsWith(`/maps/${id}.json`))?.[1];
}

const loaded = new Map<string, Promise<BuiltMap>>();
const walls = new Map<string, Collidable>();

/** The built map `id`, fetched on first use. */
export function fetchMap(id: string): Promise<BuiltMap> {
  let p = loaded.get(id);
  if (!p) {
    const url = urlOf(id);
    if (!url) return Promise.reject(new Error(`no built map ${id}; run pnpm art:build`));
    p = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`map ${id}: ${r.status}`);
      return r.json() as Promise<BuiltMap>;
    });
    p.catch(() => loaded.delete(id));
    loaded.set(id, p);
  }
  return p;
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

/** Maps one door away, for warming before the player walks through. */
export function neighbours(map: BuiltMap): string[] {
  return [...new Set(map.portals.filter((p) => p.built).map((p) => p.to))];
}
