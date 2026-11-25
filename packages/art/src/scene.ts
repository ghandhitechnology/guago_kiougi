/**
 * Draws scenes and maps from the built atlases and art.json alone, for judging art in context.
 * The layered format itself (terrain, backdrop, details, edges, shadows, sorted objects,
 * overhead, lights, atmosphere, emitters) lives in `@guago/content`, where maps are written in
 * it; review scenes here are written in the same format at one screen.
 *
 * Night and lamp light are painted, not blended: a light is a palette theme, a shadow is one ramp
 * step. Monsters and characters never take a theme, so they read the same everywhere. Things
 * name atlas sprites only, so redrawn art shows up by itself. Browser-safe: the contact sheet
 * page and the static sheet both run this file, so it imports types only.
 */
import type {
  Actor,
  Doll,
  Edge,
  Emitter,
  FramePick,
  Light,
  Placement,
  Prop,
  SceneDef,
  ShadowShape,
  Vec,
} from "@guago/content";
import {
  dualMask,
  hash2,
  pickTone,
  scatterDecals,
  type TerrainGrid,
  valueNoise,
} from "./dualgrid.ts";

export type {
  Actor,
  Cell,
  Decal,
  Doll,
  Edge,
  Emitter,
  Light,
  Prop,
  SceneDef,
  ShadowShape,
} from "@guago/content";

export const SCREEN = { w: 480, h: 270 } as const;
const TILE = 16;
/** Cells across and down of a scene without a size: the screen rounded up to whole cells. */
export const SCENE_CELLS = { w: SCREEN.w / TILE, h: Math.ceil(SCREEN.h / TILE) } as const;

export function scene(def: SceneDef): SceneDef {
  return def;
}

/**
 * An actor drawn at a whole-number scale about its anchor, like an elite at the client's double
 * size. Review scenes only: the map format does not carry a scale yet.
 */
export type ScaledActor = Actor & { readonly scale?: number };

interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** Cells across and down, and the pixel size of the whole scene. */
export function sceneSize(def: SceneDef): { cells: Vec; px: Vec } {
  if (!def.size) return { cells: [SCENE_CELLS.w, SCENE_CELLS.h], px: [SCREEN.w, SCREEN.h] };
  const [w, h] = def.size;
  return { cells: [w, h], px: [w * TILE, h * TILE] };
}

// Inputs: the parts of art.json and the atlases a scene reads. -------------------------------

export interface AtlasFrame {
  readonly frame: Rect;
  readonly spriteSourceSize: Rect;
  readonly sourceSize: { readonly w: number; readonly h: number };
}
export interface Pixels {
  readonly w: number;
  readonly h: number;
  readonly data: Uint8Array | Uint8ClampedArray;
}
export interface SceneAtlas extends Pixels {
  readonly frames: Readonly<Record<string, AtlasFrame>>;
}
interface AnimMeta {
  readonly frames: readonly string[];
  readonly fps: number;
}
type Table<T> = Readonly<Record<string, T>>;
type Masks = readonly (readonly number[])[];
export interface SceneMeta {
  readonly palette: { readonly ramps: Table<Table<string>> };
  readonly recolor: Table<Table<string>>;
  readonly shade: Table<string>;
  readonly slots: Table<{ readonly keys: Table<string>; readonly options: Table<Table<string>> }>;
  readonly sprites: Table<{
    readonly atlas: string;
    readonly origin: Vec;
    readonly shadow: string | null;
    readonly frames: readonly string[];
    readonly anims: Table<AnimMeta>;
  }>;
  readonly rigs: Table<{
    readonly atlas: string;
    readonly size: Vec;
    readonly origin: Vec;
    readonly directions: readonly string[];
    readonly layers: readonly string[];
    readonly frames: readonly string[];
    readonly anims: Table<AnimMeta>;
    readonly looks: Table<{
      readonly parts: Table<string>;
      readonly slots?: Table<string>;
    }>;
  }>;
  readonly tileGrid: {
    readonly tile: number;
    readonly margin: number;
    readonly spacing: number;
    readonly columns: number;
  };
  readonly tilesets: Table<{
    readonly upper: string;
    readonly lower: string;
    readonly masks: Masks;
    readonly tones: readonly {
      readonly on: "upper" | "lower";
      readonly band: readonly [number, number];
      readonly masks: Masks;
    }[];
    readonly decals: readonly {
      readonly on: "upper" | "lower";
      readonly density: number;
      readonly w: number;
      readonly h: number;
      readonly frame: string;
    }[];
  }>;
  readonly overlays: Table<{ readonly masks: Masks; readonly shapes?: Table<string> | null }>;
}

// Drawing ------------------------------------------------------------------------------------

type ColorMap = ReadonlyMap<number, number>;
const NO_MAP: ColorMap = new Map();

function hexKey(hex: string): number {
  return Number.parseInt(hex.slice(1), 16);
}

function toMap(rec: Table<string> | undefined): ColorMap {
  return new Map(Object.entries(rec ?? {}).map(([a, b]) => [hexKey(a), hexKey(b)]));
}

/** A canvas over a window of the world: drawing takes world pixels, `ox, oy` is its corner. */
class Canvas implements Pixels {
  readonly w: number;
  readonly h: number;
  readonly ox: number;
  readonly oy: number;
  readonly data: Uint8ClampedArray;
  constructor(w: number, h: number, ox = 0, oy = 0) {
    this.w = w;
    this.h = h;
    this.ox = ox;
    this.oy = oy;
    this.data = new Uint8ClampedArray(w * h * 4);
  }

  /** Copies opaque pixels of a source rect to world (dx, dy), recoloured, mirrored, clipped. */
  blit(
    src: Pixels,
    from: Rect,
    dx: number,
    dy: number,
    map: ColorMap = NO_MAP,
    flip = false,
    clip?: Rect,
  ): void {
    const lx = dx - this.ox;
    const ly = dy - this.oy;
    if (lx >= this.w || ly >= this.h || lx + from.w <= 0 || ly + from.h <= 0) return;
    const x0 = clip ? Math.max(0, clip.x - this.ox) : 0;
    const y0 = clip ? Math.max(0, clip.y - this.oy) : 0;
    const x1 = clip ? Math.min(this.w, clip.x - this.ox + clip.w) : this.w;
    const y1 = clip ? Math.min(this.h, clip.y - this.oy + clip.h) : this.h;
    for (let y = 0; y < from.h; y++) {
      const ty = ly + y;
      if (ty < y0 || ty >= y1) continue;
      for (let x = 0; x < from.w; x++) {
        const tx = lx + (flip ? from.w - 1 - x : x);
        if (tx < x0 || tx >= x1) continue;
        const s = ((from.y + y) * src.w + from.x + x) * 4;
        if ((src.data[s + 3] as number) === 0) continue;
        const rgb =
          ((src.data[s] as number) << 16) |
          ((src.data[s + 1] as number) << 8) |
          (src.data[s + 2] as number);
        const out = map.get(rgb) ?? rgb;
        const d = (ty * this.w + tx) * 4;
        this.data[d] = out >> 16;
        this.data[d + 1] = (out >> 8) & 255;
        this.data[d + 2] = out & 255;
        this.data[d + 3] = 255;
      }
    }
  }

  fill(rgb: number): void {
    for (let i = 0; i < this.data.length; i += 4) {
      this.data[i] = rgb >> 16;
      this.data[i + 1] = (rgb >> 8) & 255;
      this.data[i + 2] = rgb & 255;
      this.data[i + 3] = 255;
    }
  }
}

/** Ragged-edge noise in pixels, two octaves, centred on zero. */
function ragged(x: number, y: number, amount: number, seed: number): number {
  const n = 0.65 * valueNoise(x, y, 7, seed) + 0.35 * valueNoise(x, y, 2.5, seed + 9);
  return (n - 0.5) * 2 * amount;
}

/** Reach multiplier of a light's shafts at a pixel: two seeded waves around the circle. */
function shaft(rays: NonNullable<Light["rays"]>, x: number, y: number, seed: number): number {
  const a = Math.atan2(y + 0.5 - rays.at[1], x + 0.5 - rays.at[0]);
  const p = (seed % 97) * 0.37;
  const wave =
    0.6 * Math.sin(rays.count * a + p) +
    0.4 * Math.sin(Math.round(rays.count * 1.618) * a + p * 2.3);
  return 1 + rays.amount * wave;
}

/** A distance field over a window of the world. */
interface Field {
  readonly rect: Rect;
  readonly d: Float32Array;
}

/**
 * Band per pixel for one light: 0 is the brightest band, `bands.length` is unlit. `field` is
 * the region's distance field when the light has a region.
 */
function bandAt(
  light: Light,
  t: number,
  x: number,
  y: number,
  seed: number,
  field: Field | null,
): number {
  const n = light.bands.length;
  const swell = light.pulse
    ? 1 + light.pulse.amount * Math.sin((2 * Math.PI * t) / light.pulse.period)
    : 1;
  if (field && light.reach) {
    const { rect, d } = field;
    const fx = x - rect.x;
    const fy = y - rect.y;
    if (fx < 0 || fy < 0 || fx >= rect.w || fy >= rect.h) return n;
    const dist = d[fy * rect.w + fx] as number;
    // Each band's edge has its own noise, so the bands interleave instead of nesting as contours.
    const amount = light.ragged ?? 3;
    const reach = swell * (light.rays ? shaft(light.rays, x, y, seed) : 1);
    const k = light.reach.findIndex(
      (r, i) => dist + ragged(x, y, amount, seed + i * 31) < r * reach,
    );
    return k < 0 ? n : k;
  }
  const wobble = ragged(x, y, light.ragged ?? 3, seed);
  let f: number;
  let scale: number;
  if (light.spill) {
    const { top, bottom } = light.spill;
    if (y < top[2]) return n;
    const v = (y - top[2]) / Math.max(1, bottom[2] - top[2]);
    const x0 = top[0] + (bottom[0] - top[0]) * v;
    const x1 = top[1] + (bottom[1] - top[1]) * v;
    const half = Math.max(1, (x1 - x0) / 2);
    f = Math.max(Math.abs(x + 0.5 - (x0 + x1) / 2) / half, v);
    scale = Math.max(half, (bottom[2] - top[2]) / 2);
  } else if (light.at && light.r) {
    const dx = (x + 0.5 - light.at[0]) / (light.r[0] * swell);
    const dy = (y + 0.5 - light.at[1]) / (light.r[1] * swell);
    f = Math.sqrt(dx * dx + dy * dy);
    scale = (light.r[0] + light.r[1]) / 2;
  } else return n;
  const k = Math.floor((f + wobble / scale) * n);
  return k < 0 ? 0 : Math.min(n, k);
}

/** The world rectangle a light can reach, generously, before clipping to the scene. */
function lightBounds(light: Light, field: Field | null): Rect | null {
  const pad = (light.ragged ?? 3) + 2;
  const swell = 1 + (light.pulse?.amount ?? 0);
  if (field) return field.rect;
  if (light.spill) {
    const { top, bottom } = light.spill;
    const x0 = Math.min(top[0], bottom[0]) - pad;
    const x1 = Math.max(top[1], bottom[1]) + pad;
    return { x: x0, y: top[2], w: x1 - x0, h: bottom[2] - top[2] + pad };
  }
  if (light.at && light.r) {
    const rx = light.r[0] * swell + pad;
    const ry = light.r[1] * swell + pad;
    return {
      x: Math.floor(light.at[0] - rx),
      y: Math.floor(light.at[1] - ry),
      w: Math.ceil(rx * 2),
      h: Math.ceil(ry * 2),
    };
  }
  return null;
}

/**
 * Pixel distance to the nearest cell whose legend character is in `chars`, about Euclidean,
 * over the region's cells grown by `margin` pixels.
 */
function regionField(ctx: Ctx, chars: string, margin: number): Field | null {
  const [W, H] = ctx.cells.size;
  let cx0 = W;
  let cy0 = H;
  let cx1 = -1;
  let cy1 = -1;
  ctx.cells.list.forEach((c, i) => {
    if (!chars.includes(c.char)) return;
    const x = i % W;
    const y = (i - x) / W;
    cx0 = Math.min(cx0, x);
    cy0 = Math.min(cy0, y);
    cx1 = Math.max(cx1, x);
    cy1 = Math.max(cy1, y);
  });
  if (cx1 < 0) return null;
  const [pw, ph] = ctx.size;
  const x0 = Math.max(0, cx0 * TILE - margin);
  const y0 = Math.max(0, cy0 * TILE - margin);
  const x1 = Math.min(pw, (cx1 + 1) * TILE + margin);
  const y1 = Math.min(ph, (cy1 + 1) * TILE + margin);
  const rect = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  const big = 1e6;
  const d = new Float32Array(rect.w * rect.h).fill(big);
  for (let y = 0; y < rect.h; y++) {
    for (let x = 0; x < rect.w; x++) {
      const c = cellAt(ctx, Math.floor((x + x0) / TILE), Math.floor((y + y0) / TILE));
      if (chars.includes(c.char)) d[y * rect.w + x] = 0;
    }
  }
  // Two-pass chamfer, weights 1 and √2.
  const { w, h } = rect;
  const at = (x: number, y: number) =>
    x < 0 || y < 0 || x >= w || y >= h ? big : (d[y * w + x] as number);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      d[y * w + x] = Math.min(
        at(x, y),
        at(x - 1, y) + 1,
        at(x, y - 1) + 1,
        at(x - 1, y - 1) + 1.41,
        at(x + 1, y - 1) + 1.41,
      );
    }
  for (let y = h - 1; y >= 0; y--)
    for (let x = w - 1; x >= 0; x--) {
      d[y * w + x] = Math.min(
        at(x, y),
        at(x + 1, y) + 1,
        at(x, y + 1) + 1,
        at(x + 1, y + 1) + 1.41,
        at(x - 1, y + 1) + 1.41,
      );
    }
  return { rect, d };
}

/** Whether two rectangles overlap; the overlap, or null. */
function intersect(a: Rect, b: Rect): Rect | null {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.w, b.x + b.w);
  const y1 = Math.min(a.y + a.h, b.y + b.h);
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}

// Rendering ----------------------------------------------------------------------------------

export interface SceneImage extends Pixels {
  readonly warnings: readonly string[];
}

interface GroundCell {
  readonly char: string;
  readonly terrain: string | null;
  readonly theme: string | null;
}

interface Cells {
  readonly size: Vec;
  readonly list: readonly GroundCell[];
}

function parseGround(def: SceneDef): Cells {
  const rows = (typeof def.ground === "string" ? def.ground.split("\n") : [...def.ground])
    .map((r) => r.trim())
    .filter((r) => r.length > 0);
  const [w, h] = sceneSize(def).cells;
  const where = `scene ${def.name}`;
  if (rows.length !== h) throw new Error(`${where}: ground has ${rows.length} rows, not ${h}`);
  const list: GroundCell[] = [];
  rows.forEach((row, y) => {
    const chars = [...row];
    if (chars.length !== w)
      throw new Error(`${where}: ground row ${y + 1} is ${chars.length} wide, not ${w}`);
    for (const ch of chars) {
      const cell = def.legend[ch];
      if (!cell) throw new Error(`${where}: "${ch}" in row ${y + 1} is not in the legend`);
      list.push({ char: ch, terrain: cell.terrain, theme: cell.theme ?? null });
    }
  });
  return { size: [w, h], list };
}

/** Per scene definition, what does not change between frames. */
interface Prepared {
  readonly cells: Cells;
  readonly fields: Map<Light, Field | null>;
}
const prepared = new WeakMap<SceneDef, Prepared>();

function prepare(def: SceneDef): Prepared {
  let p = prepared.get(def);
  if (!p) {
    p = { cells: parseGround(def), fields: new Map() };
    prepared.set(def, p);
  }
  return p;
}

/**
 * Renders a scene or map at `time` seconds: the whole of it, or the window `view` (world
 * pixels). `atlases` holds every atlas by name, tile atlases as `tiles-<theme>`. Missing art is
 * skipped and reported in `warnings`.
 */
export function renderScene(
  def: SceneDef,
  meta: SceneMeta,
  atlases: ReadonlyMap<string, SceneAtlas>,
  time = 0,
  view?: Rect,
): SceneImage {
  const warnings: string[] = [];
  const pre = prepare(def);
  const size = sceneSize(def).px;
  const win = view ?? { x: 0, y: 0, w: size[0], h: size[1] };
  const ctx: Ctx = { def, meta, atlases, cells: pre.cells, size, time, warnings };
  const out = renderPass(ctx, def.theme, win);
  const lights = def.lights ?? [];
  if (lights.length > 0) {
    // Per pixel the brightest light wins, measured as the fraction of its bands still ahead.
    const pick: (string | null)[] = new Array(out.w * out.h).fill(null);
    const level = new Float32Array(out.w * out.h);
    lights.forEach((l, li) => {
      let field = pre.fields.get(l);
      if (field === undefined) {
        const far = Math.max(0, ...(l.reach ?? [0]));
        const margin = Math.ceil(far * (1 + (l.rays?.amount ?? 0)) * (1 + (l.pulse?.amount ?? 0)));
        field = l.region ? regionField(ctx, l.region, margin + (l.ragged ?? 3) + 2) : null;
        pre.fields.set(l, field);
      }
      if (l.region && !field) return;
      const bounds = lightBounds(l, field);
      const area = bounds ? intersect(bounds, win) : null;
      if (!area) return;
      const n = l.bands.length;
      for (let y = area.y; y < area.y + area.h; y++) {
        for (let x = area.x; x < area.x + area.w; x++) {
          const k = bandAt(l, time, x, y, def.seed + li * 17, field);
          if (k >= n) continue;
          const v = (n - k) / n;
          const i = (y - win.y) * out.w + (x - win.x);
          if (v > (level[i] as number)) {
            level[i] = v;
            pick[i] = l.bands[k] as string;
          }
        }
      }
    });
    // One pass per theme, over the part of the window that theme lights.
    const boxes = new Map<string, [number, number, number, number]>();
    pick.forEach((theme, i) => {
      if (!theme) return;
      const x = i % out.w;
      const y = (i - x) / out.w;
      const b = boxes.get(theme);
      if (!b) boxes.set(theme, [x, y, x, y]);
      else {
        b[0] = Math.min(b[0], x);
        b[1] = Math.min(b[1], y);
        b[2] = Math.max(b[2], x);
        b[3] = Math.max(b[3], y);
      }
    });
    const passes = new Map<string, Canvas>();
    for (const [theme, [x0, y0, x1, y1]] of boxes) {
      const rect = { x: win.x + x0, y: win.y + y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
      passes.set(theme, renderPass({ ...ctx, warnings: [] }, theme, rect));
    }
    pick.forEach((theme, i) => {
      const pass = theme ? passes.get(theme) : undefined;
      if (!pass) return;
      const x = (i % out.w) + win.x - pass.ox;
      const y = Math.floor(i / out.w) + win.y - pass.oy;
      const s = (y * pass.w + x) * 4;
      out.data.set(pass.data.subarray(s, s + 4), i * 4);
    });
  }
  for (const a of def.atmosphere ?? []) drawThing(ctx, out, a, NO_MAP);
  for (const e of def.emitters ?? []) drawEmitter(ctx, out, e);
  return { w: out.w, h: out.h, data: out.data, warnings: [...new Set(warnings)] };
}

export interface GroundImage extends SceneImage {
  /** One byte per pixel, 255 where the ground lies in a shadow. */
  readonly shadow: Uint8Array;
}

/**
 * The part of a scene that never moves, for the game to draw as one image: terrain, tones,
 * decals, details, edges and shadows, in the scene's theme, transparent over the void. The sky,
 * the backdrop, painted lights, objects and everything above them are left out, and so are
 * details that play an animation.
 */
export function renderGround(
  def: SceneDef,
  meta: SceneMeta,
  atlases: ReadonlyMap<string, SceneAtlas>,
  view?: Rect,
): GroundImage {
  const warnings: string[] = [];
  const { sky: _sky, ...rest } = def;
  const still: SceneDef = {
    ...rest,
    backdrop: [],
    details: (def.details ?? []).filter((d) => !("prop" in d && d.play)),
  };
  const size = sceneSize(still).px;
  const win = view ?? { x: 0, y: 0, w: size[0], h: size[1] };
  const ctx: Ctx = {
    def: still,
    meta,
    atlases,
    cells: prepare(def).cells,
    size,
    time: 0,
    warnings,
  };
  let shadow = new Uint8Array(win.w * win.h);
  const out = renderPass(ctx, still.theme, win, "shaded", (mask) => {
    shadow = new Uint8Array(mask.w * mask.h);
    for (let i = 0; i < shadow.length; i++) shadow[i] = mask.data[i * 4 + 3] as number;
  });
  return { w: out.w, h: out.h, data: out.data, shadow, warnings: [...new Set(warnings)] };
}

/**
 * One byte per pixel of the whole scene, 255 inside an edge's region: the cells whose legend
 * character is in `edge.inside`, cut along the overlay's shape where it has one, so the mask
 * follows the same torn line the ground is drawn with.
 */
export function edgeInside(def: SceneDef, meta: SceneMeta, edge: Edge): Uint8Array {
  const { cells } = prepare(def);
  const [W, H] = cells.size;
  const [pw, ph] = sceneSize(def).px;
  const out = new Uint8Array(pw * ph);
  const first = typeof edge.overlay === "string" ? edge.overlay : edge.overlay[0];
  const o = first ? meta.overlays[first] : undefined;
  const cell = (x: number, y: number) =>
    cells.list[Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))] as GroundCell;
  const grid: TerrainGrid = {
    w: W,
    h: H,
    cells: cells.list.map((c) => (edge.inside.includes(c.char) ? 1 : 0)),
  };
  for (let j = 0; j <= H; j++) {
    for (let i = 0; i <= W; i++) {
      const mask = dualMask(grid, 1, i, j);
      if (mask === 0) continue;
      const corners = [cell(i - 1, j - 1), cell(i, j - 1), cell(i - 1, j), cell(i, j)];
      const list = o?.masks[mask] ?? [];
      const index = list[hash2(i, j, def.seed + 11) % Math.max(1, list.length)];
      const hex =
        mask !== 15 && !corners.some((c) => c.terrain === null) && index !== undefined
          ? o?.shapes?.[String(index)]
          : undefined;
      for (let y = 0; y < TILE; y++) {
        const py = j * TILE - TILE / 2 + y;
        if (py < 0 || py >= ph) continue;
        for (let x = 0; x < TILE; x++) {
          const px = i * TILE - TILE / 2 + x;
          if (px < 0 || px >= pw) continue;
          const inside = hex
            ? (Number.parseInt(hex[(y * TILE + x) >> 2] as string, 16) >> (3 - (x & 3))) & 1
            : (mask >> ((y < 8 ? 0 : 2) + (x < 8 ? 0 : 1))) & 1;
          if (inside) out[py * pw + px] = 255;
        }
      }
    }
  }
  return out;
}

/** Where particle `k` of an emitter is at `time`, and how far into its life. */
export function emitterParticle(
  e: Emitter,
  seed: number,
  k: number,
  time: number,
): { x: number; y: number; age: number; hash: number } {
  const offset = ((k + (hash2(k, 7, seed) % 1000) / 1000) / e.count) * e.life;
  const t = time + offset;
  const birth = Math.floor(t / e.life);
  const age = t - birth * e.life;
  const h = hash2(k, birth, seed + 5);
  const bx = e.area.x + ((h % 1000) / 1000) * e.area.w;
  const by = e.area.y + (((h >>> 10) % 1000) / 1000) * e.area.h;
  let x = bx + e.velocity[0] * age;
  let y = by + e.velocity[1] * age;
  if (e.toward) {
    const f = (age / e.life) ** 2;
    x += (e.toward[0] - x) * f;
    y += (e.toward[1] - y) * f;
  }
  return { x, y, age, hash: h };
}

interface Ctx {
  readonly def: SceneDef;
  readonly meta: SceneMeta;
  readonly atlases: ReadonlyMap<string, SceneAtlas>;
  readonly cells: Cells;
  /** The whole scene in pixels. */
  readonly size: Vec;
  readonly time: number;
  readonly warnings: string[];
}

function cellAt(ctx: Ctx, x: number, y: number): GroundCell {
  const [W, H] = ctx.cells.size;
  return ctx.cells.list[
    Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))
  ] as GroundCell;
}

const QUADS: readonly Vec[] = [
  [0, 0],
  [8, 0],
  [0, 8],
  [8, 8],
];

function frameOf(ctx: Ctx, atlasName: string, key: string) {
  const atlas = ctx.atlases.get(atlasName);
  const f = atlas?.frames[key];
  if (!atlas || !f) {
    ctx.warnings.push(`missing frame ${atlasName}:${key}`);
    return undefined;
  }
  return { atlas, f };
}

/** Resolves a frame pick against a list of frames and animations. */
function pickFrame(
  ctx: Ctx,
  owner: string,
  frames: readonly string[],
  anims: Table<AnimMeta>,
  pick: FramePick,
  prefix: string,
  skip: string | null,
  time = ctx.time,
): string | undefined {
  if (pick.frame && frames.includes(`${prefix}${pick.frame}`)) return `${prefix}${pick.frame}`;
  const anim = pick.anim ? anims[pick.anim] : undefined;
  if (anim && anim.frames.length > 0) {
    const step = pick.play ? Math.floor(time * anim.fps) : 0;
    return anim.frames[((pick.index ?? 0) + step) % anim.frames.length];
  }
  if (pick.frame || pick.anim)
    ctx.warnings.push(`${owner}: no frame or anim "${pick.frame ?? pick.anim}"`);
  return frames.find((f) => f !== skip) ?? frames[0];
}

/** Draws a frame with its anchor at `at`, restoring trimmed offsets, at a whole-number scale. */
function place(
  target: Canvas,
  found: { atlas: SceneAtlas; f: AtlasFrame },
  origin: Vec,
  at: Vec,
  map: ColorMap,
  flip: boolean,
  scale = 1,
): void {
  const { f, atlas } = found;
  const sx = flip ? f.sourceSize.w - f.spriteSourceSize.x - f.frame.w : f.spriteSourceSize.x;
  const ox = flip ? f.sourceSize.w - 1 - origin[0] : origin[0];
  if (scale === 1) {
    target.blit(
      atlas,
      f.frame,
      at[0] - ox + sx,
      at[1] - origin[1] + f.spriteSourceSize.y,
      map,
      flip,
    );
    return;
  }
  // Each source pixel becomes a scale×scale block; the anchor pixel's bottom-centre stays put.
  const left = at[0] - ox * scale - Math.floor((scale - 1) / 2);
  const top = at[1] - origin[1] * scale - (scale - 1);
  for (let y = 0; y < f.frame.h; y++) {
    for (let x = 0; x < f.frame.w; x++) {
      const px = flip ? f.frame.w - 1 - x : x;
      const one: Rect = { x: f.frame.x + px, y: f.frame.y + y, w: 1, h: 1 };
      for (let k = 0; k < scale * scale; k++) {
        const dx = left + (sx + x) * scale + (k % scale);
        const dy = top + (f.spriteSourceSize.y + y) * scale + Math.floor(k / scale);
        target.blit(atlas, one, dx, dy, map);
      }
    }
  }
}

/** Draws a prop or actor (or its shadow into a mask), repeated as asked. */
function drawThing(
  ctx: Ctx,
  out: Canvas,
  t: Prop | Actor,
  map: ColorMap,
  shadowOnly = false,
): void {
  const name = "prop" in t ? t.prop : t.actor;
  const sp = ctx.meta.sprites[name];
  if (!sp) {
    ctx.warnings.push(`no sprite ${name}`);
    return;
  }
  let key: string | undefined;
  let origin = sp.origin;
  let atlas = sp.atlas;
  if (shadowOnly) {
    key = sp.shadow ?? ("actor" in t && t.shadow ? t.shadow : undefined);
    if (!key) return;
    const owner = ctx.meta.sprites[key.split("/")[0] as string];
    if (!owner) return;
    if (key !== sp.shadow) {
      origin = owner.origin;
      atlas = owner.atlas;
    }
  } else {
    key = pickFrame(ctx, name, sp.frames, sp.anims, t, `${name}/`, sp.shadow);
  }
  const found = key ? frameOf(ctx, atlas, key) : undefined;
  if (!found) return;
  const [ax, ay] = placeAt(t, ctx.time);
  const scale = "scale" in t ? ((t as ScaledActor).scale ?? 1) : 1;
  for (let k = 0; k < (t.repeat ?? 1); k++) {
    const at: Vec = [ax + k * found.f.sourceSize.w, ay];
    place(out, found, origin, at, map, t.flip ?? false, scale);
  }
}

/** Where a placement is at time `t`, after its drift. */
function placeAt(p: Placement, t: number): Vec {
  if (!p.drift) return p.at;
  const { to, period, phase = 0 } = p.drift;
  const f = ((((t + phase) / period) % 1) + 1) % 1;
  return [Math.round(p.at[0] + (to[0] - p.at[0]) * f), Math.round(p.at[1] + (to[1] - p.at[1]) * f)];
}

/**
 * Draws an emitter's particles at the scene's time. Particle k is born every `life` seconds,
 * offset by k / count of a life, at a hashed point in the area of that birth.
 */
function drawEmitter(ctx: Ctx, out: Canvas, e: Emitter): void {
  const sp = ctx.meta.sprites[e.sprite];
  if (!sp) {
    ctx.warnings.push(`no sprite ${e.sprite}`);
    return;
  }
  const anims = Object.keys(sp.anims);
  const animName = e.anim ?? anims[0];
  for (let k = 0; k < e.count; k++) {
    const { x, y, age, hash: h } = emitterParticle(e, ctx.def.seed, k, ctx.time);
    const key = pickFrame(
      ctx,
      e.sprite,
      sp.frames,
      sp.anims,
      { ...(animName ? { anim: animName } : {}), play: true, index: h % 7 },
      `${e.sprite}/`,
      sp.shadow,
      age,
    );
    const found = key ? frameOf(ctx, sp.atlas, key) : undefined;
    if (found) place(out, found, sp.origin, [Math.round(x), Math.round(y)], NO_MAP, (h & 1) === 1);
  }
}

/** Fills a polygon into a mask canvas. */
function fillPoly(target: Canvas, shape: ShadowShape): void {
  const pts = shape.poly;
  if (pts.length < 3) return;
  const ys = pts.map((p) => p[1]);
  const y0 = Math.max(target.oy, Math.floor(Math.min(...ys)));
  const y1 = Math.min(target.oy + target.h, Math.ceil(Math.max(...ys)));
  for (let y = y0; y < y1; y++) {
    const cy = y + 0.5;
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i] as Vec;
      const b = pts[(i + 1) % pts.length] as Vec;
      if (a[1] <= cy === b[1] <= cy) continue;
      xs.push(a[0] + ((cy - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const xa = Math.max(target.ox, Math.round(xs[k] as number));
      const xb = Math.min(target.ox + target.w, Math.round(xs[k + 1] as number));
      for (let x = xa; x < xb; x++) {
        const d = ((y - target.oy) * target.w + (x - target.ox)) * 4;
        target.data[d + 3] = 255;
      }
    }
  }
}

/**
 * How far a pass draws: the ground alone (terrain, tones, decals, details, edges), the ground
 * with its shadows, or everything.
 */
type Stage = "ground" | "shaded" | "all";

function renderPass(
  ctx: Ctx,
  passTheme: string,
  view: Rect,
  stage: Stage = "all",
  shadowMask?: (mask: Canvas) => void,
): Canvas {
  const groundOnly = stage === "ground";
  const { def, meta, warnings } = ctx;
  const out = new Canvas(view.w, view.h, view.x, view.y);
  const [W, H] = ctx.cells.size;
  const at = (x: number, y: number) => cellAt(ctx, x, y);
  const themeOf = (c: GroundCell) => c.theme ?? passTheme;
  const pairs = Object.values(meta.tilesets);
  const { tile, margin, spacing, columns } = meta.tileGrid;
  const tileRect = (index: number): Rect => ({
    x: margin + (index % columns) * (tile + spacing),
    y: margin + Math.floor(index / columns) * (tile + spacing),
    w: tile,
    h: tile,
  });
  const tiles = (theme: string): SceneAtlas | undefined => {
    const a = ctx.atlases.get(`tiles-${theme}`);
    if (!a) warnings.push(`no tile atlas for theme ${theme}`);
    return a;
  };
  const propMap = toMap(meta.recolor[passTheme]);
  const raw = (p: Prop) => (p.raw ? NO_MAP : propMap);
  // Display tiles touching the view.
  const i0 = Math.max(0, Math.floor((view.x + 8) / TILE));
  const j0 = Math.max(0, Math.floor((view.y + 8) / TILE));
  const i1 = Math.min(W, Math.floor((view.x + view.w + 8) / TILE));
  const j1 = Math.min(H, Math.floor((view.y + view.h + 8) / TILE));

  // 1. Sky and backdrop.
  if (def.sky) {
    const [ramp, step] = def.sky.split(".");
    const hex = meta.palette.ramps[ramp ?? ""]?.[step ?? ""];
    if (hex) out.fill(hexKey(hex));
    else warnings.push(`unknown sky colour ${def.sky}`);
  }
  for (const b of def.backdrop ?? []) drawThing(ctx, out, b, raw(b));

  // 2. Terrain. A display tile whose corners fit one pair and one theme draws that pair's tile.
  // Otherwise each quarter draws its own cell's pair, leaving a straight seam at the cell edge
  // for an overlay or a wall to cover. Void quarters draw nothing.
  const drawCell = (
    target: Canvas,
    i: number,
    j: number,
    corners: readonly GroundCell[],
    px: number,
    py: number,
  ) => {
    const draw = (set: (typeof pairs)[number], mask: number, theme: string, clip?: Rect) => {
      const list = set.masks[mask] ?? [];
      const index = list[hash2(i, j, def.seed) % Math.max(1, list.length)];
      const atlas = tiles(theme);
      if (index !== undefined && atlas)
        target.blit(atlas, tileRect(index), px, py, NO_MAP, false, clip);
    };
    const ids = new Set(corners.map((c) => c.terrain));
    const themes = new Set(corners.map(themeOf));
    const fit = ids.has(null)
      ? undefined
      : pairs.find((p) => [...ids].every((t) => t === p.upper || t === p.lower));
    if (fit && themes.size === 1) {
      const mask = corners.reduce((m, c, k) => m | (c.terrain === fit.upper ? 1 << k : 0), 0);
      draw(fit, mask, themeOf(corners[3] as GroundCell));
      return;
    }
    corners.forEach((c, k) => {
      if (c.terrain === null) return;
      const own = pairs.find((p) => p.upper === c.terrain || p.lower === c.terrain);
      if (!own) {
        warnings.push(`no terrain pair has "${c.terrain}"`);
        return;
      }
      const mask = corners.reduce((m, o, q) => {
        const same =
          (o.terrain === own.upper || o.terrain === own.lower) && themeOf(o) === themeOf(c);
        return m | ((same ? o.terrain : c.terrain) === own.upper ? 1 << q : 0);
      }, 0);
      const [qx, qy] = QUADS[k] as Vec;
      draw(own, mask, themeOf(c), { x: px + qx, y: py + qy, w: 8, h: 8 });
    });
  };
  // Edges with a shape cut the ground along it: each side is drawn as if it filled the tile,
  // and the shape picks between them per pixel.
  const cuts = (def.edges ?? []).flatMap((edge) => {
    const first = typeof edge.overlay === "string" ? edge.overlay : edge.overlay[0];
    const o = first ? meta.overlays[first] : undefined;
    if (!o?.shapes) return [];
    const grid: TerrainGrid = {
      w: W,
      h: H,
      cells: ctx.cells.list.map((c) => (edge.inside.includes(c.char) ? 1 : 0)),
    };
    return [{ edge, o, shapes: o.shapes, grid }];
  });
  const sideA = new Canvas(TILE, TILE);
  const sideB = new Canvas(TILE, TILE);
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const corners = [at(i - 1, j - 1), at(i, j - 1), at(i - 1, j), at(i, j)];
      const px = i * TILE - TILE / 2;
      const py = j * TILE - TILE / 2;
      const cut = corners.some((c) => c.terrain === null)
        ? undefined
        : cuts.find((c) => {
            const m = dualMask(c.grid, 1, i, j);
            return m !== 0 && m !== 15;
          });
      const mask = cut ? dualMask(cut.grid, 1, i, j) : 0;
      const list = cut ? (cut.o.masks[mask] ?? []) : [];
      const index = list[hash2(i, j, def.seed + 11) % Math.max(1, list.length)];
      const hex = index !== undefined && cut ? cut.shapes[String(index)] : undefined;
      if (!cut || !hex) {
        drawCell(out, i, j, corners, px, py);
        continue;
      }
      const isIn = corners.map((c) => cut.edge.inside.includes(c.char));
      /** Corners with the other side's corners swapped for a neighbour on this side. */
      const side = (inside: boolean) =>
        corners.map((c, k) => {
          if (isIn[k] === inside) return c;
          const q = [k ^ 1, k ^ 2, 3 - k].find((n) => isIn[n] === inside) as number;
          return corners[q] as GroundCell;
        });
      sideA.data.fill(0);
      sideB.data.fill(0);
      drawCell(sideA, i, j, side(false), 0, 0);
      drawCell(sideB, i, j, side(true), 0, 0);
      for (let y = 0; y < TILE; y++) {
        const ty = py + y - out.oy;
        if (ty < 0 || ty >= out.h) continue;
        for (let x = 0; x < TILE; x++) {
          const tx = px + x - out.ox;
          if (tx < 0 || tx >= out.w) continue;
          const bit =
            (Number.parseInt(hex[(y * TILE + x) >> 2] as string, 16) >> (3 - (x & 3))) & 1;
          const src = bit ? sideB : sideA;
          const si = (y * TILE + x) * 4;
          if ((src.data[si + 3] as number) === 0) continue;
          out.data.set(src.data.subarray(si, si + 4), (ty * out.w + tx) * 4);
        }
      }
    }
  }

  // Tones and scattered decals, once per terrain id, from the first pair that has them.
  const only = (id: string): TerrainGrid => ({
    w: W,
    h: H,
    cells: ctx.cells.list.map((c) => (c.terrain === id ? 1 : 0)),
  });
  const ids = [...new Set(ctx.cells.list.map((c) => c.terrain))].filter(
    (t): t is string => t !== null,
  );
  for (const id of ids) {
    const side = (p: (typeof pairs)[number]) =>
      p.upper === id ? "upper" : p.lower === id ? "lower" : null;
    const toned = pairs.find((p) => p.tones.some((t) => t.on === side(p)));
    const grid = only(id);
    for (const tone of toned?.tones.filter((t) => t.on === side(toned)) ?? []) {
      const picks = pickTone(grid, 1, { ...tone, on: "upper" }, def.seed);
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const index = picks[j * (W + 1) + i] as number;
          const atlas = index >= 0 ? tiles(themeOf(at(i, j))) : undefined;
          if (atlas) out.blit(atlas, tileRect(index), i * TILE - 8, j * TILE - 8);
        }
      }
    }
    const decorated = pairs.find((p) => p.decals.some((d) => d.on === side(p) && d.density > 0));
    if (!decorated) continue;
    const rules = decorated.decals.filter((d) => d.on === side(decorated));
    const placed = scatterDecals(
      grid,
      1,
      rules.map((d) => ({ on: "upper" as const, density: d.density, w: d.w, h: d.h })),
      def.seed,
    );
    for (const d of placed) {
      const rule = rules[d.decal];
      const atlas = tiles(themeOf(at(Math.floor(d.x / TILE), Math.floor(d.y / TILE))));
      const f = rule && atlas?.frames[rule.frame];
      if (atlas && f) out.blit(atlas, f.frame, d.x, d.y);
    }
  }

  // 3. Ground details.
  for (const d of def.details ?? []) {
    if ("decal" in d) {
      const theme = themeOf(at(Math.floor(d.at[0] / TILE), Math.floor(d.at[1] / TILE)));
      const found = frameOf(ctx, `tiles-${theme}`, d.decal);
      if (found) out.blit(found.atlas, found.f.frame, d.at[0], d.at[1]);
    } else drawThing(ctx, out, d, raw(d));
  }

  // 4. Overlay edges, in the pass theme: they belong to the ground outside.
  for (const edge of def.edges ?? []) {
    const names = typeof edge.overlay === "string" ? [edge.overlay] : edge.overlay;
    const name = names[Math.floor(ctx.time * (edge.fps ?? 0)) % names.length] as string;
    const o = meta.overlays[name];
    const atlas = tiles(passTheme);
    if (!o || !atlas) {
      warnings.push(`no overlay ${name}`);
      continue;
    }
    const inside: TerrainGrid = {
      w: W,
      h: H,
      cells: ctx.cells.list.map((c) => (edge.inside.includes(c.char) ? 1 : 0)),
    };
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        // Edges are ground art: none where the ground ends at the void.
        const corners = [at(i - 1, j - 1), at(i, j - 1), at(i - 1, j), at(i, j)];
        if (corners.some((c) => c.terrain === null)) continue;
        const list = o.masks[dualMask(inside, 1, i, j)] ?? [];
        const index = list[hash2(i, j, def.seed + 11) % Math.max(1, list.length)];
        if (index !== undefined) out.blit(atlas, tileRect(index), i * TILE - 8, j * TILE - 8);
      }
    }
  }

  if (groundOnly) return out;

  // 5. Shadows: one mask from the shadow layer and every object's own shadow, then the ground
  // under it one ramp step darker, or painted in the scene's shade theme.
  const mask = new Canvas(out.w, out.h, out.ox, out.oy);
  for (const s of def.shadows ?? []) {
    if ("poly" in s) fillPoly(mask, s);
    else drawThing(ctx, mask, s, NO_MAP);
  }
  const sorted: { y: number; x: number; draw: () => void }[] = [];
  for (const o of def.objects) {
    if (!("rig" in o)) {
      drawThing(ctx, mask, o, NO_MAP, true);
      const map = "prop" in o ? raw(o) : NO_MAP;
      sorted.push({ y: o.sort ?? o.at[1], x: o.at[0], draw: () => drawThing(ctx, out, o, map) });
      continue;
    }
    const doll = composeDoll(ctx, o);
    if (!doll) continue;
    const atFeet: Vec = o.at;
    if (doll.shadow) place(mask, doll.shadow, doll.origin, atFeet, NO_MAP, o.flip ?? false);
    sorted.push({
      y: o.sort ?? atFeet[1],
      x: atFeet[0],
      draw: () => {
        const { img, origin } = doll;
        const flip = o.flip ?? false;
        const left = flip ? atFeet[0] - (img.w - 1 - origin[0]) : atFeet[0] - origin[0];
        out.blit(
          img,
          { x: 0, y: 0, w: img.w, h: img.h },
          left,
          atFeet[1] - origin[1],
          NO_MAP,
          flip,
        );
      },
    });
  }
  const shade = toMap(meta.shade);
  const shaded = def.shade ? renderPass({ ...ctx, warnings: [] }, def.shade, view, "ground") : null;
  for (let i = 0; i < mask.data.length; i += 4) {
    if (mask.data[i + 3] === 0) continue;
    if (shaded && (shaded.data[i + 3] as number) > 0) {
      out.data.set(shaded.data.subarray(i, i + 4), i);
      continue;
    }
    const rgb =
      ((out.data[i] as number) << 16) |
      ((out.data[i + 1] as number) << 8) |
      (out.data[i + 2] as number);
    const to = shade.get(rgb) ?? rgb;
    out.data[i] = to >> 16;
    out.data[i + 1] = (to >> 8) & 255;
    out.data[i + 2] = to & 255;
  }
  shadowMask?.(mask);
  if (stage === "shaded") return out;

  // 6 and 7. Objects by their feet, then everything overhead.
  sorted.sort((a, b) => a.y - b.y || a.x - b.x);
  for (const s of sorted) s.draw();
  for (const o of def.overhead ?? []) drawThing(ctx, out, o, raw(o));
  return out;
}

/** Composites a rig look into one image, with its shadow layer kept apart. */
function composeDoll(ctx: Ctx, o: Doll) {
  const r = ctx.meta.rigs[o.rig];
  if (!r) {
    ctx.warnings.push(`no rig ${o.rig}`);
    return undefined;
  }
  const lookName = o.look && r.looks[o.look] ? o.look : Object.keys(r.looks)[0];
  if (o.look && lookName !== o.look) ctx.warnings.push(`${o.rig}: no look "${o.look}"`);
  const look = lookName ? r.looks[lookName] : undefined;
  if (!look) return undefined;
  const dir = o.dir && r.directions.includes(o.dir) ? o.dir : r.directions[0];
  const frame = pickFrame(ctx, o.rig, r.frames, r.anims, o, "", null);
  const slotMap = slotColors(ctx.meta, look.slots ?? {});
  const key = (layer: string) => {
    const part = look.parts[layer];
    return part ? `${o.rig}/${layer}/${part}/${dir}/${frame}` : null;
  };
  const img = new Canvas(r.size[0], r.size[1]);
  for (const layer of r.layers) {
    if (layer === "shadow") continue;
    const k = key(layer);
    const found = k ? frameOf(ctx, r.atlas, k) : undefined;
    if (found) place(img, found, [0, 0], [0, 0], slotMap, false);
  }
  const sk = key("shadow");
  const shadow = sk ? frameOf(ctx, r.atlas, sk) : undefined;
  return { img, origin: r.origin, shadow };
}

/** Slot key colour to the chosen option's colour, for compositing a look. */
function slotColors(meta: SceneMeta, choice: Table<string>): ColorMap {
  const map = new Map<number, number>();
  for (const [slot, def] of Object.entries(meta.slots)) {
    const option = def.options[choice[slot] ?? Object.keys(def.options)[0] ?? ""];
    if (!option) continue;
    for (const [step, key] of Object.entries(def.keys)) {
      const to = option[step];
      if (to) map.set(hexKey(key), hexKey(to));
    }
  }
  return map;
}
