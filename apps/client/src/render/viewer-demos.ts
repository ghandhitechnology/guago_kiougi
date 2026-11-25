/**
 * Demonstrations for the map viewer (dev only): patrols walking their routes with their vision
 * cones, combat light on real effect and telegraph sprites, a boss's entrance, and a stress case
 * of 300 lights. Each runs in a loop so it can be recorded.
 */
import type { ArtMetadata } from "@guago/art";
import { patrolPose } from "@guago/content";
import * as Phaser from "phaser";
import { paletteColor } from "./grade.ts";
import type { MapView } from "./map-view.ts";

export type Demo = "patrol" | "combat" | "entrance" | "lights300";

export const DEMO_ATLASES: Readonly<Record<Demo, readonly string[]>> = {
  patrol: [],
  combat: ["combat", "effects"],
  entrance: ["page1-bosses"],
  lights300: ["combat"],
};

/** Plays a sprite's animation once from the art metadata, creating it on first use. */
function play(
  scene: Phaser.Scene,
  meta: ArtMetadata,
  s: Phaser.GameObjects.Sprite,
  name: string,
  anim: string,
) {
  const sp = meta.sprites[name];
  const a = sp?.anims[anim];
  if (!sp || !a) return;
  const key = `demo|${name}/${anim}`;
  if (!scene.anims.exists(key)) {
    scene.anims.create({
      key,
      frames: a.frames.map((frame) => ({ key: sp.atlas, frame })),
      frameRate: a.fps,
      repeat: a.loop ? -1 : 0,
    });
  }
  s.play(key);
}

function sprite(scene: Phaser.Scene, meta: ArtMetadata, name: string, x: number, y: number) {
  const sp = meta.sprites[name];
  const s = new Phaser.GameObjects.Sprite(scene, x, y, sp?.atlas ?? "__MISSING", sp?.frames[0]);
  if (sp && !s.frame.customPivot) s.setDisplayOrigin(sp.origin[0], sp.origin[1]);
  return s;
}

/** Runs a demo; returns a function to call every frame with seconds since it began. */
export function startDemo(
  demo: Demo,
  scene: Phaser.Scene,
  view: MapView,
  meta: ArtMetadata,
  centre: { x: number; y: number },
): (t: number, dt: number) => void {
  const c = (name: string) => paletteColor(meta, name);
  switch (demo) {
    case "patrol": {
      const walkers = view.map.patrols.map((p) => {
        const body = sprite(scene, meta, "golem", 0, 0);
        play(scene, meta, body, "golem", Object.keys(meta.sprites.golem?.anims ?? {})[0] ?? "idle");
        view.addEntity(body);
        const torch = view.attachLight(body, {
          radius: 26,
          color: c("gold.light"),
          intensity: 0.9,
          offset: [0, -2],
          flicker: { amount: 0.2, period: 0.5 },
        });
        return { p, body, cone: view.addVisionCone(p), torch };
      });
      return (t) => {
        for (const w of walkers) {
          const pose = patrolPose(w.p, t);
          w.body.setPosition(Math.round(pose.x), Math.round(pose.y));
          w.body.setFlipX(Math.cos(pose.facing) < 0);
          w.cone.setPose(pose);
        }
      };
    }
    case "combat": {
      // A ring of telegraphs that fill, fire and leave a hit; bolts and flames between them.
      const tele = ["tele-circle", "tele-cone", "tele-line"] as const;
      const spots = [0, 1, 2, 3, 4, 5].map((k) => ({
        x: centre.x - 150 + (k % 3) * 150,
        y: centre.y - 40 + Math.floor(k / 3) * 90,
      }));
      let next = 0;
      const flames = [0, 1].map((k) => {
        const f = sprite(scene, meta, "fx-flame", centre.x - 75 + k * 150, centre.y + 15);
        play(scene, meta, f, "fx-flame", "burn");
        view.addEffect(f, false);
        view.addLight(f.x, f.y - 4, {
          radius: 40,
          color: c("clay.light"),
          intensity: 0.9,
          flicker: { amount: 0.25, period: 0.4 },
        });
        return f;
      });
      void flames;
      return (t) => {
        if (t < next) return;
        next = t + 0.45;
        const k = Math.floor(t / 0.45) % spots.length;
        const at = spots[k] as { x: number; y: number };
        const name = tele[k % 3] as string;
        const tg = sprite(scene, meta, name, at.x, at.y);
        play(scene, meta, tg, name, name === "tele-line" ? "charge" : "fill");
        view.addTelegraph(tg, { color: c("red.light") });
        scene.time.delayedCall(1200, () => {
          play(scene, meta, tg, name, "fire");
          scene.time.delayedCall(220, () => {
            tg.destroy();
            const heavy = k % 2 === 0;
            const hitName = heavy ? "fx-hit-heavy" : "fx-hit-crit";
            const hit = sprite(scene, meta, hitName, at.x, at.y - 8);
            view.addEffect(hit, true);
            play(scene, meta, hit, hitName, "hit");
            hit.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => hit.destroy());
            view.flash(at.x, at.y - 4, {
              radius: heavy ? 70 : 90,
              color: c(heavy ? "gold.pale" : "plum.pale"),
              intensity: 1.8,
              ms: 380,
            });
            for (let s = 0; s < 4; s++) {
              const sx = at.x + (Math.random() - 0.5) * 40;
              const sy = at.y - 6 + (Math.random() - 0.5) * 20;
              const spark = sprite(scene, meta, "fx-spark", sx, sy);
              view.addEffect(spark, true);
              play(scene, meta, spark, "fx-spark", "hit");
              spark.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => spark.destroy());
              view.flash(sx, sy, { radius: 22, color: c("gold.light"), intensity: 1.2, ms: 200 });
            }
          });
        });
        // A bolt crossing to the next spot, lighting the ground under it as it goes.
        const to = spots[(k + 1) % spots.length] as { x: number; y: number };
        const bolt = sprite(scene, meta, "fx-bolt", at.x, at.y - 10);
        bolt.setRotation(Math.atan2(to.y - at.y, to.x - at.x));
        view.addEffect(bolt);
        play(scene, meta, bolt, "fx-bolt", "a");
        const light = view.addLight(at.x, at.y, {
          radius: 36,
          color: c("navy.pale"),
          intensity: 1.1,
        });
        scene.tweens.add({
          targets: bolt,
          x: to.x,
          y: to.y - 10,
          duration: 380,
          onUpdate: () => light.moveTo(bolt.x, bolt.y + 10),
          onComplete: () => {
            bolt.destroy();
            light.remove();
            view.flash(to.x, to.y, { radius: 60, color: c("navy.pale"), intensity: 1.5, ms: 300 });
          },
        });
      };
    }
    case "entrance": {
      // Letterbox, the world drains to one colour, the boss's drain sprite and title land,
      // then colour floods back out from the boss. Eight seconds a round.
      const boss = sprite(scene, meta, "boss-zeno-drain", centre.x, centre.y + 30);
      boss.setVisible(false);
      view.addOverlay(boss);
      const title = sprite(scene, meta, "title-zeno", 128, 24);
      title.setScrollFactor(0).setVisible(false);
      view.addOverlay(title);
      let phase = -1;
      return (t) => {
        const s = t % 8;
        const p = s < 0.2 ? 0 : s < 1 ? 1 : s < 4.5 ? 2 : s < 6 ? 3 : 4;
        if (p === phase) return;
        phase = p;
        if (p === 1) {
          view.letterbox(true, 400);
          view.drain(c("red.mid"), 700);
          boss.setVisible(true);
        } else if (p === 2) {
          title.setVisible(true);
          play(scene, meta, title, "title-zeno", "land");
        } else if (p === 3) {
          title.setVisible(false);
          view.flood(boss.x, boss.y - 30, 1100);
        } else if (p === 4) {
          boss.setVisible(false);
          view.letterbox(false, 400);
        }
      };
    }
    case "lights300": {
      // Three hundred lights alive at once: flashes respawning as they fade, over the view.
      const W = scene.cameras.main.width;
      const H = scene.cameras.main.height;
      const colors = ["gold.light", "plum.pale", "navy.pale", "red.light", "sea.light"].map(c);
      let carry = 0;
      return (_t, dt) => {
        // Each flash lives 500 ms, so 600 a second keeps 300 alive.
        carry += dt * 0.6;
        const cam = scene.cameras.main;
        while (carry >= 1) {
          carry -= 1;
          view.flash(cam.scrollX + Math.random() * W, cam.scrollY + Math.random() * H, {
            radius: 18 + Math.random() * 30,
            color: colors[Math.floor(Math.random() * colors.length)] as number,
            intensity: 1,
            ms: 500,
          });
        }
      };
    }
  }
}
