import type { ArtMetadata } from "@guago/art";
import { type MapDef, mapCells, mapSize } from "@guago/content";
import { TILE_SIZE } from "@guago/shared";
import type * as Phaser from "phaser";
import { SHADOW_DEPTH } from "./actors.ts";

const PIXEL = "fx-pixel";

/** Palette colours a step kicks up, by ground: dry path dust, and blades of lawn. */
const KICKS = {
  path: ["clay.pale", "wood.pale", "stone.lamp"],
  grass: ["grass.pale", "grass.light", "grass.bright"],
} as const;

function color(meta: ArtMetadata, name: string): number {
  const [ramp, step] = name.split(".") as [string, string];
  const hex = (meta.palette.ramps as Record<string, Record<string, string>>)[ramp]?.[step];
  if (!hex) throw new Error(`palette has no ${name}`);
  return Number.parseInt(hex.slice(1), 16);
}

/**
 * A puff at the feet on every stride: a few pixels of dust on the path, a flick of grass on the
 * lawn. Single palette pixels that rise, drop and vanish; no fading, no blur.
 */
export class Footsteps {
  private readonly dust: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly blades: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly cells: Uint8Array;
  private readonly w: number;
  private readonly h: number;

  constructor(scene: Phaser.Scene, meta: ArtMetadata, map: MapDef) {
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
    this.cells = mapCells(map);
    const { w, h } = mapSize(map);
    this.w = w;
    this.h = h;
  }

  /** A foot landed at (x, y). */
  step(x: number, y: number): void {
    const tx = Math.floor(x / TILE_SIZE);
    const ty = Math.floor(y / TILE_SIZE);
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return;
    const grass = this.cells[ty * this.w + tx] === 1;
    const px = Math.round(x);
    const py = Math.round(y) - 1;
    if (grass) this.blades.explode(2, px, py);
    else this.dust.explode(3, px, py);
  }
}
