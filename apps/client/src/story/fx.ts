/**
 * The narrative's effects (`EFFECTS`), played on the stage with the renderer's own calls and the
 * art build's effect sprites: light, drain and flood, camera shake, sprites with motion. Lasting
 * effects stay on the stage until something undoes them or the map is left. Light changes all go
 * through `roomLights`, the one place a scene touches the map's own lights.
 */
import { audio } from "@guago/audio";
import type { narrative } from "@guago/content";
import * as Phaser from "phaser";
import { spriteAnim } from "../art.ts";
import { paint } from "../ui/theme.ts";
import type { Stage } from "./stage.ts";

type Effect = narrative.Effect;

export interface FxContext {
  readonly stage: Stage;
  /** A mark of the map, or `player`, as a point. */
  at(mark: string | undefined): { x: number; y: number } | undefined;
}

const sleep = (scene: Phaser.Scene, ms: number) =>
  new Promise<void>((r) => scene.time.delayedCall(ms, () => r()));

/**
 * The map's own lamps at `level` (0 dark, 1 as drawn) over `ms`. The scene's one hold on the
 * room's lights: the renderer's `setMapLights`.
 */
export function roomLights(stage: Stage, level: number, ms = 0): void {
  stage.host.view.setMapLights(level, ms);
}

/** A sprite playing one of its animations at a point, drawn in the glow layer or as an entity. */
function sprite(
  stage: Stage,
  name: string,
  anim: string | undefined,
  x: number,
  y: number,
  how: "glow" | "entity" | "overlay" = "glow",
): Phaser.GameObjects.Sprite | undefined {
  const { scene, meta, view } = stage.host;
  const art = meta.sprites[name];
  if (!art || !scene.textures.exists(art.atlas)) return undefined;
  const s = scene.add.sprite(Math.round(x), Math.round(y), art.atlas);
  const a = anim && art.anims[anim] ? anim : Object.keys(art.anims)[0];
  if (a) s.play(spriteAnim(name, a));
  if (how === "glow") view.addEffect(s);
  else if (how === "entity") view.addEntity(s, { shadow: false });
  else view.addOverlay(s);
  return s;
}

/** A sprite that plays its animation once and goes. */
function once(stage: Stage, name: string, anim: string, x: number, y: number): void {
  const s = sprite(stage, name, anim, x, y);
  if (!s) return;
  s.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => s.destroy());
  stage.host.scene.time.delayedCall(3000, () => s.active && s.destroy());
}

/** Registers what undoes a lasting effect; `playFx` took down any earlier one of the same key. */
function lasting(stage: Stage, key: string, destroy: () => void): void {
  stage.lasting.set(key, { destroy });
}

/** The map's windows, by their feet. */
function windowsOf(stage: Stage): { x: number; y: number }[] {
  return stage.host.map.scene.objects.flatMap((o) =>
    "prop" in o && o.prop === "window" ? [{ x: o.at[0], y: o.at[1] }] : [],
  );
}

function drop(stage: Stage, fx: string): void {
  for (const [key, l] of stage.lasting) {
    if (key.startsWith(`${fx}@`)) {
      l.destroy();
      stage.lasting.delete(key);
    }
  }
}

/**
 * Plays an effect. `instant` sets a lasting effect's end state with no motion and no wait: a
 * scene resumed mid-way puts back what its earlier steps left.
 */
export async function playFx(
  ctx: FxContext,
  fx: Effect,
  mark: string | undefined,
  instant = false,
): Promise<void> {
  const { stage } = ctx;
  const { scene, view, curtain, meta } = stage.host;
  const cam = scene.cameras.main;
  const p = ctx.at(mark) ?? { x: cam.midPoint.x, y: cam.midPoint.y };
  const key = `${fx}@${mark ?? ""}`;
  const color = (name: string) => paint(name);
  // A lasting effect already standing is kept when a later beat on the map settles its stage;
  // played again, the old one goes first.
  const standing = stage.lasting.get(key);
  if (standing && instant) return;
  if (standing) {
    standing.destroy();
    stage.lasting.delete(key);
  }
  switch (fx) {
    case "fade-in":
      return instant ? curtain.open(0) : curtain.open(700);
    case "fade-out":
      return instant ? curtain.close(0) : curtain.close(900);
    case "shake":
      if (!instant) cam.shake(420, 0.006);
      return;
    case "flash":
      if (!instant)
        view.flash(p.x, p.y, { radius: 160, color: color("gold.pale"), intensity: 1.6, ms: 500 });
      return;
    case "hum":
      if (instant) return;
      cam.shake(1800, 0.0018);
      return sleep(scene, 400);
    case "lights-flicker": {
      if (instant) return;
      for (const [level, ms] of [
        [0.3, 60],
        [1, 90],
        [0.1, 70],
        [0.8, 110],
        [0.05, 60],
        [0.6, 140],
        [0.15, 80],
        [0.9, 120],
      ] as const) {
        roomLights(stage, level, 30);
        await sleep(scene, ms);
      }
      return;
    }
    case "lights-out":
      // The tubes die and their hum with them; the moon through the windows stays.
      roomLights(stage, 0, instant ? 0 : 120);
      stage.air({ ambient: null }, instant ? 0 : 0.1);
      if (!instant) cam.shake(140, 0.004);
      lasting(stage, key, () => roomLights(stage, 1, 0));
      return instant ? undefined : sleep(scene, 900);
    case "rift-column": {
      // A column of daylight stands on the field: every window shows it, and its gold pours in
      // through the glass onto the floor.
      const gold = color("gold.light");
      view.showPropFrame("window", "rift");
      view.setWindowLight(2.8, instant ? 0 : 1100, gold);
      if (!instant) {
        cam.flash(260, 255, 240, 190);
        for (const w of windowsOf(stage)) {
          view.flash(w.x, w.y + 34, { radius: 70, color: gold, intensity: 1.2, ms: 1200 });
        }
      }
      lasting(stage, key, () => {
        view.showPropFrame("window", "night");
        view.setWindowLight(1, 0, null);
      });
      return instant ? undefined : sleep(scene, 700);
    }
    case "columns-rise": {
      // Marble grinding up out of the field: the building shakes once a column, the gold swells,
      // dust shakes off the window wall.
      if (instant) return;
      const gold = color("gold.light");
      const walls = windowsOf(stage);
      for (let i = 0; i < 4; i++) {
        scene.time.delayedCall(i * 480, () => {
          audio.cue("stone-land");
          cam.shake(300, 0.006 - i * 0.001);
          view.setWindowLight(2.8 + (i + 1) * 0.05, 240, gold);
          for (const w of walls) {
            if (Math.random() < 0.5) continue;
            once(stage, "fx-dust", "kick", w.x + Phaser.Math.Between(-14, 14), w.y + 6);
          }
        });
      }
      return sleep(scene, 1900);
    }
    case "page-gust": {
      if (instant) return;
      const to = ctx.at("player") ?? p;
      for (let i = 0; i < 6; i++) {
        const s = sprite(stage, i === 0 ? "pickup-page" : "page-s", undefined, p.x, p.y, "glow");
        if (!s) continue;
        const tx = to.x + (i === 0 ? 0 : Phaser.Math.Between(-60, 60));
        const ty = to.y - 12 + (i === 0 ? 0 : Phaser.Math.Between(-40, 30));
        scene.tweens.add({
          targets: s,
          x: tx,
          y: ty,
          angle: Phaser.Math.Between(-200, 200),
          delay: i * 90,
          duration: i === 0 ? 1300 : 900 + i * 80,
          ease: "Sine.InOut",
          onComplete: () => {
            if (i === 0) once(stage, "fx-pickup", "twinkle", tx, ty);
            s.destroy();
          },
        });
      }
      return sleep(scene, 1350);
    }
    case "book-glow": {
      const body = stage.host.playerBody();
      if (!body) return;
      const book = sprite(stage, "fx-book", "spin", body.x, body.y - 30, "glow");
      const light = view.attachLight(body, {
        radius: 54,
        color: color("gold.light"),
        intensity: 0.9,
        offset: [0, -14],
      });
      const follow = () => book?.setPosition(Math.round(body.x), Math.round(body.y - 30));
      scene.events.on(Phaser.Scenes.Events.POST_UPDATE, follow);
      if (book && !instant) {
        book.setScale(0.2).setAlpha(0);
        scene.tweens.add({ targets: book, scale: 1, alpha: 1, duration: 500, ease: "Back.Out" });
        once(stage, "fx-levelup", "burst", body.x, body.y - 10);
      }
      lasting(stage, key, () => {
        scene.events.off(Phaser.Scenes.Events.POST_UPDATE, follow);
        book?.destroy();
        light.remove();
      });
      return instant ? undefined : sleep(scene, 700);
    }
    case "odap-surge": {
      // 오답 pour up from below the mark and mill on it until the landing is cleared.
      const swarm: Phaser.GameObjects.Sprite[] = [];
      for (let i = 0; i < 12; i++) {
        const tx = p.x + Phaser.Math.Between(-70, 70);
        const ty = p.y + Phaser.Math.Between(-12, 40);
        const s = sprite(stage, i % 3 === 0 ? "odap-pencil" : "odap", "hop", tx, ty, "entity");
        if (!s) continue;
        swarm.push(s);
        s.setData("mark", mark);
        if (instant) continue;
        s.setPosition(tx, ty + 140).setAlpha(0);
        scene.tweens.add({
          targets: s,
          y: ty,
          alpha: 1,
          delay: i * 70,
          duration: 700,
          ease: "Quad.Out",
        });
      }
      const mill = scene.time.addEvent({
        delay: 500,
        loop: true,
        callback: () => {
          for (const s of swarm) {
            if (!s.active || Math.random() < 0.6) continue;
            scene.tweens.add({
              targets: s,
              x: s.x + Phaser.Math.Between(-12, 12),
              y: s.y + Phaser.Math.Between(-8, 8),
              duration: 380,
            });
          }
        },
      });
      lasting(stage, key, () => {
        mill.remove();
        for (const s of swarm) {
          if (!s.active) continue;
          once(stage, "fx-death-paper", "die", s.x, s.y - 6);
          view.removeEntity(s);
          s.destroy();
        }
      });
      if (!instant) cam.shake(300, 0.003);
      return instant ? undefined : sleep(scene, 500);
    }
    case "fault-crack":
      if (instant) return;
      once(stage, "fx-fault", "open", p.x, p.y);
      cam.shake(380, 0.008);
      view.flash(p.x, p.y, { radius: 90, color: color("gold.light"), intensity: 1.2, ms: 400 });
      return sleep(scene, 500);
    case "golem-rise": {
      const golem = stage.actor("opening", "odap-golem", p.x, p.y, "down");
      if (!golem) return;
      if (!instant) {
        const restY = golem.y;
        golem.body.setY(restY + 14).setAlpha(0);
        scene.tweens.add({
          targets: golem.body,
          y: restY,
          alpha: 1,
          duration: 1100,
          ease: "Quad.Out",
        });
        cam.shake(1100, 0.007);
        for (let i = 0; i < 4; i++) {
          scene.time.delayedCall(i * 220, () =>
            once(stage, "fx-dust", "kick", p.x + Phaser.Math.Between(-18, 18), p.y),
          );
        }
        await sleep(scene, 1200);
      }
      return;
    }
    case "drop-pop": {
      const page = sprite(stage, "drop-page-math", "idle", p.x, p.y, "entity");
      const glint = sprite(stage, "drop-glint", "shine", p.x, p.y - 4, "glow");
      if (page && !instant) {
        page.setY(p.y - 2);
        scene.tweens.add({
          targets: page,
          y: p.y - 22,
          duration: 220,
          yoyo: true,
          ease: "Quad.Out",
        });
        once(stage, "fx-pop", "die", p.x, p.y);
      }
      lasting(stage, key, () => {
        if (page) {
          once(stage, "fx-pickup", "twinkle", page.x, page.y - 4);
          view.removeEntity(page);
          page.destroy();
        }
        glint?.destroy();
      });
      return instant ? undefined : sleep(scene, 500);
    }
    case "freeze-field": {
      view.drain(color("stone.light"), instant ? 0 : 700);
      for (const a of stage.actors.values()) a.body.anims.pause();
      lasting(stage, key, () => {
        for (const a of stage.actors.values()) a.body.anims.resume();
      });
      return instant ? undefined : sleep(scene, 700);
    }
    case "unfreeze-field":
      drop(stage, "freeze-field");
      if (!instant) view.flood(p.x, p.y, 900);
      else view.drain(null, 0);
      return;
    case "diagonal-glow": {
      const line = sprite(stage, "p1-diagonal", instant ? "open" : "trace", p.x, p.y);
      const light = view.addLight(p.x, p.y, {
        radius: 80,
        color: color("gold.light"),
        intensity: 0.9,
      });
      lasting(stage, key, () => {
        line?.destroy();
        light.remove();
      });
      return instant ? undefined : sleep(scene, 900);
    }
    case "grid-dissolve":
      drop(stage, "diagonal-glow");
      if (instant) return;
      for (let i = 0; i < 14; i++) {
        scene.time.delayedCall(i * 60, () =>
          once(
            stage,
            "fx-debris-paper",
            "flutter",
            p.x + Phaser.Math.Between(-90, 90),
            p.y + Phaser.Math.Between(-60, 60),
          ),
        );
      }
      view.flash(p.x, p.y, { radius: 200, color: color("gold.pale"), intensity: 1.4, ms: 900 });
      return sleep(scene, 900);
    case "limit-rings": {
      const rings: Phaser.GameObjects.Sprite[] = [];
      for (const [name, m] of [
        ["p1-limit-96", "ring-96"],
        ["p1-limit-48", "ring-48"],
        ["p1-limit-24", "ring-24"],
      ] as const) {
        const at = ctx.at(m) ?? p;
        const s = sprite(stage, name, instant ? "held" : "open", at.x, at.y);
        if (s) rings.push(s);
        if (!instant) await sleep(scene, 380);
      }
      lasting(stage, key, () => {
        for (const r of rings) r.destroy();
      });
      return;
    }
    case "dash-arrive":
      if (instant) return;
      once(stage, "fx-dodge-streak", "streak", p.x - 20, p.y);
      once(stage, "fx-shockwave", "out", p.x, p.y);
      view.flash(p.x, p.y, { radius: 120, color: color("gold.pale"), intensity: 1.3, ms: 500 });
      cam.shake(200, 0.004);
      return sleep(scene, 400);
    case "ice-spread": {
      const tiles: Phaser.GameObjects.Sprite[] = [];
      for (let dx = -96; dx <= 96; dx += 32) {
        for (let dy = -16; dy <= 16; dy += 32) {
          const s = sprite(stage, "p1-ice", "idle", p.x + dx, p.y + dy, "overlay");
          if (!s) continue;
          s.setAlpha(instant ? 0.85 : 0);
          tiles.push(s);
          if (!instant) {
            scene.tweens.add({ targets: s, alpha: 0.85, delay: Math.abs(dx) * 4, duration: 400 });
          }
        }
      }
      lasting(stage, key, () => {
        for (const t of tiles) t.destroy();
      });
      return instant ? undefined : sleep(scene, 700);
    }
    case "block-slide":
      if (instant) return;
      once(stage, "fx-dust", "kick", p.x - 10, p.y + 4);
      stage.actors.get("block")?.pose("slide");
      return;
    case "theory-break":
      if (instant) return;
      once(stage, "boss-aristotle-shield", "break", p.x, p.y - 20);
      for (let i = 0; i < 3; i++)
        once(stage, "fx-shard", `tumble${i}`, p.x + (i - 1) * 14, p.y - 10);
      view.flash(p.x, p.y, { radius: 220, color: color("gold.pale"), intensity: 1.8, ms: 900 });
      cam.shake(500, 0.009);
      return sleep(scene, 800);
    case "two-stones": {
      if (instant) return;
      // A big stone and a small one, dropped together, land together.
      for (const [dx, scale] of [
        [-10, 1],
        [10, 0.55],
      ] as const) {
        const s = sprite(stage, "p1-boulder", "fall", p.x + dx, p.y - 120, "entity");
        if (!s) continue;
        s.setScale(scale);
        scene.tweens.add({
          targets: s,
          y: p.y,
          duration: 700,
          ease: "Quad.In",
          onComplete: () => {
            s.play(spriteAnim("p1-boulder", "land"));
            once(stage, "fx-dust", "kick", s.x, s.y);
            scene.time.delayedCall(2600, () => {
              view.removeEntity(s);
              s.destroy();
            });
          },
        });
      }
      await sleep(scene, 760);
      cam.shake(160, 0.004);
      return sleep(scene, 300);
    }
    case "page-return": {
      if (instant) return;
      const to = ctx.at("player") ?? p;
      const s = sprite(stage, "pickup-page", "flutter", p.x, p.y - 40);
      if (!s) return;
      await new Promise<void>((r) =>
        scene.tweens.add({
          targets: s,
          x: to.x,
          y: to.y - 18,
          duration: 1400,
          ease: "Sine.InOut",
          onComplete: () => r(),
        }),
      );
      once(stage, "fx-levelup", "burst", to.x, to.y - 10);
      s.destroy();
      return;
    }
  }
  void meta;
}

/** A landing cleared: its 오답 burst into paper. */
export function clearSwarm(stage: Stage, mark: string | undefined): void {
  for (const [key, l] of stage.lasting) {
    if (!key.startsWith("odap-surge@")) continue;
    if (mark && key !== `odap-surge@${mark}`) continue;
    l.destroy();
    stage.lasting.delete(key);
  }
}

/** The first drop picked up. */
export function pickUp(stage: Stage): void {
  drop(stage, "drop-pop");
}
