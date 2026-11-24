/**
 * Scenes: one game screen composed only from the built atlases and art.json, for judging art in
 * context. A small seed for the real map format. Every placed thing names its layer by the list
 * it sits in, drawn back to front:
 *
 * 1. `sky` and `backdrop`: what lies past the map edge, shown through void cells.
 * 2. Terrain: the ASCII `ground` grid with its dual-grid tiles, tones and scattered decals.
 * 3. `details`: hand-placed ground art (field lines, cracks, puddles, fallen needles).
 * 4. `edges`: dual-grid overlays around marked cells, like a rift's torn border.
 * 5. `shadows`: ground shadows, plus every object's own; the ground under them drops one step.
 * 6. `objects`: props, monsters and characters, sorted by their feet.
 * 7. `overhead`: what characters walk behind: canopies, eaves, capitals.
 * 8. `lights`: stepped bands of other themes, brightest inside, with ragged edges.
 * 9. `atmosphere`: small animated sprites over everything: moths, drifting needles, motes.
 *
 * Night and lamp light are painted, not blended: a light is a palette theme, a shadow is one ramp
 * step. Monsters and characters never take a theme, so they read the same everywhere. Things
 * name atlas sprites only, so redrawn art shows up by itself. Browser-safe: the contact sheet
 * page and the static sheet both run this file.
 */
import {
  dualMask,
  hash2,
  pickTone,
  scatterDecals,
  type TerrainGrid,
  valueNoise,
} from "./dualgrid.ts";

export const SCREEN = { w: 480, h: 270 } as const;
const TILE = 16;
/** Cells across and down: the screen rounded up to whole cells. */
export const SCENE_CELLS = { w: SCREEN.w / TILE, h: Math.ceil(SCREEN.h / TILE) } as const;

type Vec = readonly [number, number];
type Dir = "down" | "up" | "side";

export interface Cell {
  /** A terrain id, the `upper` or `lower` of a pair like `grass` or `walk`; null is void. */
  readonly terrain: string | null;
  /** Overrides the scene theme for this cell, like `greece` across a rift. */
  readonly theme?: string;
}

/**
 * How a thing picks its frame: by name, or by animation and index. With `play` the animation
 * runs from `index` over time; the static sheet shows time zero.
 */
interface FramePick {
  readonly frame?: string;
  readonly anim?: string;
  readonly index?: number;
  readonly play?: boolean;
}

interface Placement extends FramePick {
  /** The art's anchor (its feet) in screen pixels. */
  readonly at: Vec;
  readonly flip?: boolean;
  /** Draws copies this many times, each one frame width further right. */
  readonly repeat?: number;
  /**
   * Moves from `at` to `to` over `period` seconds, then starts again, offset by `phase`
   * seconds. For things being carried somewhere: pages pulled into a rift, scraps lifting off.
   */
  readonly drift?: { readonly to: Vec; readonly period: number; readonly phase?: number };
}

/** Environment art. Takes the pass theme unless `raw`. */
export interface Prop extends Placement {
  readonly prop: string;
  readonly raw?: boolean;
}
/** A monster sprite in the master palette. `shadow` names a frame for sprites without one. */
export interface Actor extends Placement {
  readonly actor: string;
  readonly shadow?: string;
}
/** A paper-doll character. A layer named `shadow` is drawn as its ground shadow. */
export interface Doll extends Placement {
  readonly rig: string;
  readonly look?: string;
  readonly dir?: Dir;
}
/** A terrain decal frame like `campus-lawn/needles`, at its top left, in its cell's theme. */
export interface Decal {
  readonly decal: string;
  readonly at: Vec;
}

/**
 * Painted light: stepped bands of themes, brightest first, falling off into the scene theme.
 * Every band edge is broken by low-frequency noise, so no light ends on a clean curve. One shape
 * per light:
 *
 * - `at` and `r`: an ellipse, its bands evenly spaced out to `r`.
 * - `spill`: a trapezoid falling from a lit window or door, narrow at the top, wide below.
 * - `region`: the ground around cells whose legend character is in `region`, each band reaching
 *   the next distance in `reach` (pixels).
 */
export interface Light {
  readonly bands: readonly string[];
  readonly at?: Vec;
  readonly r?: Vec;
  readonly spill?: {
    readonly top: readonly [x0: number, x1: number, y: number];
    readonly bottom: readonly [x0: number, x1: number, y: number];
  };
  readonly region?: string;
  readonly reach?: readonly number[];
  /** Pixels of edge noise. Defaults to 3. */
  readonly ragged?: number;
  readonly pulse?: { readonly amount: number; readonly period: number };
}

/** Overlay tiles drawn around the cells whose legend character is in `inside`. */
export interface Edge {
  /** One overlay, or several cycled at `fps` for a pulse. */
  readonly overlay: string | readonly string[];
  readonly fps?: number;
  readonly inside: string;
}

export interface SceneDef {
  readonly name: string;
  readonly seed: number;
  /** Theme for terrain and props. */
  readonly theme: string;
  /** Palette name filling the screen before anything else. */
  readonly sky?: string;
  readonly legend: Readonly<Record<string, Cell>>;
  /** `SCENE_CELLS.w × SCENE_CELLS.h` characters. */
  readonly ground: string;
  readonly backdrop?: readonly Prop[];
  readonly details?: readonly (Decal | Prop)[];
  readonly edges?: readonly Edge[];
  readonly shadows?: readonly Prop[];
  readonly objects: readonly (Prop | Actor | Doll)[];
  readonly overhead?: readonly Prop[];
  readonly lights?: readonly Light[];
  readonly atmosphere?: readonly (Prop | Actor)[];
}

export function scene(def: SceneDef): SceneDef {
  return def;
}

// Inputs: the parts of art.json and the atlases a scene reads. -------------------------------

interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}
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

class Canvas implements Pixels {
  readonly w: number;
  readonly h: number;
  readonly data: Uint8ClampedArray;
  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.data = new Uint8ClampedArray(w * h * 4);
  }

  /** Copies opaque pixels of a source rect, recoloured, mirrored and clipped as asked. */
  blit(
    src: Pixels,
    from: Rect,
    dx: number,
    dy: number,
    map: ColorMap = NO_MAP,
    flip = false,
    clip?: Rect,
  ): void {
    const x0 = clip ? Math.max(0, clip.x) : 0;
    const y0 = clip ? Math.max(0, clip.y) : 0;
    const x1 = clip ? Math.min(this.w, clip.x + clip.w) : this.w;
    const y1 = clip ? Math.min(this.h, clip.y + clip.h) : this.h;
    for (let y = 0; y < from.h; y++) {
      const ty = dy + y;
      if (ty < y0 || ty >= y1) continue;
      for (let x = 0; x < from.w; x++) {
        const tx = dx + (flip ? from.w - 1 - x : x);
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
  field: Float32Array | null,
): number {
  const n = light.bands.length;
  const swell = light.pulse
    ? 1 + light.pulse.amount * Math.sin((2 * Math.PI * t) / light.pulse.period)
    : 1;
  const wobble = ragged(x, y, light.ragged ?? 3, seed);
  if (field && light.reach) {
    const d = (field[y * SCREEN.w + x] as number) + wobble;
    const k = light.reach.findIndex((r) => d < r * swell);
    return k < 0 ? n : k;
  }
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

/** Pixel distance to the nearest cell whose legend character is in `chars`, about Euclidean. */
function regionField(cells: readonly GroundCell[], chars: string): Float32Array {
  const { w, h } = SCREEN;
  const big = 1e6;
  const d = new Float32Array(w * h).fill(big);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = cells[Math.floor(y / TILE) * SCENE_CELLS.w + Math.floor(x / TILE)];
      if (c && chars.includes(c.char)) d[y * w + x] = 0;
    }
  }
  // Two-pass chamfer, weights 1 and √2.
  const at = (x: number, y: number) =>
    x < 0 || y < 0 || x >= w || y >= h ? big : (d[y * w + x] as number);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = Math.min(
        at(x, y),
        at(x - 1, y) + 1,
        at(x, y - 1) + 1,
        at(x - 1, y - 1) + 1.41,
        at(x + 1, y - 1) + 1.41,
      );
      d[y * w + x] = v;
    }
  for (let y = h - 1; y >= 0; y--)
    for (let x = w - 1; x >= 0; x--) {
      const v = Math.min(
        at(x, y),
        at(x + 1, y) + 1,
        at(x, y + 1) + 1,
        at(x + 1, y + 1) + 1.41,
        at(x - 1, y + 1) + 1.41,
      );
      d[y * w + x] = v;
    }
  return d;
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

function parseGround(def: SceneDef): GroundCell[] {
  const rows = def.ground
    .split("\n")
    .map((r) => r.trim())
    .filter((r) => r.length > 0);
  const { w, h } = SCENE_CELLS;
  const where = `scene ${def.name}`;
  if (rows.length !== h) throw new Error(`${where}: ground has ${rows.length} rows, not ${h}`);
  const cells: GroundCell[] = [];
  rows.forEach((row, y) => {
    const chars = [...row];
    if (chars.length !== w)
      throw new Error(`${where}: ground row ${y + 1} is ${chars.length} wide, not ${w}`);
    for (const ch of chars) {
      const cell = def.legend[ch];
      if (!cell) throw new Error(`${where}: "${ch}" in row ${y + 1} is not in the legend`);
      cells.push({ char: ch, terrain: cell.terrain, theme: cell.theme ?? null });
    }
  });
  return cells;
}

/**
 * Renders a scene at one game screen, at `time` seconds. `atlases` holds every atlas by name,
 * tile atlases as `tiles-<theme>`. Missing art is skipped and reported in `warnings`.
 */
export function renderScene(
  def: SceneDef,
  meta: SceneMeta,
  atlases: ReadonlyMap<string, SceneAtlas>,
  time = 0,
): SceneImage {
  const warnings: string[] = [];
  const cells = parseGround(def);
  const ctx = { def, meta, atlases, cells, time, warnings };
  const out = renderPass(ctx, def.theme);
  const lights = def.lights ?? [];
  if (lights.length > 0) {
    // Per pixel the brightest light wins, measured as the fraction of its bands still ahead.
    const pick: (string | null)[] = new Array(out.w * out.h).fill(null);
    const level = new Float32Array(out.w * out.h);
    lights.forEach((l, li) => {
      const field = l.region ? regionField(cells, l.region) : null;
      const n = l.bands.length;
      for (let y = 0; y < out.h; y++) {
        for (let x = 0; x < out.w; x++) {
          const k = bandAt(l, time, x, y, def.seed + li * 17, field);
          if (k >= n) continue;
          const v = (n - k) / n;
          const i = y * out.w + x;
          if (v > (level[i] as number)) {
            level[i] = v;
            pick[i] = l.bands[k] as string;
          }
        }
      }
    });
    const passes = new Map<string, Canvas>();
    for (const theme of new Set(pick)) {
      if (theme) passes.set(theme, renderPass({ ...ctx, warnings: [] }, theme));
    }
    pick.forEach((theme, i) => {
      const pass = theme ? passes.get(theme) : undefined;
      if (pass) out.data.set(pass.data.subarray(i * 4, i * 4 + 4), i * 4);
    });
  }
  for (const a of def.atmosphere ?? []) drawThing(ctx, out, a, NO_MAP);
  return { w: out.w, h: out.h, data: out.data, warnings: [...new Set(warnings)] };
}

interface Ctx {
  readonly def: SceneDef;
  readonly meta: SceneMeta;
  readonly atlases: ReadonlyMap<string, SceneAtlas>;
  readonly cells: readonly GroundCell[];
  readonly time: number;
  readonly warnings: string[];
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
): string | undefined {
  if (pick.frame && frames.includes(`${prefix}${pick.frame}`)) return `${prefix}${pick.frame}`;
  const anim = pick.anim ? anims[pick.anim] : undefined;
  if (anim && anim.frames.length > 0) {
    const step = pick.play ? Math.floor(ctx.time * anim.fps) : 0;
    return anim.frames[((pick.index ?? 0) + step) % anim.frames.length];
  }
  if (pick.frame || pick.anim)
    ctx.warnings.push(`${owner}: no frame or anim "${pick.frame ?? pick.anim}"`);
  return frames.find((f) => f !== skip) ?? frames[0];
}

/** Draws a frame with its anchor at `at`, restoring trimmed offsets. */
function place(
  target: Canvas,
  found: { atlas: SceneAtlas; f: AtlasFrame },
  origin: Vec,
  at: Vec,
  map: ColorMap,
  flip: boolean,
): void {
  const { f, atlas } = found;
  const left = flip ? at[0] - (f.sourceSize.w - 1 - origin[0]) : at[0] - origin[0];
  const sx = flip ? f.sourceSize.w - f.spriteSourceSize.x - f.frame.w : f.spriteSourceSize.x;
  target.blit(atlas, f.frame, left + sx, at[1] - origin[1] + f.spriteSourceSize.y, map, flip);
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
  for (let k = 0; k < (t.repeat ?? 1); k++) {
    place(out, found, origin, [ax + k * found.f.sourceSize.w, ay], map, t.flip ?? false);
  }
}

/** Where a placement is at time `t`, after its drift. */
function placeAt(p: Placement, t: number): Vec {
  if (!p.drift) return p.at;
  const { to, period, phase = 0 } = p.drift;
  const f = ((((t + phase) / period) % 1) + 1) % 1;
  return [Math.round(p.at[0] + (to[0] - p.at[0]) * f), Math.round(p.at[1] + (to[1] - p.at[1]) * f)];
}

function renderPass(ctx: Ctx, passTheme: string): Canvas {
  const { def, meta, cells, warnings } = ctx;
  const out = new Canvas(SCREEN.w, SCREEN.h);
  const { w: W, h: H } = SCENE_CELLS;
  const cellAt = (x: number, y: number) =>
    cells[Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))] as GroundCell;
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
      cells: cells.map((c) => (edge.inside.includes(c.char) ? 1 : 0)),
    };
    return [{ edge, o, shapes: o.shapes, grid }];
  });
  const sideA = new Canvas(TILE, TILE);
  const sideB = new Canvas(TILE, TILE);
  for (let j = 0; j <= H; j++) {
    for (let i = 0; i <= W; i++) {
      const corners = [cellAt(i - 1, j - 1), cellAt(i, j - 1), cellAt(i - 1, j), cellAt(i, j)];
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
        const ty = py + y;
        if (ty < 0 || ty >= out.h) continue;
        for (let x = 0; x < TILE; x++) {
          const tx = px + x;
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
    cells: cells.map((c) => (c.terrain === id ? 1 : 0)),
  });
  const ids = [...new Set(cells.map((c) => c.terrain))].filter((t): t is string => t !== null);
  for (const id of ids) {
    const side = (p: (typeof pairs)[number]) =>
      p.upper === id ? "upper" : p.lower === id ? "lower" : null;
    const toned = pairs.find((p) => p.tones.some((t) => t.on === side(p)));
    for (const tone of toned?.tones.filter((t) => t.on === side(toned)) ?? []) {
      const picks = pickTone(only(id), 1, { ...tone, on: "upper" }, def.seed);
      for (let j = 0; j <= H; j++) {
        for (let i = 0; i <= W; i++) {
          const index = picks[j * (W + 1) + i] as number;
          const atlas = index >= 0 ? tiles(themeOf(cellAt(i, j))) : undefined;
          if (atlas) out.blit(atlas, tileRect(index), i * TILE - 8, j * TILE - 8);
        }
      }
    }
    const decorated = pairs.find((p) => p.decals.some((d) => d.on === side(p) && d.density > 0));
    if (!decorated) continue;
    const rules = decorated.decals.filter((d) => d.on === side(decorated));
    const placed = scatterDecals(
      only(id),
      1,
      rules.map((d) => ({ on: "upper" as const, density: d.density, w: d.w, h: d.h })),
      def.seed,
    );
    for (const d of placed) {
      const rule = rules[d.decal];
      const atlas = tiles(themeOf(cellAt(Math.floor(d.x / TILE), Math.floor(d.y / TILE))));
      const f = rule && atlas?.frames[rule.frame];
      if (atlas && f) out.blit(atlas, f.frame, d.x, d.y);
    }
  }

  // 3. Ground details.
  for (const d of def.details ?? []) {
    if ("decal" in d) {
      const theme = themeOf(cellAt(Math.floor(d.at[0] / TILE), Math.floor(d.at[1] / TILE)));
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
      cells: cells.map((c) => (edge.inside.includes(c.char) ? 1 : 0)),
    };
    for (let j = 0; j <= H; j++) {
      for (let i = 0; i <= W; i++) {
        // Edges are ground art: none where the ground ends at the void.
        const corners = [cellAt(i - 1, j - 1), cellAt(i, j - 1), cellAt(i - 1, j), cellAt(i, j)];
        if (corners.some((c) => c.terrain === null)) continue;
        const list = o.masks[dualMask(inside, 1, i, j)] ?? [];
        const index = list[hash2(i, j, def.seed + 11) % Math.max(1, list.length)];
        if (index !== undefined) out.blit(atlas, tileRect(index), i * TILE - 8, j * TILE - 8);
      }
    }
  }

  // 5. Shadows: one mask from the shadow layer and every object's own shadow, then the ground
  // under it one ramp step darker.
  const mask = new Canvas(SCREEN.w, SCREEN.h);
  for (const s of def.shadows ?? []) drawThing(ctx, mask, s, NO_MAP);
  const sorted: { y: number; x: number; draw: () => void }[] = [];
  for (const o of def.objects) {
    if (!("rig" in o)) {
      drawThing(ctx, mask, o, NO_MAP, true);
      const map = "prop" in o ? raw(o) : NO_MAP;
      sorted.push({ y: o.at[1], x: o.at[0], draw: () => drawThing(ctx, out, o, map) });
      continue;
    }
    const doll = composeDoll(ctx, o);
    if (!doll) continue;
    const at: Vec = o.at;
    if (doll.shadow) place(mask, doll.shadow, doll.origin, at, NO_MAP, o.flip ?? false);
    sorted.push({
      y: at[1],
      x: at[0],
      draw: () => {
        const { img, origin } = doll;
        const flip = o.flip ?? false;
        const left = flip ? at[0] - (img.w - 1 - origin[0]) : at[0] - origin[0];
        out.blit(img, { x: 0, y: 0, w: img.w, h: img.h }, left, at[1] - origin[1], NO_MAP, flip);
      },
    });
  }
  const shade = toMap(meta.shade);
  for (let i = 0; i < mask.data.length; i += 4) {
    if (mask.data[i + 3] === 0) continue;
    const rgb =
      ((out.data[i] as number) << 16) |
      ((out.data[i + 1] as number) << 8) |
      (out.data[i + 2] as number);
    const to = shade.get(rgb) ?? rgb;
    out.data[i] = to >> 16;
    out.data[i + 1] = (to >> 8) & 255;
    out.data[i + 2] = to & 255;
  }

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
