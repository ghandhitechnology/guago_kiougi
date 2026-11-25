import { CONTROL_MODES, castFlag, InputFlag, MAX_AIM } from "@guago/shared";
import type * as Phaser from "phaser";

/** Aim is re-sent at most this often, ms, and only when it moved this far, px. */
const AIM_EVERY_MS = 100;
const AIM_STEP = 3;
/** In the modes where books cast themselves, the mouse's aim lapses after this long still, ms. */
const AIM_LAPSE_MS = 2500;
/** Revive is asked again this often while E is held, ms. */
const REVIVE_EVERY_MS = 300;

export interface ControlSink {
  /** The aim offset from the player's feet, or null to let the server aim. */
  aim(dx: number, dy: number, on: boolean): void;
  /** Cycle to `mode`. */
  mode(mode: number): void;
  /** Cast the book in `slot` (0-based). */
  cast(slot: number): void;
  dodge(): void;
  /** Revive whoever is down within reach. */
  revive(): void;
}

/**
 * Desktop controls for the fight (PLAN §6 input): the mouse aims with a reticle, 1 to 6 cast or
 * pick a book, left click casts the picked book, Space rolls, Tab cycles the control mode, E
 * revives. Physical key codes, so the keys stay where they are under a Korean layout. Movement
 * keys stay with the movement code.
 */
export class FightKeys {
  private readonly controller = new AbortController();
  private readonly sink: ControlSink;
  private reviveHeld = false;
  private reviveAt = 0;
  /** The book left click casts. */
  picked = 0;

  constructor(sink: ControlSink, target: Window = window) {
    this.sink = sink;
    const signal = this.controller.signal;
    target.addEventListener(
      "keydown",
      (e) => {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (isTyping(target)) return;
        const digit = /^Digit([1-6])$/.exec(e.code);
        if (digit) {
          e.preventDefault();
          if (e.repeat) return;
          this.picked = Number(digit[1]) - 1;
          sink.cast(this.picked);
          return;
        }
        switch (e.code) {
          case "Space":
            e.preventDefault();
            if (!e.repeat) sink.dodge();
            break;
          case "Tab":
            e.preventDefault();
            if (!e.repeat) sink.mode(-1);
            break;
          case "KeyE":
            this.reviveHeld = true;
            if (!e.repeat) {
              this.reviveAt = 0;
              sink.revive();
            }
            break;
        }
      },
      { signal },
    );
    target.addEventListener(
      "keyup",
      (e) => {
        if (e.code === "KeyE") this.reviveHeld = false;
      },
      { signal },
    );
    target.addEventListener("blur", () => (this.reviveHeld = false), { signal });
  }

  update(now: number): void {
    if (this.reviveHeld && now - this.reviveAt > REVIVE_EVERY_MS) {
      this.reviveAt = now;
      this.sink.revive();
    }
  }

  dispose(): void {
    this.controller.abort();
  }
}

function isTyping(w: Window): boolean {
  const el = w.document.activeElement;
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
}

/** The next control mode after `mode`, in `CONTROL_MODES` order. */
export function nextMode(mode: number): number {
  return (mode + 1) % CONTROL_MODES.length;
}

/**
 * Mouse aim: the pointer's world point relative to the player, sent when it moves enough and
 * dropped (so the server aims again) when the mouse rests in a mode whose books cast themselves.
 */
export class MouseAim {
  private lastSent = 0;
  private sx = 0;
  private sy = 0;
  private on = false;
  private movedAt = -1e9;
  private px = -1;
  private py = -1;
  /** World point under the pointer. */
  x = 0;
  y = 0;
  /** The pointer is over the canvas and was moved recently enough to aim. */
  active = false;
  /** Left button pressed this frame. */
  clicked = false;
  private readonly scene: Phaser.Scene;
  private readonly onDown: (p: Phaser.Input.Pointer) => void;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.onDown = (p) => {
      if (p.leftButtonDown()) this.clicked = true;
      this.movedAt = scene.time.now;
    };
    scene.input.on("pointerdown", this.onDown);
  }

  /** Reads the pointer and sends aim when it changed. `always`: 완전 수동 aims at all times. */
  update(now: number, fromX: number, fromY: number, always: boolean, sink: ControlSink): void {
    const p = this.scene.input.activePointer;
    const cam = this.scene.cameras.main;
    const inside = p.x >= 0 && p.y >= 0 && p.x < cam.width && p.y < cam.height;
    if (p.x !== this.px || p.y !== this.py) {
      this.px = p.x;
      this.py = p.y;
      this.movedAt = now;
    }
    this.x = cam.scrollX + Math.floor(p.x);
    this.y = cam.scrollY + Math.floor(p.y);
    this.active = inside && (always || now - this.movedAt < AIM_LAPSE_MS);
    const dx = Math.max(-MAX_AIM, Math.min(MAX_AIM, Math.round(this.x - fromX)));
    const dy = Math.max(-MAX_AIM, Math.min(MAX_AIM, Math.round(this.y - fromY)));
    if (now - this.lastSent < AIM_EVERY_MS) return;
    if (
      this.active === this.on &&
      (!this.active || Math.hypot(dx - this.sx, dy - this.sy) < AIM_STEP)
    )
      return;
    this.lastSent = now;
    this.on = this.active;
    this.sx = dx;
    this.sy = dy;
    sink.aim(dx, dy, this.active);
  }

  /** Consumes this frame's click. */
  takeClick(): boolean {
    const c = this.clicked;
    this.clicked = false;
    return c;
  }

  dispose(): void {
    this.scene.input.off("pointerdown", this.onDown);
  }
}

/** Flags for the next input: a dodge and at most one cast, taken once. */
export class PendingFlags {
  private flags = 0;

  dodge(): void {
    this.flags |= InputFlag.Dodge;
  }

  cast(slot: number): void {
    this.flags = (this.flags & InputFlag.Dodge) | castFlag(slot);
  }

  take(): number {
    const f = this.flags;
    this.flags = 0;
    return f;
  }
}
