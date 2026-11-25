import * as Phaser from "phaser";
import { Button, type ButtonKind } from "./button.ts";
import { FocusScope, popScope, pushScope, type Rect } from "./focus.ts";
import { fade, slide } from "./motion.ts";
import { Panel } from "./panel.ts";
import { screen } from "./screen.ts";
import { sound } from "./sound.ts";
import { Label } from "./text.ts";
import { paint, sliceOf } from "./theme.ts";

/** A sticky note with one line, stuck by its top edge. */
function note(scene: Phaser.Scene, text: string, maxW = 200) {
  const label = new Label(scene, 6, 5, text, { font: "galmuri9", color: "ink.dark", width: maxW });
  const w = label.width + 13;
  const h = label.height + 9;
  const [l, r, t, b] = sliceOf("tooltip");
  const paper = scene.add.nineslice(0, 0, "ui", "tooltip/idle", w, h, l, r, t, b).setOrigin(0);
  const box = scene.add.container(0, 0, [paper, label.obj]);
  return { box, w, h };
}

/** The tooltip of a scene: one sticky note at a time, stuck just above what it explains. */
export class Tooltip {
  private box: Phaser.GameObjects.Container | undefined;
  private timer: Phaser.Time.TimerEvent | undefined;
  private readonly scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /** Shows `text` over `at` after a short hover. */
  show(text: string, at: Rect, delay = 350): void {
    this.hide();
    this.timer = this.scene.time.delayedCall(delay, () => {
      const n = note(this.scene, text);
      const x = Phaser.Math.Clamp(Math.round(at.x + at.w / 2 - n.w / 2), 2, screen.w - n.w - 2);
      const above = at.y - n.h - 3;
      const y = above >= 2 ? above : at.y + at.h + 3;
      n.box
        .setPosition(x, y - 3)
        .setAlpha(0)
        .setDepth(1000);
      slide(n.box, { x, y }, 110);
      fade(n.box, 1, 110);
      this.box = n.box;
    });
  }

  hide(): void {
    this.timer?.remove();
    this.timer = undefined;
    const box = this.box;
    this.box = undefined;
    if (box) fade(box, 0, 70, () => box.destroy());
  }
}

/**
 * Where toasts land while a screen is open: centred on `x`, at most `w` wide, hanging from
 * `top` or standing on `bottom`. Screen pixels.
 */
export interface ToastSpot {
  readonly x: number;
  readonly w: number;
  readonly top?: number;
  readonly bottom?: number;
}

/** Spots held by open screens, the newest last; a function so a moved screen is followed. */
const spots: (() => ToastSpot)[] = [];

function spot(): ToastSpot {
  const held = spots.at(-1);
  return held ? held() : { x: screen.w / 2, w: 313, top: 4 + screen.safe.top };
}

/**
 * Toasts land at `at` instead of the top of the screen until the returned release is called:
 * an open panel keeps them off its own controls. The newest hold wins; a toast on screen moves
 * when the spot changes.
 */
export function holdToasts(at: () => ToastSpot): () => void {
  spots.push(at);
  toaster?.moved();
  return () => {
    const i = spots.indexOf(at);
    if (i < 0) return;
    spots.splice(i, 1);
    toaster?.moved();
  };
}

/**
 * Short notices that drop in from the top of the screen, one after another, to the spot the
 * newest open screen holds (the top of the screen when none does).
 */
export class Toaster {
  private readonly scene: Phaser.Scene;
  private readonly queue: string[] = [];
  private busy = false;
  private shown:
    | { box: Phaser.GameObjects.Container; w: number; h: number; landed: boolean; leaving: boolean }
    | undefined;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  push(text: string): void {
    this.queue.push(text);
    if (this.busy) return;
    this.busy = true;
    // A tick later, so a sheet that toasts and then closes leaves the spot to what is under it.
    this.scene.time.delayedCall(0, () => this.next());
  }

  /** The spot changed: a toast on screen slides to the new one. */
  moved(): void {
    const s = this.shown;
    if (!s || s.leaving) return;
    this.scene.time.delayedCall(0, () => {
      if (this.shown !== s || s.leaving) return;
      slide(s.box, this.rest(s.w, s.h), 160, s.landed ? undefined : () => this.landed(s));
    });
  }

  private rest(w: number, h: number): { x: number; y: number } {
    const at = spot();
    const x = Phaser.Math.Clamp(Math.round(at.x - w / 2), 2, screen.w - w - 2);
    const y = at.top ?? (at.bottom ?? 4 + h) - h;
    return { x, y: Math.max(Math.round(y), 2 + screen.safe.top) };
  }

  private next(): void {
    const text = this.queue.shift();
    if (text === undefined) {
      this.busy = false;
      return;
    }
    const n = note(this.scene, text, Math.min(300, spot().w - 13));
    const s = { box: n.box, w: n.w, h: n.h, landed: false, leaving: false };
    this.shown = s;
    const at = this.rest(n.w, n.h);
    n.box.setPosition(at.x, -n.h - 2).setDepth(2000);
    sound("toast");
    slide(n.box, at, 160, () => this.landed(s));
  }

  private landed(s: NonNullable<Toaster["shown"]>): void {
    s.landed = true;
    this.scene.time.delayedCall(2200, () => {
      s.leaving = true;
      slide(s.box, { x: s.box.x, y: -s.h - 2 }, 140, () => {
        s.box.destroy();
        if (this.shown === s) this.shown = undefined;
        this.next();
      });
    });
  }
}

let toaster: Toaster | undefined;

export function setToaster(t: Toaster | undefined): void {
  toaster = t;
}

/** Shows a short notice, above every scene, where the open screen keeps it off its controls. */
export function toast(text: string): void {
  toaster?.push(text);
}

export interface ModalAction {
  readonly label: string;
  readonly kind?: ButtonKind;
  readonly onPress: () => void;
}

export interface ModalOptions {
  readonly title: string;
  readonly body: string;
  readonly actions: readonly ModalAction[];
  /** Escape and the close cross; closes the modal by default. */
  readonly onBack?: () => void;
  /** After the modal has closed, however it closed. */
  readonly onClosed?: () => void;
  readonly w?: number;
}

/**
 * A notebook page over a dimmed screen. It takes the keyboard while open, and nothing under
 * the dim takes a click.
 */
export class Modal {
  readonly scope = new FocusScope();
  private readonly dim: Phaser.GameObjects.Rectangle;
  private readonly panel: Panel;
  private readonly onClosed: (() => void) | undefined;
  private readonly unhold: () => void;
  private closing = false;

  constructor(scene: Phaser.Scene, opts: ModalOptions) {
    const ctx = { scene, scope: this.scope };
    this.onClosed = opts.onClosed;
    this.dim = scene.add
      .rectangle(0, 0, screen.w, screen.h, paint("ink.deep"))
      .setOrigin(0)
      .setAlpha(0)
      .setDepth(900)
      .setInteractive();
    fade(this.dim, 0.6, 140);
    const w = opts.w ?? 240;
    const back = opts.onBack ?? (() => this.close());
    const probe = new Label(scene, 0, 0, opts.body, { font: "galmuri11", width: w - 30 });
    const h = 19 + 12 + probe.height + 14 + 21 + 12;
    probe.obj.destroy();
    this.panel = new Panel(
      ctx,
      Math.round((screen.w - w) / 2),
      Math.round((screen.h - h) / 2),
      w,
      h,
      {
        title: opts.title,
        onClose: back,
      },
    ).setDepth(901);
    const { page } = this.panel;
    const body = new Label(scene, page.x + 8, page.y + 10, opts.body, {
      font: "galmuri11",
      color: "ink.dark",
      width: page.w - 16,
      leading: 2,
    });
    this.panel.add(body.obj);
    let bx = page.x + page.w - 8;
    const by = page.y + page.h - 8 - 21;
    const buttons = [...opts.actions].reverse().map((a) => {
      const b = new Button(ctx, 0, by, {
        label: a.label,
        kind: a.kind ?? "paper",
        onPress: a.onPress,
        sound: a.kind === "ink" ? "confirm" : "select",
      });
      bx -= b.bounds().w;
      b.setX(bx);
      bx -= 6;
      this.panel.add(b);
      return b;
    });
    this.scope.onBack = back;
    pushScope(this.scope);
    this.unhold = holdToasts(() => this.panel.toastSpot());
    this.panel.open();
    // The last action, drawn rightmost, is the one to keep going with; it takes focus first.
    this.scope.focus(buttons[0]);
  }

  close(done?: () => void): void {
    if (this.closing) return;
    this.closing = true;
    popScope(this.scope);
    this.unhold();
    this.onClosed?.();
    fade(this.dim, 0, 120, () => this.dim.destroy());
    this.panel.hide(() => {
      this.panel.destroy();
      done?.();
    });
  }
}
