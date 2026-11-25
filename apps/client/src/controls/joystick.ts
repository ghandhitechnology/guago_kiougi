import * as Phaser from "phaser";
import { stick } from "./move.ts";

/** How far the knob travels from the base's centre, in game pixels. */
const REACH = 16;
const BASE = 48;
const KNOB = 20;
/** Where a thumb may start a stick: the left side of the screen, under every UI element. */
const AREA = { x: 0, y: 40, w: 230, h: 270 - 40 };

/**
 * The left thumb's stick (PLAN §6 "Input"): it appears where the thumb lands and follows it, and
 * writes the same move the keys do. It lies under every other piece of UI, so a tap on a button
 * or the chat never starts a walk.
 */
export class Joystick {
  private readonly scene: Phaser.Scene;
  private readonly root: Phaser.GameObjects.Container;
  private readonly knob: Phaser.GameObjects.Image;
  private readonly zone: Phaser.GameObjects.Zone;
  private pointerId: number | undefined;
  private origin = { x: 0, y: 0 };

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    // Two thumbs: the stick and a button at once.
    scene.input.addPointer(2);
    this.root = scene.add.container(0, 0).setDepth(5).setVisible(false).setAlpha(0);
    const base = scene.add.image(0, 0, "ui", "stick-base/idle").setOrigin(0.5);
    this.knob = scene.add.image(0, 0, "ui", "stick-knob/idle").setOrigin(0.5);
    this.root.add([base, this.knob]);
    this.zone = scene.add.zone(AREA.x, AREA.y, AREA.w, AREA.h).setOrigin(0).setDepth(0);
    this.zone.setInteractive();
    this.zone.on("pointerdown", (p: Phaser.Input.Pointer) => this.start(p));
    scene.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => this.move(p));
    scene.input.on(Phaser.Input.Events.POINTER_UP, (p: Phaser.Input.Pointer) => this.end(p));
    scene.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, (p: Phaser.Input.Pointer) =>
      this.end(p),
    );
  }

  destroy(): void {
    this.release();
    this.root.destroy();
    this.zone.destroy();
  }

  private start(p: Phaser.Input.Pointer): void {
    if (this.pointerId !== undefined) return;
    this.pointerId = p.id;
    const half = BASE / 2;
    this.origin = {
      x: Phaser.Math.Clamp(Math.round(p.x), half + 2, 480 - half - 2),
      y: Phaser.Math.Clamp(Math.round(p.y), half + 2, 270 - half - 2),
    };
    this.root.setPosition(this.origin.x, this.origin.y).setVisible(true);
    this.scene.tweens.killTweensOf(this.root);
    this.root.setScale(0.8).setAlpha(0);
    this.scene.tweens.add({
      targets: this.root,
      scale: 1,
      alpha: 1,
      duration: 90,
      ease: "Quad.Out",
    });
    this.knob.setFrame("stick-knob/held");
    this.move(p);
  }

  private move(p: Phaser.Input.Pointer): void {
    if (p.id !== this.pointerId) return;
    const dx = p.x - this.origin.x;
    const dy = p.y - this.origin.y;
    const d = Math.hypot(dx, dy);
    const k = d > REACH ? REACH / d : 1;
    this.knob.setPosition(Math.round(dx * k), Math.round(dy * k));
    stick.x = (dx * k) / REACH;
    stick.y = (dy * k) / REACH;
    stick.active = true;
  }

  private end(p: Phaser.Input.Pointer): void {
    if (p.id !== this.pointerId) return;
    this.release();
  }

  private release(): void {
    this.pointerId = undefined;
    stick.active = false;
    stick.x = 0;
    stick.y = 0;
    this.knob.setFrame("stick-knob/idle").setPosition(0, 0);
    this.scene.tweens.add({
      targets: this.root,
      alpha: 0,
      duration: 120,
      onComplete: () => this.root.setVisible(false),
    });
  }
}

/** Whether this screen is driven by thumbs. */
export function touchScreen(): boolean {
  return window.matchMedia?.("(pointer: coarse)").matches ?? navigator.maxTouchPoints > 0;
}

export { KNOB };
