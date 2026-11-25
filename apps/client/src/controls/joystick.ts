import * as Phaser from "phaser";
import { screen } from "../ui/screen.ts";
import { stick } from "./move.ts";

/** How far the knob travels from the base's centre, in game pixels. */
const REACH = 16;
/** Pushes shorter than this share of the reach do nothing; past it the walk speeds up evenly. */
const DEADZONE = 0.22;
const BASE = 48;

interface Area {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/**
 * A thumb stick (PLAN §6 "Input"): it appears where the thumb lands and follows it. It lies under
 * every other piece of UI, so a tap on a button or the chat never starts it.
 */
export class Joystick {
  private readonly scene: Phaser.Scene;
  private readonly root: Phaser.GameObjects.Container;
  private readonly knob: Phaser.GameObjects.Image;
  private readonly zone: Phaser.GameObjects.Zone;
  private readonly area: () => Area;
  private readonly onChange: (v: { x: number; y: number } | undefined) => void;
  private pointerId: number | undefined;
  private origin = { x: 0, y: 0 };

  /** `onChange` gets the push past the deadzone, 0 to 1 in length, and `undefined` on release. */
  constructor(
    scene: Phaser.Scene,
    area: () => Area,
    onChange: (v: { x: number; y: number } | undefined) => void,
  ) {
    this.scene = scene;
    this.onChange = onChange;
    // Two thumbs: the stick and a button at once.
    scene.input.addPointer(2);
    this.root = scene.add.container(0, 0).setDepth(5).setVisible(false).setAlpha(0);
    const base = scene.add.image(0, 0, "ui", "stick-base/idle").setOrigin(0.5);
    this.knob = scene.add.image(0, 0, "ui", "stick-knob/idle").setOrigin(0.5);
    this.root.add([base, this.knob]);
    this.area = area;
    const a = area();
    this.zone = scene.add.zone(a.x, a.y, a.w, a.h).setOrigin(0).setDepth(0);
    this.zone.setInteractive();
    this.zone.on("pointerdown", (p: Phaser.Input.Pointer) => this.start(p));
    scene.input.on(Phaser.Input.Events.POINTER_MOVE, this.move, this);
    scene.input.on(Phaser.Input.Events.POINTER_UP, this.end, this);
    scene.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.end, this);
  }

  /** Fits the touch area to the screen again, after it changed size. */
  layout(): void {
    const a = this.area();
    this.zone.setPosition(a.x, a.y).setSize(a.w, a.h);
  }

  /** Off, the area takes no touches and a held stick lets go. */
  setEnabled(on: boolean): void {
    if (this.zone.input) this.zone.input.enabled = on;
    if (!on && this.pointerId !== undefined) this.release();
  }

  destroy(): void {
    if (this.pointerId !== undefined) this.release();
    this.scene.input.off(Phaser.Input.Events.POINTER_MOVE, this.move, this);
    this.scene.input.off(Phaser.Input.Events.POINTER_UP, this.end, this);
    this.scene.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.end, this);
    this.root.destroy();
    this.zone.destroy();
  }

  private start(p: Phaser.Input.Pointer): void {
    if (this.pointerId !== undefined) return;
    this.pointerId = p.id;
    const half = BASE / 2;
    this.origin = {
      x: Phaser.Math.Clamp(Math.round(p.x), half + 2, screen.w - half - 2),
      y: Phaser.Math.Clamp(Math.round(p.y), half + 2, screen.h - half - 2),
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
    // The stick's own deadzone: a resting thumb wobbles, and the wire takes any push at all.
    const reach = (d * k) / REACH;
    const scale =
      reach < DEADZONE ? 0 : (reach - DEADZONE) / (1 - DEADZONE) / Math.max(reach, 1e-6);
    this.onChange({ x: ((dx * k) / REACH) * scale, y: ((dy * k) / REACH) * scale });
  }

  private end(p: Phaser.Input.Pointer): void {
    if (p.id !== this.pointerId) return;
    this.release();
  }

  private release(): void {
    this.pointerId = undefined;
    this.onChange(undefined);
    this.knob.setFrame("stick-knob/idle").setPosition(0, 0);
    this.scene.tweens.add({
      targets: this.root,
      alpha: 0,
      duration: 120,
      onComplete: () => this.root.setVisible(false),
    });
  }
}

/** The left thumb's stick: it writes the same move the keys do. */
export function moveStick(scene: Phaser.Scene): Joystick {
  const area = () => ({ x: 0, y: 40, w: Math.round(screen.w * 0.48), h: screen.h - 40 });
  return new Joystick(scene, area, (v) => {
    stick.active = v !== undefined;
    stick.x = v?.x ?? 0;
    stick.y = v?.y ?? 0;
  });
}

/**
 * The right thumb's aim (PLAN §6: auto-aim, a drag on the right side overrides it). Below the
 * map, and under the fan and buttons, which take their own taps first.
 */
export function aimStick(
  scene: Phaser.Scene,
  aim: (dir: { x: number; y: number } | undefined) => void,
): Joystick {
  const area = () => {
    const x = Math.round(screen.w * 0.52);
    return { x, y: 90, w: screen.w - x, h: screen.h - 90 };
  };
  return new Joystick(scene, area, (v) => aim(v && (v.x !== 0 || v.y !== 0) ? v : undefined));
}

/** Whether this screen is driven by thumbs. */
export function touchScreen(): boolean {
  return window.matchMedia?.("(pointer: coarse)").matches ?? navigator.maxTouchPoints > 0;
}
