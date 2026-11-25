import type { ArtMetadata } from "@guago/art";
import { hash2, pickTiles, scatterDecals } from "@guago/art";
import * as Phaser from "phaser";
import { spriteAnim } from "../art.ts";
import { MAX_W, screen } from "../ui/screen.ts";
import { paint } from "../ui/theme.ts";
import { themedSprites } from "./themed.ts";

const W = 480;
const H = 270;
/**
 * The scene is composed on 480 and built out to each side far enough for the widest view
 * (ui/screen.ts); the front scene's camera centres the composition on whatever width there is.
 */
const SIDE = (MAX_W - W) / 2;
/** Ground tiles added to each side for that. */
const SIDE_COLS = Math.ceil(SIDE / 16);
/** Where the sky meets the water. */
const HORIZON = 148;
/** Top of the sea wall, and of the promenade behind it. */
const WALL = 182;
const GROUND = 196;
/** Depth of the far shore: the city and the water in front of it move as one. */
const FAR = 0.4;
const NIGHT = "campus-night";
/** Lamp light, brightest band first, as the campus-night scene paints it. */
export const LAMP_BANDS = ["campus-lamp", "campus-dusk", "campus-glow"] as const;
/** The lamp's foot on screen and the reach of its light. */
const LAMP = { x: 346, y: 226, r: [84, 34] as const };

interface Layer {
  readonly obj: Phaser.GameObjects.Components.Transform;
  readonly x: number;
  readonly y: number;
  /** How far the layer moves with the view: 0 is the sky at infinity, 1 the ground. */
  readonly depth: number;
}

interface Drifter {
  readonly obj: Phaser.GameObjects.Sprite;
  speed: number;
  readonly bob: number;
  readonly phase: number;
  baseY: number;
  x: number;
}

/**
 * 23:38 on the island: stars and a thin moon, the city across the water, the sea, the sea wall,
 * 가설관 still lit on every floor, the 해솔 leaning in the wind, and the cat on the wall. Torn
 * notebook pages drift across the sky. Every layer moves at its own depth when the view tilts
 * or the pointer moves, and the far ones drift on their own.
 */
export class NightBackdrop {
  private readonly scene: Phaser.Scene;
  private readonly layers: Layer[] = [];
  private readonly tiles: { obj: Phaser.GameObjects.TileSprite; speed: number; pos: number }[] = [];
  private readonly pages: Drifter[] = [];
  private readonly sea: Phaser.GameObjects.TileSprite;
  private readonly dim: Phaser.GameObjects.Rectangle;
  private view = { y: 0, x: 0 };
  private pointerX = 0;
  private seaClock = 0;
  private seaFrame = 0;
  private starClock = 0;

  constructor(scene: Phaser.Scene, meta: ArtMetadata) {
    this.scene = scene;
    const night = themedSprites(scene, meta, NIGHT, [
      "facade",
      "facade-side",
      "parapet",
      "drainpipe",
      "seawall",
      "lamp",
      "bench",
      "shrub",
      "pine",
      "pine-crown",
    ]);

    // Sky: ink at the top, warming to the city's glow at the horizon, in dithered steps.
    const sky = scene.add.graphics();
    this.skyBands(sky);
    this.layer(sky, 0, 0, 0.04);

    for (let i = -1; i < 5; i++) {
      const s = scene.add.sprite(i * 160 - 40, 0, "core", "night-stars/twinkle0").setOrigin(0);
      s.play({ key: spriteAnim("night-stars", "twinkle"), startFrame: (i + 2) % 2 });
      this.layer(s, s.x, 0, 0.08);
      // A second, fainter field lower down: the same stars upside down so they do not repeat.
      const low = scene.add.sprite(i * 160 + 40, 40, "core", "night-stars/twinkle0").setOrigin(0);
      low
        .setFlipY(true)
        .setFlipX(true)
        .play({ key: spriteAnim("night-stars", "twinkle"), startFrame: (i + 3) % 2 });
      this.layer(low, low.x, 40, 0.1);
    }
    const moon = scene.add.image(402, 24, "core", "night-moon/still").setOrigin(0);
    this.layer(moon, moon.x, moon.y, 0.1);

    // Torn pages, the twelve that went missing, drifting across the sky at three distances.
    const drift: [string, number, number, number][] = [
      ["page-s", 60, 44, 3],
      ["page-l", 300, 74, 7],
      ["page-m", 180, 102, 5],
      ["page-s", 420, 118, 3.5],
    ];
    drift.forEach(([sprite, x, y, speed], i) => {
      const s = scene.add.sprite(x, y, "core", `${sprite}/turn0`);
      s.play({ key: spriteAnim(sprite, "turn"), startFrame: (i * 3) % 8 });
      s.anims.timeScale = 0.35 + 0.1 * i;
      this.pages.push({ obj: s, speed, bob: 3 + i, phase: i * 1.7, baseY: y, x });
    });

    // The city across the water and the sea, both endless, drifting slowly.
    const city = scene.add
      .tileSprite(0, HORIZON - 30, W + 32 + 2 * SIDE, 30, "core", "night-city/still")
      .setOrigin(0);
    this.tiles.push({ obj: city, speed: 1.2, pos: 0 });
    this.layer(city, -16 - SIDE, HORIZON - 30, FAR);
    this.sea = scene.add
      .tileSprite(0, HORIZON, W + 32 + 2 * SIDE, 34, "core", "night-sea/ripple0")
      .setOrigin(0);
    this.tiles.push({ obj: this.sea, speed: 2.6, pos: 0 });
    this.layer(this.sea, -16 - SIDE, HORIZON, FAR);
    // Deep water under the sea strip, so tilting the view never opens a gap above the wall.
    const seaFill = scene.add
      .rectangle(0, HORIZON + 32, W + 32 + 2 * SIDE, 220, paint("ink.deep"))
      .setOrigin(0);
    this.layer(seaFill, -16 - SIDE, HORIZON + 32, FAR);

    // The sea wall and the promenade, the lawn going down from it.
    const wall = scene.add
      .tileSprite(0, WALL, W + 32 + 2 * SIDE, 14, night, "seawall/run")
      .setOrigin(0);
    this.layer(wall, -16 - SIDE, WALL, 1);
    const groundX = -16 - SIDE_COLS * 16;
    const ground = scene.add
      .image(groundX, GROUND - 4, this.groundTexture(scene, meta))
      .setOrigin(0);
    this.layer(ground, groundX, GROUND - 4, 1);

    // 가설관, three floors, every one still lit.
    this.building(night);

    // The lamp and its bench, the cat on the wall, the pine and its needles.
    const lamp = scene.add.image(LAMP.x, LAMP.y, night, "lamp/still");
    this.layer(lamp, lamp.x, lamp.y, 1);
    const moths = scene.add.sprite(346, 184, "core", "moths/fly0").play(spriteAnim("moths", "fly"));
    this.layer(moths, moths.x, moths.y, 1);
    const bench = scene.add.image(378, 224, night, "bench/still");
    this.layer(bench, bench.x, bench.y, 1);
    const cat = scene.add
      .sprite(384, WALL + 1, "core", "entropy/sit0")
      .play(spriteAnim("entropy", "idle"));
    this.layer(cat, cat.x, cat.y, 1);
    const shrubs: [number, number, boolean][] = [
      [178, 222, false],
      [470, 262, true],
      [196, 268, true],
    ];
    for (const [x, y, flip] of shrubs) {
      const s = scene.add.image(x, y, night, "shrub/still").setFlipX(flip);
      this.layer(s, x, y, 1);
    }
    const pine = scene.add.image(446, 236, night, "pine/base");
    this.layer(pine, pine.x, pine.y, 1);
    const crown = scene.add.sprite(446, 236, night, "pine-crown/sway0");
    crown.play(this.themedAnim(night, "pine-crown", "sway"));
    this.layer(crown, crown.x, crown.y, 1);
    for (const [x, y, i] of [
      [392, 152, 0],
      [452, 168, 4],
    ] as const) {
      const n = scene.add.sprite(x, y, "core", "needles-drift/fall0").setOrigin(0);
      n.play({ key: spriteAnim("needles-drift", "fall"), startFrame: i });
      this.layer(n, x, y, 1);
    }

    this.dim = scene.add
      .rectangle(-SIDE, -H, W + 2 * SIDE, H * 4, paint("ink.deep"))
      .setOrigin(0)
      .setAlpha(0);

    scene.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => {
      if (p.wasTouch) return;
      this.pointerX = Phaser.Math.Clamp((p.x - screen.w / 2) / (screen.w / 2), -1, 1);
    });
    this.apply();
  }

  /** Tilts the view: positive looks further up the sky, pushing the ground down. */
  look(up: number, ms: number, ease = "Cubic.InOut"): void {
    this.scene.tweens.killTweensOf(this.view);
    if (ms <= 0) {
      this.view.y = up;
      this.apply();
      return;
    }
    this.scene.tweens.add({ targets: this.view, y: up, duration: ms, ease });
  }

  /** Darkens everything behind the UI, by alpha of the night's ink. */
  shade(alpha: number, ms = 200): void {
    this.scene.tweens.killTweensOf(this.dim);
    this.scene.tweens.add({ targets: this.dim, alpha, duration: ms, ease: "Quad.Out" });
  }

  get shadeDepth(): number {
    return this.dim.depth;
  }

  update(time: number, delta: number): void {
    const dt = delta / 1000;
    for (const t of this.tiles) {
      t.pos += t.speed * dt;
      t.obj.tilePositionX = Math.round(t.pos);
    }
    this.seaClock += delta;
    if (this.seaClock > 500) {
      this.seaClock -= 500;
      this.seaFrame = (this.seaFrame + 1) % 3;
      this.sea.setFrame(`night-sea/ripple${this.seaFrame}`);
    }
    for (const p of this.pages) {
      p.x += p.speed * dt;
      if (p.x > W + SIDE + 20) {
        p.x = -SIDE - 20;
        p.baseY = 30 + ((hash2(Math.round(time), 7, 3) % 90) | 0);
      }
      const y = p.baseY + Math.sin(time / 1300 + p.phase) * p.bob + this.view.y * 0.2;
      p.obj.setPosition(Math.round(p.x + this.view.x * 0.2), Math.round(y));
    }
    this.view.x += (this.pointerX * 6 - this.view.x) * Math.min(1, dt * 3);
    this.starClock += delta;
    this.apply();
  }

  private apply(): void {
    for (const l of this.layers) {
      l.obj.setPosition(
        Math.round(l.x - this.view.x * l.depth),
        Math.round(l.y + this.view.y * l.depth),
      );
    }
  }

  private layer(obj: Phaser.GameObjects.Components.Transform, x: number, y: number, depth: number) {
    this.layers.push({ obj, x, y, depth });
  }

  private themedAnim(texture: string, sprite: string, anim: string): string {
    const key = `${texture}/${sprite}/${anim}`;
    if (this.scene.anims.exists(key)) return key;
    const meta = this.scene.cache.json.get("art") as ArtMetadata;
    const a = meta.sprites[sprite]?.anims[anim];
    if (!a) throw new Error(`art has no ${sprite}/${anim}`);
    this.scene.anims.create({
      key,
      frames: a.frames.map((frame) => ({ key: texture, frame })),
      frameRate: a.fps,
      repeat: a.loop ? -1 : 0,
    });
    return key;
  }

  /**
   * The sky in palette steps, ink at the top warming to the city's plum glow at the horizon,
   * each step blended into the next with an ordered 4×4 dither; faint stars low down where the
   * star sprites stop.
   */
  private skyBands(g: Phaser.GameObjects.Graphics): void {
    const stops: [string, number][] = [
      ["ink.deep", 52],
      ["ink.dark", 104],
      ["plum.deep", 128],
      ["plum.dark", HORIZON + 8],
    ];
    const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
    const blend = 18;
    const top = -70;
    const bottom = HORIZON + 40;
    const left = -16 - SIDE;
    const right = W + 16 + SIDE;
    for (let y = top; y < bottom; y++) {
      // Which two stops this row lies between, and how far.
      let i = stops.findIndex(([, at]) => y < at);
      if (i < 0) i = stops.length - 1;
      const [color, at] = stops[i] as [string, number];
      const prev = stops[i - 1];
      const t = prev ? (y - (at - blend)) / blend : -1;
      if (!prev || t <= 0) {
        g.fillStyle(paint(i === 0 ? color : (prev?.[0] ?? color)));
        g.fillRect(left, y, right - left, 1);
        continue;
      }
      g.fillStyle(paint(prev[0]));
      g.fillRect(left, y, right - left, 1);
      g.fillStyle(paint(color));
      for (let x = left; x < right; x++) {
        const k = (BAYER[((y & 3) << 2) | (x & 3)] as number) / 16;
        if (k < t) g.fillRect(x, y, 1, 1);
      }
    }
    // Faint stars below the star sprites, thinning toward the city's glow.
    for (let y = 78; y < 128; y++) {
      for (let x = left; x < right; x++) {
        const h = hash2(x, y, 77) / 2 ** 32;
        const density = 0.006 * (1 - (y - 78) / 60);
        if (h < density) {
          g.fillStyle(paint(h < density * 0.3 ? "navy.pale" : "navy.light"));
          g.fillRect(x, y, 1, 1);
        }
      }
    }
  }

  /**
   * The promenade along the wall and the lawn below it, with a path down the middle, lit by
   * the lamp the way the art's scenes paint light: stepped bands of brighter palette themes
   * with ragged edges, not a blend.
   */
  private groundTexture(scene: Phaser.Scene, meta: ArtMetadata): string {
    const key = "title-ground";
    if (scene.textures.exists(key)) return key;
    const tileset = meta.tilesets["lawn-walk"];
    if (!tileset) throw new Error("art has no lawn-walk terrain");
    const cols = 33 + 2 * SIDE_COLS;
    const rows = 8;
    // 1 is grass, 0 the paved walk: a promenade two cells deep, a path down to the bottom.
    const cells = new Uint8Array(cols * rows);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const px = x - SIDE_COLS;
        const walk = y < 2 || (px >= 14 && px <= 18 && !(y >= 3 && (px === 14 || px === 18)));
        cells[y * cols + x] = walk ? 0 : 1;
      }
    }
    const grid = { w: cols, h: rows, cells };
    const picked = pickTiles(grid, 1, tileset.masks, 1123);
    const decals = scatterDecals(grid, 1, tileset.decals, 1123);
    const { tile, margin, spacing, columns } = meta.tileGrid;
    const w = cols * tile;
    const h = rows * tile;

    const paintTheme = (theme: string): ImageData | undefined => {
      if (!scene.textures.exists(`tiles-${theme}`)) return undefined;
      const atlas = scene.textures.get(`tiles-${theme}`);
      const img = atlas.getSourceImage() as CanvasImageSource;
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
      ctx.imageSmoothingEnabled = false;
      for (let j = 0; j <= rows; j++) {
        for (let i = 0; i <= cols; i++) {
          const idx = picked[j * (cols + 1) + i] as number;
          const sx = margin + (idx % columns) * (tile + spacing);
          const sy = margin + Math.floor(idx / columns) * (tile + spacing);
          ctx.drawImage(
            img,
            sx,
            sy,
            tile,
            tile,
            i * tile - tile / 2,
            j * tile - tile / 2,
            tile,
            tile,
          );
        }
      }
      for (const d of decals) {
        const decal = tileset.decals[d.decal];
        if (!decal || !atlas.has(decal.frame)) continue;
        const f = atlas.get(decal.frame);
        ctx.drawImage(
          img,
          f.cutX,
          f.cutY,
          f.cutWidth,
          f.cutHeight,
          d.x + f.x,
          d.y + f.y,
          f.cutWidth,
          f.cutHeight,
        );
      }
      return ctx.getImageData(0, 0, w, h);
    };

    const base = paintTheme(NIGHT);
    if (!base) throw new Error(`tiles-${NIGHT} is not loaded`);
    // Brightest band first; each band covers a third of the pool's radius.
    const bands = LAMP_BANDS.map(paintTheme);
    const [lx, ly] = [LAMP.x + 16, LAMP.y - (GROUND - 4)];
    const [rx, ry] = LAMP.r;
    const out = base.data;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const d = Math.hypot((x - lx) / rx, (y - ly) / ry);
        // A ragged edge: the band boundary wanders by a few pixels.
        const ragged = d + ((hash2(x >> 1, y >> 1, 5) % 1000) / 1000 - 0.5) * 0.09;
        const k = Math.floor(ragged * bands.length);
        const band = k >= 0 && k < bands.length ? bands[k] : undefined;
        if (!band) continue;
        const i = (y * w + x) * 4;
        out[i] = band.data[i] as number;
        out[i + 1] = band.data[i + 1] as number;
        out[i + 2] = band.data[i + 2] as number;
        out[i + 3] = band.data[i + 3] as number;
      }
    }
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    (canvas.getContext("2d") as CanvasRenderingContext2D).putImageData(base, 0, 0);
    scene.textures.addCanvas(key, canvas);
    return key;
  }

  private building(night: string): void {
    const s = this.scene;
    const floors: [number, string[]][] = [
      [
        GROUND + 2,
        [
          "end-l",
          "window",
          "window-dark",
          "window",
          "door-l",
          "door-r",
          "window-dim",
          "window",
          "end-r",
        ],
      ],
      [
        GROUND - 46,
        [
          "up-end-l",
          "up-window",
          "up-curtain",
          "up-window-dark",
          "up-window",
          "up-studying",
          "up-window-dim",
          "up-window",
          "up-end-r",
        ],
      ],
      [
        GROUND - 94,
        [
          "up-end-l",
          "up-window-dark",
          "up-window",
          "up-window",
          "up-window-dim",
          "up-window-dark",
          "up-curtain",
          "up-window",
          "up-end-r",
        ],
      ],
    ];
    const x0 = -8;
    floors.forEach(([bottom, frames], f) => {
      frames.forEach((frame, i) => {
        const x = x0 + i * 16;
        const img = s.add.sprite(x, bottom, night, `facade/${frame}`);
        if (f === 1 && i === 6) {
          img.play({ key: this.themedAnim(night, "facade", "flicker"), startFrame: 2 });
        }
        this.layer(img, x, bottom, 1);
      });
      const side = s.add.image(
        x0 + frames.length * 16,
        bottom,
        night,
        `facade-side/${f === 0 ? "ground" : "up"}`,
      );
      this.layer(side, side.x, bottom, 1);
    });
    const roof = GROUND - 142;
    for (let i = 0; i < 9; i++) {
      const p = s.add.image(x0 + i * 16, roof, night, "parapet/run");
      this.layer(p, p.x, roof, 1);
    }
  }
}
