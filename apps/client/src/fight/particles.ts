import * as Phaser from "phaser";
import type { MapView } from "../render/index.ts";
import { TEX } from "../render/textures.ts";
import { COMBAT } from "./catalog.ts";

/** How a particle moves and looks. */
export const Bit = {
  /** A chunk of a monster: thrown up, falls on the fake height axis, bounces once, rests, fades. */
  Debris: 0,
  /** 오답's paper: flutters down slowly. */
  Paper: 1,
  /** A spark: flies straight out, no gravity, gone fast. */
  Spark: 2,
  /** An ember or a mote: drifts up and fades. */
  Mote: 3,
  /** A wind-up: starts on a ring and draws in to the point, arriving as it ends. */
  Gather: 4,
} as const;
export type Bit = (typeof Bit)[keyof typeof Bit];

const DEBRIS = ["fx-debris/a", "fx-debris/b", "fx-debris/c"] as const;
const PAPER = [
  "fx-debris-paper/a",
  "fx-debris-paper/flip",
  "fx-debris-paper/b",
  "fx-debris-paper/flip",
];
/** Gravity on the fake height axis, px per s². */
const GRAVITY = 520;
/** Seconds a wind-up's points take to draw in. */
const GATHER_LIFE = 0.14;

/**
 * Pooled particles with a hard cap (PLAN §6: 150 on mobile, 600 on desktop). Sprites are made
 * once up to the cap and reused; state lives in typed arrays and dead particles are swapped out
 * of the live list, so a frame allocates nothing. When the cap is reached the oldest particle is
 * taken over.
 */
export class Particles {
  private readonly scene: Phaser.Scene;
  private readonly view: MapView;
  private readonly sprites: Phaser.GameObjects.Sprite[] = [];
  private cap: number;
  private readonly max: number;
  private readonly x: Float32Array;
  private readonly y: Float32Array;
  private readonly z: Float32Array;
  private readonly vx: Float32Array;
  private readonly vy: Float32Array;
  private readonly vz: Float32Array;
  private readonly age: Float32Array;
  private readonly life: Float32Array;
  private readonly kind: Uint8Array;
  private readonly bounced: Uint8Array;
  /** Live particle slots, oldest first. */
  private readonly live: Int32Array;
  private count = 0;
  private readonly free: number[] = [];

  constructor(scene: Phaser.Scene, view: MapView, cap: number, max = 600) {
    this.scene = scene;
    this.view = view;
    this.max = max;
    this.cap = Math.min(cap, max);
    this.x = new Float32Array(max);
    this.y = new Float32Array(max);
    this.z = new Float32Array(max);
    this.vx = new Float32Array(max);
    this.vy = new Float32Array(max);
    this.vz = new Float32Array(max);
    this.age = new Float32Array(max);
    this.life = new Float32Array(max);
    this.kind = new Uint8Array(max);
    this.bounced = new Uint8Array(max);
    this.live = new Int32Array(max);
  }

  setCap(cap: number): void {
    this.cap = Math.min(cap, this.max);
    while (this.count > this.cap) this.kill(0);
  }

  get alive(): number {
    return this.count;
  }

  private sprite(i: number): Phaser.GameObjects.Sprite {
    let s = this.sprites[i];
    if (!s) {
      s = new Phaser.GameObjects.Sprite(this.scene, 0, 0, COMBAT, DEBRIS[0]);
      s.setVisible(false);
      this.view.addEffect(s, false);
      this.sprites[i] = s;
    }
    return s;
  }

  private take(): number {
    if (this.count >= this.cap) this.kill(0);
    let i = this.free.pop();
    if (i === undefined) i = this.count + this.free.length;
    if (i >= this.max) i = this.live[0] as number;
    this.live[this.count++] = i;
    return i;
  }

  private kill(at: number): void {
    const i = this.live[at] as number;
    this.sprites[i]?.setVisible(false);
    // Keep order: the oldest stays first, so the cap always takes the oldest.
    this.live.copyWithin(at, at + 1, this.count);
    this.count--;
    this.free.push(i);
  }

  /**
   * Throws `n` particles of a kind from (x, y), at `height` above the ground, `speed` px/s spread
   * around `angle` by `spread` radians (a full circle by default), tinted.
   */
  burst(
    kind: Bit,
    x: number,
    y: number,
    n: number,
    tint: number,
    speed = 60,
    height = 6,
    angle = 0,
    spread = Math.PI * 2,
  ): void {
    for (let k = 0; k < n; k++) {
      const i = this.take();
      const a = angle + (Math.random() - 0.5) * spread;
      const v = speed * (0.55 + Math.random() * 0.6);
      this.x[i] = x;
      this.y[i] = y;
      this.z[i] = height;
      this.vx[i] = Math.cos(a) * v;
      this.vy[i] = Math.sin(a) * v * 0.6;
      if (kind === Bit.Gather) {
        // `speed` is the ring's radius: it starts there and flies in over its life.
        const r = speed * (0.7 + Math.random() * 0.5);
        this.x[i] = x + Math.cos(a) * r;
        this.y[i] = y + Math.sin(a) * r * 0.6;
        this.vx[i] = (-Math.cos(a) * r) / GATHER_LIFE;
        this.vy[i] = (-Math.sin(a) * r * 0.6) / GATHER_LIFE;
      }
      this.vz[i] = kind === Bit.Debris ? 70 + Math.random() * 70 : kind === Bit.Paper ? 40 : 0;
      this.age[i] = 0;
      this.kind[i] = kind;
      this.bounced[i] = 0;
      this.life[i] =
        kind === Bit.Debris
          ? 0.7 + Math.random() * 0.35
          : kind === Bit.Paper
            ? 0.9 + Math.random() * 0.4
            : kind === Bit.Spark
              ? 0.16 + Math.random() * 0.1
              : kind === Bit.Gather
                ? GATHER_LIFE
                : 0.5 + Math.random() * 0.3;
      const s = this.sprite(i);
      if (kind === Bit.Paper || kind === Bit.Debris) {
        if (s.texture.key !== COMBAT) s.setTexture(COMBAT);
        s.setFrame(
          kind === Bit.Paper ? (PAPER[0] as string) : (DEBRIS[(Math.random() * 3) | 0] as string),
          false,
          false,
        );
      } else if (s.texture.key !== TEX.px) {
        // Sparks, motes and wind-ups are single 2 px points, drawn at ×1.
        s.setTexture(TEX.px);
      }
      s.setVisible(true)
        .setAlpha(1)
        .setTint(tint)
        .setFlipX(Math.random() < 0.5);
    }
  }

  update(dtMs: number): void {
    const dt = Math.min(0.05, dtMs / 1000);
    for (let k = 0; k < this.count; ) {
      const i = this.live[k] as number;
      const age = (this.age[i] as number) + dt;
      this.age[i] = age;
      const life = this.life[i] as number;
      if (age >= life) {
        this.kill(k);
        continue;
      }
      const kind = this.kind[i] as Bit;
      let vx = this.vx[i] as number;
      let vy = this.vy[i] as number;
      let vz = this.vz[i] as number;
      let z = this.z[i] as number;
      if (kind === Bit.Debris) {
        vz -= GRAVITY * dt;
        z += vz * dt;
        if (z <= 0) {
          z = 0;
          if (this.bounced[i] === 0 && vz < -40) {
            vz = -vz * 0.35;
            vx *= 0.5;
            vy *= 0.5;
            this.bounced[i] = 1;
          } else {
            vz = 0;
            vx *= 0.8;
            vy *= 0.8;
          }
        }
      } else if (kind === Bit.Paper) {
        vz -= GRAVITY * 0.25 * dt;
        if (vz < -18) vz = -18;
        z = Math.max(0, z + vz * dt);
        vx *= 0.96;
        vy *= 0.96;
      } else if (kind === Bit.Spark) {
        vx *= 0.88;
        vy *= 0.88;
      } else if (kind === Bit.Gather) {
        // Straight in, no drag: it arrives on the point as it ends.
      } else {
        z += 14 * dt;
        vx *= 0.9;
        vy *= 0.9;
      }
      this.vx[i] = vx;
      this.vy[i] = vy;
      this.vz[i] = vz;
      this.z[i] = z;
      const x = (this.x[i] as number) + vx * dt;
      const y = (this.y[i] as number) + vy * dt;
      this.x[i] = x;
      this.y[i] = y;
      const s = this.sprites[i] as Phaser.GameObjects.Sprite;
      s.setPosition(Math.round(x), Math.round(y - z));
      const left = life - age;
      if (left < 0.2 && kind !== Bit.Gather) s.setAlpha(left / 0.2);
      if (kind === Bit.Paper) {
        const f = PAPER[Math.floor(age * 10) % PAPER.length] as string;
        if (s.frame.name !== f) s.setFrame(f, false, false);
      }
      k++;
    }
  }

  destroy(): void {
    for (const s of this.sprites) s?.destroy();
    this.sprites.length = 0;
    this.count = 0;
  }
}
