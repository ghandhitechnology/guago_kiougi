/**
 * Patrols in a 위험 구역 (PLAN §11): each guard walks its route on the room's own clock, the same
 * pose the server tests sight from for the same tick, drawn with the cast table's art and its
 * vision cone cut by walls. Nothing about a guard is sent; the server says only when one calls
 * out (`halt`).
 */
import type { ArtMetadata } from "@guago/art";
import { CAST_ART, type Patrol, type Pose, patrolPose } from "@guago/content";
import { type Collidable, Facing, isSolidTile, TILE_SIZE } from "@guago/shared";
import type * as Phaser from "phaser";
import { composeLook, lookAnim, lookTexture, spriteAnim } from "./art.ts";
import { CONE_DEPTH } from "./depths.ts";
import type { MapView } from "./render/index.ts";
import { paint } from "./ui/theme.ts";

/** Rays across a cone: enough that a wall's edge reads straight at 16 px tiles. */
const RAYS = 28;
/** The ray march matches the server's sight line: a quarter tile per sample. */
const STEP = TILE_SIZE / 4;

/**
 * Draws a guard's cone as the server tests it: out to its length, cut where a straight line
 * from the guard first meets a solid tile. Plain fill until the lighting pass's torch beam
 * replaces this one function.
 */
export function drawCone(g: Phaser.GameObjects.Graphics, walls: Collidable, p: Patrol, pose: Pose) {
  g.clear();
  const half = ((p.cone.angle / 2) * Math.PI) / 180;
  const points: { x: number; y: number }[] = [{ x: pose.x, y: pose.y }];
  for (let i = 0; i <= RAYS; i++) {
    const a = pose.facing - half + (2 * half * i) / RAYS;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    let d = 0;
    while (d < p.cone.length) {
      const next = Math.min(p.cone.length, d + STEP);
      const x = pose.x + dx * next;
      const y = pose.y + dy * next;
      if (isSolidTile(walls, Math.floor(x / TILE_SIZE), Math.floor(y / TILE_SIZE))) break;
      d = next;
    }
    points.push({ x: pose.x + dx * d, y: pose.y + dy * d });
  }
  g.fillStyle(paint("gold.light"), 0.22);
  g.fillPoints(points as Phaser.Math.Vector2[], true);
  g.lineStyle(1, paint("gold.pale"), 0.45);
  g.strokePoints(points.slice(1) as Phaser.Math.Vector2[], false);
}

const DIR_OF = (facing: number): { dir: string; flip: boolean; f: number } => {
  const c = Math.cos(facing);
  const s = Math.sin(facing);
  if (Math.abs(c) > Math.abs(s))
    return { dir: "side", flip: c < 0, f: c < 0 ? Facing.Left : Facing.Right };
  return { dir: s < 0 ? "up" : "down", flip: false, f: s < 0 ? Facing.Up : Facing.Down };
};

interface Guard {
  readonly patrol: Patrol;
  readonly body: Phaser.GameObjects.Sprite | undefined;
  readonly cone: Phaser.GameObjects.Graphics;
  readonly rig: string | undefined;
  readonly look: string | undefined;
  last: { x: number; y: number } | undefined;
  /** Until when the signature plays (the call out), in scene time. */
  haltUntil: number;
}

export class Patrols {
  private readonly guards: Guard[] = [];
  private readonly scene: Phaser.Scene;
  private readonly view: MapView;
  private readonly walls: Collidable;

  constructor(
    scene: Phaser.Scene,
    meta: ArtMetadata,
    view: MapView,
    walls: Collidable,
    patrols: readonly Patrol[],
  ) {
    this.scene = scene;
    this.view = view;
    this.walls = walls;
    for (const patrol of patrols) {
      const cast = CAST_ART[patrol.walker];
      const rig = cast?.kind === "rig" ? meta.rigs[cast.art] : undefined;
      const look = rig ? Object.keys(rig.looks)[0] : undefined;
      let body: Phaser.GameObjects.Sprite | undefined;
      if (cast && rig && look) {
        if (!scene.textures.exists(lookTexture(cast.art, look)))
          composeLook(scene, meta, cast.art, look);
        body = scene.add.sprite(-100, -100, lookTexture(cast.art, look));
        view.addEntity(body);
      } else if (cast?.kind === "sprite" && meta.sprites[cast.art]) {
        body = scene.add.sprite(-100, -100, meta.sprites[cast.art]?.atlas ?? "core");
        body.play(spriteAnim(cast.art, "idle"));
        view.addEntity(body);
      }
      const cone = scene.add.graphics().setDepth(CONE_DEPTH);
      this.guards.push({
        patrol,
        body,
        cone,
        rig: rig && cast ? cast.art : undefined,
        look,
        last: undefined,
        haltUntil: 0,
      });
    }
  }

  /** A guard called out: it plays its signature move for a moment. */
  halt(id: string): void {
    const g = this.guards.find((x) => x.patrol.id === id);
    if (g) g.haltUntil = this.scene.time.now + 1200;
  }

  /** Puts every guard where it is at server time `ms`. */
  update(ms: number): void {
    const now = this.scene.time.now;
    for (const g of this.guards) {
      const pose = patrolPose(g.patrol, ms / 1000);
      drawCone(g.cone, this.walls, g.patrol, pose);
      if (!g.body) continue;
      const moving =
        g.last !== undefined && Math.hypot(pose.x - g.last.x, pose.y - g.last.y) > 0.05;
      g.last = { x: pose.x, y: pose.y };
      g.body.setPosition(Math.round(pose.x), Math.round(pose.y));
      const { dir, flip } = DIR_OF(pose.facing);
      g.body.setFlipX(flip);
      if (g.rig && g.look) {
        const cast = CAST_ART[g.patrol.walker];
        const anim = now < g.haltUntil && cast ? cast.signature : moving ? "walk" : "idle";
        g.body.play(lookAnim(g.rig, g.look, dir, anim), true);
      }
    }
  }

  destroy(): void {
    for (const g of this.guards) {
      if (g.body) {
        this.view.removeEntity(g.body);
        g.body.destroy();
      }
      g.cone.destroy();
    }
  }
}
