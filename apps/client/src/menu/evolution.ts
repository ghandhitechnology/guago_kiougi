import type { ItemView } from "@guago/shared";
import type * as Phaser from "phaser";
import { loadArt } from "../art.ts";
import { bookDef, bookGood } from "../items/catalog.ts";
import { cue } from "../sound/audio.ts";
import { fade } from "../ui/motion.ts";
import { screen } from "../ui/screen.ts";
import { sound } from "../ui/sound.ts";
import { Label, wrap } from "../ui/text.ts";
import { paint } from "../ui/theme.ts";

/**
 * An evolution (PLAN §8) is the biggest moment in the menus and takes the whole screen. The
 * screen goes dark and the book rises in the middle, six times its size, trembling while light in
 * its class colour is drawn into it. When the server agrees: a white flash and a shake, the cover
 * slams into its evolved binding (foil, seal, ribbon), a ring of its class colour breaks outward
 * and the book's own evolved effect art plays round it, then the new name lands with a thump and
 * one line says what it does now. About three seconds; a press goes back only once it has landed.
 */

/** Ramps by class: the colour each class's attacks and covers are drawn in. */
const CLASS_RAMP: Readonly<Record<string, string>> = {
  math: "navy",
  physics: "plum",
  chemistry: "sea",
  biology: "grass",
  earth: "gold",
};

/** The least time the book hangs charging, so the rise is felt even on a fast answer. */
const CHARGE_MS = 1100;
/** After the cover lands, how long before a press may end the moment. */
const SKIP_AFTER_MS = 400;
const SCALE = 6;
/** Evolved forms whose art is not named `evo-<id>`. */
const ART_NAMES: Readonly<Record<string, string>> = {
  "typhoon-eye": "evo-typhoon-cloud",
  "aqua-regia": "fx-aqua-regia-pool",
  thermite: "fx-molten-iron",
  "climax-forest": "fx-forest",
  spectrum: "atk-spectrum",
};

export interface EvolutionMoment {
  /** The server agreed: play the reveal, then `then` once the player presses on. */
  land(then: () => void): void;
  /** The server refused: the light falls back and the screen clears. */
  abort(): void;
}

export function evolutionMoment(scene: Phaser.Scene, item: ItemView): EvolutionMoment {
  const def = bookDef(item.def);
  const before = bookGood(item.def, false);
  const after = bookGood(item.def, true);
  const ramp = CLASS_RAMP[def?.subject ?? ""] ?? "gold";
  const cx = Math.round(screen.w / 2);
  const cy = Math.round(screen.h / 2) - 22;
  const started = scene.time.now;
  const timers: Phaser.Time.TimerEvent[] = [];
  const later = (ms: number, fn: () => void) => {
    timers.push(scene.time.delayedCall(ms, fn));
  };

  const dim = scene.add
    .rectangle(0, 0, screen.w, screen.h, paint("ink.deep"))
    .setOrigin(0)
    .setAlpha(0)
    .setInteractive();
  const rays = scene.add.graphics();
  const halo = scene.add.graphics();
  const art = scene.add.container(cx, cy);
  const motes = scene.add.container(0, 0);
  const cover = scene.add
    .image(cx, cy + 40, "ui", before.icon)
    .setOrigin(0.5)
    .setScale(SCALE)
    .setAlpha(0);
  const front = scene.add.container(0, 0);
  const root = scene.add
    .container(0, 0, [dim, rays, halo, art, motes, cover, front])
    .setDepth(3000);

  fade(dim, 0.94, 300);
  sound("open");
  cue(def?.cues.cast ?? "story.chalk");
  cue("rift.pulse", { volume: 0.8 });
  // The book rises into the middle of the dark.
  scene.tweens.add({ targets: cover, y: cy, alpha: 1, duration: 620, ease: "Back.Out" });

  // Charging: rays turn slowly, the halo breathes, light is drawn into the book, and it trembles
  // harder the longer the answer takes.
  let k = 0;
  let charging = true;
  const tick = scene.time.addEvent({
    delay: 50,
    loop: true,
    callback: () => {
      k++;
      drawRays(rays, cx, cy, ramp, k, charging ? 0.25 : 0.5);
      halo.clear();
      const r = 54 + Math.round(3 * Math.sin(k / 3));
      halo.fillStyle(paint(`${ramp}.dark`), 0.35).fillCircle(cx, cy, r);
      halo.fillStyle(paint(`${ramp}.mid`), 0.25).fillCircle(cx, cy, r - 12);
      if (!charging) return;
      const t = Math.min(1, (scene.time.now - started) / CHARGE_MS);
      const amp = t < 0.5 ? 0 : t < 0.85 ? 1 : 2;
      if (cover.alpha === 1)
        cover.setPosition(cx + (k % 2 ? amp : -amp), cy + (k % 3 === 0 ? -1 : 0));
      // A mote of light from the edge of the screen into the book.
      const a = Math.random() * Math.PI * 2;
      const d = 150 + Math.random() * 60;
      const m = scene.add
        .rectangle(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 3, 3, paint(`${ramp}.pale`))
        .setAlpha(0);
      motes.add(m);
      scene.tweens.add({
        targets: m,
        x: cx,
        y: cy,
        alpha: { from: 0.2, to: 1 },
        duration: 420,
        ease: "Quad.In",
        onComplete: () => m.destroy(),
      });
      if (k % 5 === 0) sound("type");
    },
  });

  // The evolved form's own effect art, from the evolved atlas; loaded now if this is its first use.
  const evoName = def ? (ART_NAMES[def.evolution.id] ?? `evo-${def.evolution.id}`) : undefined;
  if (evoName && !scene.textures.exists("combat-evolved")) {
    loadArt(scene, { atlases: ["combat-evolved"] });
    scene.load.start();
  }

  let closed = false;
  const close = (then?: () => void) => {
    if (closed) return;
    closed = true;
    tick.remove();
    for (const t of timers) t.remove();
    fade(root, 0, 260, () => {
      root.destroy();
      then?.();
    });
  };

  return {
    abort: () => {
      charging = false;
      scene.tweens.add({ targets: cover, y: cy + 40, alpha: 0, duration: 300, ease: "Quad.In" });
      close();
    },
    land: (then) => {
      const wait = Math.max(0, CHARGE_MS - (scene.time.now - started));
      later(wait, () => {
        charging = false;
        motes.removeAll(true);
        cover.setPosition(cx, cy);
        // The flash and the shake.
        const flash = scene.add
          .rectangle(0, 0, screen.w, screen.h, paint("stone.bright"))
          .setOrigin(0);
        front.add(flash);
        fade(flash, 0, 460, () => flash.destroy());
        scene.cameras.main.shake(280, 0.012);
        // The cover slams into its evolved binding.
        cover.setFrame(after.icon).setOrigin(0.5);
        scene.tweens.killTweensOf(cover);
        cover.setScale(SCALE + 3).setAlpha(1);
        scene.tweens.add({ targets: cover, scale: SCALE, duration: 150, ease: "Quad.In" });
        // A slow float once it has landed.
        later(400, () =>
          scene.tweens.add({
            targets: cover,
            y: cy - 3,
            duration: 900,
            ease: "Sine.InOut",
            yoyo: true,
            repeat: -1,
          }),
        );
        cue("jingle.jeonjik");
        cue(`hit.${def?.subject ?? "math"}.heavy`);
        sound("stamp");
        ring(scene, front, cx, cy, ramp);
        burst(scene, front, cx, cy, ramp);
        const play = () => {
          if (closed || !evoName) return;
          playArt(scene, art, evoName);
        };
        if (scene.textures.exists("combat-evolved")) play();
        else scene.load.once("complete", play);

        // The new name lands with weight.
        later(360, () => {
          const name = new Label(scene, 0, 0, after.name, {
            font: "galmuri11-bold",
            color: "gold.pale",
          });
          const shadow = new Label(scene, 1, 1, after.name, {
            font: "galmuri11-bold",
            color: `${ramp}.deep`,
          });
          name.at(-Math.round(name.width / 2), -6);
          shadow.at(-Math.round(name.width / 2) + 1, -5);
          const plate = scene.add.container(cx, cy + 78, [shadow.obj, name.obj]);
          front.add(plate);
          plate.setScale(5).setAlpha(0);
          scene.tweens.add({
            targets: plate,
            scale: 2,
            alpha: 1,
            duration: 170,
            ease: "Quad.In",
            onComplete: () => {
              scene.cameras.main.shake(120, 0.006);
              sound("stamp");
            },
          });
        });
        // What it does now, in one line under the name.
        later(900, () => {
          const width = Math.min(340, screen.w - 40);
          const lines = wrap(scene, "galmuri9", after.desc, width).slice(0, 2);
          const line = new Label(scene, 0, 0, lines.join("\n"), {
            font: "galmuri9",
            color: "stone.light",
            width,
            align: "center",
            leading: 1,
          });
          line.at(cx - Math.round(width / 2), cy + 100);
          front.add(line.obj);
          line.obj.setAlpha(0);
          fade(line.obj, 1, 300);
          sound("page");
        });
        // Any press goes back to the bag, the new book picked, once the cover has landed.
        later(SKIP_AFTER_MS, () => {
          dim.once("pointerup", () => close(then));
          scene.input.keyboard?.once("keydown", () => close(then));
        });
      });
    },
  };
}

function drawRays(
  g: Phaser.GameObjects.Graphics,
  cx: number,
  cy: number,
  ramp: string,
  k: number,
  strength: number,
): void {
  g.clear();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + k * 0.012;
    const lit = strength * (0.6 + 0.4 * Math.sin(k / 5 + i * 1.7));
    g.lineStyle(i % 2 ? 1 : 2, paint(i % 2 ? `${ramp}.light` : "gold.pale"), lit);
    g.lineBetween(
      cx + Math.cos(a) * 40,
      cy + Math.sin(a) * 40,
      cx + Math.cos(a) * 320,
      cy + Math.sin(a) * 320,
    );
  }
}

/** A shockwave ring in the class colour, breaking outward from the book. */
function ring(
  scene: Phaser.Scene,
  into: Phaser.GameObjects.Container,
  cx: number,
  cy: number,
  ramp: string,
): void {
  const g = scene.add.graphics();
  into.add(g);
  const r = { v: 30 };
  scene.tweens.add({
    targets: r,
    v: 240,
    duration: 620,
    ease: "Cubic.Out",
    onUpdate: () => {
      const t = (r.v - 30) / 210;
      g.clear();
      g.lineStyle(3, paint(`${ramp}.pale`), 1 - t).strokeCircle(cx, cy, r.v);
      g.lineStyle(1, paint("gold.pale"), 1 - t).strokeCircle(cx, cy, r.v - 6);
    },
    onComplete: () => g.destroy(),
  });
}

/** Squares of the class colour and gold flung out from the book. */
function burst(
  scene: Phaser.Scene,
  into: Phaser.GameObjects.Container,
  cx: number,
  cy: number,
  ramp: string,
): void {
  const colours = [`${ramp}.pale`, `${ramp}.light`, "gold.pale", "stone.bright"];
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2 + Math.random() * 0.15;
    const d = 70 + Math.random() * 110;
    const size = i % 3 === 0 ? 3 : 2;
    const sq = scene.add
      .rectangle(cx, cy, size, size, paint(colours[i % colours.length] as string))
      .setOrigin(0.5);
    into.add(sq);
    scene.tweens.add({
      targets: sq,
      x: cx + Math.cos(a) * d,
      y: cy + Math.sin(a) * d,
      alpha: 0,
      duration: 520 + Math.random() * 380,
      ease: "Cubic.Out",
      onComplete: () => sq.destroy(),
    });
  }
}

/**
 * Plays an evolved form's effect art round the book. Art drawn at many aims (a flying tome and
 * its ribbon) circles it as comets, each frame turned to where it flies; big art (a ring, an
 * aura) plays large behind it; small art orbits it six times over.
 */
function playArt(scene: Phaser.Scene, into: Phaser.GameObjects.Container, name: string): void {
  const tex = scene.textures.get("combat-evolved");
  const mine = tex.getFrameNames().filter((f) => f.startsWith(`${name}/`));
  if (mine.length === 0) return;
  const groups = new Map<string, string[]>();
  for (const f of mine) {
    const key = f.slice(name.length + 1).replace(/\d+$/, "");
    groups.set(key, [...(groups.get(key) ?? []), f]);
  }
  for (const list of groups.values())
    list.sort((a, b) => Number(a.match(/\d+$/)?.[0] ?? 0) - Number(b.match(/\d+$/)?.[0] ?? 0));
  const aims = [...groups.keys()]
    .map((k) => k.match(/^(\D*)(\d+)-$/))
    .filter((m): m is RegExpMatchArray => !!m);
  let kk = 0;
  const step = (fn: (k: number) => void) =>
    scene.time.addEvent({
      delay: 90,
      loop: true,
      callback: () => {
        if (!into.active) return;
        fn(++kk);
      },
    });
  into.setAlpha(0);
  fade(into, 1, 200);

  if (aims.length >= 4) {
    // Comets: each copy's frame is the aim nearest the way it is flying round.
    const base = (aims[0] as RegExpMatchArray)[1] as string;
    const n = aims.length;
    const copies = [0, 1, 2].map(() => scene.add.image(0, 0, "combat-evolved").setScale(2));
    into.add(copies);
    const ev = step((k) => {
      copies.forEach((c, i) => {
        const th = k * 0.09 + (i / copies.length) * Math.PI * 2;
        c.setPosition(Math.round(Math.cos(th) * 86), Math.round(Math.sin(th) * 44));
        const fly = th + Math.PI / 2;
        const d = (((Math.round((fly / (Math.PI * 2)) * n) % n) + n) % n) as number;
        const frames = groups.get(`${base}${d}-`) ?? [];
        const f = frames[k % Math.max(1, frames.length)];
        if (f) c.setFrame(f);
      });
    });
    into.once("destroy", () => ev.remove());
    return;
  }
  // The group with the most frames is the one that moves; art made of single poses (the
  // element cards of 멘델레예프의 꿈) cycles through all of them.
  const biggest = [...groups.values()].sort((a, b) => b.length - a.length)[0] ?? [];
  const frames = biggest.length > 1 ? biggest : mine;
  const first = tex.get(frames[0]);
  if (first.width >= 48 || first.height >= 48) {
    const big = scene.add.image(0, 0, "combat-evolved", frames[0]).setScale(3);
    into.add(big);
    const ev = step((k) => big.setFrame(frames[k % frames.length] as string));
    into.once("destroy", () => ev.remove());
    return;
  }
  const copies = [0, 1, 2, 3, 4, 5].map((i) =>
    scene.add.image(0, 0, "combat-evolved", frames[i % frames.length]).setScale(3),
  );
  into.add(copies);
  const ev = step((k) => {
    copies.forEach((c, i) => {
      const th = k * 0.05 + (i / copies.length) * Math.PI * 2;
      c.setPosition(Math.round(Math.cos(th) * 92), Math.round(Math.sin(th) * 46));
      c.setFrame(frames[(k + i) % frames.length] as string);
    });
  });
  into.once("destroy", () => ev.remove());
}
