import type * as Phaser from "phaser";
import type { NavKey } from "./focus.ts";
import { Highlighter } from "./marks.ts";
import { sound } from "./sound.ts";
import { Label } from "./text.ts";
import { sliceOf } from "./theme.ts";
import { type Ctx, Widget } from "./widget.ts";

/**
 * A quantity on the page: − 3 +. Left and right keys step it, holding a side steps faster, and it
 * stays between `min` and `max` with a dull click at either end.
 *
 * ```ts
 * new Stepper(ctx, x, y, { min: 1, max: 99, value: 1, onChange: (n) => price(n) });
 * ```
 */
export interface StepperOptions {
  readonly min: number;
  readonly max: number;
  readonly value: number;
  readonly onChange: (value: number) => void;
}

const H = 17;
const SIDE = 15;
const MID = 26;

export class Stepper extends Widget {
  private readonly opts: StepperOptions;
  private readonly minus: Phaser.GameObjects.NineSlice;
  private readonly plus: Phaser.GameObjects.NineSlice;
  private readonly text: Label;
  private readonly marker: Highlighter;
  private n: number;
  private max: number;
  private repeat: Phaser.Time.TimerEvent | undefined;

  constructor(ctx: Ctx, x: number, y: number, opts: StepperOptions) {
    super(ctx, x, y, SIDE * 2 + MID, H);
    this.opts = opts;
    this.n = opts.value;
    this.max = opts.max;
    const s = ctx.scene;
    const [l, r, t, b] = sliceOf("btn");
    this.minus = s.add.nineslice(0, 0, "ui", "btn/idle", SIDE, H, l, r, t, b).setOrigin(0);
    this.plus = s.add.nineslice(SIDE + MID, 0, "ui", "btn/idle", SIDE, H, l, r, t, b).setOrigin(0);
    const [il, ir, it, ib] = sliceOf("inset");
    const well = s.add.nineslice(SIDE, 0, "ui", "inset/idle", MID, H, il, ir, it, ib).setOrigin(0);
    // galmuri11-bold has no U+2212 minus; the en dash is its minus.
    const minusMark = new Label(s, 5, 3, "–", { font: "galmuri11-bold", color: "ink.dark" });
    const plusMark = new Label(s, SIDE + MID + 4, 3, "+", {
      font: "galmuri11-bold",
      color: "ink.dark",
    });
    this.text = new Label(s, 0, 4, "", { font: "galmuri11", color: "ink.dark" });
    this.marker = new Highlighter(s);
    this.marker.box(SIDE + 1, 1, MID - 2, H - 3);
    this.add([
      well,
      this.marker.gfx,
      this.minus,
      this.plus,
      minusMark.obj,
      plusMark.obj,
      this.text.obj,
    ]);
    this.zone.removeAllListeners("pointerup");
    this.zone.on("pointerdown", (p: Phaser.Input.Pointer) => {
      const side = p.x - this.getWorldTransformMatrix().tx < SIDE + MID / 2 ? -1 : 1;
      this.step(side);
      this.repeat = s.time.addEvent({
        delay: 380,
        callback: () => {
          this.repeat = s.time.addEvent({ delay: 70, loop: true, callback: () => this.step(side) });
        },
      });
    });
    const stop = () => {
      this.repeat?.remove();
      this.repeat = undefined;
    };
    this.zone.on("pointerup", stop);
    this.zone.on("pointerout", stop);
    this.draw();
  }

  get value(): number {
    return this.n;
  }

  /** A new ceiling (what the player can afford), pulling the value down to it. */
  setMax(max: number): void {
    this.max = Math.max(this.opts.min, max);
    if (this.n > this.max) {
      this.n = this.max;
      this.opts.onChange(this.n);
    }
    this.draw();
  }

  override nav(key: NavKey): boolean {
    if (key === "left") this.step(-1);
    else if (key === "right") this.step(1);
    else return false;
    return true;
  }

  private step(by: number): void {
    const next = Math.max(this.opts.min, Math.min(this.max, this.n + by));
    if (next === this.n) {
      sound("error");
      this.repeat?.remove();
      return;
    }
    this.n = next;
    sound("hover");
    this.draw();
    this.opts.onChange(this.n);
  }

  private draw(): void {
    this.text.set(String(this.n));
    this.text.at(SIDE + Math.floor((MID - this.text.width) / 2), 4);
    this.minus.setFrame(this.n <= this.opts.min ? "btn/disabled" : "btn/idle");
    this.plus.setFrame(this.n >= this.max ? "btn/disabled" : "btn/idle");
  }

  protected fire(): void {}

  protected refresh(): void {
    if (this.focused && this.isEnabled) this.marker.show(90);
    else this.marker.hide(60);
  }
}
