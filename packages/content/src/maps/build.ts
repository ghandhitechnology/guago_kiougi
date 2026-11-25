import { TILE_SIZE, type TileCollision } from "@guago/shared";
import type {
  BuiltMap,
  Interactable,
  Layers,
  MapSource,
  Portal,
  Rule,
  Spawn,
  TileRect,
  Zone,
} from "./format.ts";
import type { Cell, Light, Prop, SceneDef } from "./layers.ts";
import { fractal } from "./noise.ts";
import { buildPatrol } from "./patrols.ts";
import { gridLines, parseStamp } from "./stamp.ts";

/** A map in the middle of being built: plan characters and collision per tile. */
export interface Draft {
  readonly w: number;
  readonly h: number;
  readonly ground: string[];
  readonly solid: string[];
}

/** Parses the plan into ground characters and the collision each implies. */
export function readPlan(src: Pick<MapSource, "id" | "plan" | "legend">): Draft {
  const rows = gridLines(src.plan);
  const w = rows[0]?.length ?? 0;
  const ground: string[] = [];
  const solid: string[] = [];
  rows.forEach((row, y) => {
    if (row.length !== w)
      throw new Error(`map ${src.id}: plan row ${y + 1} is ${row.length} wide, not ${w}`);
    for (const ch of row) {
      const cell = src.legend[ch];
      if (!cell)
        throw new Error(`map ${src.id}: "${ch}" in plan row ${y + 1} is not in the legend`);
      ground.push(ch);
      solid.push(solidOf(cell.terrain, cell.solid));
    }
  });
  return { w, h: rows.length, ground, solid };
}

function solidOf(terrain: string | null, solid: "#" | "~" | false | undefined): string {
  if (solid === false) return ".";
  if (solid) return solid;
  return terrain === null ? "~" : ".";
}

/**
 * Runs generator rules over the plan's ground characters. Pure: the same plan, seed and rules
 * always give the same ground.
 */
export function applyRules(
  draft: Draft,
  rules: readonly Rule[],
  seed: number,
  legend: MapSource["legend"],
): void {
  const { w, h, ground } = draft;
  rules.forEach((rule, k) => {
    const near = rule.near ? distanceTo(draft, rule.near.chars, rule.near.within) : null;
    const changed = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!rule.on.includes(ground[i] as string)) continue;
        const r = rule.inside;
        if (r && (x < r.x || y < r.y || x >= r.x + r.w || y >= r.y + r.h)) continue;
        if (near && (near[i] as number) > (rule.near?.within ?? 0)) continue;
        if (fractal(x, y, rule.scale, seed + 977 * (k + 1)) >= rule.threshold) changed[i] = 1;
      }
    }
    // Fray, never speckle: a changed cell needs two neighbours that are, or become, `to`.
    for (let pass = 0; pass < 2; pass++) {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          if (!changed[i]) continue;
          let n = 0;
          for (const [dx, dy] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ] as const) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const j = ny * w + nx;
            if (changed[j] || ground[j] === rule.to) n++;
          }
          if (n < 2) changed[i] = 0;
        }
      }
    }
    const to = legend[rule.to];
    if (!to) throw new Error(`rule ${k + 1}: "${rule.to}" is not in the legend`);
    for (let i = 0; i < w * h; i++) {
      if (!changed[i]) continue;
      ground[i] = rule.to;
      draft.solid[i] = solidOf(to.terrain, to.solid);
    }
  });
}

/** Chebyshev distance in tiles to the nearest cell holding one of `chars`, capped at `cap + 1`. */
function distanceTo(draft: Draft, chars: string, cap: number): Uint8Array {
  const { w, h, ground } = draft;
  const d = new Uint8Array(w * h).fill(cap + 1);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!chars.includes(ground[y * w + x] as string)) continue;
      for (let yy = Math.max(0, y - cap); yy <= Math.min(h - 1, y + cap); yy++) {
        for (let xx = Math.max(0, x - cap); xx <= Math.min(w - 1, x + cap); xx++) {
          const k = Math.max(Math.abs(xx - x), Math.abs(yy - y));
          const j = yy * w + xx;
          if (k < (d[j] as number)) d[j] = k;
        }
      }
    }
  }
  return d;
}

/** Every layer of `Layers` as a list being filled. */
type Lists = { -readonly [K in keyof Layers]-?: NonNullable<Layers[K]>[number][] };

/** Every layer list, empty. */
function emptyLayers(): Lists {
  return {
    backdrop: [],
    details: [],
    shadows: [],
    objects: [],
    overhead: [],
    atmosphere: [],
    lights: [],
    emitters: [],
  };
}

function addLayers(into: Lists, from: Layers): void {
  into.backdrop.push(...(from.backdrop ?? []));
  into.details.push(...(from.details ?? []));
  into.shadows.push(...(from.shadows ?? []));
  into.objects.push(...(from.objects ?? []));
  into.overhead.push(...(from.overhead ?? []));
  into.atmosphere.push(...(from.atmosphere ?? []));
  into.lights.push(...(from.lights ?? []));
  into.emitters.push(...(from.emitters ?? []));
}

export interface BuildResult {
  readonly map: BuiltMap;
  /** Tiles made solid by prop footprints, for the portal check. */
  readonly footprints: ReadonlySet<number>;
}

/**
 * Builds a map: plan, rules, stamps, then art. `built` lists every map id that exists, so a
 * portal knows whether its target is built yet.
 */
export function buildMap(src: MapSource, built: ReadonlySet<string>): BuildResult {
  const draft = readPlan(src);
  const { w, h } = draft;
  applyRules(draft, src.rules ?? [], src.seed, src.legend);

  const layers = emptyLayers();
  const regions = new Map<string, TileRect>();
  for (const s of src.stamps ?? []) {
    const parsed = parseStamp(s.stamp);
    const [tx, ty] = s.at;
    const id = s.id ?? s.stamp.name;
    for (const { x, y, cell } of parsed.cells) {
      const mx = tx + x;
      const my = ty + y;
      if (mx < 0 || my < 0 || mx >= w || my >= h)
        throw new Error(`map ${src.id}: stamp ${id} reaches past the map at ${mx},${my}`);
      const i = my * w + mx;
      if (cell.ground !== undefined) {
        const g = src.legend[cell.ground];
        if (!g) throw new Error(`map ${src.id}: stamp ${id} uses "${cell.ground}", not in legend`);
        draft.ground[i] = cell.ground;
        draft.solid[i] = solidOf(g.terrain, g.solid);
      }
      if (cell.solid !== undefined) draft.solid[i] = cell.solid === false ? "." : cell.solid;
    }
    for (const [name, r] of parsed.regions) {
      const key = `${id}:${name}`;
      if (regions.has(key)) throw new Error(`map ${src.id}: region ${key} is laid twice`);
      regions.set(key, { x: r.x + tx, y: r.y + ty, w: r.w, h: r.h });
    }
    if (s.stamp.things) addLayers(layers, s.stamp.things(tx * TILE_SIZE, ty * TILE_SIZE));
  }
  addLayers(layers, src);

  for (const r of src.blocks ?? []) {
    for (let y = r.y; y < r.y + r.h; y++)
      for (let x = r.x; x < r.x + r.w; x++)
        if (x >= 0 && y >= 0 && x < w && y < h) draft.solid[y * w + x] = "#";
  }

  // Footprints: solid, and remembered so a portal under one is caught.
  const footprints = new Set<number>();
  const objects = layers.objects.map((o) => {
    if (!("foot" in o) || !o.foot) return o;
    const { foot, ...rest } = o;
    for (let y = foot.y; y < foot.y + foot.h; y++) {
      for (let x = foot.x; x < foot.x + foot.w; x++) {
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        draft.solid[y * w + x] = "#";
        footprints.add(y * w + x);
      }
    }
    return rest as Prop;
  });

  const rect = (r: TileRect | string, what: string): TileRect => {
    if (typeof r !== "string") return r;
    const found = regions.get(r);
    if (!found) throw new Error(`map ${src.id}: ${what} names region ${r}, which no stamp has`);
    return found;
  };

  const spawns: Record<string, Spawn> = {};
  for (const [name, s] of Object.entries(src.spawns)) {
    spawns[name] = {
      x: s.tile[0] * TILE_SIZE + TILE_SIZE / 2,
      y: s.tile[1] * TILE_SIZE + TILE_SIZE - 4,
      facing: s.facing ?? "down",
    };
  }
  const portals: Portal[] = (src.portals ?? []).map((p) => ({
    id: p.id,
    rect: rect(p.rect, `portal ${p.id}`),
    to: p.to,
    spawn: p.spawn,
    built: built.has(p.to),
  }));
  const interactables: Interactable[] = (src.interactables ?? []).map((t) => ({
    id: t.id,
    kind: t.kind,
    rect: rect(t.rect, `interactable ${t.id}`),
  }));
  const zones: Zone[] = (src.zones ?? []).map((z) => ({
    ...z,
    rect: rect(z.rect, `zone ${z.id}`),
  }));

  const rows = (list: readonly string[]): string[] =>
    Array.from({ length: h }, (_, y) => list.slice(y * w, (y + 1) * w).join(""));
  const collision: TileCollision = { w, h, rows: rows(draft.solid) };

  const legend: Record<string, Cell> = {};
  for (const [ch, cell] of Object.entries(src.legend)) {
    legend[ch] = cell.theme
      ? { terrain: cell.terrain, theme: cell.theme }
      : { terrain: cell.terrain };
  }
  const painted = layers.lights.flatMap((l): Light[] => (l.paint ? [l.paint] : []));
  const scene: SceneDef = {
    name: src.id,
    seed: src.seed,
    theme: src.theme,
    ...(src.sky ? { sky: src.sky } : {}),
    ...(src.shade ? { shade: src.shade } : {}),
    size: [w, h],
    legend,
    ground: rows(draft.ground),
    backdrop: layers.backdrop,
    details: layers.details,
    edges: src.edges ?? [],
    shadows: layers.shadows,
    objects,
    overhead: layers.overhead,
    lights: painted,
    atmosphere: layers.atmosphere,
    emitters: layers.emitters,
  };

  return {
    map: {
      id: src.id,
      name: src.name,
      w,
      h,
      time: src.time,
      landmark: {
        name: src.landmark.name,
        x: src.landmark.tile[0] * TILE_SIZE + TILE_SIZE / 2,
        y: src.landmark.tile[1] * TILE_SIZE + TILE_SIZE / 2,
      },
      ambient: src.ambient,
      lights: layers.lights,
      scene,
      collision,
      spawns,
      portals,
      interactables,
      zones,
      marks: Object.fromEntries(
        Object.entries(src.marks ?? {}).map(([name, [tx, ty]]) => [
          name,
          { x: tx * TILE_SIZE + TILE_SIZE / 2, y: ty * TILE_SIZE + TILE_SIZE / 2 },
        ]),
      ),
      npcs: (src.npcs ?? []).map((n) => ({
        speaker: n.speaker,
        x: n.tile[0] * TILE_SIZE + TILE_SIZE / 2,
        y: n.tile[1] * TILE_SIZE + TILE_SIZE - 4,
        facing: n.facing ?? "down",
      })),
      patrols: (src.patrols ?? []).map(buildPatrol),
    },
    footprints,
  };
}
