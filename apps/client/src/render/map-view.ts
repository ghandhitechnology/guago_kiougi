/**
 * A built map drawn in the game: every layer of the map format, lit.
 *
 * Draw order, back to front, all inside one world layer that the grade filter colours:
 * - backdrop: the sky colour and what lies past the map edge, with parallax, unlit,
 * - ground: one baked image, the details that move, the rift's glowing lip, entity shadows and
 *   weather, lit pixel by pixel through the light map,
 * - objects: props and entities sorted by their feet, then overhead art (cut away around the
 *   player), foliage and atmosphere. Each sprite takes one light, the light map's value at its
 *   feet, banded the same way, so a column standing at the edge of a pool is lit as a whole
 *   instead of split by the ground behind it,
 * - glow: light itself, drawn additively: halos, the rift's inward motes, and effects drawn
 *   with `blend: "add"`.
 *
 * The light map is a render texture drawn first in the frame, through the same camera, so it
 * never lags the camera by a frame. Positions are world pixels; an entity's `x, y` is its feet.
 */
import type { ArtMetadata, SpriteMeta } from "@guago/art";
import { emitterParticle } from "@guago/art";
import type {
  Actor,
  BuiltMap,
  Doll,
  Emitter,
  FramePick,
  LightSource,
  Placement,
  Prop,
} from "@guago/content";
import * as Phaser from "phaser";
import { composeLook, lookTexture } from "../art.ts";
import { artMetadata, KEYS, litTheme, mapData, type ThemedAtlas, themedAtlas } from "./assets.ts";
import { bandLight, Grade, glTexture, LightComposite, registerComposite } from "./composite.ts";
import { Cutaway, registerCutaway } from "./cutaway.ts";
import { buildLut, colorOf, gradeFor, luma, NO_GRADE, paletteColor, rgbOf } from "./grade.ts";
import { buildRegionLight, type MapMasks, type Rect, type RegionLight, readMasks } from "./rift.ts";
import { makeTextures, TEX } from "./textures.ts";
import { qualityTier, TIER_SETTINGS, type Tier, type TierSettings } from "./tiers.ts";

export type LightingMode = "screen" | "object" | "off";

/** Layers the viewer can hide one by one. */
export const LAYER_NAMES = [
  "backdrop",
  "ground",
  "shadows",
  "objects",
  "overhead",
  "atmosphere",
  "glow",
  "weather",
] as const;
export type LayerName = (typeof LAYER_NAMES)[number];

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

export interface LightHandle {
  /** Changes the light; omitted fields stay. */
  set(spec: Partial<LightSpec>): void;
  /** Moves a free light. Attached lights follow their entity. */
  moveTo(x: number, y: number): void;
  remove(): void;
}

export interface EntityOptions {
  /**
   * The ground shadow drawn under it: a texture and frame, or false for none. Defaults to the
   * texture's own `shadow` frame when it has one, else the effects atlas's middle blob.
   */
  readonly shadow?: { readonly texture: string; readonly frame: string } | false;
  /** Overhead art near this entity cuts away. Usually the player alone. */
  readonly focus?: boolean;
  /**
   * Lit by the map (default true): tinted each frame by the light and shade at its feet. Skipped
   * while its tint mode is not MULTIPLY, so a white hit flash wins, and while the game holds a
   * tint of its own.
   */
  readonly lit?: boolean;
}

export interface MapViewOptions {
  readonly tier?: Tier;
  readonly lighting?: LightingMode;
  /** The camera the map is seen through. Defaults to the scene's main camera. */
  readonly camera?: Phaser.Cameras.Scene2D.Camera;
}

export interface RenderStats {
  readonly tier: Tier;
  readonly lighting: LightingMode;
  readonly objects: number;
  readonly visibleObjects: number;
  readonly entities: number;
  readonly lights: number;
  readonly particles: number;
}

type Rgb = [number, number, number];
type Lit = Phaser.GameObjects.Sprite | Phaser.GameObjects.Image;

/** Sprites far away from the camera stop drawing; this much margin hides the edge. */
const CULL_MARGIN = 48;
/** Sprites whose names say they are far sky, with how much they follow the camera. */
const PARALLAX: Readonly<Record<string, number>> = {
  "night-stars": 0.25,
  "night-moon": 0.12,
  "golden-sun": 0.18,
};
/** Overhead sprites that are leaves: they wave on the high tier. */
const FOLIAGE = /crown$|^pergola$/;
const SHADOW_ALPHA = 0.35;
/** A rift's spill is light relative to the tear's own daylight, which shows the art as drawn. */
const SPILL_SCALE = 0.85;

interface Placed {
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly bounds: Rect;
  /** Takes the light at its feet. Backdrop and additive art does not. */
  readonly lit: boolean;
}

interface Glow {
  readonly prop: Phaser.GameObjects.Sprite;
  /** The prop's glowing pixels, drawn just above it and never darkened. */
  readonly overlay: Phaser.GameObjects.Sprite;
  readonly halo: Phaser.GameObjects.Image;
  readonly bounds: Rect;
  /** How much of the prop glows, per frame name: lit pixels, and their centre. */
  readonly frames: ReadonlyMap<string, { n: number; cx: number; cy: number }>;
  readonly most: number;
  /** 0 to 1 for the current frame. */
  level: number;
}

interface Drift {
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly from: readonly [number, number];
  readonly to: readonly [number, number];
  readonly period: number;
  readonly phase: number;
}

interface Entity {
  readonly obj: Lit;
  readonly shadow: Phaser.GameObjects.Image | null;
  readonly focus: boolean;
  readonly lit: boolean;
  readonly light: Rgb;
  lastTint: number;
}

interface Light {
  spec: LightSpec;
  x: number;
  y: number;
  readonly image: Phaser.GameObjects.Image;
  readonly phaseSeed: number;
  /** Set for lights carried by an entity. */
  readonly owner: Lit | null;
  /** A prop whose frames switch this light on and off (a sputtering floodlight). */
  follows: Glow | null;
  /** Light added at the centre this frame, after flicker. */
  level: number;
  objectLight: Phaser.GameObjects.Light | null;
}

interface Particles {
  readonly emitter: Emitter;
  readonly sprites: Phaser.GameObjects.Sprite[];
  readonly frames: readonly string[];
  readonly fps: number;
}

/** A smooth wobble in [-1, 1] over time, never quite repeating. */
function wobble(t: number, period: number, seed: number): number {
  const w = (2 * Math.PI) / period;
  return (
    0.55 * Math.sin(t * w + seed) +
    0.3 * Math.sin(t * w * 2.31 + seed * 1.7) +
    0.15 * Math.sin(t * w * 5.13 + seed * 0.3)
  );
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export class MapView {
  readonly scene: Phaser.Scene;
  readonly map: BuiltMap;
  readonly meta: ArtMetadata;
  /** The map's size in pixels. */
  readonly width: number;
  readonly height: number;
  readonly camera: Phaser.Cameras.Scene2D.Camera;

  private tierName: Tier;
  private tier: TierSettings;
  private lighting: LightingMode;
  private readonly themed: ThemedAtlas;
  private readonly masks: MapMasks;

  private readonly world: Phaser.GameObjects.Layer;
  private readonly backdrop: Phaser.GameObjects.Layer;
  private readonly lit: Phaser.GameObjects.Layer;
  private readonly ground: Phaser.GameObjects.Layer;
  private readonly shadows: Phaser.GameObjects.Layer;
  private readonly weatherLayer: Phaser.GameObjects.Layer;
  private readonly objects: Phaser.GameObjects.Layer;
  private readonly overhead: Phaser.GameObjects.Layer;
  private readonly foliage: Phaser.GameObjects.Layer;
  private readonly atmosphere: Phaser.GameObjects.Layer;
  private readonly glowLayer: Phaser.GameObjects.Layer;
  /** Light lying on the ground (a rift's lip): unlit, under everything standing on it. */
  private readonly groundGlow: Phaser.GameObjects.Layer;
  private readonly lightLayer: Phaser.GameObjects.Layer;
  private readonly lightRT: Phaser.GameObjects.RenderTexture;

  private readonly composite: LightComposite;
  private readonly grade: Grade;
  private readonly cutOverhead: Cutaway;
  private readonly cutFoliage: Cutaway;
  private readonly lutKey: string;

  private readonly placed: Placed[] = [];
  private readonly overheadPlaced: Placed[] = [];
  private readonly glows: Glow[] = [];
  private readonly drifts: Drift[] = [];
  private readonly particles: Particles[] = [];
  private readonly entities = new Map<Phaser.GameObjects.GameObject, Entity>();
  private readonly lights = new Set<Light>();
  private readonly region: RegionLight | null;
  private readonly regionImages: {
    readonly inside: Phaser.GameObjects.Image;
    readonly spill: readonly [Phaser.GameObjects.Image, Phaser.GameObjects.Image];
    readonly glow: Phaser.GameObjects.Image;
    readonly motes: Phaser.GameObjects.Particles.ParticleEmitter;
    readonly color: Rgb;
  } | null;
  private regionObjectLight: Phaser.GameObjects.Light | null = null;
  private weather: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private readonly ambientLight: Rgb;
  /** Lights count for less in daylight: a lit window barely shows on sunny pavement. */
  private readonly lightScale: number;
  private readonly shadeTint: Rgb;
  private readonly animKeys = new Set<string>();
  private readonly hidden = new Set<LayerName>();
  private readonly offs: (() => void)[] = [];
  private time = 0;

  /** Builds the view of a map whose assets `loadMap` has loaded. */
  static create(scene: Phaser.Scene, id: string, options: MapViewOptions = {}): MapView {
    return new MapView(scene, id, options);
  }

  private constructor(scene: Phaser.Scene, id: string, options: MapViewOptions) {
    this.scene = scene;
    this.map = mapData(scene, id);
    this.meta = artMetadata(scene);
    this.camera = options.camera ?? scene.cameras.main;
    this.width = this.map.w * 16;
    this.height = this.map.h * 16;
    this.tierName = options.tier ?? qualityTier() ?? "high";
    this.tier = TIER_SETTINGS[this.tierName];
    this.lighting = options.lighting ?? "screen";
    makeTextures(scene);
    registerComposite(scene);
    registerCutaway(scene);

    const theme = litTheme(this.map);
    const paintedNight = theme !== this.map.scene.theme ? this.map.scene.theme : null;
    this.themed = themedAtlas(scene, this.meta, theme, paintedNight);
    this.masks = readMasks(scene, KEYS.masks(id));
    const W = this.camera.width;
    const H = this.camera.height;

    // The light map renders first in the frame, through the camera, and draws nothing itself.
    this.lightRT = scene.add.renderTexture(0, 0, W, H).setOrigin(0).setScrollFactor(0);
    this.lightRT.setRenderMode("redraw").setDepth(-1000);
    // A layer made from a config takes NORMAL blending, which would override its children's;
    // SKIP_CHECK lets each child blend its own way, as `add.layer` does.
    const layer = () => scene.make.layer({}, false).setBlendMode(Phaser.BlendModes.SKIP_CHECK);
    this.lightLayer = layer();
    this.world = scene.add.layer().setDepth(0);
    this.backdrop = layer();
    this.lit = layer();
    this.ground = layer();
    this.shadows = layer();
    this.weatherLayer = layer();
    this.objects = layer();
    this.overhead = layer();
    this.foliage = layer();
    this.atmosphere = layer();
    this.glowLayer = layer();
    this.groundGlow = layer();
    this.lit.add([this.ground, this.shadows, this.weatherLayer]);
    this.world.add([
      this.backdrop,
      this.lit,
      this.groundGlow,
      this.objects,
      this.overhead,
      this.foliage,
      this.atmosphere,
      this.glowLayer,
    ]);

    // Sky and ambient. The ambient takes its colour more the dimmer it is: a night is deep blue,
    // a late afternoon only a little gold.
    const skyName = this.map.scene.sky;
    this.backdrop.add(
      new Phaser.GameObjects.Image(scene, 0, 0, TEX.px)
        .setOrigin(0)
        .setScrollFactor(0)
        .setDisplaySize(W, H)
        .setTint(skyName ? paletteColor(this.meta, skyName) : 0),
    );
    const amb = rgbOf(paletteColor(this.meta, this.map.ambient.color));
    const norm = Math.max(0.05, luma(amb));
    const { intensity } = this.map.ambient;
    this.ambientLight = [...amb].map(
      (v) => intensity * (1 + (v / norm - 1) * (1 - intensity)),
    ) as Rgb;
    this.lightScale = Math.max(0.25, Math.min(1, 1.6 * (1 - intensity)));
    this.lightLayer.add(
      new Phaser.GameObjects.Image(scene, 0, 0, TEX.px)
        .setOrigin(0)
        .setScrollFactor(0)
        .setDisplaySize(W, H)
        .setTint(colorOf(this.ambientLight.map((v) => v / 2) as Rgb)),
    );
    this.shadeTint = [...rgbOf(this.map.time.phase === "night" ? 0x8c8aa8 : 0xb4accc)];

    // Ground: the baked image, then the details that move.
    this.ground.add(new Phaser.GameObjects.Image(scene, 0, 0, KEYS.ground(id)).setOrigin(0));
    for (const d of this.map.scene.details ?? []) {
      if ("prop" in d && d.play) this.placeThing(d, this.ground, 0, false);
    }
    for (const b of this.map.scene.backdrop ?? [])
      this.placeThing(b, this.backdrop, 0, false, true);
    for (const o of this.map.scene.objects) this.placeThing(o, this.objects, null, true);
    (this.map.scene.overhead ?? []).forEach((o, i) => {
      const p = this.placeThing(o, FOLIAGE.test(o.prop) ? this.foliage : this.overhead, i, true);
      if (p) this.overheadPlaced.push(p);
    });
    (this.map.scene.atmosphere ?? []).forEach((a, i) => {
      this.placeThing(a, this.atmosphere, i, true);
    });
    this.buildParticles();

    // Lights: the rift's region first, then every point light on top of it.
    this.region = this.buildRegion();
    this.regionImages = this.region ? this.buildRegionImages(this.region) : null;
    for (const source of this.map.lights) if (!source.paint?.region) this.addMapLight(source);
    this.lightRT.preserve(true);
    this.lightRT.capture(this.lightLayer, { camera: this.camera });

    // Filters: light on the ground, grade on the world, cutaway on what hangs overhead.
    this.lutKey = `render:lut:${id}`;
    buildLut(scene, this.lutKey, this.meta, gradeFor(this.meta, this.map));
    this.lit.enableFilters();
    this.composite = new LightComposite(this.lit.filterCamera);
    this.composite.light = (
      this.lightRT.texture as Phaser.Textures.DynamicTexture
    ).getWebGLTexture();
    this.lit.filters?.internal.add(this.composite);
    this.world.enableFilters();
    this.grade = new Grade(this.world.filterCamera);
    this.grade.lut = glTexture(scene, this.lutKey);
    if (this.region) {
      this.grade.rift = glTexture(scene, this.region.fxKey);
      const r = this.region.fxRect;
      this.grade.riftRect = [r.x, r.y, r.w, r.h];
    }
    this.world.filters?.internal.add(this.grade);
    this.overhead.enableFilters();
    this.cutOverhead = new Cutaway(this.overhead.filterCamera);
    this.overhead.filters?.internal.add(this.cutOverhead);
    this.foliage.enableFilters();
    this.cutFoliage = new Cutaway(this.foliage.filterCamera);
    this.foliage.filters?.internal.add(this.cutFoliage);

    this.buildWeather();
    this.applyTier();
    this.setLighting(this.lighting);

    const onUpdate = (_t: number, delta: number) => this.update(delta);
    scene.events.on(Phaser.Scenes.Events.POST_UPDATE, onUpdate);
    this.offs.push(() => scene.events.off(Phaser.Scenes.Events.POST_UPDATE, onUpdate));
    const onShutdown = () => this.destroy();
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, onShutdown);
    this.offs.push(() => scene.events.off(Phaser.Scenes.Events.SHUTDOWN, onShutdown));
    this.update(0);
  }

  // Public API -----------------------------------------------------------------------------

  /**
   * Adds an entity (player, monster, NPC) to the Y-sorted layer with its ground shadow. The
   * caller keeps moving it; the view sorts it by its feet and lights it every frame.
   */
  addEntity(obj: Lit, options: EntityOptions = {}): void {
    if (this.entities.has(obj)) return;
    this.objects.add(obj);
    let shadow: Phaser.GameObjects.Image | null = null;
    if (options.shadow !== false) {
      const own = options.shadow ?? this.defaultShadow(obj);
      if (own) {
        shadow = new Phaser.GameObjects.Image(this.scene, 0, 0, own.texture, own.frame);
        shadow.setAlpha(SHADOW_ALPHA);
        this.shadows.add(shadow);
        if (this.lighting === "object") shadow.setLighting(true);
      }
    }
    if (this.lighting === "object") obj.setLighting(true);
    this.entities.set(obj, {
      obj,
      shadow,
      focus: options.focus ?? false,
      lit: options.lit ?? true,
      light: [1, 1, 1],
      lastTint: 0xffffff,
    });
  }

  /** Takes an entity out of the view with its lights. The object itself is not destroyed. */
  removeEntity(obj: Phaser.GameObjects.GameObject): void {
    const e = this.entities.get(obj);
    if (!e) return;
    this.objects.remove(obj);
    e.shadow?.destroy();
    if (e.lit && e.obj.tint === e.lastTint) e.obj.clearTint();
    for (const l of [...this.lights]) if (l.owner === obj) this.dropLight(l);
    this.entities.delete(obj);
  }

  /** A light carried by an entity: a lamp, a spell, a glowing book. */
  attachLight(obj: Lit, spec: LightSpec): LightHandle {
    return this.handle(this.createLight(spec, obj.x, obj.y, obj));
  }

  /** A light standing in the world. */
  addLight(x: number, y: number, spec: LightSpec): LightHandle {
    return this.handle(this.createLight(spec, x, y, null));
  }

  /**
   * An effect sprite in the glow layer: never darkened, and drawn additively when its art says
   * `blend: "add"`. For sparks, bolts, telegraphs and other light.
   */
  addEffect(obj: Lit, additive?: boolean): void {
    const frame = obj.frame.name;
    const name = frame.split("/")[0] ?? "";
    const sprite = this.meta.sprites[name];
    if (additive ?? sprite?.blend === "add") obj.setBlendMode(Phaser.BlendModes.ADD);
    this.glowLayer.add(obj);
  }

  /** How deep in a ground shadow a point is: 0 in the open, 1 in full shade. */
  shadeAt(x: number, y: number): number {
    const xi = Math.round(x);
    const yi = Math.round(y);
    if (xi < 0 || yi < 0 || xi >= this.masks.w || yi >= this.masks.h) return 0;
    return (this.masks.shadow[yi * this.masks.w + xi] ?? 0) / 255;
  }

  /** The light falling on a point this frame, before banding: 1 shows the art as drawn. */
  lightAt(x: number, y: number): Rgb {
    const xi = Math.round(x);
    const yi = Math.round(y);
    const { w, h, inside } = this.masks;
    const inTear =
      this.region !== null &&
      xi >= 0 &&
      yi >= 0 &&
      xi < w &&
      yi < h &&
      (inside[yi * w + xi] ?? 0) > 0;
    const out: Rgb = inTear ? [1, 1, 1] : [...this.ambientLight];
    const r = this.region;
    const img = this.regionImages;
    if (!inTear && r && img) {
      const lx = xi - r.rect.x;
      const ly = yi - r.rect.y;
      if (lx >= 0 && ly >= 0 && lx < r.rect.w && ly < r.rect.h) {
        const i = ly * r.rect.w + lx;
        const a =
          ((r.spill[0][i] ?? 0) * img.spill[0].alpha + (r.spill[1][i] ?? 0) * img.spill[1].alpha) /
          127.5;
        for (let c = 0; c < 3; c++) out[c] = (out[c] as number) + (img.color[c] as number) * a;
      }
    }
    for (const l of this.lights) {
      if (l.level <= 0) continue;
      const R = l.spec.radius;
      const dx = (x - l.x) / R;
      const dy = (y - l.y) / (R * (l.spec.squash ?? 0.58));
      const r2 = dx * dx + dy * dy;
      if (r2 >= 1) continue;
      const v = (1 - r2) ** 2 * l.level;
      const col = rgbOf(l.spec.color);
      for (let c = 0; c < 3; c++) out[c] = (out[c] as number) + (col[c] as number) * v;
    }
    return out;
  }

  get qualityTier(): Tier {
    return this.tierName;
  }

  setTier(tier: Tier): void {
    this.tierName = tier;
    this.tier = TIER_SETTINGS[tier];
    this.applyTier();
  }

  get lightingMode(): LightingMode {
    return this.lighting;
  }

  /**
   * `screen`: the light map and the grade, the game's look. `object`: Phaser's per-object
   * lights, kept to compare against. `off`: the art as drawn.
   */
  setLighting(mode: LightingMode): void {
    this.lighting = mode;
    const screen = mode === "screen";
    this.composite.setActive(screen);
    this.grade.setActive(screen);
    this.lightRT.setVisible(screen);
    for (const g of [this.glowLayer, this.groundGlow])
      g.setVisible(mode !== "off" && !this.hidden.has("glow"));
    for (const g of this.glows) g.overlay.setVisible(screen && g.prop.visible);
    const object = mode === "object";
    const lights = this.scene.lights;
    if (object) {
      lights.enable();
      lights.setAmbientColor(colorOf(this.ambientLight.map((v) => Math.min(1, v)) as Rgb));
    } else lights.disable();
    for (const layer of [
      this.ground,
      this.shadows,
      this.objects,
      this.overhead,
      this.foliage,
      this.atmosphere,
    ]) {
      for (const child of layer.getChildren()) {
        if ("setLighting" in child && typeof child.setLighting === "function")
          child.setLighting(object);
      }
    }
    for (const l of this.lights) this.syncObjectLight(l);
    // Object lights have no shape: the rift becomes one big point light at its heart.
    if (object && this.region && !this.regionObjectLight) {
      const src = this.region.source;
      const reach = Math.max(...(src.paint?.reach ?? [src.radius]));
      this.regionObjectLight = lights.addLight(
        this.region.core[0],
        this.region.core[1] + 60,
        reach * 3,
        paletteColor(this.meta, src.color),
        src.intensity * 2,
      );
    } else if (!object && this.regionObjectLight) {
      lights.removeLight(this.regionObjectLight);
      this.regionObjectLight = null;
    }
    if (!screen) {
      for (const p of this.placed) if (p.lit) p.sprite.clearTint();
      for (const p of this.particles) for (const s of p.sprites) s.clearTint();
    }
  }

  /** The grade on or off (off shows lit colours without the palette pull), for review. */
  setGrade(on: boolean): void {
    buildLut(this.scene, this.lutKey, this.meta, on ? gradeFor(this.meta, this.map) : NO_GRADE);
  }

  /** Review knobs: light steps, seam sharpness and how far colours pull to the palette. */
  tune(knobs: { steps?: number; sharp?: number; snap?: number }): void {
    if (knobs.steps !== undefined) this.composite.steps = knobs.steps;
    if (knobs.sharp !== undefined) this.composite.sharp = knobs.sharp;
    if (knobs.snap !== undefined) {
      buildLut(this.scene, this.lutKey, this.meta, {
        ...gradeFor(this.meta, this.map),
        snap: knobs.snap,
      });
    }
  }

  setLayerVisible(name: LayerName, visible: boolean): void {
    if (visible) this.hidden.delete(name);
    else this.hidden.add(name);
    const layers: Record<LayerName, Phaser.GameObjects.Layer[]> = {
      backdrop: [this.backdrop],
      ground: [this.ground],
      shadows: [this.shadows],
      objects: [this.objects],
      overhead: [this.overhead, this.foliage],
      atmosphere: [this.atmosphere],
      glow: [this.glowLayer, this.groundGlow],
      weather: [this.weatherLayer],
    };
    for (const l of layers[name]) l.setVisible(visible);
  }

  layerVisible(name: LayerName): boolean {
    return !this.hidden.has(name);
  }

  stats(): RenderStats {
    let visible = 0;
    for (const p of this.placed) if (p.sprite.visible) visible++;
    let particles = 0;
    for (const p of this.particles) for (const s of p.sprites) if (s.visible) particles++;
    particles += this.weather?.getAliveParticleCount() ?? 0;
    particles += this.regionImages?.motes.getAliveParticleCount() ?? 0;
    return {
      tier: this.tierName,
      lighting: this.lighting,
      objects: this.placed.length,
      visibleObjects: visible,
      entities: this.entities.size,
      lights: this.lights.size + (this.region ? 1 : 0),
      particles,
    };
  }

  /** Removes everything the view made. Shared atlases stay loaded; see `unloadMap`. */
  destroy(): void {
    for (const off of this.offs.splice(0)) off();
    for (const l of [...this.lights]) this.dropLight(l);
    for (const obj of [...this.entities.keys()]) this.removeEntity(obj);
    if (this.regionObjectLight) this.scene.lights.removeLight(this.regionObjectLight);
    this.scene.lights.disable();
    for (const g of this.glows) g.overlay.destroy();
    this.world.destroy();
    this.lightLayer.destroy();
    this.lightRT.destroy();
    for (const key of [this.lutKey, ...(this.region?.keys ?? [])]) {
      if (this.scene.textures.exists(key)) this.scene.textures.remove(key);
    }
    for (const key of this.animKeys) this.scene.anims.remove(key);
  }

  // Building ---------------------------------------------------------------------------------

  private handle(light: Light): LightHandle {
    return {
      set: (s) => {
        light.spec = { ...light.spec, ...s };
      },
      moveTo: (x, y) => {
        light.x = x;
        light.y = y;
      },
      remove: () => this.dropLight(light),
    };
  }

  /** Animation key for a sprite's animation drawn from one texture. */
  private anim(texture: string, sprite: string, name: string): string | null {
    const key = `${texture}|${sprite}/${name}`;
    if (this.animKeys.has(key) || this.scene.anims.exists(key)) return key;
    const a = this.meta.sprites[sprite]?.anims[name];
    if (!a) return null;
    this.scene.anims.create({
      key,
      frames: a.frames.map((frame) => ({ key: texture, frame })),
      frameRate: a.fps,
      repeat: a.loop ? -1 : 0,
    });
    this.animKeys.add(key);
    return key;
  }

  /** The frame a placement shows, and the animation it plays from there, like the sheet. */
  private pick(
    name: string,
    sp: SpriteMeta,
    p: FramePick,
  ): { frame: string; anim: string | null; start: number } {
    if (p.frame && sp.frames.includes(`${name}/${p.frame}`))
      return { frame: `${name}/${p.frame}`, anim: null, start: 0 };
    const a = p.anim ? sp.anims[p.anim] : undefined;
    if (a && a.frames.length > 0) {
      const start = (p.index ?? 0) % a.frames.length;
      return { frame: a.frames[start] as string, anim: p.play ? (p.anim as string) : null, start };
    }
    return {
      frame: sp.frames.find((f) => f !== sp.shadow) ?? sp.frames[0] ?? "",
      anim: null,
      start: 0,
    };
  }

  /**
   * Places a prop, actor or doll in `layer`. `order` is its depth in an unsorted layer, or null
   * to sort it by its feet. Backdrop art takes parallax when its name asks for it.
   */
  private placeThing(
    t: Prop | Actor | Doll,
    layer: Phaser.GameObjects.Layer,
    order: number | null,
    lit: boolean,
    backdrop = false,
  ): Placed | null {
    if ("rig" in t) return this.placeDoll(t, layer, order);
    const name = "prop" in t ? t.prop : t.actor;
    const sp = this.meta.sprites[name];
    if (!sp) return null;
    const raw = !("prop" in t) || t.raw === true;
    const texture = raw || sp.atlas !== "core" ? sp.atlas : this.themed.key;
    const { frame, anim, start } = this.pick(name, sp, t);
    const tex = this.scene.textures.get(texture);
    if (!tex.has(frame)) return null;
    const f = tex.get(frame);
    const W = f.realWidth;
    const flip = t.flip === true;
    const [ox, oy] = sp.origin;
    const factor = backdrop ? (PARALLAX[name] ?? 1) : 1;
    const additive = sp.blend === "add";
    let first: Placed | null = null;
    for (let k = 0; k < (t.repeat ?? 1); k++) {
      const x = t.at[0] + k * W;
      const y = t.at[1];
      const sprite = new Phaser.GameObjects.Sprite(this.scene, 0, 0, texture, frame);
      sprite.setFlipX(flip).setPosition(x + this.flipShift(f, flip, W, ox), y);
      if (!f.customPivot) sprite.setDisplayOrigin(ox, oy);
      if (anim) {
        const key = this.anim(texture, name, anim);
        if (key) sprite.play({ key, startFrame: start });
      }
      if (factor !== 1) {
        // Placed where the contact sheet has it when the camera centres on the whole run.
        const s0 = t.at[0] + (W * (t.repeat ?? 1)) / 2 - this.camera.width / 2;
        sprite.setScrollFactor(factor, 1).setX(sprite.x - (1 - factor) * s0);
      }
      if (additive) sprite.setBlendMode(Phaser.BlendModes.ADD);
      (additive ? this.glowLayer : layer).add(sprite);
      sprite.setDepth(order ?? ((t as Placement).sort ?? y) + x * 1e-5);
      const placed: Placed = {
        sprite,
        bounds: this.boundsOf(sprite, t.drift?.to),
        lit: lit && !additive,
      };
      if (factor === 1) this.placed.push(placed);
      if (t.drift) {
        this.drifts.push({
          sprite,
          from: [sprite.x, y],
          to: [t.drift.to[0] + k * W, t.drift.to[1]],
          period: t.drift.period,
          phase: t.drift.phase ?? 0,
        });
      }
      if (!raw && this.themed.glow && sp.frames.some((fr) => this.themed.glowing.has(fr))) {
        this.makeGlow(sprite, sp, flip, ox, oy, W, placed.bounds, layer);
      }
      first ??= placed;
    }
    return first;
  }

  private placeDoll(t: Doll, layer: Phaser.GameObjects.Layer, order: number | null): Placed | null {
    const rig = this.meta.rigs[t.rig];
    if (!rig) return null;
    const look = t.look && rig.looks[t.look] ? t.look : Object.keys(rig.looks)[0];
    if (!look) return null;
    const key = lookTexture(t.rig, look);
    if (!this.scene.textures.exists(key)) composeLook(this.scene, this.meta, t.rig, look);
    const dir = t.dir && rig.directions.includes(t.dir) ? t.dir : rig.directions[0];
    const frameName = t.frame && rig.frames.includes(t.frame) ? t.frame : rig.frames[0];
    const sprite = new Phaser.GameObjects.Sprite(this.scene, 0, 0, key, `${dir}/${frameName}`);
    sprite.setPosition(t.at[0], t.at[1]).setFlipX(t.flip === true);
    layer.add(sprite);
    sprite.setDepth(order ?? (t.sort ?? t.at[1]) + t.at[0] * 1e-5);
    const placed: Placed = { sprite, bounds: this.boundsOf(sprite), lit: true };
    this.placed.push(placed);
    return placed;
  }

  /**
   * Where a flipped sprite must stand to land on the contact sheet's pixels. The sheet mirrors a
   * frame about its anchor pixel; Phaser mirrors a frame with a pivot about the pivot's edge,
   * one pixel to the left, and a frame without one about its centre.
   */
  private flipShift(f: Phaser.Textures.Frame, flip: boolean, W: number, ox: number): number {
    if (!flip) return 0;
    return f.customPivot ? 1 : 2 * ox - W + 1;
  }

  private boundsOf(sprite: Phaser.GameObjects.Sprite, to?: readonly [number, number]): Rect {
    const w = sprite.frame.realWidth;
    const h = sprite.frame.realHeight;
    const x0 = sprite.x - sprite.displayOriginX;
    const y0 = sprite.y - sprite.displayOriginY;
    if (!to) return { x: x0, y: y0, w, h };
    const dx = to[0] - sprite.x;
    const dy = to[1] - sprite.y;
    return {
      x: Math.min(x0, x0 + dx),
      y: Math.min(y0, y0 + dy),
      w: w + Math.abs(dx),
      h: h + Math.abs(dy),
    };
  }

  /** The prop's glowing pixels just above it, never darkened, and a halo where they gather. */
  private makeGlow(
    prop: Phaser.GameObjects.Sprite,
    sp: SpriteMeta,
    flip: boolean,
    ox: number,
    oy: number,
    W: number,
    bounds: Rect,
    layer: Phaser.GameObjects.Layer,
  ): void {
    const glowKey = this.themed.glow as string;
    const overlay = new Phaser.GameObjects.Sprite(this.scene, 0, 0, glowKey, prop.frame.name);
    overlay
      .setFlipX(flip)
      .setPosition(prop.x, prop.y)
      .setDepth(prop.depth + 1e-7);
    if (!prop.frame.customPivot) overlay.setDisplayOrigin(ox, oy);
    layer.add(overlay);
    const frames = new Map<string, { n: number; cx: number; cy: number }>();
    const glowTex = this.scene.textures.get(glowKey);
    const ctx = (glowTex.getSourceImage() as HTMLCanvasElement).getContext("2d", {
      willReadFrequently: true,
    });
    let most = 0;
    for (const name of sp.frames) {
      if (!glowTex.has(name) || !ctx) continue;
      const f = glowTex.get(name);
      const data = ctx.getImageData(f.cutX, f.cutY, f.cutWidth, f.cutHeight).data;
      let n = 0;
      let sx = 0;
      let sy = 0;
      for (let y = 0; y < f.cutHeight; y++) {
        for (let x = 0; x < f.cutWidth; x++) {
          if ((data[(y * f.cutWidth + x) * 4 + 3] ?? 0) === 0) continue;
          n++;
          sx += x + f.x;
          sy += y + f.y;
        }
      }
      const cx = n > 0 ? sx / n + 0.5 : 0;
      frames.set(name, { n, cx: flip ? W - cx : cx, cy: n > 0 ? sy / n + 0.5 : 0 });
      most = Math.max(most, n);
    }
    const halo = new Phaser.GameObjects.Image(this.scene, 0, 0, TEX.halo);
    halo
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(paletteColor(this.meta, "gold.pale"))
      .setVisible(false);
    this.glowLayer.add(halo);
    this.glows.push({ prop, overlay, halo, bounds, frames, most, level: 0 });
  }

  private buildParticles(): void {
    for (const e of this.map.scene.emitters ?? []) {
      const sp = this.meta.sprites[e.sprite];
      if (!sp) continue;
      const animName = e.anim ?? Object.keys(sp.anims)[0];
      const frames = (animName ? sp.anims[animName]?.frames : undefined) ?? sp.frames;
      const fps = (animName ? sp.anims[animName]?.fps : undefined) ?? 1;
      const sprites: Phaser.GameObjects.Sprite[] = [];
      for (let k = 0; k < e.count; k++) {
        const s = new Phaser.GameObjects.Sprite(this.scene, 0, 0, sp.atlas, frames[0] ?? "");
        if (!s.frame.customPivot) s.setDisplayOrigin(sp.origin[0], sp.origin[1]);
        this.atmosphere.add(s);
        sprites.push(s);
      }
      this.particles.push({ emitter: e, sprites, frames, fps });
    }
  }

  private buildWeather(): void {
    const kind = this.map.time.weather;
    if (kind !== "sea-wind" && kind !== "drizzle") return;
    const W = this.camera.width;
    const H = this.camera.height;
    const config: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig =
      kind === "sea-wind"
        ? {
            x: { min: -8, max: W * 0.7 },
            y: { min: -4, max: H + 4 },
            speedX: { min: 40, max: 95 },
            speedY: { min: -8, max: 6 },
            lifespan: { min: 2200, max: 4200 },
            alpha: { start: 0, end: 0.9, ease: (v: number) => Math.sin(v * Math.PI) },
            tint: paletteColor(this.meta, "stone.bright"),
            frequency: 45,
          }
        : {
            x: { min: 0, max: W + 40 },
            y: -6,
            speedX: { min: -40, max: -30 },
            speedY: { min: 220, max: 260 },
            lifespan: 1400,
            alpha: 0.55,
            tint: paletteColor(this.meta, "navy.pale"),
            scaleY: 2,
            frequency: 12,
          };
    this.weather = this.scene.add.particles(0, 0, TEX.px, config);
    this.weather.setScrollFactor(0);
    this.weatherLayer.add(this.weather);
  }

  private buildRegion(): RegionLight | null {
    const source = this.map.lights.find((l) => l.paint?.region);
    if (!source) return null;
    return buildRegionLight(this.scene, this.map.id, this.masks, source, this.map.scene.seed);
  }

  private buildRegionImages(region: RegionLight) {
    const color = paletteColor(this.meta, region.source.color);
    const at = (key: string, r: Rect) =>
      new Phaser.GameObjects.Image(this.scene, r.x, r.y, key).setOrigin(0);
    const spill = region.spillKeys.map((key) =>
      at(key, region.rect).setBlendMode(Phaser.BlendModes.ADD).setTint(color),
    ) as [Phaser.GameObjects.Image, Phaser.GameObjects.Image];
    // Light spills first, then the tear's own daylight is written over it.
    const inside = at(region.insideKey, region.insideRect).setTint(0x808080);
    this.lightLayer.add([...spill, inside]);
    // The lip glows on the ground, under whatever stands on it.
    const glow = at(region.glowKey, region.glowRect)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(paletteColor(this.meta, "gold.pale"));
    this.groundGlow.add(glow);
    const lip = region.lip;
    const n = lip.length / 2;
    const [cx, cy] = region.core;
    const motes = this.scene.add.particles(0, 0, TEX.px, {
      emitZone: {
        type: "random",
        source: {
          getRandomPoint: (p: Phaser.Types.Math.Vector2Like) => {
            const k = Math.floor(Math.random() * n) * 2;
            p.x = lip[k] ?? cx;
            p.y = lip[k + 1] ?? cy;
          },
        },
      },
      moveToX: cx,
      moveToY: cy,
      lifespan: { min: 2600, max: 5200 },
      alpha: { start: 0.95, end: 0.1 },
      tint: [paletteColor(this.meta, "gold.pale"), paletteColor(this.meta, "clay.dust"), 0xffffff],
      blendMode: Phaser.BlendModes.ADD,
      frequency: 90,
      maxAliveParticles: 48,
    });
    this.glowLayer.add(motes);
    return { inside, spill, glow, motes, color: [...rgbOf(color)] as Rgb };
  }

  private addMapLight(source: LightSource): void {
    const light = this.createLight(
      {
        radius: source.radius,
        color: paletteColor(this.meta, source.color),
        intensity: source.intensity,
        squash: 0.58,
        ...(source.flicker ? { flicker: source.flicker } : {}),
      },
      source.at[0],
      source.at[1],
      null,
    );
    // A light standing at a prop that switches itself on and off follows the prop's frames.
    let best: Glow | null = null;
    let bestD = 48;
    for (const g of this.glows) {
      if (!g.prop.anims.isPlaying) continue;
      const d = Math.hypot(g.prop.x - source.at[0], g.prop.y - source.at[1]);
      if (d < bestD) {
        bestD = d;
        best = g;
      }
    }
    light.follows = best;
  }

  private defaultShadow(obj: Lit): { texture: string; frame: string } | null {
    const tex = obj.texture;
    if (tex.has("shadow")) return { texture: tex.key, frame: "shadow" };
    const name = obj.frame.name.split("/")[0] ?? "";
    if (tex.has(`${name}/shadow`)) return { texture: tex.key, frame: `${name}/shadow` };
    const fallback = this.meta.sprites["shadow-m"];
    if (fallback) return { texture: fallback.atlas, frame: fallback.frames[0] ?? "" };
    return null;
  }

  private createLight(spec: LightSpec, x: number, y: number, owner: Lit | null): Light {
    const image = new Phaser.GameObjects.Image(this.scene, 0, 0, TEX.pool);
    image.setBlendMode(Phaser.BlendModes.ADD);
    this.lightLayer.add(image);
    const light: Light = {
      spec,
      x,
      y,
      image,
      phaseSeed: Math.random() * 100,
      owner,
      follows: null,
      level: 0,
      objectLight: null,
    };
    this.lights.add(light);
    this.syncObjectLight(light);
    return light;
  }

  private dropLight(light: Light): void {
    if (!this.lights.delete(light)) return;
    light.image.destroy();
    if (light.objectLight) this.scene.lights.removeLight(light.objectLight);
  }

  private syncObjectLight(light: Light): void {
    const want = this.lighting === "object";
    if (want && !light.objectLight) {
      light.objectLight = this.scene.lights.addLight(
        light.x,
        light.y,
        light.spec.radius * 1.6,
        light.spec.color,
        light.spec.intensity * 1.6,
      );
    } else if (!want && light.objectLight) {
      this.scene.lights.removeLight(light.objectLight);
      light.objectLight = null;
    }
  }

  private applyTier(): void {
    const t = this.tier;
    this.composite.dither = t.dither;
    this.grade.haze = t.riftHaze ? 1 : 0;
    this.grade.chroma = t.riftChroma ? 1 : 0;
    for (const p of this.particles) {
      const keep = Math.round(p.emitter.count * t.particles);
      p.sprites.forEach((s, k) => {
        s.setActive(k < keep);
        if (k >= keep) s.setVisible(false);
      });
    }
    if (this.weather) this.weather.maxAliveParticles = t.weather;
    if (this.regionImages) this.regionImages.motes.maxAliveParticles = t.riftMotes;
    this.cutFoliage.wobble = t.foliageWobble ? 1 : 0;
  }

  // Per frame ---------------------------------------------------------------------------------

  private update(deltaMs: number): void {
    this.time += deltaMs / 1000;
    const t = this.time;
    const cam = this.camera;
    const view: Rect = {
      x: cam.scrollX - CULL_MARGIN,
      y: cam.scrollY - CULL_MARGIN,
      w: cam.width + 2 * CULL_MARGIN,
      h: cam.height + 2 * CULL_MARGIN,
    };
    for (const p of this.placed) p.sprite.setVisible(overlaps(p.bounds, view));
    for (const d of this.drifts) {
      const f = ((((t + d.phase) / d.period) % 1) + 1) % 1;
      d.sprite.setPosition(
        Math.round(d.from[0] + (d.to[0] - d.from[0]) * f),
        Math.round(d.from[1] + (d.to[1] - d.from[1]) * f),
      );
    }
    this.updateParticles(t, view);
    this.updateGlows();
    this.updateLights(t);
    this.updateRegion(t);
    this.lightSprites(deltaMs);
    this.updateCutaway();
    this.grade.time = t;
  }

  private updateParticles(t: number, view: Rect): void {
    const seed = this.map.scene.seed;
    for (const p of this.particles) {
      p.sprites.forEach((s, k) => {
        if (!s.active) return;
        const q = emitterParticle(p.emitter, seed, k, t);
        const x = Math.round(q.x);
        const y = Math.round(q.y);
        const inView = x >= view.x && y >= view.y && x < view.x + view.w && y < view.y + view.h;
        s.setVisible(inView);
        if (!inView) return;
        const frame = p.frames[((q.hash % 7) + Math.floor(q.age * p.fps)) % p.frames.length];
        if (frame && s.frame.name !== frame) s.setFrame(frame, false, false);
        s.setPosition(x, y).setFlipX((q.hash & 1) === 1);
      });
    }
  }

  /** The banded light at a point as a tint, never above the art as drawn. */
  private tintAt(x: number, y: number, shade = 0): number {
    const l = bandLight(this.lightAt(x, y), this.composite.steps, this.composite.sharp);
    if (shade > 0.01)
      for (let c = 0; c < 3; c++)
        l[c] = (l[c] as number) * (1 + ((this.shadeTint[c] as number) - 1) * shade);
    return colorOf(l.map((v) => Math.min(1, v)) as Rgb);
  }

  /** Lights every sprite by the light at its feet, and sorts and shades entities. */
  private lightSprites(deltaMs: number): void {
    const screen = this.lighting === "screen";
    if (screen) {
      for (const p of this.placed) {
        const s = p.sprite;
        if (!p.lit || !s.visible) continue;
        // Light along the sprite's feet, left edge and right edge: a column is lit as a whole,
        // and a run of stands or fence carries the light across its pieces without steps.
        const left = s.x - s.displayOriginX;
        const right = left + s.frame.realWidth;
        const a = this.tintAt(left + 1, s.y);
        const b = this.tintAt(right - 1, s.y);
        if (s.flipX) s.setTint(b, a, b, a);
        else s.setTint(a, b, a, b);
      }
      for (const p of this.particles) {
        for (const s of p.sprites) if (s.visible) s.setTint(this.tintAt(s.x, s.y + 16));
      }
    }
    const k = Math.min(1, deltaMs / 90);
    for (const e of this.entities.values()) {
      const { obj } = e;
      obj.setDepth(obj.y + obj.x * 1e-5);
      e.shadow?.setPosition(Math.round(obj.x), Math.round(obj.y)).setVisible(obj.visible);
      if (!e.lit || !screen) continue;
      // A flash or the game's own tint wins; lighting resumes once the tint is cleared.
      if (obj.tintMode !== Phaser.TintModes.MULTIPLY) continue;
      if (obj.tint !== e.lastTint && obj.tint !== 0xffffff) continue;
      const target = [...rgbOf(this.tintAt(obj.x, obj.y, this.shadeAt(obj.x, obj.y)))];
      for (let c = 0; c < 3; c++)
        e.light[c] = (e.light[c] as number) + ((target[c] as number) - (e.light[c] as number)) * k;
      const tint = colorOf(e.light);
      obj.setTint(tint);
      e.lastTint = tint;
    }
  }

  private updateGlows(): void {
    const screen = this.lighting === "screen";
    for (const g of this.glows) {
      const info = g.frames.get(g.prop.frame.name);
      g.level = info && g.most > 0 ? info.n / g.most : 0;
      if (g.overlay.frame.name !== g.prop.frame.name)
        g.overlay.setFrame(g.prop.frame.name, false, false);
      g.overlay.setVisible(screen && g.prop.visible);
      const on = screen && g.prop.visible && this.tier.halos && g.level > 0 && !!info;
      g.halo.setVisible(on);
      if (!on || !info) continue;
      const left = g.prop.x - g.prop.displayOriginX;
      const top = g.prop.y - g.prop.displayOriginY;
      const size = Math.max(14, Math.min(44, Math.sqrt(info.n) * 4.5));
      g.halo
        .setPosition(Math.round(left + info.cx), Math.round(top + info.cy))
        .setDisplaySize(size, size)
        .setAlpha(0.55 + 0.45 * g.level);
    }
  }

  private updateLights(t: number): void {
    // Entity lights beyond the tier's budget go dark, the farthest from the camera first.
    const cx = this.camera.scrollX + this.camera.width / 2;
    const cy = this.camera.scrollY + this.camera.height / 2;
    const carried = [...this.lights].filter((l) => l.owner);
    carried.sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy));
    const allowed = new Set(carried.slice(0, this.tier.entityLights));
    for (const l of this.lights) {
      if (l.owner) {
        l.x = l.owner.x + (l.spec.offset?.[0] ?? 0);
        l.y = l.owner.y + (l.spec.offset?.[1] ?? 0);
      }
      const { spec } = l;
      let k = 1;
      if (spec.flicker) k += spec.flicker.amount * wobble(t, spec.flicker.period, l.phaseSeed);
      if (l.follows) k *= 0.08 + 0.92 * l.follows.level;
      if (l.owner && (!allowed.has(l) || !l.owner.visible)) k = 0;
      l.level = Math.max(0, Math.min(2, spec.intensity * k * this.lightScale));
      const size = spec.radius * 2;
      l.image
        .setPosition(l.x, l.y)
        .setDisplaySize(size, size * (spec.squash ?? 0.58))
        .setTint(spec.color)
        .setAlpha(l.level / 2);
      if (l.objectLight) {
        l.objectLight.setPosition(l.x, l.y);
        l.objectLight.setIntensity(l.level * 1.6);
      }
    }
  }

  private updateRegion(t: number): void {
    const r = this.region;
    const img = this.regionImages;
    if (!r || !img) return;
    const src = r.source;
    const pulse = src.paint?.pulse ?? src.flicker;
    let k = 1;
    if (pulse) k += pulse.amount * 2.5 * Math.sin((2 * Math.PI * t) / pulse.period);
    if (src.flicker) k += src.flicker.amount * 0.5 * wobble(t, src.flicker.period * 1.7, 3.1);
    const base = (src.intensity * SPILL_SCALE * k) / 2;
    // The shafts drift: two ray patterns crossfade over about eleven seconds.
    const mix = this.tier.riftShafts ? 0.5 + 0.5 * Math.sin((2 * Math.PI * t) / 11) : 0;
    img.spill[0].setAlpha(Math.min(1, base * (1 - mix)));
    img.spill[1].setAlpha(Math.min(1, base * mix));
    img.glow.setAlpha(0.7 + 0.3 * Math.sin((2 * Math.PI * t) / (pulse?.period ?? 2.2)));
  }

  private updateCutaway(): void {
    let focus: Entity | null = null;
    for (const e of this.entities.values()) if (e.focus) focus = e;
    const fx = focus ? focus.obj.x : -1e5;
    const fy = focus ? focus.obj.y - 12 : -1e5;
    const body: Rect = { x: fx - 8, y: fy - 12, w: 16, h: 24 };
    let under = false;
    for (const p of this.overheadPlaced) {
      // Overhead art always draws over entities, so whatever overlaps the player opens.
      const hit = focus !== null && p.sprite.visible && overlaps(p.bounds, body);
      if (!this.tier.ditherCutaway) {
        const target = hit ? 0.45 : 1;
        p.sprite.setAlpha(p.sprite.alpha + (target - p.sprite.alpha) * 0.2);
      } else if (p.sprite.alpha !== 1) p.sprite.setAlpha(1);
      if (hit) under = true;
    }
    for (const c of [this.cutOverhead, this.cutFoliage]) {
      c.focusX = fx;
      c.focusY = fy;
      c.cut = under && this.tier.ditherCutaway ? 1 : 0;
      c.time = this.time;
      c.setActive(c.cut > 0 || c.wobble > 0);
    }
  }
}
