/**
 * People on rounds (PLAN §11 위험 구역 patrols, the towns' walks): each walks its route on the
 * room's own clock, the same pose the server tests a guard's sight from for the same tick, drawn
 * with the cast table's art. A guard carries its vision cone as a torch beam in the light map
 * (`MapView.addVisionCone`, lit exactly where the server says it sees); a townsperson on a walk
 * carries none, wears a nameplate and barks like anyone standing. Nothing about either is sent;
 * the server says only when a guard calls out (`halt`) and what a walker says.
 */
import type { ArtMetadata } from "@guago/art";
import { CAST_ART, type Patrol, patrolPose, type Walk } from "@guago/content";
import { Facing } from "@guago/shared";
import type * as Phaser from "phaser";
import { composeLook, lookAnim, lookTexture, spriteAnim } from "./art.ts";
import { speakerName } from "./npc.ts";
import type { MapView, VisionCone } from "./render/index.ts";
import { worldUi } from "./ui/world-ui.ts";

const DIR_OF = (facing: number): { dir: string; flip: boolean; f: number } => {
  const c = Math.cos(facing);
  const s = Math.sin(facing);
  if (Math.abs(c) > Math.abs(s))
    return { dir: "side", flip: c < 0, f: c < 0 ? Facing.Left : Facing.Right };
  return { dir: s < 0 ? "up" : "down", flip: false, f: s < 0 ? Facing.Up : Facing.Down };
};

interface Rounder {
  readonly route: Walk;
  readonly body: Phaser.GameObjects.Sprite | undefined;
  readonly cone: VisionCone | undefined;
  readonly rig: string | undefined;
  readonly look: string | undefined;
  /** The name over a walker's feet, which its barks hang on; none for a guard. */
  readonly name: string | undefined;
  last: { x: number; y: number } | undefined;
  /** Until when the signature plays (the call out), in scene time. */
  haltUntil: number;
}

export class Patrols {
  private readonly rounders: Rounder[] = [];
  private readonly scene: Phaser.Scene;
  private readonly view: MapView;

  constructor(
    scene: Phaser.Scene,
    meta: ArtMetadata,
    view: MapView,
    routes: readonly (Patrol | Walk)[],
  ) {
    this.scene = scene;
    this.view = view;
    for (const route of routes) {
      const cast = CAST_ART[route.walker];
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
      const guard = "cone" in route;
      this.rounders.push({
        route,
        body,
        cone: guard ? view.addVisionCone(route) : undefined,
        rig: rig && cast ? cast.art : undefined,
        look,
        name: guard ? undefined : speakerName(route.walker) || undefined,
        last: undefined,
        haltUntil: 0,
      });
    }
  }

  /** A guard called out: it plays its signature move for a moment. */
  halt(id: string): void {
    const g = this.rounders.find((x) => x.route.id === id);
    if (g) g.haltUntil = this.scene.time.now + 1200;
  }

  /** Puts everyone where they are at server time `ms`. */
  update(ms: number): void {
    const now = this.scene.time.now;
    for (const g of this.rounders) {
      const pose = patrolPose(g.route, ms / 1000);
      g.cone?.setPose(pose);
      if (g.name) worldUi.npc(g.route.walker, g.name, pose.x, pose.y);
      if (!g.body) continue;
      const moving =
        g.last !== undefined && Math.hypot(pose.x - g.last.x, pose.y - g.last.y) > 0.05;
      g.last = { x: pose.x, y: pose.y };
      g.body.setPosition(Math.round(pose.x), Math.round(pose.y));
      const { dir, flip } = DIR_OF(pose.facing);
      g.body.setFlipX(flip);
      if (g.rig && g.look) {
        const cast = CAST_ART[g.route.walker];
        const anim = now < g.haltUntil && cast ? cast.signature : moving ? "walk" : "idle";
        g.body.play(lookAnim(g.rig, g.look, dir, anim), true);
      }
    }
  }

  destroy(): void {
    for (const g of this.rounders) {
      if (g.body) {
        this.view.removeEntity(g.body);
        g.body.destroy();
      }
      g.cone?.remove();
      if (g.name) worldUi.npcGone(g.route.walker);
    }
  }
}
