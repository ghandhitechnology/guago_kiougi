import * as Phaser from "phaser";
import type { NavKey } from "./focus.ts";
import { Highlighter } from "./marks.ts";
import { sound } from "./sound.ts";
import { ink, Label } from "./text.ts";
import { sliceOf } from "./theme.ts";
import { type Ctx, Widget } from "./widget.ts";

export interface SliderOptions {
  readonly label: string;
  /** Width of the groove. */
  readonly w: number;
  /** Width the label column takes before the groove. */
  readonly labelW: number;
  readonly value: number;
  readonly onChange: (value: number) => void;
}

const ROW = 17;
const STEP = 0.1;

/**
 * A slider from the kit: a groove, a navy fill and a paper knob that lifts while held. Drag it,
 * click along the groove, or press left and right.
 */
export class Slider extends Widget {
  private readonly opts: SliderOptions;
  private readonly fill: Phaser.GameObjects.NineSlice;
  private readonly knob: Phaser.GameObjects.Image;
  private readonly marker: Highlighter;
  private readonly text: Label;
  private readonly x0: number;
  private v: number;
  private lastTick = 0;

  constructor(ctx: Ctx, x: number, y: number, opts: SliderOptions) {
    super(ctx, x, y, opts.labelW + opts.w + 4, ROW);
    this.opts = opts;
    this.v = opts.value;
    const scene = ctx.scene;
    this.x0 = opts.labelW;
    this.marker = new Highlighter(scene);
    this.text = new Label(scene, 1, Math.floor((ROW - ink("galmuri11").height) / 2), opts.label, {
      font: "galmuri11",
      color: "ink.dark",
    });
    this.marker.box(-1, 2, this.text.width + 4, ROW - 4);
    const [tl, tr, tt, tb] = sliceOf("slider-track");
    const [fl, fr, ft, fb] = sliceOf("slider-fill");
    const gy = Math.floor((ROW - 5) / 2);
    const track = scene.add
      .nineslice(this.x0, gy, "ui", "slider-track/idle", opts.w, 5, tl, tr, tt, tb)
      .setOrigin(0);
    this.fill = scene.add
      .nineslice(this.x0 + 1, gy + 1, "ui", "slider-fill/idle", 3, 3, fl, fr, ft, fb)
      .setOrigin(0);
    this.knob = scene.add.image(this.x0, gy - 3, "ui", "slider-knob/idle").setOrigin(0);
    this.add([this.marker.gfx, this.text.obj, track, this.fill, this.knob]);
    this.zone.setInteractive({ draggable: true, useHandCursor: true });
    this.zone.on("drag", (p: Phaser.Input.Pointer) => this.fromPointer(p));
    this.zone.on("dragend", () => this.knob.setFrame("slider-knob/idle"));
    this.draw();
  }

  get value(): number {
    return this.v;
  }

  protected override down(pointer?: Phaser.Input.Pointer): void {
    if (pointer) this.fromPointer(pointer);
    this.knob.setFrame("slider-knob/held");
  }

  protected override up(): void {
    this.knob.setFrame("slider-knob/idle");
  }

  override activate(): void {}

  protected fire(): void {}

  override nav(key: NavKey): boolean {
    if (key !== "left" && key !== "right") return false;
    this.set(this.v + (key === "right" ? STEP : -STEP));
    return true;
  }

  protected refresh(): void {
    if (this.focused && this.isEnabled) this.marker.show(90);
    else this.marker.hide(60);
  }

  private fromPointer(p: Phaser.Input.Pointer): void {
    const m = this.getWorldTransformMatrix();
    const local = (p.x - m.tx) / m.scaleX - this.x0 - 3;
    this.set(local / (this.opts.w - 7));
  }

  private set(v: number): void {
    const next = Math.round(Phaser.Math.Clamp(v, 0, 1) * 20) / 20;
    if (next === this.v) return;
    this.v = next;
    this.draw();
    this.opts.onChange(next);
    // A tick of sound while it moves, never a buzz.
    const now = this.scene.time.now;
    if (now - this.lastTick > 70) {
      this.lastTick = now;
      sound("hover");
    }
  }

  private draw(): void {
    const reach = this.opts.w - 7;
    const kx = Math.round(this.v * reach);
    this.knob.setX(this.x0 + kx);
    this.fill.setSize(Math.max(0, kx + 2), 3).setVisible(kx > 0);
  }
}
