import type { ArtMetadata } from "@guago/art";
import type { BuiltMap } from "@guago/content";
import { TILE_SIZE } from "@guago/shared";
import type * as Phaser from "phaser";
import { SHADOW_DEPTH } from "./actors.ts";

const PIXEL = "fx-pixel";

/** Palette colours a step kicks up, by ground: dry path dust, and blades of lawn. */
const KICKS = {
  path: ["clay.pale", "wood.pale", "stone.lamp"],
  grass: ["grass.pale", "grass.light", "grass.bright"],
} as const;

/** What a terrain kicks up underfoot; floors indoors kick up nothing. */
const SURFACE: Readonly<Record<string, 0 | 1 | 2>> = { grass: 2, dirt: 1, sand: 1, court: 1 };

function color(meta: ArtMetadata, name: string): number {
  const [ramp, step] = name.split(".") as [string, string];
  const hex = (meta.palette.ramps as Record<string, Record<string, string>>)[ramp]?.[step];
  if (!hex) throw new Error(`palette has no ${name}`);
  return Number.parseInt(hex.slice(1), 16);
}

/**
 * A puff at the feet on every stride: a few pixels of dust on a path, a flick of grass on the
 * lawn, nothing on a classroom floor. Single palette pixels that rise, drop and vanish; no
 * fading, no blur.
 */
export class Footsteps {
  private readonly dust: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly blades: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly cells: Uint8Array;
  private readonly w: number;
  private readonly h: number;

  constructor(scene: Phaser.Scene, meta: ArtMetadata, map: BuiltMap) {
    if (!scene.textures.exists(PIXEL)) {
      const t = scene.textures.createCanvas(PIXEL, 1, 1);
      const ctx = t?.getContext();
      if (ctx) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, 1, 1);
        t?.refresh();
      }
    }
    const make = (tints: readonly string[], rise: number) =>
      scene.add
        .particles(0, 0, PIXEL, {
          emitting: false,
          lifespan: { min: 180, max: 320 },
          speedX: { min: -14, max: 14 },
          speedY: { min: -rise, max: -rise / 3 },
          gravityY: 160,
          tint: tints.map((n) => color(meta, n)),
          maxAliveParticles: 120,
        })
        .setDepth(SHADOW_DEPTH + 1);
    this.dust = make(KICKS.path, 22);
    this.blades = make(KICKS.grass, 30);
    this.w = map.w;
    this.h = map.h;
    this.cells = new Uint8Array(map.w * map.h);
    const ground = map.scene.ground;
    const rows = typeof ground === "string" ? ground.split("\n").filter((r) => r.trim()) : ground;
    rows.forEach((row, y) => {
      [...row.trim()].forEach((ch, x) => {
        const terrain = map.scene.legend[ch]?.terrain;
        if (terrain && y < map.h && x < map.w) this.cells[y * map.w + x] = SURFACE[terrain] ?? 0;
      });
    });
  }

  /** A foot landed at (x, y). */
  step(x: number, y: number): void {
    const tx = Math.floor(x / TILE_SIZE);
    const ty = Math.floor(y / TILE_SIZE);
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return;
    const surface = this.cells[ty * this.w + tx];
    const px = Math.round(x);
    const py = Math.round(y) - 1;
    if (surface === 2) this.blades.explode(2, px, py);
    else if (surface === 1) this.dust.explode(3, px, py);
  }

  destroy(): void {
    this.dust.destroy();
    this.blades.destroy();
  }
}
