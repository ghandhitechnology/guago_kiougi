import type { NavKey } from "../ui/focus.ts";
import { Highlighter } from "../ui/marks.ts";
import { sound } from "../ui/sound.ts";
import { Label } from "../ui/text.ts";
import { type Ctx, Widget } from "../ui/widget.ts";

/**
 * Section words at the head of a page, like headings written in a notebook: the open one is in
 * ink with a highlighter pass, the others in pencil. Left and right walk along them.
 */
export class Segments extends Widget {
  private readonly items: { id: string; label: Label; mark: Highlighter; x: number }[] = [];
  private current: string;
  private readonly onChange: (id: string) => void;

  constructor(
    ctx: Ctx,
    x: number,
    y: number,
    opts: {
      items: readonly { id: string; label: string }[];
      selected: string;
      onChange(id: string): void;
    },
  ) {
    const probes = opts.items.map(
      (i) => new Label(ctx.scene, 0, 0, i.label, { font: "galmuri11-bold" }),
    );
    const widths = probes.map((p) => p.width);
    for (const p of probes) p.obj.destroy();
    const gap = 12;
    const w = widths.reduce((a, b) => a + b + gap, -gap);
    super(ctx, x, y, w, 14, 3);
    this.current = opts.selected;
    this.onChange = opts.onChange;
    this.zone.disableInteractive();
    let ix = 0;
    opts.items.forEach((item, i) => {
      const iw = widths[i] ?? 0;
      const mark = new Highlighter(ctx.scene).box(ix - 2, 3, iw + 4, 9);
      const label = new Label(ctx.scene, ix, 2, item.label, { font: "galmuri11-bold" });
      const zone = ctx.scene.add
        .zone(ix - 4, -3, iw + 8, 20)
        .setOrigin(0)
        .setInteractive({
          useHandCursor: true,
        });
      zone.on("pointerup", () => this.select(item.id));
      this.add([mark.gfx, label.obj, zone]);
      this.items.push({ id: item.id, label, mark, x: ix });
      ix += iw + gap;
    });
    this.paint(false);
  }

  get selected(): string {
    return this.current;
  }

  select(id: string): void {
    if (id === this.current) return;
    this.current = id;
    sound("tab");
    this.paint(true);
    this.onChange(id);
  }

  override nav(key: NavKey): boolean {
    if (key !== "left" && key !== "right") return false;
    const i = this.items.findIndex((it) => it.id === this.current);
    const next = this.items[i + (key === "left" ? -1 : 1)];
    if (next) this.select(next.id);
    return true;
  }

  override activate(): void {}

  protected fire(): void {}

  protected refresh(): void {
    this.paint(false);
  }

  private paint(animate: boolean): void {
    for (const it of this.items) {
      const on = it.id === this.current;
      it.label.color(on ? "ink.dark" : "stone.dark");
      if (on) it.mark.show(animate ? 140 : 0);
      else it.mark.hide(animate ? 60 : 0);
    }
  }
}
