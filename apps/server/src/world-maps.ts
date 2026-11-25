/**
 * The maps the server runs (PLAN §10): every built map by id, where a character may stand, and
 * who of the cast stands where. Built once at start from the map sources, the same data the art
 * build writes for the client.
 */
import { type BuiltMap, buildAllMaps, CAST_ART, narrative, storyPlaces } from "@guago/content";
import {
  type Collidable,
  type Facing,
  facingOf,
  inArea,
  overlapsSolid,
  PLAYER_RADIUS,
  shutDoors,
  TILE_SIZE,
} from "@guago/shared";

const MAPS: ReadonlyMap<string, BuiltMap> = new Map(buildAllMaps().map((r) => [r.map.id, r.map]));

/** Where the story starts. Until the opening sequence is built, new characters stand here. */
export const START_MAP = "campus-yard";
/** Where 명령퇴사 sends a player (PLAN §11) until the living world lets them back. */
export const HOME_MAP = "home";
/** Interactables that are the 급식 counter: using one eats (PLAN §11 급식). */
export const MEAL_COUNTERS: ReadonlySet<string> = new Set(["serving-line"]);
/** Interactables that are 졸방대: standing in reach of one clears 졸음 (PLAN §11). */
export const isDesk = (id: string): boolean => /^standing-desk(-\d+)?$/.test(id);
/** Interactables that are places of their own in the story (the codex's 매점 게시판). */
export const PLACE_THINGS: ReadonlySet<string> = new Set(["corkboard"]);

if (!MAPS.get(START_MAP)?.spawns.main)
  throw new Error(`map ${START_MAP} with a main spawn is missing`);

export function builtMap(id: string): BuiltMap | undefined {
  return MAPS.get(id);
}

export function allMaps(): readonly BuiltMap[] {
  return [...MAPS.values()];
}

/** The collision a room of `map` walks on: its own, with doors to unbuilt maps shut. */
const walls = new Map<string, Collidable>();
export function roomCollision(map: BuiltMap): Collidable {
  let c = walls.get(map.id);
  if (!c) {
    c = { collision: shutDoors(map.collision, map.portals) };
    walls.set(map.id, c);
  }
  return c;
}

export interface Place {
  readonly map: BuiltMap;
  readonly x: number;
  readonly y: number;
  readonly facing: Facing;
}

function mainOf(map: BuiltMap): Place {
  const s = map.spawns.main;
  if (!s) throw new Error(`map ${map.id} has no main spawn`);
  return { map, x: s.x, y: s.y, facing: facingOf(s.facing) };
}

/** Where a new character stands. */
export function startPlace(): Place {
  return mainOf(MAPS.get(START_MAP) as BuiltMap);
}

/** Pixels a blocked spot may be moved to find room for the feet. */
const NUDGE_PX = 12;

/** The spot, or the nearest one within a few pixels where the feet fit. */
function clearSpot(map: BuiltMap, x: number, y: number): { x: number; y: number } | undefined {
  if (!Number.isFinite(x) || !Number.isFinite(y) || x <= 0 || y <= 0) return undefined;
  if (x >= map.w * TILE_SIZE || y >= map.h * TILE_SIZE) return undefined;
  const walls = roomCollision(map);
  for (let r = 0; r <= NUDGE_PX; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (!overlapsSolid(walls, x + dx, y + dy, PLAYER_RADIUS)) return { x: x + dx, y: y + dy };
      }
    }
  }
  return undefined;
}

/**
 * A saved place made valid: the spot itself when its map is built and the feet fit there (or
 * fit a few pixels off), else that map's main spawn, else the start.
 */
export function validPlace(mapId: string, x: number, y: number): Place {
  const map = MAPS.get(mapId);
  if (!map) return startPlace();
  const spot = clearSpot(map, x, y);
  return spot ? { map, ...spot, facing: facingOf("down") } : mainOf(map);
}

/**
 * The map a character belongs on by its durable record: the 집 while sent home, else where it
 * was saved (made valid), and never the 집 once the time is up. Entering seats a character there,
 * and a room takes only a character that belongs on it at the moment of joining.
 */
export function belongsOn(
  saved: { readonly mapId: string; readonly x: number; readonly y: number },
  sentHome: boolean,
): string {
  if (sentHome) return HOME_MAP;
  const map = validPlace(saved.mapId, saved.x, saved.y).map.id;
  return map === HOME_MAP ? START_MAP : map;
}

/** A spawn of `map` by name, nudged clear of walls, else its main spawn. */
export function spawnPlace(map: BuiltMap, name: string): Place {
  const s = map.spawns[name];
  const spot = s && clearSpot(map, s.x, s.y);
  return s && spot ? { map, ...spot, facing: facingOf(s.facing) } : mainOf(map);
}

// The cast -----------------------------------------------------------------------------------

/**
 * The story's clock. Barks and who is around switch on it (PLAN §10 page lifecycle); it is a
 * constant until server-wide state exists.
 */
export const MILESTONE: narrative.Milestone = "p1.open";

const ORDER: readonly string[] = narrative.MILESTONES;
const reached = (m: string) => ORDER.indexOf(m) <= ORDER.indexOf(MILESTONE);
const current = (b: narrative.Bark) => reached(b.from) && (!b.until || !reached(b.until));

export interface Npc {
  /** Key in `MapState.npcs`. */
  readonly key: string;
  readonly speaker: string;
  readonly x: number;
  readonly y: number;
  readonly facing: Facing;
  /** Text keys of what this person says here now; empty for someone who does not talk. */
  readonly lines: readonly string[];
}

/** Ids of every place a bark can name that exists: maps, the rooms inside them, their story ids. */
const builtPlaces = new Set(
  allMaps().flatMap((m) =>
    [m.id, ...m.zones.filter((z) => z.kind === "room").map((z) => z.id)].flatMap(storyPlaces),
  ),
);

/** The places a point stands in: its map and any room zone around it, with their story ids. */
export function placesAt(map: BuiltMap, x: number, y: number): string[] {
  return [
    map.id,
    ...map.zones.filter((z) => z.kind === "room" && inArea(z.rect, x, y)).map((z) => z.id),
  ].flatMap(storyPlaces);
}

/**
 * Who stands where, decided once for the whole hub. A cast member stands somewhere only with a
 * body in the cast table (`CAST_ART`; a voice like the school broadcast never does), and only
 * once their barks have begun at the current milestone (or when they have none, like the cat).
 * Each stands at one spot: the spot in their home, else in the place their barks name, else the
 * first spot the maps list for them. There they say the lines of that place and of places not
 * built yet, or, when none are left, every line they have now.
 */
function cast(): Map<string, Npc[]> {
  const barks = narrative.NARRATIVE.barks;
  const spots = allMaps().flatMap((map) =>
    map.npcs.map((n, i) => ({ map, index: i, spot: n, places: placesAt(map, n.x, n.y) })),
  );
  const out = new Map<string, Npc[]>(allMaps().map((m) => [m.id, []]));
  for (const speaker of new Set(spots.map((s) => s.spot.speaker))) {
    const own = barks.filter((b) => b.speaker === speaker);
    const now = own.filter(current);
    if (!CAST_ART[speaker] || (own.length > 0 && now.length === 0)) continue;
    const mine = spots.filter((s) => s.spot.speaker === speaker);
    const named = new Set(now.flatMap((b) => (b.where ? [b.where] : [])));
    const lives = CAST_ART[speaker]?.home;
    const home =
      (lives ? mine.find((s) => s.places.includes(lives)) : undefined) ??
      mine.find((s) => s.places.some((p) => named.has(p))) ??
      mine[0];
    if (!home) continue;
    const here = now.filter(
      (b) => !b.where || home.places.includes(b.where) || !builtPlaces.has(b.where),
    );
    const lines = (here.length > 0 ? here : now).map((b) => b.text);
    out.get(home.map.id)?.push({
      key: String(home.index),
      speaker,
      x: home.spot.x,
      y: home.spot.y,
      facing: facingOf(home.spot.facing),
      lines,
    });
  }
  return out;
}

const CAST = cast();

/** The cast members standing on `map` now. */
export function npcsOf(map: BuiltMap): readonly Npc[] {
  return CAST.get(map.id) ?? [];
}

/** A notice's or a lore object's description by its id, as narrative keys. */
export function describe(id: string): { name: string; desc: string } | undefined {
  const d = narrative.NARRATIVE.descriptions.find((x) => x.id === id);
  return d && { name: d.name, desc: d.desc };
}
