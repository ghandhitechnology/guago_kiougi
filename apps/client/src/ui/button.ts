import type * as Phaser from "phaser";
import { Highlighter } from "./marks.ts";
import { sound } from "./sound.ts";
import { ink, Label } from "./text.ts";
import { type FontKey, sliceOf } from "./theme.ts";
import { type Ctx, Widget } from "./widget.ts";

export type ButtonKind = "paper" | "ink" | "text";

export interface ButtonOptions {
  readonly kind?: ButtonKind;
  readonly label?: string;
  /** An atlas frame drawn on the cap instead of, or before, the label. */
  readonly icon?: string;
  readonly font?: FontKey;
  readonly w?: number;
  readonly h?: number;
  readonly onPress: () => void;
  /** The sound of pressing it; `select` by default. */
  readonly sound?: "select" | "confirm" | "close" | "tab";
}

const ATLAS = "ui";

/**
 * A keycap on the page. Paper caps take a highlighter pass on focus, ink caps light up; both
 * sink two pixels when pressed. A `text` button is a word on the page that gets underlined.
 */
export class Button extends Widget {
  private readonly kind: ButtonKind;
  private readonly cap: Phaser.GameObjects.NineSlice | undefined;
  private readonly marker: Highlighter | undefined;
  private readonly label: Label | undefined;
  private readonly icon: Phaser.GameObjects.Image | undefined;
  private readonly opts: ButtonOptions;
  private readonly rest: { label: number; icon: number };

  constructor(ctx: Ctx, x: number, y: number, opts: ButtonOptions) {
    const kind = opts.kind ?? "paper";
    const font = opts.font ?? (kind === "text" ? "galmuri9" : "galmuri11-bold");
    const probe = opts.label ? new Label(ctx.scene, 0, 0, opts.label, { font }) : undefined;
    const iconW = opts.icon ? (ctx.scene.textures.getFrame(ATLAS, opts.icon)?.width ?? 0) : 0;
    const gap = opts.icon && probe ? 4 : 0;
    const content = (probe?.width ?? 0) + iconW + gap;
    const w = opts.w ?? content + (kind === "text" ? 2 : 20);
    const h = opts.h ?? (kind === "text" ? 13 : 21);
    super(ctx, x, y, w, h);
    this.kind = kind;
    this.opts = opts;

    const sprite = kind === "ink" ? "btn-ink" : "btn";
    if (kind !== "text") {
      const [l, r, t, b] = sliceOf(sprite);
      this.cap = ctx.scene.add
        .nineslice(0, 0, ATLAS, `${sprite}/idle`, w, h, l, r, t, b)
        .setOrigin(0);
      this.add(this.cap);
    }
    if (kind !== "ink") {
      this.marker = new Highlighter(ctx.scene);
      if (kind === "paper") this.marker.box(1, 1, w - 2, h - 5);
      else this.marker.box(-1, 0, w + 2, h);
      this.add(this.marker.gfx);
    }

    // Content centred on the face: rows 1 to h - 4 of a cap.
    const faceTop = kind === "text" ? 0 : 1;
    const faceH = kind === "text" ? h : h - 5;
    let cx = Math.floor((w - content) / 2);
    if (opts.icon) {
      const f = ctx.scene.textures.getFrame(ATLAS, opts.icon);
      const iy = faceTop + Math.floor((faceH - (f?.height ?? 0)) / 2);
      this.icon = ctx.scene.add.image(cx, iy, ATLAS, opts.icon).setOrigin(0);
      this.add(this.icon);
      cx += iconW + gap;
    }
    if (probe) {
      const m = ink(font);
      const ly = faceTop + Math.floor((faceH - m.height) / 2);
      probe.at(cx, ly);
      this.label = probe;
      this.add(probe.obj);
    }
    this.rest = { label: this.label?.obj.y ?? 0, icon: this.icon?.y ?? 0 };
    this.refresh();
  }

  setText(text: string): this {
    this.label?.set(text);
    return this;
  }

  protected override down(): void {
    if (this.cap) this.cap.setFrame(`${this.sprite()}/pressed`);
    const dy = this.kind === "text" ? 1 : 2;
    if (this.label) this.label.obj.y = this.rest.label + dy;
    if (this.icon) this.icon.y = this.rest.icon + dy;
    this.marker?.gfx.setY(this.kind === "paper" ? 3 : 1);
  }

  protected override up(): void {
    if (this.label) this.label.obj.y = this.rest.label;
    if (this.icon) this.icon.y = this.rest.icon;
    this.marker?.gfx.setY(this.kind === "paper" ? 1 : 0);
    this.refresh();
  }

  protected fire(): void {
    sound(this.opts.sound ?? "select");
    this.opts.onPress();
  }

  private sprite(): string {
    return this.kind === "ink" ? "btn-ink" : "btn";
  }

  protected refresh(): void {
    const on = this.isEnabled;
    if (this.cap && !this.pressed) {
      const state = !on ? "disabled" : this.focused && this.kind === "ink" ? "hover" : "idle";
      this.cap.setFrame(`${this.sprite()}/${state}`);
    }
    const color = !on
      ? "stone.dark"
      : this.kind === "ink"
        ? "stone.bright"
        : this.kind === "text"
          ? this.focused
            ? "ink.dark"
            : "navy.mid"
          : "ink.dark";
    this.label?.color(color);
    this.icon?.setAlpha(on ? 1 : 0.5);
    if (this.marker) {
      if (this.focused && on) this.marker.show(90);
      else this.marker.hide(60);
    }
  }
}
