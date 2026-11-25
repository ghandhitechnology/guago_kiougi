import type * as Phaser from "phaser";
import type { NavKey, Rect } from "./focus.ts";
import { sound } from "./sound.ts";
import { ink, Label } from "./text.ts";
import { paint, sliceOf } from "./theme.ts";
import { type Ctx, Widget } from "./widget.ts";

export interface Tab {
  readonly id: string;
  readonly label?: string;
  /** A `ui` atlas frame, such as a class emblem. */
  readonly icon?: string;
}

export interface TabRowOptions {
  readonly tabs: readonly Tab[];
  readonly selected?: string;
  /** Height of the open tab; closed tabs stand two pixels lower. */
  readonly h?: number;
  /** Fixed width per tab; otherwise each fits its content. */
  readonly tabW?: number;
  readonly onChange: (id: string) => void;
  /** The pointer came onto a tab (with its bounds on screen) or left them all. */
  readonly onHover?: (id: string | undefined, at: Rect | undefined) => void;
}

interface Built {
  readonly tab: Tab;
  readonly x: number;
  readonly w: number;
  readonly back: Phaser.GameObjects.NineSlice;
  readonly label: Label | undefined;
  readonly icon: Phaser.GameObjects.Image | undefined;
}

/**
 * Index tabs along the top edge of a well. The open tab is the well's own paper and stands
 * tallest; left and right walk along them, and the open tab follows.
 */
export class TabRow extends Widget {
  private readonly opts: TabRowOptions;
  private readonly built: Built[] = [];
  private readonly tabH: number;
  private readonly underline: Phaser.GameObjects.Rectangle;
  private current: string;
  private hover: string | undefined;

  constructor(ctx: Ctx, x: number, y: number, opts: TabRowOptions) {
    const h = opts.h ?? 17;
    const widths = opts.tabs.map((t) => {
      if (opts.tabW) return opts.tabW;
      const text = t.label ? new Label(ctx.scene, 0, 0, t.label, { font: "galmuri9" }) : undefined;
      const w = (text?.width ?? 16) + 12;
      text?.obj.destroy();
      return w;
    });
    const total = widths.reduce((a, b) => a + b + 1, -1);
    super(ctx, x, y, total, h, 2);
    this.opts = opts;
    this.tabH = h;
    this.current = opts.selected ?? opts.tabs[0]?.id ?? "";
    const [l, r, t, b] = sliceOf("tab");
    let tx = 0;
    opts.tabs.forEach((tab, i) => {
      const w = widths[i] ?? 16;
      const back = ctx.scene.add.nineslice(tx, 0, "ui", "tab/idle", w, h, l, r, t, b).setOrigin(0);
      this.add(back);
      let label: Label | undefined;
      let icon: Phaser.GameObjects.Image | undefined;
      if (tab.icon) {
        icon = ctx.scene.add.image(tx + Math.floor((w - 16) / 2), 0, "ui", tab.icon).setOrigin(0);
        this.add(icon);
      }
      if (tab.label) {
        label = new Label(ctx.scene, tx + 6, 0, tab.label, { font: "galmuri9" });
        this.add(label.obj);
      }
      const zone = ctx.scene.add
        .zone(tx, -2, w, h + 4)
        .setOrigin(0)
        .setInteractive({
          useHandCursor: true,
        });
      zone.on("pointerover", () => {
        this.hover = tab.id;
        this.paint();
        const b = zone.getBounds();
        opts.onHover?.(tab.id, { x: b.x, y: b.y, w: b.width, h: b.height });
      });
      zone.on("pointerout", () => {
        if (this.hover === tab.id) this.hover = undefined;
        this.paint();
        opts.onHover?.(undefined, undefined);
      });
      zone.on("pointerup", () => this.select(tab.id));
      this.add(zone);
      this.built.push({ tab, x: tx, w, back, label, icon });
      tx += w + 1;
    });
    this.zone.disableInteractive();
    this.underline = ctx.scene.add.rectangle(0, 0, 1, 1, paint("red.mid")).setOrigin(0);
    this.add(this.underline);
    this.paint();
  }

  get selected(): string {
    return this.current;
  }

  select(id: string, quiet = false): void {
    if (id === this.current) return;
    this.current = id;
    if (!quiet) sound("tab");
    this.paint(true);
    this.opts.onChange(id);
  }

  override nav(key: NavKey): boolean {
    if (key !== "left" && key !== "right") return false;
    const i = this.opts.tabs.findIndex((t) => t.id === this.current);
    const next = this.opts.tabs[i + (key === "left" ? -1 : 1)];
    if (next) this.select(next.id);
    return true;
  }

  override activate(): void {}

  protected fire(): void {}

  protected refresh(): void {
    this.paint();
  }

  private paint(rise = false): void {
    const m = ink("galmuri9");
    for (const b of this.built) {
      const open = b.tab.id === this.current;
      const lit = !open && b.tab.id === this.hover;
      b.back.setFrame(open ? "tab/open" : lit ? "tab/hover" : "tab/idle");
      // Closed tabs start two rows lower in their art; the content follows.
      const top = open ? 0 : 2;
      const inner = this.tabH - top - 2;
      b.label?.at(b.x + 6, top + Math.floor((inner - m.height) / 2) + 1);
      b.label?.color(open ? "ink.dark" : "stone.dark");
      if (b.icon) {
        b.icon.setY(top + Math.floor((inner - 16) / 2) + 1);
        if (open && rise) {
          b.icon.y += 2;
          this.scene.tweens.add({
            targets: b.icon,
            y: b.icon.y - 2,
            duration: 90,
            ease: "Quad.Out",
          });
        }
      }
    }
    // Keyboard focus: the open tab's label is underlined in red pen.
    const shown = this.built.find((b) => b.tab.id === this.current);
    this.underline.setVisible(this.focused && shown !== undefined);
    if (shown) this.underline.setPosition(shown.x + 4, this.tabH - 4).setSize(shown.w - 8, 1);
  }
}
