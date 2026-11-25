import * as Phaser from "phaser";
import type { Rect } from "./focus.ts";
import { layDown, pickUp, type Rest } from "./motion.ts";
import type { ToastSpot } from "./overlay.ts";
import { sound } from "./sound.ts";
import { Label } from "./text.ts";
import { sliceOf } from "./theme.ts";
import { type Ctx, Widget } from "./widget.ts";

export interface PanelOptions {
  /** Written on the name label stuck to the cover. */
  readonly title?: string;
  /** Shows the close cross on the cover. */
  readonly onClose?: () => void;
  /** `panel` has a cover band for the title; `dialog` a thin cover all round. */
  readonly kind?: "panel" | "dialog";
}

/** The cross on a cover band. */
class CloseButton extends Widget {
  readonly late = true;
  private readonly img: Phaser.GameObjects.Image;
  private readonly onPress: () => void;

  constructor(ctx: Ctx, x: number, y: number, onPress: () => void) {
    super(ctx, x, y, 11, 11, 6);
    this.onPress = onPress;
    this.img = ctx.scene.add.image(0, 0, "ui", "close/idle").setOrigin(0);
    this.add(this.img);
  }

  protected override down(): void {
    this.img.setFrame("close/pressed").setY(1);
  }

  protected override up(): void {
    this.img.setY(0);
    this.refresh();
  }

  protected fire(): void {
    sound("close");
    this.onPress();
  }

  protected refresh(): void {
    if (!this.pressed) this.img.setFrame(this.focused ? "close/hover" : "close/idle");
  }
}

/**
 * A page of the 0조 연구노트 on its navy cover. Content goes on the page (`page`, in the
 * panel's own coordinates). It is laid down when opened and picked up when closed.
 */
export class Panel extends Phaser.GameObjects.Container {
  readonly page: Rect;
  readonly rest: Rest;
  private readonly onClose: (() => void) | undefined;
  /** The free stretch of the cover band, between the name label and the close cross. */
  private readonly band: { l: number; r: number; bottom: number };

  constructor(ctx: Ctx, x: number, y: number, w: number, h: number, opts: PanelOptions = {}) {
    super(ctx.scene, Math.round(x), Math.round(y));
    ctx.scene.add.existing(this);
    this.rest = { x: this.x, y: this.y };
    this.onClose = opts.onClose;
    const kind = opts.kind ?? "panel";
    const [l, r, t, b] = sliceOf(kind);
    const cover = ctx.scene.add.nineslice(0, 0, "ui", `${kind}/idle`, w, h, l, r, t, b);
    cover.setOrigin(0);
    // Swallows clicks on the paper so nothing under the panel reacts.
    cover.setInteractive();
    this.add(cover);
    this.page =
      kind === "panel"
        ? { x: 7, y: 19, w: w - 11, h: h - 23 }
        : { x: 7, y: 5, w: w - 11, h: h - 9 };
    let bandL = 4;

    if (opts.title && kind === "panel") {
      const title = new Label(ctx.scene, 0, 0, opts.title, { font: "galmuri11-bold" });
      const [ll, lr, lt, lb] = sliceOf("label");
      const tag = ctx.scene.add
        .nineslice(10, 2, "ui", "label/idle", title.width + 12, 15, ll, lr, lt, lb)
        .setOrigin(0);
      title.at(16, 4);
      this.add([tag, title.obj]);
      bandL = 10 + tag.width + 4;
    }
    if (opts.onClose && kind === "panel") {
      this.add(new CloseButton(ctx, w - 17, 4, opts.onClose));
    }
    const bandR = opts.onClose && kind === "panel" ? w - 21 : w - 4;
    this.band = { l: bandL, r: bandR, bottom: kind === "panel" ? 20 : 4 };
    this.setVisible(false);
  }

  /**
   * Where toasts land while this panel is open (`holdToasts`): standing on its cover band,
   * between the name label and the cross, so they cover none of the page's controls.
   */
  toastSpot(): ToastSpot {
    const { l, r, bottom } = this.band;
    return { x: this.rest.x + (l + r) / 2, w: r - l, bottom: this.rest.y + bottom };
  }

  /** The panel's close action, for Escape. */
  closePanel(): void {
    this.onClose?.();
  }

  open(done?: () => void): this {
    sound("open");
    layDown(this, this.rest, done);
    return this;
  }

  hide(done?: () => void): this {
    sound("close");
    pickUp(this, this.rest, done);
    return this;
  }

  /** Shown at rest with no motion, for screens that build already open. */
  place(): this {
    this.setVisible(true).setAlpha(1).setScale(1).setPosition(this.rest.x, this.rest.y);
    return this;
  }
}
