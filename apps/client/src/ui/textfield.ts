import * as Phaser from "phaser";
import { fieldBlurred, fieldFocused } from "./keyboard-room.ts";
import { Highlighter } from "./marks.ts";
import { shake } from "./motion.ts";
import { sound } from "./sound.ts";
import { ink, Label, measure } from "./text.ts";
import { type FontKey, paint, sliceOf } from "./theme.ts";
import { type Ctx, shown, Widget } from "./widget.ts";

export interface TextFieldOptions {
  /** Written above the box, and highlighted while the box has focus. */
  readonly label?: string;
  readonly w: number;
  readonly h?: number;
  readonly password?: boolean;
  readonly maxLength?: number;
  /** `username`, `current-password`, `new-password`, or `off`. */
  readonly autocomplete?: string;
  readonly enterKeyHint?: "next" | "go" | "done";
  readonly onChange?: (value: string) => void;
  /** Enter in the box. */
  readonly onSubmit?: () => void;
}

const FONT: FontKey = "galmuri11";
const LABEL_FONT: FontKey = "galmuri9";
/** Space the label takes above the box. */
export const FIELD_LABEL_H = 13;
const PAD_X = 5;

/**
 * An answer box. The real typing happens in a transparent DOM input laid exactly over it, so
 * phones open their keyboard on a tap and Korean IME composition works everywhere; the box
 * draws the value in the bitmap font with a pixel caret, and dots for a password.
 */
export class TextField extends Widget {
  readonly field: HTMLInputElement;
  private readonly opts: TextFieldOptions;
  private readonly box: Phaser.GameObjects.NineSlice;
  private readonly text: Label;
  private readonly caret: Phaser.GameObjects.Rectangle;
  private readonly under: Phaser.GameObjects.Rectangle;
  private readonly title: Label | undefined;
  private readonly marker: Highlighter | undefined;
  private readonly boxY: number;
  private composing: { from: number } | undefined;
  private blink = 0;

  constructor(ctx: Ctx, x: number, y: number, opts: TextFieldOptions) {
    const h = opts.h ?? 20;
    const top = opts.label ? FIELD_LABEL_H : 0;
    super(ctx, x, y, opts.w, h + top);
    this.opts = opts;
    this.boxY = top;
    const scene = ctx.scene;

    if (opts.label) {
      this.marker = new Highlighter(scene);
      this.title = new Label(scene, 1, 1, opts.label, { font: LABEL_FONT, color: "stone.dark" });
      this.marker.box(-1, -1, this.title.width + 3, 11);
      this.add([this.marker.gfx, this.title.obj]);
    }
    const [l, r, t, b] = sliceOf("inset");
    this.box = scene.add.nineslice(0, top, "ui", "inset/idle", opts.w, h, l, r, t, b).setOrigin(0);
    const m = ink(FONT);
    const textY = top + Math.floor((h - m.height) / 2) + 1;
    this.text = new Label(scene, PAD_X, textY, "", { font: FONT, color: "ink.dark" });
    this.caret = scene.add
      .rectangle(PAD_X, textY - 1, 1, m.height + 2, paint("ink.dark"))
      .setOrigin(0)
      .setVisible(false);
    this.under = scene.add
      .rectangle(PAD_X, textY + m.height + 1, 0, 1, paint("navy.mid"))
      .setOrigin(0)
      .setVisible(false);
    this.add([this.box, this.text.obj, this.under, this.caret]);

    this.field = this.makeInput();
    scene.events.on(Phaser.Scenes.Events.POST_UPDATE, this.track, this);
    this.once(Phaser.GameObjects.Events.DESTROY, () => {
      scene.events.off(Phaser.Scenes.Events.POST_UPDATE, this.track, this);
      this.field.remove();
    });
    this.refresh();
  }

  get value(): string {
    return this.field.value;
  }

  set value(v: string) {
    this.field.value = v;
    this.draw();
  }

  /** A wrong answer: the box shakes and keeps focus. */
  reject(): void {
    shake(this.box, { x: 0, y: this.boxY });
  }

  override activate(): void {
    if (this.opts.onSubmit) this.opts.onSubmit();
  }

  protected fire(): void {}

  protected override down(): void {
    this.focusField();
  }

  protected refresh(): void {
    const on = this.focused && this.isEnabled;
    if (this.marker) {
      if (on) this.marker.show(90);
      else this.marker.hide(60);
    }
    this.title?.color(on ? "ink.dark" : "stone.dark");
    this.draw();
  }

  private makeInput(): HTMLInputElement {
    const el = document.createElement("input");
    const o = this.opts;
    el.type = o.password ? "password" : "text";
    el.autocomplete = (o.autocomplete ?? "off") as AutoFill;
    el.spellcheck = false;
    el.setAttribute("autocapitalize", "off");
    el.setAttribute("autocorrect", "off");
    if (o.maxLength) el.maxLength = o.maxLength;
    el.enterKeyHint = o.enterKeyHint ?? "next";
    if (o.autocomplete === "username") el.name = "username";
    if (o.autocomplete?.endsWith("password")) el.name = "password";
    if (o.label) el.setAttribute("aria-label", o.label);
    Object.assign(el.style, {
      position: "fixed",
      left: "0px",
      top: "0px",
      width: "0px",
      height: "0px",
      margin: "0",
      padding: "0",
      border: "0",
      outline: "none",
      opacity: "0",
      // 16 px keeps phones from zooming the page when the box gets focus.
      fontSize: "16px",
      color: "transparent",
      background: "transparent",
      caretColor: "transparent",
      display: "none",
      zIndex: "2",
    } satisfies Partial<CSSStyleDeclaration>);
    el.addEventListener("input", () => {
      this.draw();
      sound("type");
      this.opts.onChange?.(el.value);
    });
    el.addEventListener("focus", () => {
      if (this.ctx.scope.current !== this) this.ctx.scope.focus(this, "pointer");
      this.blink = 0;
      this.draw();
      fieldFocused(el);
    });
    el.addEventListener("blur", () => {
      fieldBlurred(el);
      this.composing = undefined;
      this.draw();
    });
    el.addEventListener("pointerenter", () => {
      if (this.enabled() && this.ctx.scope.current !== this) this.ctx.scope.focus(this, "pointer");
    });
    el.addEventListener("compositionstart", () => {
      this.composing = { from: el.selectionStart ?? el.value.length };
    });
    el.addEventListener("compositionupdate", () => this.draw());
    el.addEventListener("compositionend", () => {
      this.composing = undefined;
      this.draw();
    });
    // The caret moves with the arrow keys and with taps inside the text.
    const onSelect = () => {
      if (document.activeElement === el) this.draw();
    };
    document.addEventListener("selectionchange", onSelect);
    this.once(Phaser.GameObjects.Events.DESTROY, () =>
      document.removeEventListener("selectionchange", onSelect),
    );
    document.body.appendChild(el);
    return el;
  }

  focusField(): void {
    this.track(0, 0);
    this.field.focus({ preventScroll: true });
  }

  /** Keeps the DOM input over the box, and blinks the caret. */
  private track(_time: number, delta: number): void {
    const el = this.field;
    const visible = shown(this) && this.isEnabled;
    if (!visible) {
      if (el.style.display !== "none") {
        if (document.activeElement === el) el.blur();
        el.style.display = "none";
      }
      return;
    }
    const canvas = this.scene.game.canvas;
    const r = canvas.getBoundingClientRect();
    const k = r.width / this.scene.scale.width;
    const m = this.box.getWorldTransformMatrix();
    Object.assign(el.style, {
      display: "block",
      left: `${r.left + m.tx * k}px`,
      top: `${r.top + m.ty * k}px`,
      width: `${this.boxW * k * m.scaleX}px`,
      height: `${(this.boxH - this.boxY) * k * m.scaleY}px`,
    });
    if (document.activeElement === el) {
      this.blink += delta;
      this.caret.setVisible(this.blink % 1000 < 560);
    } else this.caret.setVisible(false);
  }

  /** Draws the value, scrolled so the caret stays inside the box. */
  private draw(): void {
    const el = this.field;
    const shownText = this.opts.password ? "●".repeat(el.value.length) : el.value;
    const chars = [...shownText];
    const caretAt = Math.min(el.selectionStart ?? chars.length, chars.length);
    const room = this.boxW - PAD_X * 2;
    const width = (a: number, b: number) => measure(this.scene, FONT, chars.slice(a, b).join(""));
    // First visible character: as far left as possible while the caret still fits.
    let from = 0;
    while (from < caretAt && width(from, caretAt) > room - 2) from++;
    let to = chars.length;
    while (to > caretAt && width(from, to) > room) to--;
    this.text.set(chars.slice(from, to).join(""));
    const cx = PAD_X + (caretAt > from ? width(from, caretAt) + 1 : 0);
    this.caret.setX(cx);
    this.blink = 0;
    if (this.composing && document.activeElement === el) {
      const a = Math.max(this.composing.from, from);
      const end = Math.min(caretAt, to);
      const x0 = PAD_X + (a > from ? width(from, a) + 1 : 0);
      this.under
        .setVisible(end > a)
        .setX(x0)
        .setSize(Math.max(0, cx - x0 - 1), 1);
    } else this.under.setVisible(false);
  }
}
