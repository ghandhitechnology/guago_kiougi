import { EMBLEM_COLORS, EMBLEM_SHAPES, EMBLEM_SYMBOLS } from "@guago/content";
import { type Emblem, encodeEmblem } from "@guago/shared";
import type * as Phaser from "phaser";
import { uiArt } from "../ui/theme.ts";

/**
 * 과잠 emblems and jackets, painted in exact palette colours. The art draws every emblem part in
 * the stone ramp as a key (deep, dark, mid, light) and the hanging 과잠 in the `jacket` swap slot;
 * this repaints them pixel by pixel into a texture per emblem and size, so a club's colours are
 * the palette's own, never a tint.
 */

export type EmblemSize = "l" | "s";

const SIZES = {
  l: { shape: "emblem-shape", symbol: "emblem-symbol", w: 24, sym: 12 },
  s: { shape: "emblem-shape-s", symbol: "emblem-symbol-s", w: 11, sym: 5 },
} as const;

const KEY_STEPS = ["deep", "dark", "mid", "light"] as const;

function hex(c: string): number {
  return Number.parseInt(c.slice(1), 16);
}

/** Stone key colours to a ramp's deep, dark, mid and light. */
function rampSwap(ramp: string): Map<number, number> {
  const ramps = uiArt().palette.ramps;
  const keys = ramps.stone ?? {};
  const to = ramps[ramp] ?? keys;
  const swap = new Map<number, number>();
  for (const step of KEY_STEPS) {
    const from = keys[step];
    const into = to[step] ?? to.mid;
    if (from && into) swap.set(hex(from), hex(into));
  }
  return swap;
}

/** Copies an atlas frame onto a canvas at (x, y), repainting its colours through `swap`. */
function paintFrame(
  scene: Phaser.Scene,
  ctx: CanvasRenderingContext2D,
  frameName: string,
  x: number,
  y: number,
  swap: Map<number, number>,
): void {
  const atlas = scene.textures.get("ui");
  if (!atlas.has(frameName)) return;
  const f = atlas.get(frameName);
  const scratch = document.createElement("canvas");
  scratch.width = f.cutWidth;
  scratch.height = f.cutHeight;
  const sc = scratch.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
  sc.drawImage(
    atlas.getSourceImage() as CanvasImageSource,
    f.cutX,
    f.cutY,
    f.cutWidth,
    f.cutHeight,
    0,
    0,
    f.cutWidth,
    f.cutHeight,
  );
  const px = sc.getImageData(0, 0, f.cutWidth, f.cutHeight);
  const d = px.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const to = swap.get(
      ((d[i] as number) << 16) | ((d[i + 1] as number) << 8) | (d[i + 2] as number),
    );
    if (to === undefined) continue;
    d[i] = to >> 16;
    d[i + 1] = (to >> 8) & 0xff;
    d[i + 2] = to & 0xff;
  }
  sc.putImageData(px, 0, 0);
  ctx.drawImage(scratch, x + f.x, y + f.y);
}

/** The texture key of an emblem at a size, painted on first use. */
export function emblemTexture(scene: Phaser.Scene, emblem: Emblem, size: EmblemSize): string {
  const key = `emblem:${size}:${encodeEmblem(emblem)}`;
  if (scene.textures.exists(key)) return key;
  const s = SIZES[size];
  const canvas = document.createElement("canvas");
  canvas.width = s.w;
  canvas.height = s.w;
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  ctx.imageSmoothingEnabled = false;
  paintFrame(scene, ctx, `${s.shape}/${emblem.shape}`, 0, 0, rampSwap(emblem.shapeColor));
  // A small symbol in the shape's own colour would vanish: it takes the colour's deep step.
  const symbolSwap = rampSwap(emblem.symbolColor);
  if (size === "s" && emblem.symbolColor === emblem.shapeColor) {
    const deep = uiArt().palette.ramps[emblem.symbolColor]?.deep;
    const light = uiArt().palette.ramps.stone?.light;
    if (deep && light) symbolSwap.set(hex(light), hex(deep));
  }
  const at = Math.floor((s.w - s.sym) / 2);
  paintFrame(scene, ctx, `${s.symbol}/${emblem.symbol}`, at, at, symbolSwap);
  scene.textures.addCanvas(key, canvas);
  return key;
}

/** A swap slot's key colours to one of its options' colours. */
function slotSwap(slot: string, option: string): Map<number, number> {
  const s = uiArt().slots[slot];
  const colors = s?.options[option];
  const swap = new Map<number, number>();
  if (!s || !colors) return swap;
  for (const [step, keyColor] of Object.entries(s.keys)) {
    const to = colors[step];
    if (to) swap.set(hex(keyColor), hex(to));
  }
  return swap;
}

/**
 * The 6×6 crest a club wears on the 과잠's back, painted per emblem: the shape in the `emblem`
 * slot, the symbol in `mark`.
 */
export function crestTexture(scene: Phaser.Scene, emblem: Emblem): string {
  const key = `crest:${encodeEmblem(emblem)}`;
  if (scene.textures.exists(key)) return key;
  const canvas = document.createElement("canvas");
  canvas.width = 6;
  canvas.height = 6;
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  ctx.imageSmoothingEnabled = false;
  paintFrame(
    scene,
    ctx,
    `crest/shape/${emblem.shape}`,
    0,
    0,
    slotSwap("emblem", emblem.shapeColor),
  );
  // A symbol in the shape's own colour would vanish into it: it takes the colour's deep step.
  const symbolSwap = slotSwap("mark", emblem.symbolColor);
  if (emblem.symbolColor === emblem.shapeColor) {
    const mid = uiArt().slots.mark?.keys.mid;
    const deep = uiArt().slots.mark?.options[emblem.symbolColor]?.deep;
    if (mid && deep) symbolSwap.set(hex(mid), hex(deep));
  }
  paintFrame(scene, ctx, `crest/symbol/${emblem.symbol}`, 0, 0, symbolSwap);
  scene.textures.addCanvas(key, canvas);
  return key;
}

/** One large symbol alone in a colour, for the editor's symbol squares. */
export function symbolTexture(scene: Phaser.Scene, symbol: string, color: string): string {
  const key = `emblem-symbol:${symbol}.${color}`;
  if (scene.textures.exists(key)) return key;
  const s = SIZES.l;
  const canvas = document.createElement("canvas");
  canvas.width = s.sym;
  canvas.height = s.sym;
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  paintFrame(scene, ctx, `${s.symbol}/${symbol}`, 0, 0, rampSwap(color));
  scene.textures.addCanvas(key, canvas);
  return key;
}

/** The hanging 과잠 in a jacket colour (a `jacket` slot option). */
export function jacketTexture(scene: Phaser.Scene, jacket: string): string {
  const key = `jacket-hang:${jacket}`;
  if (scene.textures.exists(key)) return key;
  const slot = uiArt().slots.jacket;
  const swap = new Map<number, number>();
  const colors = slot?.options[jacket] ?? Object.values(slot?.options ?? {})[0];
  if (slot && colors) {
    for (const [step, keyColor] of Object.entries(slot.keys)) {
      const to = colors[step];
      if (to) swap.set(hex(keyColor), hex(to));
    }
  }
  const frame = scene.textures.getFrame("ui", "jacket-hang/idle");
  const canvas = document.createElement("canvas");
  canvas.width = frame?.width ?? 48;
  canvas.height = frame?.height ?? 54;
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  paintFrame(scene, ctx, "jacket-hang/idle", 0, 0, swap);
  scene.textures.addCanvas(key, canvas);
  return key;
}

/** Jacket colours a club may pick: the art's `jacket` slot options, in order. */
export function jacketColors(): string[] {
  return Object.keys(uiArt().slots.jacket?.options ?? {});
}

/** The swatch colour of a jacket option: its mid step. */
export function jacketSwatch(jacket: string): number {
  const c = uiArt().slots.jacket?.options[jacket]?.mid;
  return c ? hex(c) : 0;
}

/** The swatch colour of an emblem colour id (a ramp): its light step. */
export function rampSwatch(ramp: string): number {
  const r = uiArt().palette.ramps[ramp];
  const c = r?.light ?? r?.mid;
  return c ? hex(c) : 0;
}

/** Parts open to a club of `level`, in content order. */
export function emblemParts(level: number) {
  const open = (p: { level: number }) => p.level <= level;
  return {
    shapes: EMBLEM_SHAPES.map((p) => ({ ...p, open: open(p) })),
    symbols: EMBLEM_SYMBOLS.map((p) => ({ ...p, open: open(p) })),
    colors: EMBLEM_COLORS.map((p) => ({ ...p, open: open(p) })),
  };
}

/** A new club's first emblem: the first part of each list. */
export function firstEmblem(): Emblem {
  return {
    shape: EMBLEM_SHAPES[0]?.id ?? "shield",
    shapeColor: EMBLEM_COLORS[3]?.id ?? "gold",
    symbol: EMBLEM_SYMBOLS[0]?.id ?? "pi",
    symbolColor: EMBLEM_COLORS[0]?.id ?? "ink",
  };
}
