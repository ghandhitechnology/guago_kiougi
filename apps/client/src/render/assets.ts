/**
 * What a map needs from the art build, and nothing else: the metadata, the shared sprite atlas
 * (props, monsters, characters), the effects atlas (entity shadows), the built map and its
 * baked images. Tile atlases are never loaded: the ground arrives baked by the same renderer
 * as the contact sheet (`packages/art/src/build/bake.ts`).
 */
import type { ArtMetadata } from "@guago/art";
import type { BuiltMap } from "@guago/content";
import type * as Phaser from "phaser";

const files = import.meta.glob<string>(
  [
    "../../../../packages/art/dist/{art,core,effects}.{png,json}",
    "../../../../packages/art/dist/maps/*.{png,json}",
  ],
  { query: "?url", import: "default", eager: true },
);

function url(path: string): string {
  const hit = Object.entries(files).find(([p]) => p.endsWith(`/dist/${path}`));
  if (!hit) throw new Error(`art build output has no ${path}; run pnpm art:build`);
  return hit[1];
}

function has(path: string): boolean {
  return Object.keys(files).some((p) => p.endsWith(`/dist/${path}`));
}

/** Cache and texture keys. `art` and the atlas names match `../art.ts`. */
export const KEYS = {
  meta: "art",
  map: (id: string) => `map:${id}`,
  ground: (id: string) => `ground:${id}`,
  masks: (id: string) => `masks:${id}`,
} as const;

/** Atlases every map draws from. */
export const SHARED_ATLASES = ["core", "effects"] as const;

/**
 * The theme the engine lights. A map's `theme` is how the contact sheet paints it, lighting
 * included; when that theme is painted night, the game draws the daylight art under it and
 * lets the light make the night.
 */
export function litTheme(map: BuiltMap): string {
  return map.ambient.unlit ?? map.scene.theme;
}

/** Every file a map loads, by path inside the art build, for size reports. */
export function mapFiles(id: string): string[] {
  return [`maps/${id}.json`, `maps/${id}-ground.png`, `maps/${id}-masks.png`];
}

/** Every file loaded once for all maps. */
export function sharedFiles(): string[] {
  return ["art.json", ...SHARED_ATLASES.flatMap((a) => [`${a}.png`, `${a}.json`])];
}

/**
 * Queues everything map `id` needs on the scene's loader, skipping what is already loaded.
 * Start the loader after calling.
 */
export function loadMap(scene: Phaser.Scene, id: string): void {
  const { load, cache, textures } = scene;
  if (!cache.json.exists(KEYS.meta)) load.json(KEYS.meta, url("art.json"));
  for (const atlas of SHARED_ATLASES) {
    if (!textures.exists(atlas)) load.atlas(atlas, url(`${atlas}.png`), url(`${atlas}.json`));
  }
  if (!textures.exists(KEYS.masks(id))) load.image(KEYS.masks(id), url(`maps/${id}-masks.png`));
  if (!textures.exists(KEYS.ground(id))) load.image(KEYS.ground(id), url(`maps/${id}-ground.png`));
  if (!cache.json.exists(KEYS.map(id))) load.json(KEYS.map(id), url(`maps/${id}.json`));
}

/** Whether a built map exists for `id`. */
export function mapExists(id: string): boolean {
  return has(`maps/${id}.json`);
}

export function mapData(scene: Phaser.Scene, id: string): BuiltMap {
  const map = scene.cache.json.get(KEYS.map(id)) as BuiltMap | undefined;
  if (!map) throw new Error(`map ${id} is not loaded`);
  return map;
}

export function artMetadata(scene: Phaser.Scene): ArtMetadata {
  return scene.cache.json.get(KEYS.meta) as ArtMetadata;
}

/** Drops everything only map `id` used. Shared atlases and themed copies other maps use stay. */
export function unloadMap(scene: Phaser.Scene, id: string, keepThemes: readonly string[] = []) {
  const { textures, cache } = scene;
  for (const key of [KEYS.ground(id), KEYS.masks(id)])
    if (textures.exists(key)) textures.remove(key);
  const map = cache.json.get(KEYS.map(id)) as BuiltMap | undefined;
  if (map) {
    for (const key of themedKeys(litTheme(map))) {
      if (keepThemes.includes(litTheme(map))) continue;
      if (textures.exists(key)) textures.remove(key);
    }
  }
  cache.json.remove(KEYS.map(id));
}

// Themed copies of the sprite atlas -----------------------------------------------------------

function themedKeys(theme: string): string[] {
  return [`core@${theme}`, `core@${theme}:glow`];
}

function hexKey(hex: string): number {
  return Number.parseInt(hex.slice(1), 16);
}

/** Copies every frame of `from`, trims and pivots included, onto texture `to`. */
function copyFrames(from: Phaser.Textures.Texture, to: Phaser.Textures.Texture): void {
  for (const name of from.getFrameNames()) {
    const f = from.get(name);
    const g = to.add(name, 0, f.cutX, f.cutY, f.cutWidth, f.cutHeight);
    if (!g) continue;
    if (f.trimmed) g.setTrim(f.realWidth, f.realHeight, f.x, f.y, f.cutWidth, f.cutHeight);
    if (f.customPivot) {
      g.customPivot = true;
      g.pivotX = f.pivotX;
      g.pivotY = f.pivotY;
    }
  }
}

function atlasPixels(scene: Phaser.Scene, atlas: string) {
  const image = scene.textures.get(atlas).getSourceImage() as HTMLImageElement;
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
  ctx.drawImage(image, 0, 0);
  return { canvas, ctx, pixels: ctx.getImageData(0, 0, canvas.width, canvas.height) };
}

export interface ThemedAtlas {
  /** Texture key of the sprite atlas recoloured into the theme, or `core` when it changes nothing. */
  readonly key: string;
  /**
   * Texture key of the atlas holding only the pixels that glow when the theme paints night (lit
   * windows, lamp heads, screens), or null when the theme paints no night.
   */
  readonly glow: string | null;
  /** Frame names that hold at least one glowing pixel. */
  readonly glowing: ReadonlySet<string>;
}

/**
 * The palette steps that keep glowing at night: the colours lamps, lit windows and screens are
 * drawn in, which `campus-night` deliberately leaves alone.
 */
const GLOW_STEPS = ["gold.light", "gold.pale", "sea.light", "sea.pale"] as const;

/**
 * The sprite atlas in `theme`, built once per theme by recolouring the shared atlas on the CPU
 * exactly as the contact sheet does. When the map is lit from a daylight theme under a painted
 * night theme (`paintedNight`), also builds the glow atlas: the pixels the night theme leaves
 * bright, which the renderer draws unlit on top so lamps and windows shine in the dark.
 */
export function themedAtlas(
  scene: Phaser.Scene,
  meta: ArtMetadata,
  theme: string,
  paintedNight: string | null,
): ThemedAtlas {
  const [key, glowKey] = themedKeys(theme) as [string, string];
  const recolor = meta.recolor[theme] ?? {};
  const textures = scene.textures;
  const source = textures.get("core");
  let base = "core";
  if (Object.keys(recolor).length > 0) {
    if (!textures.exists(key)) {
      const { canvas, ctx, pixels } = atlasPixels(scene, "core");
      const map = new Map(Object.entries(recolor).map(([a, b]) => [hexKey(a), hexKey(b)]));
      const d = pixels.data;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] === 0) continue;
        const to = map.get(
          ((d[i] as number) << 16) | ((d[i + 1] as number) << 8) | (d[i + 2] as number),
        );
        if (to === undefined) continue;
        d[i] = to >> 16;
        d[i + 1] = (to >> 8) & 255;
        d[i + 2] = to & 255;
      }
      ctx.putImageData(pixels, 0, 0);
      const tex = textures.addCanvas(key, canvas);
      if (tex) copyFrames(source, tex);
    }
    base = key;
  }
  if (!paintedNight) return { key: base, glow: null, glowing: new Set() };

  const night = meta.recolor[paintedNight] ?? {};
  const glowColors = new Set(
    GLOW_STEPS.map((name) => {
      const [ramp, step] = name.split(".") as [string, string];
      return meta.palette.ramps[ramp]?.[step];
    })
      .filter((hex): hex is string => hex !== undefined && !(hex in night))
      .map(hexKey),
  );
  const { canvas, ctx, pixels } = atlasPixels(scene, base);
  const d = pixels.data;
  const lit = new Uint8Array(canvas.width * canvas.height);
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const rgb = ((d[i] as number) << 16) | ((d[i + 1] as number) << 8) | (d[i + 2] as number);
    if (d[i + 3] !== 0 && glowColors.has(rgb)) lit[p] = 1;
    else d[i + 3] = 0;
  }
  const glowing = new Set<string>();
  for (const name of source.getFrameNames()) {
    const f = source.get(name);
    search: for (let y = f.cutY; y < f.cutY + f.cutHeight; y++) {
      for (let x = f.cutX; x < f.cutX + f.cutWidth; x++) {
        if (lit[y * canvas.width + x]) {
          glowing.add(name);
          break search;
        }
      }
    }
  }
  if (!textures.exists(glowKey)) {
    ctx.putImageData(pixels, 0, 0);
    const tex = textures.addCanvas(glowKey, canvas);
    if (tex) copyFrames(source, tex);
  }
  return { key: base, glow: glowKey, glowing };
}
