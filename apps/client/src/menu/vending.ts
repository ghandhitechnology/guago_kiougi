import { narrative, type ShopItem, shopPrice, vendingStock, vendingWeek } from "@guago/content";
import * as Phaser from "phaser";
import { refusal } from "../copy/lines.ts";
import { amount, materialGood } from "../items/catalog.ts";
import { cue, sfx } from "../sound/audio.ts";
import { inventory } from "../state/inventory.ts";
import { live } from "../state/live.ts";
import { Button } from "../ui/button.ts";
import { FocusScope, popScope, pushScope } from "../ui/focus.ts";
import { fade, layDown, pickUp, shake } from "../ui/motion.ts";
import { screen } from "../ui/screen.ts";
import { sound } from "../ui/sound.ts";
import { Stepper } from "../ui/stepper.ts";
import { Label, wrap } from "../ui/text.ts";
import { paint } from "../ui/theme.ts";
import { type Ctx, Widget } from "../ui/widget.ts";

/**
 * The 자판기 (PLAN §13): a machine, not a menu. The week's six goods stand behind the glass with
 * their price tags; picking one lights it and its name and price come up on the display, which
 * otherwise shows the 솔방울 held. The button takes the money, and the goods drop into the tray
 * with a clank. Whatever the machine refuses, it says on its display in its own 합쇼체.
 */

const W = 236;
const H = 212;
const GLASS = { x: 10, y: 28, w: 140, h: 150 };

/** One shelf spot behind the glass: the snack, standing on its coil, and its price tag. */
class Shelf extends Widget {
  private readonly ring: Phaser.GameObjects.Rectangle;
  private readonly onPick: () => void;
  constructor(ctx: Ctx, x: number, y: number, item: ShopItem, price: number, onPick: () => void) {
    super(ctx, x, y, 40, 60, 0);
    this.onPick = onPick;
    const s = ctx.scene;
    this.ring = s.add
      .rectangle(-1, -1, 42, 62)
      .setOrigin(0)
      .setStrokeStyle(1, paint("gold.light"))
      .setVisible(false);
    const coil = s.add.rectangle(4, 40, 32, 3, paint("stone.dark")).setOrigin(0);
    const icon = s.add
      .image(20, 22, "ui", materialGood(`snack:${item.id}`).icon)
      .setOrigin(0.5)
      .setScale(2);
    const tag = s.add.rectangle(4, 46, 32, 11, paint("stone.bright")).setOrigin(0);
    const p = new Label(s, 0, 47, amount(price), { font: "galmuri9", color: "ink.dark" });
    p.at(20 - Math.round(p.width / 2), 48);
    this.add([this.ring, coil, icon, tag, p.obj]);
  }
  setLit(on: boolean): void {
    this.ring.setVisible(on);
  }
  protected fire(): void {
    this.onPick();
  }
  protected refresh(): void {
    this.ring.setAlpha(this.focused ? 1 : this.ring.visible ? 1 : 0);
  }
}

export class VendingMachine {
  private readonly scene: Phaser.Scene;
  private readonly onClosed: () => void;
  private readonly onOpened: () => void;
  private root: Phaser.GameObjects.Container | undefined;
  private dim: Phaser.GameObjects.Rectangle | undefined;
  private scope: FocusScope | undefined;
  private display: Phaser.GameObjects.Container | undefined;
  private tray: Phaser.GameObjects.Container | undefined;
  private shelves: Shelf[] = [];
  private stock: readonly ShopItem[] = [];
  private picked = 0;
  private qty = 1;
  private stepper: Stepper | undefined;
  private pending = false;
  private message: { text: string; until: number } | undefined;
  private unwatch: (() => void) | undefined;

  constructor(scene: Phaser.Scene, onOpened: () => void, onClosed: () => void) {
    this.scene = scene;
    this.onOpened = onOpened;
    this.onClosed = onClosed;
  }

  get isOpen(): boolean {
    return this.root !== undefined;
  }

  open(): void {
    if (this.root) return;
    const s = this.scene;
    const scope = new FocusScope();
    const ctx: Ctx = { scene: s, scope };
    this.scope = scope;
    this.dim = s.add
      .rectangle(0, 0, screen.w, screen.h, paint("ink.deep"))
      .setOrigin(0)
      .setAlpha(0)
      .setDepth(850)
      .setInteractive();
    this.dim.on("pointerup", () => this.close());
    fade(this.dim, 0.5, 160);
    const x = Math.round((screen.w - W) / 2);
    const y = Math.round((screen.h - H) / 2);
    const root = s.add.container(x, y).setDepth(851);
    this.root = root;
    // The machine: red body, a darker frame, the lit sign, the glass, the panel and the tray.
    const g = s.add.graphics();
    g.fillStyle(paint("red.deep")).fillRect(0, 0, W, H);
    g.fillStyle(paint("red.mid")).fillRect(2, 2, W - 4, H - 4);
    g.fillStyle(paint("red.light")).fillRect(2, 2, W - 4, 2);
    g.fillStyle(paint("red.dark")).fillRect(2, H - 6, W - 4, 4);
    g.fillStyle(paint("stone.bright")).fillRect(8, 6, W - 16, 16);
    g.fillStyle(paint("navy.dark")).fillRect(GLASS.x, GLASS.y, GLASS.w, GLASS.h);
    g.fillStyle(paint("navy.mid")).fillRect(GLASS.x + 2, GLASS.y + 2, GLASS.w - 4, GLASS.h - 4);
    g.fillStyle(paint("navy.light")).fillRect(GLASS.x + 4, GLASS.y + 4, 2, GLASS.h - 8);
    g.fillStyle(paint("ink.deep")).fillRect(GLASS.x, GLASS.y + GLASS.h + 6, GLASS.w, 20);
    g.fillStyle(paint("ink.dark")).fillRect(GLASS.x + 2, GLASS.y + GLASS.h + 8, GLASS.w - 4, 16);
    root.add(g);
    const desc = narrative.NARRATIVE.descriptions.find((d) => d.id === "vending");
    const sign = new Label(s, 0, 9, desc ? (narrative.NARRATIVE.ko[desc.name] ?? "") : "", {
      font: "galmuri11-bold",
      color: "red.dark",
    });
    sign.at(Math.round((W - sign.width) / 2), 9);
    root.add(sign.obj);
    // This week's goods, the price at the live Page's scale.
    const week = vendingWeek(live.serverNow());
    this.stock = vendingStock(week);
    const page = live.page?.page ?? 1;
    this.shelves = this.stock.map((item, i) => {
      const sh = new Shelf(
        ctx,
        GLASS.x + 8 + (i % 3) * 44,
        GLASS.y + 8 + Math.floor(i / 3) * 70,
        item,
        shopPrice(item, page),
        () => this.pick(i),
      );
      root.add(sh);
      return sh;
    });
    // The panel: the display, the stepper and the big button.
    const px = GLASS.x + GLASS.w + 8;
    g.fillStyle(paint("ink.deep")).fillRect(px, GLASS.y, W - px - 8, 56);
    g.fillStyle(paint("ink.dark")).fillRect(px + 2, GLASS.y + 2, W - px - 12, 52);
    this.display = s.add.container(px + 5, GLASS.y + 5);
    root.add(this.display);
    this.stepper = new Stepper(ctx, px + 4, GLASS.y + 64, {
      min: 1,
      max: 9,
      value: 1,
      onChange: (n) => {
        this.qty = n;
        this.drawDisplay();
      },
    });
    const buy = new Button(ctx, px, GLASS.y + 88, {
      label: "",
      icon: "icon/pinecone",
      kind: "ink",
      w: W - px - 8,
      h: 26,
      sound: "confirm",
      onPress: () => void this.buy(),
    });
    const close = new Button(ctx, W - 18, 6, {
      kind: "text",
      icon: "close/idle",
      sound: "close",
      onPress: () => this.close(),
    });
    this.tray = s.add.container(GLASS.x, GLASS.y + GLASS.h + 6);
    root.add([this.stepper, buy, close, this.tray]);
    scope.onBack = () => this.close();
    pushScope(scope);
    layDown(root, { x, y });
    sfx("vending.hum", { volume: 0.6 });
    this.onOpened();
    this.pick(0, true);
    this.unwatch = inventory.watch(() => this.drawDisplay());
    const timer = s.time.addEvent({ delay: 500, loop: true, callback: () => this.drawDisplay() });
    root.once(Phaser.GameObjects.Events.DESTROY, () => timer.remove());
    scope.focus(this.shelves[0], "key");
  }

  close(): void {
    const root = this.root;
    if (!root) return;
    this.root = undefined;
    this.unwatch?.();
    if (this.scope) popScope(this.scope);
    const dim = this.dim;
    if (dim) fade(dim, 0, 120, () => dim.destroy());
    sound("close");
    pickUp(root, { x: root.x, y: root.y }, () => {
      root.destroy();
      this.onClosed();
    });
  }

  private pick(i: number, quiet = false): void {
    this.picked = i;
    this.shelves.forEach((sh, k) => {
      sh.setLit(k === i);
    });
    if (!quiet) sound("select");
    this.message = undefined;
    this.drawDisplay();
  }

  /** The display: the pick and its price, the 솔방울 held, or the machine's own words. */
  private drawDisplay(): void {
    const d = this.display;
    if (!d || !this.root) return;
    d.removeAll(true);
    const s = this.scene;
    const now = Date.now();
    const w = 60;
    if (this.message && this.message.until > now) {
      const rows = wrap(s, "galmuri9", this.message.text, w).slice(0, 4);
      d.add(
        new Label(s, 0, 0, rows.join("\n"), { font: "galmuri9", color: "red.light", leading: 0 })
          .obj,
      );
      return;
    }
    const item = this.stock[this.picked];
    if (!item) return;
    const page = live.page?.page ?? 1;
    const name = materialGood(`snack:${item.id}`).name;
    d.add(new Label(s, 0, 0, name, { font: "galmuri9", color: "grass.light" }).obj);
    const total = shopPrice(item, page) * this.qty;
    const have = inventory.money("pinecone");
    d.add(
      new Label(s, 0, 14, `${amount(total)}`, {
        font: "galmuri11",
        color: total > have ? "red.light" : "grass.light",
      }).obj,
    );
    d.add(new Label(s, 0, 32, amount(have), { font: "galmuri9", color: "grass.mid" }).obj);
    this.stepper?.setMax(
      Math.max(1, Math.min(9, Math.floor(have / Math.max(1, shopPrice(item, page))))),
    );
  }

  private say(code: string): void {
    const line = refusal("op", code);
    if (!line) return;
    this.message = { text: line.text, until: Date.now() + 3500 };
    this.drawDisplay();
  }

  private async buy(): Promise<void> {
    const item = this.stock[this.picked];
    if (!item || this.pending || !this.root) return;
    this.pending = true;
    const r = await inventory.op("shop.buy", { item: item.id, qty: this.qty });
    this.pending = false;
    if (!this.root) return;
    if (!r.ok) {
      sound("error");
      if (this.display) shake(this.display, { x: this.display.x, y: this.display.y });
      if (r.error !== "offline" && r.error !== "timeout") this.say(r.error);
      return;
    }
    // The goods drop from their shelf into the tray, one after another.
    const sh = this.shelves[this.picked];
    const s = this.scene;
    const n = Math.min(this.qty, 4);
    for (let i = 0; i < n; i++) {
      const can = s.add
        .image((sh?.x ?? 0) + 20, (sh?.y ?? 0) + 22, "ui", materialGood(`snack:${item.id}`).icon)
        .setOrigin(0.5)
        .setScale(2);
      this.root.add(can);
      s.tweens.add({
        targets: can,
        y: GLASS.y + GLASS.h + 16,
        x: GLASS.x + 30 + i * 22,
        duration: 420,
        delay: i * 180,
        ease: "Bounce.Out",
        onStart: () => s.time.delayedCall(300, () => sfx("vending.can")),
        onComplete: () => {
          s.time.delayedCall(700, () => fade(can, 0, 260, () => can.destroy()));
        },
      });
    }
    cue("sfx.pickup.material", { volume: 0.7 });
  }
}
