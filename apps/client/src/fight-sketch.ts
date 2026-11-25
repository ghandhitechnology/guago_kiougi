import { flightWall, FxKind, traceBeam, type Collidable, type WireFx } from "@guago/shared";
import type * as Phaser from "phaser";

/**
 * Development only: the fight's tells, marks, shots and beams drawn plainly from the snapshot's
 * effect records, so the simulation can be watched before the combat presentation lands. Palette
 * colours, one Graphics layer, nothing else. The presentation replaces all of it.
 */

const DANGER = 0xb8293a; // red.mid
const DANGER_EDGE = 0xe3513f; // red.light
const MARK = 0xc98b25; // gold.mid
const SHOT = 0xfbe8a0; // gold.pale
const ENEMY = 0x953a68; // rose.dark
const BEAM = 0xf297a0; // rose.light

interface Live {
  f: WireFx;
  /** Tick it started on the server. */
  from: number;
  until: number;
  path?: Float64Array;
  points?: number;
}

export class FightSketch {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly live = new Map<number, Live>();
  private readonly wall: (x: number, y: number) => boolean;

  constructor(scene: Phaser.Scene, map: Collidable, depth: number) {
    this.g = scene.add.graphics().setDepth(depth);
    this.wall = flightWall(map);
  }

  /** A spawn record at the message's tick. */
  spawn(f: WireFx, tick: number): void {
    const from = tick + f.start;
    let until = from + Math.max(1, f.duration);
    if (f.kind === FxKind.Danger || f.kind === FxKind.Mark) {
      until = from + f.a + (f.count + 1) * Math.max(1, f.period) + 4;
    } else if (f.kind === FxKind.Shot || f.kind === FxKind.EnemyShot) {
      until = from + Math.ceil(f.length / Math.max(0.01, f.speed));
    }
    const live: Live = { f: { ...f, chain: [...f.chain], parents: [...f.parents] }, from, until };
    if (f.kind === FxKind.Beam) {
      live.path = new Float64Array(256);
      live.points = traceBeam(this.wall, f.x, f.y, f.angle, f.length, f.a, f.b, f.c, live.path);
    }
    this.live.set(f.fx, live);
  }

  end(fx: number): void {
    this.live.delete(fx);
  }

  /** Redraws everything alive at server time `t` (ms). */
  draw(t: number): void {
    const tick = t / 50;
    const g = this.g;
    g.clear();
    for (const [id, l] of this.live) {
      if (tick > l.until) {
        this.live.delete(id);
        continue;
      }
      const f = l.f;
      const age = tick - l.from;
      if (age < 0) continue;
      switch (f.kind) {
        case FxKind.Danger:
        case FxKind.Mark: {
          // The tell fills toward the strike; at the strike it flashes.
          const fire = f.a;
          const k = Math.min(1, age / Math.max(1, fire));
          const color = f.kind === FxKind.Danger ? DANGER : MARK;
          const line = f.kind === FxKind.Mark ? (f.flags & 1) === 1 : f.length > 0;
          g.lineStyle(1, f.kind === FxKind.Danger ? DANGER_EDGE : MARK, 1);
          if (line) {
            const len = f.length;
            const wdt = f.kind === FxKind.Danger ? f.radius * 2 : f.width;
            const cos = Math.cos(f.angle);
            const sin = Math.sin(f.angle);
            const nx = -sin * (wdt / 2);
            const ny = cos * (wdt / 2);
            const pts = [
              { x: f.x + nx, y: f.y + ny },
              { x: f.x + cos * len + nx, y: f.y + sin * len + ny },
              { x: f.x + cos * len - nx, y: f.y + sin * len - ny },
              { x: f.x - nx, y: f.y - ny },
            ];
            g.fillStyle(color, age >= fire ? 0.7 : 0.15 + 0.3 * k);
            g.fillPoints(pts, true);
            g.strokePoints(pts, true);
          } else {
            g.fillStyle(color, age >= fire ? 0.7 : 0.12);
            g.fillCircle(f.x, f.y, f.radius);
            g.strokeCircle(f.x, f.y, f.radius);
            if (age < fire) {
              g.fillStyle(color, 0.35);
              g.fillCircle(f.x, f.y, f.radius * k);
            }
          }
          break;
        }
        case FxKind.Shot:
        case FxKind.EnemyShot: {
          const x = f.x + Math.cos(f.angle) * f.speed * age;
          const y = f.y + Math.sin(f.angle) * f.speed * age;
          g.fillStyle(f.kind === FxKind.EnemyShot ? ENEMY : SHOT, 1);
          g.fillCircle(Math.round(x), Math.round(y - 4), Math.max(1.5, f.radius * 0.7));
          break;
        }
        case FxKind.Lob: {
          const k = Math.min(1, age / Math.max(1, f.duration));
          const x = f.x + (f.tx - f.x) * k;
          const y = f.y + (f.ty - f.y) * k;
          const z = 4 * f.a * k * (1 - k);
          g.fillStyle(SHOT, 1);
          g.fillCircle(Math.round(x), Math.round(y - z - 4), 2.5);
          break;
        }
        case FxKind.Beam: {
          if (!l.path || !l.points) break;
          g.lineStyle(Math.max(1, f.width / 3), BEAM, 0.8);
          g.beginPath();
          g.moveTo(l.path[0] as number, l.path[1] as number);
          for (let i = 1; i < l.points; i++) g.lineTo(l.path[i * 2] as number, l.path[i * 2 + 1] as number);
          g.strokePath();
          break;
        }
      }
    }
  }

  clear(): void {
    this.live.clear();
    this.g.clear();
  }
}
