import type * as Phaser from "phaser";
import { Highlighter } from "./marks.ts";
import { sound } from "./sound.ts";
import { ink, Label } from "./text.ts";
import type { FontKey } from "./theme.ts";
import { type Ctx, Widget } from "./widget.ts";

export interface CheckboxOptions {
  readonly label: string;
  readonly font?: FontKey;
  readonly checked?: boolean;
  readonly onChange?: (checked: boolean) => void;
}

const BOX = 12;
const ROW = 16;

/** An answer box ticked in red pen; the tick draws itself from its foot to its tail. */
export class Checkbox extends Widget {
  private readonly tick: Phaser.GameObjects.Image;
  private readonly marker: Highlighter;
  private readonly text: Label;
  private readonly opts: CheckboxOptions;
  private value: boolean;
  private drawn = 0;
  private tween: Phaser.Tweens.Tween | undefined;

  constructor(ctx: Ctx, x: number, y: number, opts: CheckboxOptions) {
    const font = opts.font ?? "galmuri11";
    const text = new Label(ctx.scene, 0, 0, opts.label, { font, color: "ink.dark" });
    super(ctx, x, y, BOX + 4 + text.width + 2, ROW);
    this.opts = opts;
    this.value = opts.checked ?? false;
    const scene = ctx.scene;
    const boxY = Math.floor((ROW - BOX) / 2);
    const base = scene.add.image(0, boxY, "ui", "check/off").setOrigin(0);
    this.tick = scene.add.image(0, boxY, "ui", "check/on").setOrigin(0);
    this.marker = new Highlighter(scene).box(BOX + 2, 1, text.width + 4, ROW - 2);
    const m = ink(font);
    text.at(BOX + 4, Math.floor((ROW - m.height) / 2));
    this.text = text;
    this.add([base, this.tick, this.marker.gfx, text.obj]);
    this.show(this.value ? 1 : 0);
    this.refresh();
  }

  get checked(): boolean {
    return this.value;
  }

  set checked(on: boolean) {
    this.value = on;
    this.draw(on);
  }

  protected fire(): void {
    this.value = !this.value;
    sound(this.value ? "select" : "close");
    this.draw(this.value);
    this.opts.onChange?.(this.value);
  }

  protected refresh(): void {
    if (this.focused && this.isEnabled) this.marker.show(90);
    else this.marker.hide(60);
    this.text.color(this.isEnabled ? "ink.dark" : "stone.dark");
  }

  private draw(on: boolean): void {
    this.tween?.stop();
    const state = { p: this.drawn };
    this.tween = this.scene.tweens.add({
      targets: state,
      p: on ? 1 : 0,
      duration: on ? 140 : 70,
      ease: "Quad.Out",
      onUpdate: () => this.show(state.p),
    });
  }

  /** Reveals the tick from the left: it is drawn bottom left to top right. */
  private show(p: number): void {
    this.drawn = p;
    this.tick.setCrop(0, 0, Math.round(BOX * p), BOX);
    this.tick.setVisible(p > 0);
  }
}
