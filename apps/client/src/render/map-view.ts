/**
 * A built map drawn in the game: every layer of the map format, lit.
 *
 * Draw order, back to front, all inside one world layer that the grade filter colours:
 * - backdrop: the sky colour and what lies past the map edge, with parallax, unlit,
 * - ground: one baked image, the details that move, entity shadows and weather, lit pixel by
 *   pixel through the light map,
 * - ground glow: light lying on the ground, unlit, under whatever stands on it: a rift's lip,
 *   enemy telegraphs,
 * - sprites: props and entities sorted by their feet, overhead art (cut away around the player),
 *   foliage and atmosphere. Every sprite pixel takes the light the ground has in its column at
 *   the sprite's feet (see `sprite-light.ts`),
 * - glow: light itself, drawn additively: halos, the rift's motes, sun shafts, effects drawn
 *   with `blend: "add"`.
 *
 * Above the world: overlays the drain leaves alone (a boss's entrance pieces) and the letterbox.
 * Positions are world pixels; an entity's `x, y` is its feet.
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
  Patrol,
  Placement,
  Prop,
} from "@guago/content";
import * as Phaser from "phaser";
import { composeLook, lookTexture } from "../art.ts";
import { artMetadata, KEYS, litTheme, mapData, type ThemedAtlas, themedAtlas } from "./assets.ts";
import { Grade, glTexture, LightComposite, registerComposite } from "./composite.ts";
import { Cutaway, registerCutaway } from "./cutaway.ts";
import { buildLut, colorOf, gradeFor, luma, NO_GRADE, paletteColor, rgbOf } from "./grade.ts";
import {
  type FlashSpec,
  LIGHT_MARGIN,
  type Light,
  LightField,
  type LightSpec,
  wobble,
} from "./light-field.ts";
import { buildRegionLight, type MapMasks, type Rect, type RegionLight, readMasks } from "./rift.ts";
import {
  FeetBuffer,
  registerSpriteLight,
  type SpriteCode,
  SpriteLightFilter,
} from "./sprite-light.ts";
import { bayer4, makeTextures, TEX } from "./textures.ts";
import { qualityTier, TIER_SETTINGS, type Tier, type TierSettings } from "./tiers.ts";
import { Cone, type VisionCone } from "./vision.ts";

export type { FlashSpec, LightSpec } from "./light-field.ts";
export type { VisionCone } from "./vision.ts";

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
   * Lit by the map (default true): the light and ground shade at its feet. A sprite whose tint
   * mode is not MULTIPLY (a white hit flash) shows unlit while it lasts.
   */
  readonly lit?: boolean;
}

export interface TelegraphOptions {
  /** The light the telegraph throws on the ground around it. Defaults to `red.light`. */
  readonly color?: number;
  /** Pixels; defaults to the sprite's half width plus a little. */
  readonly radius?: number;
  /** Light at its centre, pulsing between 60% and 100%. Defaults to 0.9. */
  readonly intensity?: number;
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
  readonly flashes: number;
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
/** Backdrop water that glitters under a low sun. */
const WATER = /sea$/;
const SHADOW_ALPHA = 0.35;
/** A rift's spill is light relative to the tear's own daylight, which shows the art as drawn. */
const SPILL_SCALE = 0.85;
/** Pixels of height an entity's long shadow is cast from. */
const ENTITY_HEIGHT = 22;

interface Placed {
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly bounds: Rect;
}

interface Glow {
  readonly prop: Phaser.GameObjects.Sprite;
  /** The prop's glowing pixels, drawn just above it and never darkened. */
  readonly overlay: Phaser.GameObjects.Sprite;
  /** Only props that stand at one of the map's lights (lamps, floodlights) carry a halo. */
  readonly halo: Phaser.GameObjects.Image | null;
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
}

interface Telegraph {
  readonly sprite: Lit;
  readonly light: Light;
  readonly intensity: number;
  readonly born: number;
}

interface Particles {
  readonly emitter: Emitter;
  readonly sprites: Phaser.GameObjects.Sprite[];
  readonly frames: readonly string[];
  readonly fps: number;
}

/** A value moving toward a target over a time. */
interface Ramp {
  from: number;
  to: number;
  ms: number;
  age: number;
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function step(r: Ramp, deltaMs: number): number {
  r.age = Math.min(r.ms, r.age + deltaMs);
  const k = r.ms <= 0 ? 1 : r.age / r.ms;
  const e = k * k * (3 - 2 * k);
  return r.from + (r.to - r.from) * e;
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
  private readonly theme: string;
  private readonly paintedNight: string | null;
  private readonly themedAtlases = new Map<string, ThemedAtlas>();
  private readonly masks: MapMasks;
  private readonly field: LightField;
  private readonly feet: FeetBuffer;

  private readonly world: Phaser.GameObjects.Layer;
  private readonly backdrop: Phaser.GameObjects.Layer;
  private readonly lit: Phaser.GameObjects.Layer;
  private readonly ground: Phaser.GameObjects.Layer;
  private readonly shadows: Phaser.GameObjects.Layer;
  private readonly weatherLayer: Phaser.GameObjects.Layer;
  private readonly groundGlow: Phaser.GameObjects.Layer;
  private readonly sprites: Phaser.GameObjects.Layer;
  private readonly objects: Phaser.GameObjects.Layer;
  private readonly overhead: Phaser.GameObjects.Layer;
  private readonly foliage: Phaser.GameObjects.Layer;
  private readonly atmosphere: Phaser.GameObjects.Layer;
  private readonly glowLayer: Phaser.GameObjects.Layer;
  private readonly overlay: Phaser.GameObjects.Layer;
  private readonly bars: [Phaser.GameObjects.Image, Phaser.GameObjects.Image];

  private readonly composite: LightComposite;
  private readonly spriteLight: SpriteLightFilter;
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
  private readonly telegraphs = new Map<Phaser.GameObjects.GameObject, Telegraph>();
  /** How a sprite that is not an entity is coded: its feet below its y, or drawn unlit. */
  private readonly codes = new WeakMap<
    Phaser.GameObjects.GameObject,
    { feet: number; unlit: boolean }
  >();
  private readonly region: RegionLight | null;
  private regionGlow: Phaser.GameObjects.Image | null = null;
  private regionMotes: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private regionObjectLight: Phaser.GameObjects.Light | null = null;
  private readonly objectLights = new Map<Light, Phaser.GameObjects.Light>();
  private weather: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private glitter: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private readonly shafts: Phaser.GameObjects.Image[] = [];
  /** The way a low sun throws shadows, per pixel of height, or null. */
  private readonly sun: readonly [number, number] | null;
  private readonly shadeTint: Rgb;
  private readonly animKeys = new Set<string>();
  private readonly textureKeys: string[] = [];
  private readonly hidden = new Set<LayerName>();
  private readonly offs: (() => void)[] = [];
  private drainRamp: Ramp = { from: 0, to: 0, ms: 0, age: 0 };
  private floodRamp: Ramp | null = null;
  private floodAt: [number, number] = [0, 0];
  private barRamp: Ramp = { from: 0, to: 0, ms: 0, age: 0 };
  /** The map's own lamps, and the light its windows let in, with the strength their data gives. */
  private readonly lamps: { light: Light; base: number }[] = [];
  private readonly windows: { light: Light; base: number; color: number }[] = [];
  private lampRamp: Ramp = { from: 1, to: 1, ms: 0, age: 0 };
  private lampLevel = 1;
  private windowRamp: Ramp = { from: 1, to: 1, ms: 0, age: 0 };
  private windowLevel = 1;
  private time = 0;
  private readonly cones = new Set<Cone>();
  private coneCount = 0;
  /** A map with interior walls: no wind or rain falls across its screen. */
  private get indoors(): boolean {
    return (this.map.scene.edges ?? []).some((e) =>
      (typeof e.overlay === "string" ? [e.overlay] : e.overlay).includes("wall-top"),
    );
  }

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
    registerSpriteLight(scene);

    this.theme = litTheme(this.map);
    this.paintedNight = this.theme !== this.map.scene.theme ? this.map.scene.theme : null;
    this.masks = readMasks(scene, KEYS.masks(id));
    const W = this.camera.width;
    const H = this.camera.height;
    const sun = this.map.ambient.sun;
    this.sun = sun ? [sun.dir[0], sun.dir[1]] : null;

    // The ambient takes its colour more the dimmer it is: a night is deep blue, a late
    // afternoon only a little gold.
    const amb = rgbOf(paletteColor(this.meta, this.map.ambient.color));
    const norm = Math.max(0.05, luma(amb));
    const { intensity } = this.map.ambient;
    const ambient = [...amb].map((v) => intensity * (1 + (v / norm - 1) * (1 - intensity))) as Rgb;
    this.field = new LightField(scene, id, this.masks, this.camera, ambient, this.map.scene.seed);
    this.shadeTint = [...rgbOf(this.map.time.phase === "night" ? 0x8c8aa8 : 0xb4accc)];

    // A layer made from a config takes NORMAL blending, which would override its children's;
    // SKIP_CHECK lets each child blend its own way, as `add.layer` does.
    const layer = () => scene.make.layer({}, false).setBlendMode(Phaser.BlendModes.SKIP_CHECK);
    this.world = scene.add.layer().setDepth(0);
    this.backdrop = layer();
    this.lit = layer();
    this.ground = layer();
    this.shadows = layer();
    this.weatherLayer = layer();
    this.groundGlow = layer();
    this.sprites = layer();
    this.objects = layer();
    this.overhead = layer();
    this.foliage = layer();
    this.atmosphere = layer();
    this.glowLayer = layer();
    this.lit.add([this.ground, this.shadows, this.weatherLayer]);
    this.sprites.add([this.objects, this.overhead, this.foliage, this.atmosphere]);
    this.world.add([this.backdrop, this.lit, this.groundGlow, this.sprites, this.glowLayer]);
    this.overlay = scene.add.layer().setDepth(50);
    this.bars = [0, 1].map((k) =>
      scene.add
        .image(0, k === 0 ? 0 : H, TEX.px)
        .setOrigin(0, k)
        .setScrollFactor(0)
        .setDisplaySize(W, 0)
        .setTint(paletteColor(this.meta, "ink.deep"))
        .setDepth(60),
    ) as [Phaser.GameObjects.Image, Phaser.GameObjects.Image];

    const skyName = this.map.scene.sky;
    this.backdrop.add(
      new Phaser.GameObjects.Image(scene, 0, 0, TEX.px)
        .setOrigin(0)
        .setScrollFactor(0)
        .setDisplaySize(W, H)
        .setTint(skyName ? paletteColor(this.meta, skyName) : 0),
    );

    // Ground: the baked image, then the details that move.
    this.ground.add(new Phaser.GameObjects.Image(scene, 0, 0, KEYS.ground(id)).setOrigin(0));
    for (const d of this.map.scene.details ?? []) {
      if ("prop" in d && d.play) this.placeThing(d, this.ground, 0);
    }
    for (const b of this.map.scene.backdrop ?? []) this.placeThing(b, this.backdrop, 0, true);
    for (const o of this.map.scene.objects) this.placeThing(o, this.objects, null);
    (this.map.scene.overhead ?? []).forEach((o, i) => {
      const p = this.placeThing(o, FOLIAGE.test(o.prop) ? this.foliage : this.overhead, i);
      if (p) this.overheadPlaced.push(p);
    });
    (this.map.scene.atmosphere ?? []).forEach((a, i) => {
      const p = this.placeThing(a, this.atmosphere, i);
      if (p) this.codes.set(p.sprite, { feet: 16, unlit: false });
    });
    this.buildParticles();

    // Lights: the rift's region first, then every map light, shaped and cut by walls.
    this.region = this.buildRegion();
    this.map.lights.forEach((source, i) => {
      // Light the contact sheet paints but the engine does not cast (radius or intensity 0).
      if (source.paint?.region || source.radius <= 0 || source.intensity <= 0) return;
      const light = this.field.addStatic(source, paletteColor(this.meta, source.color), i);
      light.follows = this.sputter(source.at);
      const base = light.spec.intensity;
      if (light.window) this.windows.push({ light, base, color: light.spec.color });
      else this.lamps.push({ light, base });
    });

    // Filters: light on the ground and on sprites, the grade on the world, cutaways overhead.
    const lightW = W + 2 * LIGHT_MARGIN;
    const lightH = H + 2 * LIGHT_MARGIN;
    this.lutKey = `render:lut:${id}`;
    buildLut(scene, this.lutKey, this.meta, gradeFor(this.meta, this.map));
    this.lit.enableFilters();
    this.composite = new LightComposite(this.lit.filterCamera);
    this.composite.light = this.field.texture;
    this.composite.lightW = lightW;
    this.composite.lightH = lightH;
    if (this.region) {
      this.composite.rift = glTexture(scene, this.region.fxKey);
      const r = this.region.fxRect;
      this.composite.riftRect = [r.x, r.y, r.w, r.h];
    }
    this.composite.ambient = this.ambientStored(ambient);
    this.lit.filters?.internal.add(this.composite);

    this.feet = new FeetBuffer(
      scene,
      this.camera,
      [this.objects, this.overhead, this.foliage, this.atmosphere],
      (obj) => this.code(obj),
    );
    this.sprites.enableFilters();
    this.spriteLight = new SpriteLightFilter(this.sprites.filterCamera);
    this.spriteLight.light = this.field.texture;
    this.spriteLight.feet = this.feet.texture;
    this.spriteLight.lightW = lightW;
    this.spriteLight.lightH = lightH;
    this.spriteLight.shade = this.shadeTint;
    this.spriteLight.ambient = this.ambientStored(ambient);
    if (sun) {
      const len = Math.hypot(sun.dir[0], sun.dir[1]) || 1;
      this.spriteLight.sun = [-Math.round(sun.dir[0] / len), -Math.round(sun.dir[1] / len)];
      this.spriteLight.rim = [...rgbOf(paletteColor(this.meta, sun.color))];
      this.spriteLight.rimOn = true;
    }
    this.sprites.filters?.internal.add(this.spriteLight);

    this.world.enableFilters();
    this.grade = new Grade(this.world.filterCamera);
    this.grade.lut = glTexture(scene, this.lutKey);
    this.world.filters?.internal.add(this.grade);
    this.overhead.enableFilters();
    this.cutOverhead = new Cutaway(this.overhead.filterCamera);
    this.overhead.filters?.internal.add(this.cutOverhead);
    this.foliage.enableFilters();
    this.cutFoliage = new Cutaway(this.foliage.filterCamera);
    this.foliage.filters?.internal.add(this.cutFoliage);

    this.buildWeather();
    if (sun) this.buildSun(sun.color);
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

  // Entities and lights ---------------------------------------------------------------------

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
    });
  }

  /** Takes an entity out of the view with its lights. The object itself is not destroyed. */
  removeEntity(obj: Phaser.GameObjects.GameObject): void {
    const e = this.entities.get(obj);
    if (!e) return;
    this.objects.remove(obj);
    e.shadow?.destroy();
    for (const l of [...this.field.lights]) {
      if ((l.owner as unknown) === obj) this.dropLight(l);
    }
    this.entities.delete(obj);
  }

  /** A light carried by an entity: a lamp, a spell, a glowing book. */
  attachLight(obj: Lit, spec: LightSpec): LightHandle {
    return this.handle(this.makeLight(spec, obj.x, obj.y, obj));
  }

  /** A light standing in the world. */
  addLight(x: number, y: number, spec: LightSpec): LightHandle {
    return this.handle(this.makeLight(spec, x, y, null));
  }

  /**
   * A burst of light at a point that fades from its peak to nothing over `ms`: a hit spark, a
   * cast, an explosion. Pooled; hundreds at once cost one quad each in the light map.
   */
  flash(x: number, y: number, spec: FlashSpec): void {
    if (this.lighting === "screen") this.field.flash(x, y, spec);
  }

  /**
   * An effect sprite in the glow layer: never darkened, and drawn additively when its art says
   * `blend: "add"`. For sparks, bolts and other light.
   */
  addEffect(obj: Lit, additive?: boolean): void {
    const name = obj.frame.name.split("/")[0] ?? "";
    const sprite = this.meta.sprites[name];
    if (additive ?? sprite?.blend === "add") obj.setBlendMode(Phaser.BlendModes.ADD);
    this.glowLayer.add(obj);
  }

  /**
   * An enemy telegraph on the ground: drawn unlit under everything standing on it, so it reads
   * at full strength in the darkest map, with a pulsing light thrown around it. Remove with
   * `removeTelegraph`, or destroy the sprite.
   */
  addTelegraph(obj: Lit, options: TelegraphOptions = {}): void {
    if (this.telegraphs.has(obj)) return;
    this.groundGlow.add(obj);
    const intensity = options.intensity ?? 0.9;
    const light = this.makeLight(
      {
        radius: options.radius ?? obj.displayWidth / 2 + 10,
        color: options.color ?? paletteColor(this.meta, "red.light"),
        intensity,
        squash: obj.displayHeight / Math.max(1, obj.displayWidth) + 0.1,
      },
      obj.x,
      obj.y,
      obj,
    );
    this.telegraphs.set(obj, { sprite: obj, light, intensity, born: this.time });
    obj.once(Phaser.GameObjects.Events.DESTROY, () => this.removeTelegraph(obj));
  }

  removeTelegraph(obj: Phaser.GameObjects.GameObject): void {
    const t = this.telegraphs.get(obj);
    if (!t) return;
    this.dropLight(t.light);
    this.groundGlow.remove(obj);
    this.telegraphs.delete(obj);
  }

  /**
   * Drains the world to shades of one colour over `ms` (a boss's entrance), or back to its own
   * colour with `drain(null, ms)`. Overlays, the glow layer's halos and the UI are untouched
   * only when added with `addOverlay`; everything in the world drains.
   */
  drain(color: number | null, ms = 600): void {
    if (color !== null) this.grade.drainColor = [...rgbOf(color)];
    this.floodRamp = null;
    this.grade.flood = [0, 0, 0];
    this.drainRamp = { from: this.grade.drain, to: color === null ? 0 : 1, ms, age: 0 };
  }

  /** Floods a drained world's colour back outward from a world point over `ms`. */
  flood(x: number, y: number, ms = 900): void {
    if (this.grade.drain <= 0) return;
    this.floodAt = [x, y];
    const reach = Math.hypot(this.camera.width, this.camera.height) + 40;
    this.floodRamp = { from: 1, to: reach, ms, age: 0 };
  }

  /**
   * The map's own lamps (its `lights` data: tubes, lamps, signs) at `level` of the strength they
   * are drawn with, 0 to 1, eased over `ms`: a power cut, a lamp switched on. The light windows
   * let in, carried lights, flashes and a rift's region are not among them.
   */
  setMapLights(level: number, ms = 0): void {
    this.lampRamp = { from: this.lampLevel, to: Math.max(0, Math.min(1, level)), ms, age: 0 };
  }

  /**
   * The light the map's windows let in (their spill on the floor) at `level` of its drawn
   * strength, 0 to 3, eased over `ms`, in `color` or its own with null: a column of daylight on
   * the field pouring gold through the glass.
   */
  setWindowLight(level: number, ms = 0, color: number | null = null): void {
    for (const w of this.windows) w.light.spec = { ...w.light.spec, color: color ?? w.color };
    this.windowRamp = { from: this.windowLevel, to: Math.max(0, Math.min(3, level)), ms, age: 0 };
  }

  /**
   * Shows every placed `prop` in its `frame` (`window` in `rift`: the field outside at 23:40),
   * keeping a variant the placement chose (`-curtain`). Props with no such frame stay as drawn.
   */
  showPropFrame(prop: string, frame: string): void {
    for (const { sprite } of this.placed) {
      const name = sprite.frame.name;
      if (!name.startsWith(`${prop}/`)) continue;
      const variant = name.endsWith("-curtain") ? "-curtain" : "";
      const next = `${prop}/${frame}${variant}`;
      if (next !== name && sprite.texture.has(next)) sprite.setFrame(next);
    }
  }

  /** Black bars top and bottom, `size` pixels each, sliding in or out over `ms`. */
  letterbox(on: boolean, ms = 400, size = 28): void {
    this.barRamp = { from: this.bars[0].displayHeight, to: on ? size : 0, ms, age: 0 };
  }

  /**
   * A guard's vision cone as a torch beam in the light map, lit exactly where `sees` says the
   * guard sees: drive it each frame with `setPose(patrolPose(patrol, t))`.
   */
  addVisionCone(patrol: Patrol, options: { color?: number; intensity?: number } = {}): VisionCone {
    const key = `render:cone:${this.map.id}:${patrol.id}:${this.coneCount++}`;
    const cone = new Cone(
      this.scene,
      this.map,
      patrol,
      key,
      options.color ?? paletteColor(this.meta, "gold.light"),
      options.intensity ?? 0.8,
      () => this.cones.delete(cone),
    );
    this.cones.add(cone);
    this.field.layer.add(cone.image);
    return cone;
  }

  /** Draws above the world, untouched by its light and drain: a boss's drain sprite, a title. */
  addOverlay(obj: Phaser.GameObjects.GameObject): void {
    this.overlay.add(obj);
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
    return this.field.lightAt(x, y);
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
   * `screen`: the light map, sprite light and grade, the game's look. `object`: Phaser's
   * per-object lights, kept to compare against. `off`: the art as drawn.
   */
  setLighting(mode: LightingMode): void {
    this.lighting = mode;
    const screen = mode === "screen";
    this.composite.setActive(screen);
    this.spriteLight.setActive(screen);
    this.grade.setActive(screen);
    this.field.setVisible(screen);
    this.feet.rt.setVisible(screen);
    for (const g of [this.glowLayer, this.groundGlow])
      g.setVisible(mode !== "off" && !this.hidden.has("glow"));
    for (const g of this.glows) g.overlay.setVisible(screen && g.prop.visible);
    const object = mode === "object";
    const lights = this.scene.lights;
    if (object) {
      lights.enable();
      lights.setAmbientColor(colorOf(this.field.ambient.map((v) => Math.min(1, v)) as Rgb));
    } else lights.disable();
    const layers = [
      this.ground,
      this.shadows,
      this.objects,
      this.overhead,
      this.foliage,
      this.atmosphere,
    ];
    for (const l of layers) {
      for (const child of l.getChildren()) {
        if ("setLighting" in child && typeof child.setLighting === "function")
          child.setLighting(object);
      }
    }
    for (const [light, ol] of this.objectLights) {
      lights.removeLight(ol);
      this.objectLights.delete(light);
    }
    if (object) {
      for (const l of this.field.lights) {
        this.objectLights.set(
          l,
          lights.addLight(l.x, l.y, l.spec.radius * 1.6, l.spec.color, l.spec.intensity * 1.6),
        );
      }
    }
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
  }

  /** The grade on or off (off shows lit colours without the palette pull), for review. */
  setGrade(on: boolean): void {
    buildLut(this.scene, this.lutKey, this.meta, on ? gradeFor(this.meta, this.map) : NO_GRADE);
  }

  /** Review knobs: light steps, seam sharpness and how far colours pull to the palette. */
  tune(knobs: { steps?: number; sharp?: number; snap?: number }): void {
    for (const f of [this.composite, this.spriteLight]) {
      if (knobs.steps !== undefined) f.steps = knobs.steps;
      if (knobs.sharp !== undefined) f.sharp = knobs.sharp;
    }
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
    for (const e of [this.weather, this.regionMotes, this.glitter])
      particles += e?.getAliveParticleCount() ?? 0;
    return {
      tier: this.tierName,
      lighting: this.lighting,
      objects: this.placed.length,
      visibleObjects: visible,
      entities: this.entities.size,
      lights: this.field.lights.size + (this.region ? 1 : 0),
      flashes: this.field.flashCount,
      particles,
    };
  }

  /** Removes everything the view made. Shared atlases stay loaded; see `unloadMap`. */
  destroy(): void {
    for (const off of this.offs.splice(0)) off();
    for (const obj of [...this.telegraphs.keys()]) this.removeTelegraph(obj);
    for (const c of [...this.cones]) c.remove();
    for (const obj of [...this.entities.keys()]) this.removeEntity(obj);
    for (const ol of this.objectLights.values()) this.scene.lights.removeLight(ol);
    if (this.regionObjectLight) this.scene.lights.removeLight(this.regionObjectLight);
    this.scene.lights.disable();
    for (const g of this.glows) g.overlay.destroy();
    this.world.destroy();
    this.overlay.destroy();
    for (const b of this.bars) b.destroy();
    this.field.destroy();
    this.feet.destroy();
    for (const key of [this.lutKey, ...this.textureKeys, ...(this.region?.keys ?? [])]) {
      if (this.scene.textures.exists(key)) this.scene.textures.remove(key);
    }
    for (const key of this.animKeys) this.scene.anims.remove(key);
  }

  // Building ---------------------------------------------------------------------------------

  private makeLight(spec: LightSpec, x: number, y: number, owner: Lit | null): Light {
    const light = this.field.create(spec, x, y, owner);
    if (this.lighting === "object") {
      this.objectLights.set(
        light,
        this.scene.lights.addLight(x, y, spec.radius * 1.6, spec.color, spec.intensity * 1.6),
      );
    }
    return light;
  }

  private dropLight(light: Light): void {
    this.field.drop(light);
    const ol = this.objectLights.get(light);
    if (ol) this.scene.lights.removeLight(ol);
    this.objectLights.delete(light);
  }

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

  /**
   * The ambient as the light map holds it after 8-bit storage at half strength, so the filters
   * subtract exactly what is there and flat ambient bands to nothing.
   */
  private ambientStored(a: Rgb): Rgb {
    return a.map((v) => (Math.round(Math.min(1, v / 2) * 255) / 255) * 2) as Rgb;
  }

  /** How a sprite is coded for the sprite light pass. */
  private code(obj: Phaser.GameObjects.GameObject): SpriteCode {
    const y = (obj as unknown as { y: number }).y;
    const e = this.entities.get(obj);
    if (e) {
      const x = (obj as unknown as { x: number }).x;
      return { feetY: y, unlit: !e.lit, shade: this.shadeAt(x, y) };
    }
    const c = this.codes.get(obj);
    return { feetY: y + (c?.feet ?? 0), unlit: c?.unlit ?? false, shade: 0 };
  }

  /** A light at a prop that switches itself on and off follows the prop's frames. */
  private sputter(at: readonly [number, number]): (() => number) | null {
    let best: Glow | null = null;
    let bestD = 48;
    for (const g of this.glows) {
      if (!g.prop.anims.isPlaying) continue;
      const d = Math.hypot(g.prop.x - at[0], g.prop.y - at[1]);
      if (d < bestD) {
        bestD = d;
        best = g;
      }
    }
    const g = best;
    return g ? () => g.level : null;
  }

  /** An atlas recoloured into the map's theme, made once per atlas. */
  private themed(atlas: string): ThemedAtlas {
    let t = this.themedAtlases.get(atlas);
    if (!t) {
      t = themedAtlas(this.scene, this.meta, atlas, this.theme, this.paintedNight);
      this.themedAtlases.set(atlas, t);
    }
    return t;
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
    backdrop = false,
  ): Placed | null {
    if ("rig" in t) return this.placeDoll(t, layer, order);
    const name = "prop" in t ? t.prop : t.actor;
    const sp = this.meta.sprites[name];
    if (!sp) return null;
    const raw = !("prop" in t) || t.raw === true;
    const themed = raw ? null : this.themed(sp.atlas);
    const texture = themed ? themed.key : sp.atlas;
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
      const placed: Placed = { sprite, bounds: this.boundsOf(sprite, t.drift?.to) };
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
      if (themed?.glow && sp.frames.some((fr) => themed.glowing.has(fr))) {
        this.makeGlow(sprite, sp, themed.glow, flip, ox, oy, W, placed.bounds, layer);
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
    const placed: Placed = { sprite, bounds: this.boundsOf(sprite) };
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
    glowKey: string,
    flip: boolean,
    ox: number,
    oy: number,
    W: number,
    bounds: Rect,
    layer: Phaser.GameObjects.Layer,
  ): void {
    const overlay = new Phaser.GameObjects.Sprite(this.scene, 0, 0, glowKey, prop.frame.name);
    overlay
      .setFlipX(flip)
      .setPosition(prop.x, prop.y)
      .setDepth(prop.depth + 1e-7);
    if (!prop.frame.customPivot) overlay.setDisplayOrigin(ox, oy);
    layer.add(overlay);
    this.codes.set(overlay, { feet: 0, unlit: true });
    const frames = new Map<string, { n: number; cx: number; cy: number }>();
    const glowTex = this.scene.textures.get(glowKey);
    const ctx = (glowTex.getSourceImage() as HTMLCanvasElement).getContext("2d", {
      willReadFrequently: true,
    });
    let most = 0;
    let spread = 0;
    for (const name of sp.frames) {
      if (!glowTex.has(name) || !ctx) continue;
      const f = glowTex.get(name);
      const data = ctx.getImageData(f.cutX, f.cutY, f.cutWidth, f.cutHeight).data;
      let n = 0;
      let sx = 0;
      let sy = 0;
      let x0 = Number.POSITIVE_INFINITY;
      let x1 = Number.NEGATIVE_INFINITY;
      for (let y = 0; y < f.cutHeight; y++) {
        for (let x = 0; x < f.cutWidth; x++) {
          if ((data[(y * f.cutWidth + x) * 4 + 3] ?? 0) === 0) continue;
          n++;
          sx += x + f.x;
          sy += y + f.y;
          x0 = Math.min(x0, x);
          x1 = Math.max(x1, x);
        }
      }
      if (n > 0) spread = Math.max(spread, x1 - x0);
      const cx = n > 0 ? sx / n + 0.5 : 0;
      frames.set(name, { n, cx: flip ? W - cx : cx, cy: n > 0 ? sy / n + 0.5 : 0 });
      most = Math.max(most, n);
    }
    // A halo gathers round one light head; glow spread along a string or a sign gets none.
    const lamp =
      spread <= 14 &&
      this.map.lights.some(
        (l) => !l.paint?.region && Math.hypot(l.at[0] - prop.x, l.at[1] - prop.y) < 48,
      );
    let halo: Phaser.GameObjects.Image | null = null;
    if (lamp) {
      halo = new Phaser.GameObjects.Image(this.scene, 0, 0, TEX.halo);
      halo.setBlendMode(Phaser.BlendModes.ADD);
      halo.setTint(paletteColor(this.meta, "gold.pale")).setVisible(false);
      this.glowLayer.add(halo);
    }
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
        if (sp.blend === "add") {
          s.setBlendMode(Phaser.BlendModes.ADD);
          this.glowLayer.add(s);
        } else this.atmosphere.add(s);
        this.codes.set(s, { feet: 16, unlit: false });
        sprites.push(s);
      }
      this.particles.push({ emitter: e, sprites, frames, fps });
    }
  }

  private buildWeather(): void {
    const kind = this.map.time.weather;
    if (kind !== "sea-wind" && kind !== "drizzle") return;
    // Indoors the weather stays at the windows, in their own art.
    if (this.indoors) return;
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

  /**
   * Under a low sun: water past the map's edge glitters, and broad shafts of light lean across
   * the air in the sun's direction, banded and dithered like the rest of the light.
   */
  private buildSun(color: string): void {
    const warm = paletteColor(this.meta, color);
    const water = this.placed
      .filter((p) => WATER.test(p.sprite.frame.name.split("/")[0] ?? ""))
      .map((p) => p.bounds);
    for (const b of this.backdrop.getChildren()) {
      const s = b as Phaser.GameObjects.Sprite;
      if (s.frame && WATER.test(s.frame.name.split("/")[0] ?? "")) {
        water.push({
          x: s.x - s.displayOriginX,
          y: s.y - s.displayOriginY,
          w: s.frame.realWidth,
          h: s.frame.realHeight,
        });
      }
    }
    if (water.length > 0) {
      const area = water.reduce((a, b) => {
        const x0 = Math.min(a.x, b.x);
        const y0 = Math.min(a.y, b.y);
        return {
          x: x0,
          y: y0,
          w: Math.max(a.x + a.w, b.x + b.w) - x0,
          h: Math.max(a.y + a.h, b.y + b.h) - y0,
        };
      });
      this.glitter = this.scene.add.particles(0, 0, TEX.px, {
        x: { min: area.x, max: area.x + area.w },
        y: { min: area.y + 2, max: area.y + area.h - 2 },
        lifespan: { min: 180, max: 520 },
        alpha: { start: 0, end: 1, ease: (v: number) => Math.sin(v * Math.PI) },
        scaleX: { min: 0.5, max: 1.5 },
        scaleY: 0.5,
        tint: [warm, 0xffffff],
        blendMode: Phaser.BlendModes.ADD,
        frequency: 14,
      });
      this.backdrop.add(this.glitter);
    }
    // Shafts: a slanted band of dithered light, a few across the map, drifting a little.
    if (!this.sun) return;
    const key = `render:shaft:${this.map.id}`;
    const H = this.camera.height;
    const slant = this.sun[0] / Math.max(0.2, Math.abs(this.sun[1]) + 0.35);
    const bandW = 70;
    const w = Math.ceil(bandW + Math.abs(slant) * H);
    if (!this.scene.textures.exists(key)) {
      const tex = this.scene.textures.createCanvas(key, w, H);
      if (tex) {
        const ctx = tex.getContext();
        const img = ctx.createImageData(w, H);
        for (let y = 0; y < H; y++) {
          const shift = slant > 0 ? slant * y : Math.abs(slant) * (H - y);
          for (let x = 0; x < w; x++) {
            const u = (x - shift) / bandW;
            if (u < 0 || u > 1) continue;
            const v = Math.sin(u * Math.PI) * (0.55 + 0.45 * Math.sin((y / H) * Math.PI));
            const level = v > 0.66 ? 2 : v > 0.3 + bayer4(x, y) * 0.12 ? 1 : 0;
            const o = (y * w + x) * 4;
            img.data[o] = 255;
            img.data[o + 1] = 255;
            img.data[o + 2] = 255;
            img.data[o + 3] = [0, 20, 36][level] as number;
          }
        }
        ctx.putImageData(img, 0, 0);
        tex.refresh();
        this.textureKeys.push(key);
      }
    }
    for (let x = 80; x < this.width; x += 340) {
      const shaft = new Phaser.GameObjects.Image(this.scene, x, 0, key)
        .setOrigin(0, 0)
        .setScrollFactor(0.9, 0)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(warm);
      this.glowLayer.add(shaft);
      this.shafts.push(shaft);
    }
  }

  private buildRegion(): RegionLight | null {
    const source = this.map.lights.find((l) => l.paint?.region) ?? this.woundLight();
    if (!source) return null;
    const region = buildRegionLight(
      this.scene,
      this.map.id,
      this.masks,
      source,
      this.map.scene.seed,
    );
    if (!region) return null;
    // A cold rift in a bright map cools the ground round it; anywhere else it lights it.
    const rgb = rgbOf(paletteColor(this.meta, source.color));
    const cold = rgb[2] > rgb[0] && this.map.ambient.intensity >= 0.7;
    this.field.setRegion(region, paletteColor(this.meta, source.color), cold ? "mix" : "add");
    // The lip glows on the ground, under whatever stands on it.
    this.regionGlow = new Phaser.GameObjects.Image(
      this.scene,
      region.glowRect.x,
      region.glowRect.y,
      region.glowKey,
    )
      .setOrigin(0)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(this.lipColor(source.color));
    this.groundGlow.add(this.regionGlow);
    const lip = region.lip;
    const n = lip.length / 2;
    const [cx, cy] = region.core;
    this.regionMotes = this.scene.add.particles(0, 0, TEX.px, {
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
      tint: [this.lipColor(source.color), paletteColor(this.meta, source.color), 0xffffff],
      blendMode: Phaser.BlendModes.ADD,
      frequency: 90,
      maxAliveParticles: 48,
    });
    this.glowLayer.add(this.regionMotes);
    return region;
  }

  /** The lip of a tear glows pale gold in warm light, in its own colour in cold. */
  private lipColor(color: string): number {
    const c = rgbOf(paletteColor(this.meta, color));
    return c[2] > c[0] ? paletteColor(this.meta, color) : paletteColor(this.meta, "gold.pale");
  }

  /**
   * A torn edge the map paints no region light for (the agora's wound): lit from the light
   * standing nearest it, spilling that light's colour out over a third of its radius.
   */
  private woundLight(): LightSource | null {
    const { w, h, inside } = this.masks;
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (let y = 0; y < h; y += 4) {
      for (let x = 0; x < w; x += 4) {
        if (!inside[y * w + x]) continue;
        sx += x;
        sy += y;
        n++;
      }
    }
    if (n === 0) return null;
    const cx = sx / n;
    const cy = sy / n;
    const dist = (l: LightSource) => Math.hypot(l.at[0] - cx, l.at[1] - cy);
    const near = this.map.lights
      .filter((l) => l.radius > 0 && l.intensity > 0)
      .sort((a, b) => dist(a) - dist(b))[0];
    if (!near || dist(near) > 240) return null;
    return {
      ...near,
      intensity: near.intensity * 0.6,
      paint: {
        bands: [],
        region: "*",
        reach: [near.radius * 0.35],
        ragged: 5,
        rays: { at: [cx, cy], count: 9, amount: 0.25 },
      },
    };
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

  private applyTier(): void {
    const t = this.tier;
    this.composite.dither = t.dither;
    this.spriteLight.dither = t.dither;
    this.composite.haze = t.riftHaze ? 1 : 0;
    this.composite.chroma = t.riftChroma ? 1 : 0;
    for (const p of this.particles) {
      const keep = Math.round(p.emitter.count * t.particles);
      p.sprites.forEach((s, k) => {
        s.setActive(k < keep);
        if (k >= keep) s.setVisible(false);
      });
    }
    if (this.weather) this.weather.maxAliveParticles = t.weather;
    if (this.regionMotes) this.regionMotes.maxAliveParticles = t.riftMotes;
    if (this.glitter) this.glitter.maxAliveParticles = Math.round(t.weather / 2);
    for (const s of this.shafts) s.setVisible(t.riftShafts);
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
    this.updateEntities();
    this.updateTelegraphs(t);
    const lamps = step(this.lampRamp, deltaMs);
    if (lamps !== this.lampLevel) {
      this.lampLevel = lamps;
      for (const m of this.lamps) m.light.spec = { ...m.light.spec, intensity: m.base * lamps };
    }
    const windows = step(this.windowRamp, deltaMs);
    if (windows !== this.windowLevel) {
      this.windowLevel = windows;
      for (const w of this.windows) w.light.spec = { ...w.light.spec, intensity: w.base * windows };
    }
    this.field.update(t, deltaMs, this.tier.entityLights);
    this.updateRegion(t);
    this.updateCutaway();
    this.updateEntrance(deltaMs);
    for (const s of this.shafts) s.setAlpha(0.75 + 0.25 * Math.sin(t * 0.4 + s.x * 0.01));
    this.composite.time = t;
    if (this.lighting === "screen") this.feet.queue();
    for (const [light, ol] of this.objectLights) {
      ol.setPosition(light.x, light.y);
      ol.setIntensity(light.level * 1.6);
    }
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

  /** Sorts entities by their feet and lays their shadows, long under a low sun. */
  private updateEntities(): void {
    const sun = this.sun;
    for (const e of this.entities.values()) {
      const { obj } = e;
      obj.setDepth(obj.y + obj.x * 1e-5);
      const s = e.shadow;
      if (!s) continue;
      s.setVisible(obj.visible);
      if (sun && this.shadeAt(obj.x, obj.y) < 0.5) {
        // Cast away from the sun: stretched along it, starting at the feet.
        const len = Math.hypot(sun[0], sun[1]) * ENTITY_HEIGHT;
        const w = s.frame.realWidth;
        s.setScale((w + len) / w, 1).setPosition(
          Math.round(obj.x + (sun[0] * ENTITY_HEIGHT) / 2),
          Math.round(obj.y + (sun[1] * ENTITY_HEIGHT) / 2),
        );
      } else s.setScale(1).setPosition(Math.round(obj.x), Math.round(obj.y));
    }
  }

  private updateTelegraphs(t: number): void {
    for (const g of this.telegraphs.values()) {
      const pulse = 0.8 + 0.2 * Math.sin((t - g.born) * 9);
      g.light.spec = { ...g.light.spec, intensity: g.intensity * pulse };
    }
  }

  private updateGlows(): void {
    const screen = this.lighting === "screen";
    for (const g of this.glows) {
      const info = g.frames.get(g.prop.frame.name);
      g.level = info && g.most > 0 ? info.n / g.most : 0;
      if (g.overlay.frame.name !== g.prop.frame.name)
        g.overlay.setFrame(g.prop.frame.name, false, false);
      // Lamps, screens and signs go dark with the map's lamps (`setMapLights`); a window's glow
      // is the sky's.
      const power = g.prop.frame.name.startsWith("window/") ? 1 : this.lampLevel;
      g.overlay.setVisible(screen && g.prop.visible && power > 0).setAlpha(power);
      if (!g.halo) continue;
      const on = screen && g.prop.visible && this.tier.halos && g.level > 0 && !!info && power > 0;
      g.halo.setVisible(on);
      if (!on || !info) continue;
      const left = g.prop.x - g.prop.displayOriginX;
      const top = g.prop.y - g.prop.displayOriginY;
      const size = Math.max(14, Math.min(44, Math.sqrt(info.n) * 4.5));
      g.halo
        .setPosition(Math.round(left + info.cx), Math.round(top + info.cy))
        .setDisplaySize(size, size)
        .setAlpha((0.55 + 0.45 * g.level) * power);
    }
  }

  private updateRegion(t: number): void {
    const r = this.region;
    if (!r) return;
    const src = r.source;
    const pulse = src.paint?.pulse ?? src.flicker;
    let k = 1;
    if (pulse) k += pulse.amount * 2.5 * Math.sin((2 * Math.PI * t) / pulse.period);
    if (src.flicker) k += src.flicker.amount * 0.5 * wobble(t, src.flicker.period * 1.7, 3.1);
    const base = src.intensity * SPILL_SCALE * k;
    // The shafts drift: two ray patterns crossfade over about eleven seconds.
    const mix = this.tier.riftShafts ? 0.5 + 0.5 * Math.sin((2 * Math.PI * t) / 11) : 0;
    this.field.setRegionLevels(base * (1 - mix), base * mix);
    this.regionGlow?.setAlpha(0.7 + 0.3 * Math.sin((2 * Math.PI * t) / (pulse?.period ?? 2.2)));
  }

  private updateEntrance(deltaMs: number): void {
    this.grade.drain = step(this.drainRamp, deltaMs);
    if (this.floodRamp) {
      const r = step(this.floodRamp, deltaMs);
      this.grade.flood = [this.floodAt[0], this.floodAt[1], r];
      if (this.floodRamp.age >= this.floodRamp.ms) {
        this.floodRamp = null;
        this.grade.flood = [0, 0, 0];
        this.drainRamp = { from: 0, to: 0, ms: 0, age: 0 };
        this.grade.drain = 0;
      }
    }
    const h = Math.round(step(this.barRamp, deltaMs));
    for (const b of this.bars) b.setDisplaySize(this.camera.width, h).setVisible(h > 0);
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
