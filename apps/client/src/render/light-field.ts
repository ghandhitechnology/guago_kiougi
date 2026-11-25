/**
 * The light field: everything that lights a map, drawn each frame into one render texture (the
 * light map) and readable on the CPU.
 *
 * The light map covers the screen and a margin around it, so a sprite whose feet are below the
 * screen's edge still finds the light it stands in. It stores half the light (0.5 is the art as
 * drawn), so light can rise to twice the art before it clips. It renders during the frame
 * through its own camera, kept on the main camera's whole-pixel scroll, so it never lags.
 *
 * Map lights are shaped once when the map opens: a pool or a window's spill, cut by the walls
 * between it and every pixel (the baked mask's wall tiles), at pixel resolution along tile-scale
 * walls. Lights carried by entities and flashes are plain pools and pass through walls; they are
 * small and short.
 */
import { valueNoise } from "@guago/art";
import type { LightSource } from "@guago/content";
import * as Phaser from "phaser";
import { worldScroll } from "./cutaway.ts";
import { colorOf, rgbOf } from "./grade.ts";
import type { MapMasks, Rect, RegionLight } from "./rift.ts";
import { TEX } from "./textures.ts";

/** Pixels the light map reaches past each edge of the screen. */
export const LIGHT_MARGIN = 128;

type Rgb = [number, number, number];

export interface LightSpec {
  /** Pixels across the pool's half width. */
  readonly radius: number;
  readonly color: number;
  /** Light added at the pool's centre; the art shows as drawn at an ambient plus this of 1. */
  readonly intensity: number;
  readonly flicker?: { readonly amount: number; readonly period: number };
  /** Height of the pool on the ground over its width; light falls on the ground in 3/4 view. */
  readonly squash?: number;
  /** From an entity's feet. */
  readonly offset?: readonly [number, number];
}

export interface FlashSpec {
  readonly radius: number;
  readonly color: number;
  /** Light at the centre at the flash's peak. */
  readonly intensity: number;
  /** Milliseconds from peak to dark. */
  readonly ms: number;
  readonly squash?: number;
}

export interface Light {
  spec: LightSpec;
  x: number;
  y: number;
  readonly image: Phaser.GameObjects.Image;
  readonly seed: number;
  /** Set for lights carried by an entity. */
  readonly owner:
    | (Phaser.GameObjects.Components.Transform & Phaser.GameObjects.Components.Visible)
    | null;
  /** 0 to 1 from the prop whose frames switch this light on and off (a sputtering floodlight). */
  follows: (() => number) | null;
  /** Light added at the centre this frame, after flicker. */
  level: number;
  /** A shaped light: its texture's place in the world and its strength per pixel. */
  shape: { readonly rect: Rect; readonly alpha: Uint8Array } | null;
  /** Daylight through a window: never dimmed for a bright ambient. */
  window: boolean;
}

interface Flash {
  readonly image: Phaser.GameObjects.Image;
  spec: FlashSpec;
  age: number;
  live: boolean;
}

/** A smooth wobble in [-1, 1] over time, never quite repeating. */
export function wobble(t: number, period: number, seed: number): number {
  const w = (2 * Math.PI) / period;
  return (
    0.55 * Math.sin(t * w + seed) +
    0.3 * Math.sin(t * w * 2.31 + seed * 1.7) +
    0.15 * Math.sin(t * w * 5.13 + seed * 0.3)
  );
}

/** The wall tiles of a map from the baked mask: one byte per tile. */
function wallTiles(masks: MapMasks): { w: number; h: number; walls: Uint8Array } {
  const w = Math.ceil(masks.w / 16);
  const h = Math.ceil(masks.h / 16);
  const walls = new Uint8Array(w * h);
  for (let ty = 0; ty < h; ty++) {
    for (let tx = 0; tx < w; tx++) {
      const px = Math.min(masks.w - 1, tx * 16 + 8);
      const py = Math.min(masks.h - 1, ty * 16 + 8);
      walls[ty * w + tx] = (masks.wall[py * masks.w + px] ?? 0) > 0 ? 1 : 0;
    }
  }
  return { w, h, walls };
}

/**
 * Whether light from (ox, oy) reaches (px, py) past the wall tiles: a walk through the tile grid
 * along the ray. The wall the light is mounted in is left behind before walls count, and a
 * pixel on a wall face counts as lit when the floor line at the face's foot is.
 */
function reaches(
  grid: { w: number; h: number; walls: Uint8Array },
  ox: number,
  oy: number,
  px: number,
  py: number,
): boolean {
  const { w, h, walls } = grid;
  const wallAt = (tx: number, ty: number) =>
    tx < 0 || ty < 0 || tx >= w || ty >= h ? false : walls[ty * w + tx] === 1;
  const tx1 = Math.floor(px / 16);
  let ty1 = Math.floor(py / 16);
  if (wallAt(tx1, ty1)) {
    while (wallAt(tx1, ty1 + 1)) ty1++;
    py = ty1 * 16 + 15.5;
  }
  let tx = Math.floor(ox / 16);
  let ty = Math.floor(oy / 16);
  const dx = px - ox;
  const dy = py - oy;
  const stepX = dx > 0 ? 1 : -1;
  const stepY = dy > 0 ? 1 : -1;
  const tDeltaX = dx === 0 ? Number.POSITIVE_INFINITY : Math.abs(16 / dx);
  const tDeltaY = dy === 0 ? Number.POSITIVE_INFINITY : Math.abs(16 / dy);
  let tMaxX =
    dx === 0
      ? Number.POSITIVE_INFINITY
      : (dx > 0 ? (tx + 1) * 16 - ox : ox - tx * 16) / Math.abs(dx);
  let tMaxY =
    dy === 0
      ? Number.POSITIVE_INFINITY
      : (dy > 0 ? (ty + 1) * 16 - oy : oy - ty * 16) / Math.abs(dy);
  let escaped = !wallAt(tx, ty);
  for (let n = 0; n < 256; n++) {
    if (tx === tx1 && ty === ty1) return true;
    if (tMaxX < tMaxY) {
      tx += stepX;
      tMaxX += tDeltaX;
    } else {
      ty += stepY;
      tMaxY += tDeltaY;
    }
    if (tx === tx1 && ty === ty1) return true;
    const wall = wallAt(tx, ty);
    if (!escaped) {
      if (!wall) escaped = true;
      continue;
    }
    if (wall) return false;
  }
  return true;
}

export class LightField {
  readonly rt: Phaser.GameObjects.RenderTexture;
  readonly layer: Phaser.GameObjects.Layer;
  readonly lights = new Set<Light>();
  private readonly scene: Phaser.Scene;
  private readonly lightCamera: Phaser.Cameras.Scene2D.Camera;
  private readonly ambientImage: Phaser.GameObjects.Image;
  private readonly grid: { w: number; h: number; walls: Uint8Array };
  private readonly flashes: Flash[] = [];
  private readonly textureKeys: string[] = [];
  private region: {
    readonly light: RegionLight;
    readonly spill: readonly [Phaser.GameObjects.Image, Phaser.GameObjects.Image];
    readonly color: Rgb;
  } | null = null;
  ambient: Rgb;

  private readonly id: string;
  private readonly masks: MapMasks;
  private readonly camera: Phaser.Cameras.Scene2D.Camera;
  private readonly seed: number;

  constructor(
    scene: Phaser.Scene,
    id: string,
    masks: MapMasks,
    camera: Phaser.Cameras.Scene2D.Camera,
    ambient: Rgb,
    seed: number,
  ) {
    this.id = id;
    this.masks = masks;
    this.camera = camera;
    this.seed = seed;
    this.scene = scene;
    this.ambient = ambient;
    this.grid = wallTiles(masks);
    const M = LIGHT_MARGIN;
    const W = camera.width + 2 * M;
    const H = camera.height + 2 * M;
    this.rt = scene.add.renderTexture(0, 0, W, H).setOrigin(0).setScrollFactor(0);
    this.rt.setRenderMode("redraw").setDepth(-1000);
    this.layer = scene.make.layer({}, false).setBlendMode(Phaser.BlendModes.SKIP_CHECK);
    this.lightCamera = new Phaser.Cameras.Scene2D.Camera(0, 0, W, H).setScene(scene, false);
    this.lightCamera.setRoundPixels(true);
    this.ambientImage = new Phaser.GameObjects.Image(scene, 0, 0, TEX.px)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDisplaySize(W, H);
    this.layer.add(this.ambientImage);
    this.setAmbient(ambient);
    this.rt.preserve(true);
    // At render time, after the main camera has moved, the light camera takes its scroll.
    this.rt.callback(() => {
      const [sx, sy] = worldScroll(this.camera);
      this.lightCamera.setScroll(sx - M, sy - M);
      // A camera outside the scene's camera list computes its matrix only when asked.
      this.lightCamera.preRender();
    });
    this.rt.capture(this.layer, { camera: this.lightCamera });
  }

  /** The light map's texture, for the filters. */
  get texture(): Phaser.Renderer.WebGL.Wrappers.WebGLTextureWrapper | null {
    return (this.rt.texture as Phaser.Textures.DynamicTexture).getWebGLTexture();
  }

  setAmbient(ambient: Rgb): void {
    this.ambient = ambient;
    this.ambientImage.setTint(colorOf(ambient.map((v) => Math.min(1, v / 2)) as Rgb));
  }

  setVisible(on: boolean): void {
    this.rt.setVisible(on);
  }

  /** The rift's light: its spills first, then its daylight written over them. */
  setRegion(region: RegionLight, color: number): void {
    const at = (key: string, r: Rect) =>
      new Phaser.GameObjects.Image(this.scene, r.x, r.y, key).setOrigin(0);
    const spill = region.spillKeys.map((key) =>
      at(key, region.rect).setBlendMode(Phaser.BlendModes.ADD).setTint(color),
    ) as [Phaser.GameObjects.Image, Phaser.GameObjects.Image];
    const inside = at(region.insideKey, region.insideRect).setTint(0x808080);
    this.layer.addAt([...spill, inside], 1);
    this.region = { light: region, spill, color: [...rgbOf(color)] };
  }

  /** Sets the rift spill's two ray patterns' strength this frame. */
  setRegionLevels(a: number, b: number): void {
    this.region?.spill[0].setAlpha(Math.max(0, Math.min(1, a / 2)));
    this.region?.spill[1].setAlpha(Math.max(0, Math.min(1, b / 2)));
  }

  /**
   * A light of the map, shaped once: a pool lying where the sheet paints it (or around the
   * light), or a window's spill, cut by walls as seen from the light itself.
   */
  addStatic(source: LightSource, color: number, index: number): Light {
    const paint = source.paint;
    const spec: LightSpec = {
      radius: source.radius,
      color,
      intensity: source.intensity,
      squash: paint?.r ? paint.r[1] / paint.r[0] : 0.58,
      ...(source.flicker ? { flicker: source.flicker } : {}),
    };
    const light = this.create(spec, source.at[0], source.at[1], null);
    let rect: Rect;
    let value: (x: number, y: number) => number;
    if (paint?.spill) {
      const { top, bottom } = paint.spill;
      const pad = 3;
      const x0 = Math.floor(Math.min(top[0], bottom[0])) - pad;
      const x1 = Math.ceil(Math.max(top[1], bottom[1])) + pad;
      rect = { x: x0, y: top[2], w: x1 - x0, h: bottom[2] - top[2] + pad };
      const span = Math.max(1, bottom[2] - top[2]);
      value = (wx, wy) => {
        const v = (wy - top[2]) / span;
        const a = top[0] + (bottom[0] - top[0]) * Math.min(1, v);
        const b = top[1] + (bottom[1] - top[1]) * Math.min(1, v);
        const half = Math.max(1, (b - a) / 2);
        const n = (valueNoise(wx, wy, 3, this.seed + index) - 0.5) * 0.25;
        const f = Math.max(Math.abs(wx - (a + b) / 2) / half, v) + n;
        return f >= 1 ? 0 : (1 - f) ** 1.1;
      };
    } else {
      const [cx, cy] = paint?.at ?? source.at;
      const R = spec.radius;
      const Ry = R * (spec.squash ?? 0.58);
      rect = {
        x: Math.floor(cx - R),
        y: Math.floor(cy - Ry),
        w: Math.ceil(2 * R),
        h: Math.ceil(2 * Ry),
      };
      value = (wx, wy) => {
        const dx = (wx - cx) / R;
        const dy = (wy - cy) / Ry;
        const r2 = dx * dx + dy * dy;
        return r2 >= 1 ? 0 : (1 - r2) ** 2;
      };
    }
    const [ox, oy] = paint?.spill
      ? [(paint.spill.top[0] + paint.spill.top[1]) / 2, paint.spill.top[2] + 1]
      : source.at;
    const key = `render:light:${this.id}:${index}`;
    const alpha = new Uint8Array(rect.w * rect.h);
    if (this.scene.textures.exists(key)) this.scene.textures.remove(key);
    const tex = this.scene.textures.createCanvas(key, rect.w, rect.h);
    if (tex) {
      const ctx = tex.getContext();
      const img = ctx.createImageData(rect.w, rect.h);
      for (let y = 0; y < rect.h; y++) {
        for (let x = 0; x < rect.w; x++) {
          const wx = rect.x + x + 0.5;
          const wy = rect.y + y + 0.5;
          let v = value(wx, wy);
          if (v > 0 && !reaches(this.grid, ox, oy, wx, wy)) v = 0;
          const q = Math.round(Math.min(1, v) * 255);
          const o = (y * rect.w + x) * 4;
          img.data[o] = 255;
          img.data[o + 1] = 255;
          img.data[o + 2] = 255;
          img.data[o + 3] = q;
          alpha[y * rect.w + x] = q;
        }
      }
      ctx.putImageData(img, 0, 0);
      tex.refresh();
      this.textureKeys.push(key);
      light.image.setTexture(key).setOrigin(0).setPosition(rect.x, rect.y);
    }
    light.shape = { rect, alpha };
    light.window = paint?.spill !== undefined;
    return light;
  }

  /** A plain pool of light, standing or carried. */
  create(spec: LightSpec, x: number, y: number, owner: Light["owner"]): Light {
    const image = new Phaser.GameObjects.Image(this.scene, 0, 0, TEX.pool);
    image.setBlendMode(Phaser.BlendModes.ADD);
    this.layer.add(image);
    const light: Light = {
      spec,
      x,
      y,
      image,
      seed: Math.random() * 100,
      owner,
      follows: null,
      level: 0,
      shape: null,
      window: false,
    };
    this.lights.add(light);
    return light;
  }

  drop(light: Light): void {
    if (!this.lights.delete(light)) return;
    light.image.destroy();
  }

  /** A burst of light that fades from its peak to nothing: a hit, a cast, a spark. */
  flash(x: number, y: number, spec: FlashSpec): void {
    let f = this.flashes.find((k) => !k.live);
    if (!f) {
      if (this.flashes.length >= 512) return;
      const image = new Phaser.GameObjects.Image(this.scene, 0, 0, TEX.pool);
      image.setBlendMode(Phaser.BlendModes.ADD);
      this.layer.add(image);
      f = { image, spec, age: 0, live: false };
      this.flashes.push(f);
    }
    f.spec = spec;
    f.age = 0;
    f.live = true;
    const size = spec.radius * 2;
    f.image
      .setVisible(true)
      .setPosition(x, y)
      .setDisplaySize(size, size * (spec.squash ?? 0.58))
      .setTint(spec.color);
  }

  /** Flashes alive now. */
  get flashCount(): number {
    let n = 0;
    for (const f of this.flashes) if (f.live) n++;
    return n;
  }

  /**
   * Moves carried lights to their owners and sets every light's level for time `t`. Carried
   * lights beyond `budget` go dark, the farthest from the camera first.
   */
  update(t: number, deltaMs: number, budget: number): void {
    const cx = this.camera.scrollX + this.camera.width / 2;
    const cy = this.camera.scrollY + this.camera.height / 2;
    const carried = [...this.lights].filter((l) => l.owner);
    carried.sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy));
    const allowed = new Set(carried.slice(0, budget));
    for (const l of this.lights) {
      if (l.owner) {
        l.x = l.owner.x + (l.spec.offset?.[0] ?? 0);
        l.y = l.owner.y + (l.spec.offset?.[1] ?? 0);
      }
      const { spec } = l;
      let k = 1;
      if (spec.flicker) k += spec.flicker.amount * wobble(t, spec.flicker.period, l.seed);
      if (l.follows) k *= 0.08 + 0.92 * l.follows();
      if (l.owner && (!allowed.has(l) || !l.owner.visible)) k = 0;
      l.level = Math.max(0, Math.min(2, spec.intensity * k));
      l.image.setTint(spec.color).setAlpha(l.level / 2);
      if (!l.shape) {
        const size = spec.radius * 2;
        l.image.setPosition(l.x, l.y).setDisplaySize(size, size * (spec.squash ?? 0.58));
      }
    }
    for (const f of this.flashes) {
      if (!f.live) continue;
      f.age += deltaMs;
      const k = 1 - f.age / f.spec.ms;
      if (k <= 0) {
        f.live = false;
        f.image.setVisible(false);
        continue;
      }
      f.image.setAlpha(Math.min(1, (f.spec.intensity * k * k) / 2));
    }
  }

  /** The light falling on a point this frame, before banding: 1 shows the art as drawn. */
  lightAt(x: number, y: number): Rgb {
    const xi = Math.round(x);
    const yi = Math.round(y);
    const { w, h, inside } = this.masks;
    const r = this.region;
    const inTear =
      r !== null && xi >= 0 && yi >= 0 && xi < w && yi < h && (inside[yi * w + xi] ?? 0) > 0;
    const out: Rgb = inTear ? [1, 1, 1] : [...this.ambient];
    if (!inTear && r) {
      const rect = r.light.rect;
      const lx = xi - rect.x;
      const ly = yi - rect.y;
      if (lx >= 0 && ly >= 0 && lx < rect.w && ly < rect.h) {
        const i = ly * rect.w + lx;
        const a =
          ((r.light.spill[0][i] ?? 0) * r.spill[0].alpha +
            (r.light.spill[1][i] ?? 0) * r.spill[1].alpha) /
          127.5;
        for (let c = 0; c < 3; c++) out[c] = (out[c] as number) + (r.color[c] as number) * a;
      }
    }
    for (const l of this.lights) {
      if (l.level <= 0) continue;
      let v: number;
      if (l.shape) {
        const { rect, alpha } = l.shape;
        const lx = xi - rect.x;
        const ly = yi - rect.y;
        if (lx < 0 || ly < 0 || lx >= rect.w || ly >= rect.h) continue;
        v = ((alpha[ly * rect.w + lx] ?? 0) / 255) * l.level;
      } else {
        const R = l.spec.radius;
        const dx = (x - l.x) / R;
        const dy = (y - l.y) / (R * (l.spec.squash ?? 0.58));
        const r2 = dx * dx + dy * dy;
        if (r2 >= 1) continue;
        v = (1 - r2) ** 2 * l.level;
      }
      const col = rgbOf(l.spec.color);
      for (let c = 0; c < 3; c++) out[c] = (out[c] as number) + (col[c] as number) * v;
    }
    return out;
  }

  destroy(): void {
    this.layer.destroy();
    this.rt.destroy();
    this.lightCamera.destroy();
    for (const key of this.textureKeys) {
      if (this.scene.textures.exists(key)) this.scene.textures.remove(key);
    }
  }
}
