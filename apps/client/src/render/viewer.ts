/**
 * The map viewer: a development scene for reviewing maps in motion before the game flow
 * reaches them. Never part of a production build (main.ts loads it only under Vite's dev
 * server, from `?view=<map id>`).
 *
 * URL: `view` map id, `tier` low|medium|high (else the probe decides), `light`
 * screen|object|off, `n` wandering sprites (`crowd` 1 keeps them on screen), `path` 1 for the
 * scripted camera path at `speed` pixels a second, `hud` 0 to hide the readout, `at` x,y to
 * centre on, `hide` layers to hide, `steps`, `sharp` and `snap` to tune the light.
 * Keys: arrows move the camera, 1–8 toggle layers, L lighting, T tier, G grade, N/M add or
 * remove 50 wanderers, P path, H readout.
 */
import type { ArtMetadata } from "@guago/art";
import { isSolidTile } from "@guago/shared";
import * as Phaser from "phaser";
import { composeLook, defaultLook, lookAnim, lookTexture } from "../art.ts";
import { artMetadata, loadAtlases, loadMap, mapData } from "./assets.ts";
import { paletteColor } from "./grade.ts";
import { LAYER_NAMES, type LightHandle, type LightingMode, MapView } from "./map-view.ts";
import { probeTier, setQualityTier, TIERS, type Tier } from "./tiers.ts";
import { DEMO_ATLASES, type Demo, startDemo } from "./viewer-demos.ts";

const MONSTERS = ["odap", "odap-pencil", "rational", "golem", "element-fire", "element-water"];
const PLAYER_RIG = "student";

interface Walker {
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly kind: "player" | "monster";
  readonly name: string;
  tx: number;
  ty: number;
  speed: number;
  dir: string;
  light: LightHandle | null;
}

/** Camera paths, in world pixels: each map's walk past its lights and under its crowns. */
const PATHS: Readonly<Record<string, readonly (readonly [number, number])[]>> = {
  // From the yard path: through the lamp's pool and the sputtering floodlight's, across the
  // dark field into the tear's spill, onto the marble, behind the olive and a column.
  "campus-field": [
    [40, 344],
    [104, 330],
    [150, 300],
    [200, 236],
    [300, 240],
    [470, 300],
    [600, 330],
    [690, 250],
    [760, 196],
    [812, 128],
    [860, 128],
    [900, 200],
    [960, 300],
  ],
  // Along the front of 가설관, behind the 해솔's crown, under the wisteria, past the vending
  // machines' glow at the 급식실 plaza.
  "campus-yard": [
    [180, 400],
    [250, 438],
    [420, 438],
    [560, 470],
    [700, 532],
    [800, 532],
    [800, 690],
    [760, 728],
    [900, 740],
    [1020, 640],
  ],
};

export class ViewerScene extends Phaser.Scene {
  private id = "";
  private view!: MapView;
  private meta!: ArtMetadata;
  private readonly params = new URLSearchParams(location.search);
  private readonly walkers: Walker[] = [];
  private hero: Walker | null = null;
  private path: readonly (readonly [number, number])[] = [];
  private pathOn = false;
  private pathT = 0;
  private hud: HTMLDivElement | null = null;
  private drawCalls = 0;
  private lastDrawCalls = 0;
  private frameTimes: number[] = [];
  private look = "";
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;

  constructor() {
    super("viewer");
  }

  preload(): void {
    this.id = this.params.get("view") || "campus-field";
    loadMap(this, this.id);
    const demo = this.params.get("demo") as Demo | null;
    if (demo && demo in DEMO_ATLASES) loadAtlases(this, DEMO_ATLASES[demo]);
  }

  create(): void {
    this.meta = artMetadata(this);
    const map = mapData(this, this.id);
    const tierParam = this.params.get("tier");
    const tier = TIERS.includes(tierParam as Tier) ? (tierParam as Tier) : undefined;
    if (tier) setQualityTier(tier, false);
    const lighting = (this.params.get("light") as LightingMode | null) ?? "screen";
    this.view = MapView.create(this, this.id, { lighting, ...(tier ? { tier } : {}) });
    if (this.params.get("grade") === "0") this.view.setGrade(false);
    for (const name of this.params.get("hide")?.split(",") ?? []) {
      if ((LAYER_NAMES as readonly string[]).includes(name))
        this.view.setLayerVisible(name as (typeof LAYER_NAMES)[number], false);
    }
    const knob = (k: string) => (this.params.has(k) ? Number(this.params.get(k)) : undefined);
    const steps = knob("steps");
    const sharp = knob("sharp");
    const snap = knob("snap");
    this.view.tune({
      ...(steps !== undefined ? { steps } : {}),
      ...(sharp !== undefined ? { sharp } : {}),
      ...(snap !== undefined ? { snap } : {}),
    });

    for (const m of MONSTERS) this.monsterAnims(m);
    this.look = composeLook(this, this.meta, PLAYER_RIG, defaultLook(this.meta, PLAYER_RIG)).look;

    const cam = this.cameras.main;
    cam.setBounds(0, 0, this.view.width, this.view.height);
    cam.setRoundPixels(true);
    const at = this.params.get("at")?.split(",").map(Number);
    const spawn = map.spawns.main ?? { x: map.landmark.x, y: map.landmark.y };
    cam.centerOn(at?.[0] ?? spawn.x, at?.[1] ?? spawn.y);

    this.path = PATHS[this.id] ?? [];
    this.pathOn = this.params.get("path") === "1" && this.path.length > 1;
    if (this.path.length > 1) this.spawnHero();
    this.addWalkers(Number(this.params.get("n") ?? 0));

    this.cursors =
      this.input.keyboard?.createCursorKeys() as Phaser.Types.Input.Keyboard.CursorKeys;
    this.input.keyboard?.on("keydown", (e: KeyboardEvent) => this.onKey(e.key));
    this.countDrawCalls();
    if (this.params.get("hud") !== "0") this.makeHud();
    const demo = this.params.get("demo") as Demo | null;
    if (demo && demo in DEMO_ATLASES) {
      const centre = { x: cam.scrollX + cam.width / 2, y: cam.scrollY + cam.height / 2 };
      this.demo = startDemo(demo, this, this.view, this.meta, centre);
    }
    if (!tier) {
      void probeTier(this.game, (fn) => {
        this.events.on(Phaser.Scenes.Events.POST_UPDATE, fn);
        return () => this.events.off(Phaser.Scenes.Events.POST_UPDATE, fn);
      }).then((t) => this.view.setTier(t));
    }
    (window as unknown as { viewer: unknown }).viewer = {
      view: this.view,
      scene: this,
      setTier: (t: Tier) => this.view.setTier(t),
      setLighting: (m: LightingMode) => this.view.setLighting(m),
      setLayer: (name: (typeof LAYER_NAMES)[number], on: boolean) =>
        this.view.setLayerVisible(name, on),
      centre: (x: number, y: number) => this.cameras.main.centerOn(x, y),
      path: (on: boolean) => {
        this.pathOn = on;
        this.pathT = 0;
      },
      walkers: (n: number) => this.addWalkers(n),
      stats: () => ({
        ...this.view.stats(),
        drawCalls: this.lastDrawCalls,
        frameMs: this.frameMs(),
        fps: this.game.loop.actualFps,
      }),
    };
  }

  private monsterAnims(name: string): void {
    const sp = this.meta.sprites[name];
    if (!sp) return;
    for (const [anim, a] of Object.entries(sp.anims)) {
      const key = `${name}/${anim}`;
      if (this.anims.exists(key)) continue;
      this.anims.create({
        key,
        frames: a.frames.map((frame) => ({ key: sp.atlas, frame })),
        frameRate: a.fps,
        repeat: a.loop ? -1 : 0,
      });
    }
  }

  /** A walkable point anywhere, or on screen with `crowd=1` so every sprite is drawn. */
  private randomWalkable(): [number, number] {
    const map = mapData(this, this.id);
    const crowd = this.params.get("crowd") === "1";
    const view = this.cameras.main.worldView;
    for (let i = 0; i < 200; i++) {
      const tx = crowd
        ? Math.floor((view.x + 8 + Math.random() * (view.width - 16)) / 16)
        : Math.floor(Math.random() * map.w);
      const ty = crowd
        ? Math.floor((view.y + 16 + Math.random() * (view.height - 20)) / 16)
        : Math.floor(Math.random() * map.h);
      if (!isSolidTile(map, tx, ty)) return [tx * 16 + 8, ty * 16 + 12];
    }
    return [map.spawns.main?.x ?? 0, map.spawns.main?.y ?? 0];
  }

  private makeWalker(kind: Walker["kind"], x: number, y: number): Walker {
    let sprite: Phaser.GameObjects.Sprite;
    let name: string;
    if (kind === "player") {
      name = PLAYER_RIG;
      sprite = this.add.sprite(x, y, lookTexture(PLAYER_RIG, this.look));
      sprite.play(lookAnim(PLAYER_RIG, this.look, "down", "walk"));
    } else {
      name = MONSTERS[Math.floor(Math.random() * MONSTERS.length)] ?? "odap";
      const sp = this.meta.sprites[name];
      sprite = this.add.sprite(x, y, sp?.atlas ?? "core");
      if (sp) sprite.setDisplayOrigin(sp.origin[0], sp.origin[1]);
      const idle = sp?.anims.hop ? "hop" : Object.keys(sp?.anims ?? {})[0];
      if (idle) sprite.play(`${name}/${idle}`);
    }
    sprite.anims.setProgress(Math.random());
    return {
      sprite,
      kind,
      name,
      tx: x,
      ty: y,
      speed: 18 + Math.random() * 22,
      dir: "down",
      light: null,
    };
  }

  private spawnHero(): void {
    const [x, y] = this.path[0] as readonly [number, number];
    const hero = this.makeWalker("player", x, y);
    hero.speed = Number(this.params.get("speed") ?? 42);
    this.view.addEntity(hero.sprite, { focus: true });
    hero.light = this.view.attachLight(hero.sprite, {
      radius: 34,
      color: paletteColor(this.meta, "sea.light"),
      intensity: 0.55,
      offset: [0, -2],
      flicker: { amount: 0.12, period: 0.9 },
    });
    this.hero = hero;
  }

  private addWalkers(n: number): void {
    if (n < 0) {
      for (const w of this.walkers.splice(n)) {
        this.view.removeEntity(w.sprite);
        w.sprite.destroy();
      }
      return;
    }
    const players = Math.round(n * (80 / 230));
    for (let i = 0; i < n; i++) {
      const [x, y] = this.randomWalkable();
      const w = this.makeWalker(i < players ? "player" : "monster", x, y);
      this.view.addEntity(w.sprite);
      if (i % 12 === 0) {
        w.light = this.view.attachLight(w.sprite, {
          radius: 28,
          color: paletteColor(this.meta, i % 24 === 0 ? "plum.pale" : "gold.light"),
          intensity: 0.5,
          offset: [0, -4],
        });
      }
      [w.tx, w.ty] = this.randomWalkable();
      this.walkers.push(w);
    }
  }

  private onKey(key: string): void {
    const n = Number(key);
    if (n >= 1 && n <= LAYER_NAMES.length) {
      const name = LAYER_NAMES[n - 1];
      if (name) this.view.setLayerVisible(name, !this.view.layerVisible(name));
    }
    switch (key.toLowerCase()) {
      case "l": {
        const modes: LightingMode[] = ["screen", "object", "off"];
        this.view.setLighting(
          modes[(modes.indexOf(this.view.lightingMode) + 1) % modes.length] as LightingMode,
        );
        break;
      }
      case "t":
        this.view.setTier(TIERS[(TIERS.indexOf(this.view.qualityTier) + 1) % TIERS.length] as Tier);
        break;
      case "g":
        this.gradeOn = !this.gradeOn;
        this.view.setGrade(this.gradeOn);
        break;
      case "n":
        this.addWalkers(50);
        break;
      case "m":
        this.addWalkers(-50);
        break;
      case "p":
        this.pathOn = !this.pathOn;
        break;
      case "h":
        if (this.hud) this.hud.style.display = this.hud.style.display === "none" ? "" : "none";
        break;
    }
  }

  private gradeOn = true;

  private demo: ((t: number, dt: number) => void) | null = null;
  private demoTime = 0;

  override update(_time: number, delta: number): void {
    if (this.demo) {
      this.demoTime += delta / 1000;
      this.demo(this.demoTime, delta);
    }
    this.frameTimes.push(delta);
    if (this.frameTimes.length > 120) this.frameTimes.shift();
    const dt = delta / 1000;
    const cam = this.cameras.main;

    if (this.pathOn && this.hero) {
      this.pathT += dt * this.hero.speed;
      const p = this.pointOnPath(this.pathT);
      this.moveTo(this.hero, p[0], p[1], dt, true);
      cam.centerOn(Math.round(this.hero.sprite.x), Math.round(this.hero.sprite.y - 12));
    } else {
      const speed = 180 * dt;
      if (this.cursors.left.isDown) cam.scrollX -= speed;
      if (this.cursors.right.isDown) cam.scrollX += speed;
      if (this.cursors.up.isDown) cam.scrollY -= speed;
      if (this.cursors.down.isDown) cam.scrollY += speed;
    }

    for (const w of this.walkers) {
      if (this.moveTo(w, w.tx, w.ty, dt, false)) [w.tx, w.ty] = this.randomWalkable();
    }
    this.updateHud();
  }

  private pointOnPath(dist: number): [number, number] {
    const pts = this.path;
    let total = 0;
    const lens: number[] = [];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1] as readonly [number, number];
      const b = pts[i] as readonly [number, number];
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      lens.push(l);
      total += l;
    }
    // Back and forth along the path.
    let d = dist % (2 * total);
    if (d > total) d = 2 * total - d;
    for (let i = 0; i < lens.length; i++) {
      const l = lens[i] as number;
      if (d <= l) {
        const a = pts[i] as readonly [number, number];
        const b = pts[i + 1] as readonly [number, number];
        const f = d / l;
        return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
      }
      d -= l;
    }
    const last = pts[pts.length - 1] as readonly [number, number];
    return [last[0], last[1]];
  }

  /** Steps a walker toward a point; true when it arrived. */
  private moveTo(w: Walker, tx: number, ty: number, dt: number, exact: boolean): boolean {
    const s = w.sprite;
    const dx = tx - s.x;
    const dy = ty - s.y;
    const d = Math.hypot(dx, dy);
    if (exact) s.setPosition(tx, ty);
    else if (d > 0.5) {
      const step = Math.min(d, w.speed * dt);
      s.setPosition(s.x + (dx / d) * step, s.y + (dy / d) * step);
    }
    if (w.kind === "player" && d > 0.01) {
      const dir = Math.abs(dx) > Math.abs(dy) ? "side" : dy < 0 ? "up" : "down";
      s.setFlipX(dir === "side" && dx < 0);
      if (dir !== w.dir) {
        w.dir = dir;
        s.play(lookAnim(PLAYER_RIG, this.look, dir, "walk"), true);
      }
    } else if (w.kind === "monster" && Math.abs(dx) > 0.5) s.setFlipX(dx < 0);
    return !exact && d < 2;
  }

  // Readout -------------------------------------------------------------------------------------

  private countDrawCalls(): void {
    const renderer = this.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
    const gl = renderer.gl as WebGLRenderingContext & Record<string, unknown>;
    for (const name of ["drawElements", "drawArrays"] as const) {
      const original = gl[name].bind(gl) as (...args: unknown[]) => void;
      (gl as unknown as Record<string, unknown>)[name] = (...args: unknown[]) => {
        this.drawCalls++;
        original(...args);
      };
    }
    this.game.events.on(Phaser.Core.Events.PRE_RENDER, () => {
      this.drawCalls = 0;
    });
    this.game.events.on(Phaser.Core.Events.POST_RENDER, () => {
      this.lastDrawCalls = this.drawCalls;
    });
  }

  private frameMs(): number {
    if (this.frameTimes.length === 0) return 0;
    return this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
  }

  private makeHud(): void {
    const hud = document.createElement("div");
    hud.style.cssText =
      "position:fixed;left:8px;top:8px;z-index:10;font:12px/1.4 ui-monospace,monospace;color:#e0d5c2;background:#1a1427cc;padding:6px 8px;white-space:pre;pointer-events:none";
    document.body.appendChild(hud);
    this.hud = hud;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => hud.remove());
  }

  private updateHud(): void {
    if (!this.hud || this.game.loop.frame % 10 !== 0) return;
    const s = this.view.stats();
    const ms = this.frameMs();
    const hidden = LAYER_NAMES.filter((n) => !this.view.layerVisible(n));
    this.hud.textContent = [
      `${this.id}  tier ${s.tier}  light ${s.lighting}`,
      `${(1000 / Math.max(1, ms)).toFixed(0)} fps  ${ms.toFixed(1)} ms  ${this.lastDrawCalls} draws`,
      `props ${s.visibleObjects}/${s.objects}  entities ${s.entities}  lights ${s.lights}  particles ${s.particles}`,
      hidden.length ? `hidden ${hidden.join(" ")}` : "",
      "arrows · 1-8 layers · L light · T tier · G grade · N/M ±50 · P path · H",
    ]
      .filter(Boolean)
      .join("\n");
  }
}
