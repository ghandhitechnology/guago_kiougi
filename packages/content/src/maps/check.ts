import { isSolidTile, type TileCollision } from "@guago/shared";
import { CUTSCENES } from "../narrative/cutscenes.ts";
import { OPENING } from "../narrative/opening.ts";
import type { Cutscene } from "../narrative/schema.ts";
import { SPEAKERS } from "../narrative/speakers.ts";
import { stageMapOf } from "../stages.ts";
import type { BuildResult } from "./build.ts";
import type { BuiltMap, TileRect } from "./format.ts";
import type { Actor, Decal, Doll, Prop } from "./layers.ts";
import { clearLine } from "./patrols.ts";

/**
 * The parts of the art build's metadata (`art.json`) a map is checked against. The art
 * package's `ArtMetadata` has this shape and more.
 */
export interface ArtIndex {
  readonly themes: readonly string[];
  readonly palette: { readonly ramps: Readonly<Record<string, Readonly<Record<string, string>>>> };
  readonly sprites: Readonly<
    Record<
      string,
      { readonly frames: readonly string[]; readonly anims: Readonly<Record<string, unknown>> }
    >
  >;
  readonly rigs: Readonly<
    Record<
      string,
      {
        readonly looks: Readonly<Record<string, unknown>>;
        readonly anims: Readonly<Record<string, unknown>>;
        readonly frames: readonly string[];
      }
    >
  >;
  readonly tilesets: Readonly<
    Record<
      string,
      {
        readonly upper: string;
        readonly lower: string;
        readonly decals: readonly { readonly frame: string }[];
        /** Theme atlases holding its tiles; null or absent for every theme. */
        readonly bake?: readonly string[] | null;
      }
    >
  >;
  readonly overlays: Readonly<Record<string, { readonly bake?: readonly string[] | null }>>;
}

export interface MapRegistry {
  /** Ids of maps that exist, with their spawn names. */
  readonly built: ReadonlyMap<string, readonly string[]>;
  /** Ids of maps other maps may link to before they exist. */
  readonly planned: ReadonlySet<string>;
}

/** Walkable tiles reachable from a tile over the four sides. 1 per reached tile, row major. */
export function reach(grid: TileCollision, from: readonly [number, number]): Uint8Array {
  const { w, h } = grid;
  const map = { collision: grid };
  const seen = new Uint8Array(w * h);
  const [fx, fy] = from;
  if (isSolidTile(map, fx, fy)) return seen;
  const stack = [fy * w + fx];
  seen[fy * w + fx] = 1;
  while (stack.length > 0) {
    const i = stack.pop() as number;
    const x = i % w;
    const y = (i - x) / w;
    for (const [nx, ny] of [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ] as const) {
      if (isSolidTile(map, nx, ny)) continue;
      const j = ny * w + nx;
      if (seen[j]) continue;
      seen[j] = 1;
      stack.push(j);
    }
  }
  return seen;
}

/** Walkable tiles that are not part of any 2×2 walkable square: one-tile squeezes. */
export function narrowTiles(grid: TileCollision): [number, number][] {
  const map = { collision: grid };
  const open = (x: number, y: number) => !isSolidTile(map, x, y);
  const out: [number, number][] = [];
  for (let y = 0; y < grid.h; y++) {
    for (let x = 0; x < grid.w; x++) {
      if (!open(x, y)) continue;
      const fits = [
        [0, 0],
        [-1, 0],
        [0, -1],
        [-1, -1],
      ].some(([dx, dy]) => {
        const ax = x + (dx as number);
        const ay = y + (dy as number);
        return open(ax, ay) && open(ax + 1, ay) && open(ax, ay + 1) && open(ax + 1, ay + 1);
      });
      if (!fits) out.push([x, y]);
    }
  }
  return out;
}

function tilesOf(r: TileRect): [number, number][] {
  const out: [number, number][] = [];
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) out.push([x, y]);
  return out;
}

function list(cells: readonly [number, number][], max = 6): string {
  const shown = cells.slice(0, max).map(([x, y]) => `${x},${y}`);
  return cells.length > max ? `${shown.join(" ")} and ${cells.length - max} more` : shown.join(" ");
}

/** Every problem with a built map, as readable lines. Empty means the map is good. */
export function checkMap(result: BuildResult, art: ArtIndex, registry: MapRegistry): string[] {
  const { map, footprints } = result;
  const where = `map ${map.id}`;
  const out: string[] = [];
  const say = (msg: string) => out.push(`${where}: ${msg}`);
  const scene = map.scene;

  // Art references.
  const themes = new Set(art.themes);
  const colour = (name: string) => {
    const [ramp, step] = name.split(".");
    return art.palette.ramps[ramp ?? ""]?.[step ?? ""] !== undefined;
  };
  const terrains = new Set(Object.values(art.tilesets).flatMap((t) => [t.upper, t.lower]));
  const decals = new Set(Object.values(art.tilesets).flatMap((t) => t.decals.map((d) => d.frame)));
  if (!themes.has(scene.theme)) say(`theme ${scene.theme} is not built`);
  if (scene.sky && !colour(scene.sky)) say(`sky ${scene.sky} is not a palette colour`);
  if (scene.shade && !themes.has(scene.shade)) say(`shade theme ${scene.shade} is not built`);
  for (const [ch, cell] of Object.entries(scene.legend)) {
    if (cell.terrain !== null && !terrains.has(cell.terrain))
      say(`legend "${ch}": no terrain pair has ${cell.terrain}`);
    if (cell.theme && !themes.has(cell.theme))
      say(`legend "${ch}": theme ${cell.theme} is not built`);
  }
  const sprite = (layer: string, t: Prop | Actor) => {
    const name = "prop" in t ? t.prop : t.actor;
    const s = art.sprites[name];
    if (!s) return say(`${layer}: no sprite ${name}`);
    if (t.frame && !s.frames.includes(`${name}/${t.frame}`))
      say(`${layer}: ${name} has no frame ${t.frame}`);
    if (t.anim && !(t.anim in s.anims)) say(`${layer}: ${name} has no animation ${t.anim}`);
    if ("actor" in t && t.shadow) {
      const owner = art.sprites[t.shadow.split("/")[0] ?? ""];
      if (!owner?.frames.includes(t.shadow)) say(`${layer}: no shadow frame ${t.shadow}`);
    }
  };
  const doll = (layer: string, d: Doll) => {
    const r = art.rigs[d.rig];
    if (!r) return say(`${layer}: no rig ${d.rig}`);
    if (d.look && !(d.look in r.looks)) say(`${layer}: ${d.rig} has no look ${d.look}`);
    if (d.anim && !(d.anim in r.anims)) say(`${layer}: ${d.rig} has no animation ${d.anim}`);
    if (d.frame && !r.frames.includes(d.frame)) say(`${layer}: ${d.rig} has no frame ${d.frame}`);
  };
  const decal = (layer: string, d: Decal) => {
    if (!decals.has(d.decal)) say(`${layer}: no decal ${d.decal}`);
  };
  for (const p of scene.backdrop ?? []) sprite("backdrop", p);
  for (const d of scene.details ?? []) "decal" in d ? decal("details", d) : sprite("details", d);
  for (const s of scene.shadows ?? []) if ("prop" in s) sprite("shadows", s);
  for (const o of scene.objects) "rig" in o ? doll("objects", o) : sprite("objects", o);
  for (const p of scene.overhead ?? []) sprite("overhead", p);
  for (const a of scene.atmosphere ?? []) sprite("atmosphere", a);
  for (const e of scene.edges ?? []) {
    for (const o of typeof e.overlay === "string" ? [e.overlay] : e.overlay)
      if (!(o in art.overlays)) say(`edges: no overlay ${o}`);
  }
  for (const e of scene.emitters ?? []) {
    const s = art.sprites[e.sprite];
    if (!s) say(`emitters: no sprite ${e.sprite}`);
    else if (e.anim && !(e.anim in s.anims))
      say(`emitters: ${e.sprite} has no animation ${e.anim}`);
  }
  // Baking: every terrain and overlay the map draws is in the atlas of every theme it paints
  // with (its theme, its shade, cell themes and each light band).
  const painted = new Set<string>([scene.theme]);
  if (scene.shade) painted.add(scene.shade);
  for (const cell of Object.values(scene.legend)) if (cell.theme) painted.add(cell.theme);
  for (const l of scene.lights ?? []) for (const b of l.bands) painted.add(b);
  const used = new Set(Object.values(scene.legend).flatMap((c) => (c.terrain ? [c.terrain] : [])));
  const unbaked = (name: string, bake: readonly string[] | null | undefined) => {
    for (const t of painted)
      if (bake && !bake.includes(t)) say(`${name} is not baked into theme ${t}`);
  };
  for (const [name, set] of Object.entries(art.tilesets))
    if (used.has(set.upper) || used.has(set.lower)) unbaked(name, set.bake);
  for (const e of scene.edges ?? [])
    for (const o of typeof e.overlay === "string" ? [e.overlay] : e.overlay)
      unbaked(o, art.overlays[o]?.bake);
  if (!colour(map.ambient.color)) say(`ambient ${map.ambient.color} is not a palette colour`);
  if (map.ambient.sun && !colour(map.ambient.sun.color))
    say(`ambient: sun ${map.ambient.sun.color} is not a palette colour`);
  if (map.ambient.unlit && !themes.has(map.ambient.unlit))
    say(`ambient: unlit theme ${map.ambient.unlit} is not built`);
  map.lights.forEach((l, i) => {
    if (!colour(l.color)) say(`light ${i + 1}: ${l.color} is not a palette colour`);
    for (const b of l.paint?.bands ?? [])
      if (!themes.has(b)) say(`light ${i + 1}: theme ${b} is not built`);
  });

  // Places.
  const grid = map.collision;
  const solid = (x: number, y: number) => isSolidTile(map, x, y);
  const inBounds = (r: TileRect) =>
    r.x >= 0 && r.y >= 0 && r.x + r.w <= map.w && r.y + r.h <= map.h;
  const main = map.spawns.main;
  if (!main) say("has no main spawn");
  const tileOf = (s: { x: number; y: number }): [number, number] => [
    Math.floor(s.x / 16),
    Math.floor(s.y / 16),
  ];
  for (const [name, s] of Object.entries(map.spawns)) {
    const [tx, ty] = tileOf(s);
    if (solid(tx, ty)) say(`spawn ${name} at tile ${tx},${ty} is not walkable`);
  }
  const reached = main ? reach(grid, tileOf(main)) : new Uint8Array(map.w * map.h);
  const lost: [number, number][] = [];
  for (let y = 0; y < map.h; y++)
    for (let x = 0; x < map.w; x++) if (!solid(x, y) && !reached[y * map.w + x]) lost.push([x, y]);
  if (lost.length > 0) say(`walkable tiles the main spawn cannot reach: ${list(lost)}`);
  const narrow = narrowTiles(grid);
  if (narrow.length > 0) say(`paths narrower than 2 tiles at ${list(narrow)}`);

  const ids = new Set<string>();
  const unique = (kind: string, id: string) => {
    if (ids.has(id)) say(`${kind} id ${id} is used twice`);
    ids.add(id);
  };
  for (const p of map.portals) {
    unique("portal", p.id);
    if (!inBounds(p.rect)) say(`portal ${p.id} reaches past the map`);
    const target = registry.built.get(p.to);
    if (!target && !registry.planned.has(p.to))
      say(`portal ${p.id} leads to ${p.to}, which is neither built nor planned`);
    if (target && !target.includes(p.spawn)) say(`portal ${p.id}: ${p.to} has no spawn ${p.spawn}`);
    const tiles = tilesOf(p.rect);
    const blocked = tiles.filter(([x, y]) => footprints.has(y * map.w + x));
    if (blocked.length > 0) say(`portal ${p.id} is blocked by a prop at ${list(blocked)}`);
    const shut = tiles.filter(([x, y]) => solid(x, y));
    if (shut.length > 0) say(`portal ${p.id} covers solid tiles at ${list(shut)}`);
    if (!tiles.some(([x, y]) => reached[y * map.w + x])) say(`portal ${p.id} cannot be reached`);
  }
  for (const t of map.interactables) {
    unique("interactable", t.id);
    if (!inBounds(t.rect)) say(`interactable ${t.id} reaches past the map`);
    const near = tilesOf({ x: t.rect.x - 1, y: t.rect.y - 1, w: t.rect.w + 2, h: t.rect.h + 2 });
    if (
      !near.some(([x, y]) => x >= 0 && y >= 0 && x < map.w && y < map.h && reached[y * map.w + x])
    )
      say(`interactable ${t.id} cannot be reached`);
  }
  for (const z of map.zones) {
    unique("zone", z.id);
    if (!inBounds(z.rect)) say(`zone ${z.id} reaches past the map`);
    if (z.kind === "monsters" && !art.sprites[z.monster])
      say(`zone ${z.id}: no monster sprite ${z.monster}`);
  }
  // Scene marks and cast spots.
  for (const [name, m] of Object.entries(map.marks)) {
    const [tx, ty] = tileOf(m);
    if (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h) say(`mark ${name} is outside the map`);
  }
  const speakers = new Set(SPEAKERS.map((s) => s.id));
  for (const n of map.npcs) {
    const [tx, ty] = tileOf(n);
    if (!speakers.has(n.speaker)) say(`npc spot for ${n.speaker}: no such speaker`);
    if (solid(tx, ty) || !reached[ty * map.w + tx])
      say(`npc spot for ${n.speaker} at tile ${tx},${ty} is not walkable from the main spawn`);
  }
  // Patrols: every waypoint walkable and reached, every leg a clear straight walk.
  for (const p of map.patrols) {
    unique("patrol", p.id);
    if (!speakers.has(p.walker) && !art.sprites[p.walker])
      say(`patrol ${p.id}: no speaker or sprite ${p.walker}`);
    if (p.route.length < 2) say(`patrol ${p.id} needs two waypoints`);
    if (!(p.speed > 0) || !(p.cone.length > 0) || !(p.cone.angle > 0 && p.cone.angle <= 360))
      say(`patrol ${p.id}: speed, cone length and angle must be positive`);
    p.route.forEach((w, i) => {
      const [tx, ty] = tileOf(w);
      if (solid(tx, ty) || !reached[ty * map.w + tx])
        say(`patrol ${p.id} waypoint ${i} at tile ${tx},${ty} is not walkable from the main spawn`);
      const next = p.route[i + 1] ?? (p.loop === "cycle" ? p.route[0] : undefined);
      if (next && next !== w && !clearLine(map, w.x, w.y, next.x, next.y))
        say(`patrol ${p.id} leg ${i} walks through something solid`);
    });
  }
  for (const a of map.arenas) {
    unique("arena", a.id);
    if (!inBounds(a.rect)) say(`arena ${a.id} reaches past the map`);
    const shut = tilesOf(a.rect).filter(([x, y]) => solid(x, y));
    if (shut.length > 0) say(`arena ${a.id} is not open floor at ${list(shut)}`);
  }
  return out;
}

/** Every scene the story stages: the cutscenes and the opening's beats. */
const SCENES: readonly Cutscene[] = [...CUTSCENES, ...OPENING.map((b) => b.scene)];

/**
 * The map a scene is staged on: one built with that id, or one with a room zone of that id (a
 * scene staged in `study-hall` plays in the map that names that room).
 */
export function sceneMap(maps: readonly BuiltMap[], place: string): BuiltMap | undefined {
  return stageMapOf(maps, place);
}

/**
 * Every scene staged on a built map finds the marks it names there, and every mark it walks the
 * player to is walkable. Other marks may be solid: a camera on the clock, the cat on a sill.
 */
export function checkScenes(maps: readonly BuiltMap[], scenes = SCENES): string[] {
  const out: string[] = [];
  for (const c of scenes) {
    const map = sceneMap(maps, c.map);
    if (!map) continue;
    const say = (msg: string) => out.push(`map ${map.id}: scene ${c.id} ${msg}`);
    for (const mark of c.marks) if (!(mark in map.marks)) say(`needs mark ${mark}`);
    for (const step of c.steps) {
      if (step.do !== "move" || step.actor !== "player") continue;
      const m = map.marks[step.to];
      if (m && isSolidTile(map, Math.floor(m.x / 16), Math.floor(m.y / 16)))
        say(`moves ${step.actor} to mark ${step.to}, which is solid`);
    }
  }
  return out;
}

/** A built map reduced to what a check needs from other maps. */
export function spawnNames(map: BuiltMap): string[] {
  return Object.keys(map.spawns);
}
