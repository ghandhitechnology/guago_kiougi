import {
  AMOUNT,
  type ItemView,
  LISTING_CATEGORIES,
  type ListingCategory,
  type ListingView,
  listingFee,
  type PriceDay,
  saleTax,
  TRADABLE_STACK,
  TRADE,
} from "@guago/shared";
import * as Phaser from "phaser";
import { t } from "../i18n/index.ts";
import {
  amount,
  bookGood,
  type Good,
  GRADE_INK,
  gradeName,
  itemGood,
  materialGood,
  toolGood,
} from "../items/catalog.ts";
import type { MenuTab } from "../menu/notebook.ts";
import { inventory } from "../state/inventory.ts";
import { Button } from "../ui/button.ts";
import { CostRow } from "../ui/cost-row.ts";
import { CELL, type CellItem, ItemCell } from "../ui/item-cell.ts";
import { List, type ListRow } from "../ui/list.ts";
import { turnPage } from "../ui/motion.ts";
import { toast } from "../ui/overlay.ts";
import { sound } from "../ui/sound.ts";
import { Stepper } from "../ui/stepper.ts";
import { Label } from "../ui/text.ts";
import { TextField } from "../ui/textfield.ts";
import { paint, sliceOf } from "../ui/theme.ts";
import type { Ctx } from "../ui/widget.ts";
import type { WorldLink } from "../world-link.ts";
import { text } from "./rows.ts";
import { Segments } from "./segments.ts";
import { line, refusal, term, timeLeft } from "./words.ts";

type Section = "browse" | "mine" | "sell";
const ROW = 18;

/** What a listing is, by its category: a book, a tool, or a stack from the bag. */
function goodOf(l: Pick<ListingView, "category" | "def" | "item">): Good {
  if (l.category === "book") return bookGood(l.def, l.item?.evolved ?? false);
  if (l.category === "tool") return toolGood(l.def);
  return materialGood(l.def);
}

/** A whole number from a decimal string, for drawing only; money stays in strings. */
const num = (s: string) => Number(s);

export function marketTab(link: () => WorldLink | undefined, order = 80): MenuTab {
  return {
    id: "market",
    label: t("market.tab"),
    icon: "icon/pinecone",
    order,
    build(ctx, page, size) {
      const l = link();
      if (l) new MarketPage(ctx, page, size, l);
    },
  };
}

let lastSection: Section = "browse";
let lastCategory: ListingCategory | undefined;

/**
 * 매점 게시판 (PLAN §13, §18): 사기, the listings by category, cheapest or dearest first, each
 * opening to its facts, 14 days of prices as a small chart, and 사기 with the quantity and the
 * total; 내 물건, the player's listings with their state and time left, and 내리기; 팔기, the bag,
 * where a pick sets a unit price with the 2% fee paid now and what a sale brings after 5% tax.
 */
class MarketPage {
  private readonly ctx: Ctx;
  private readonly link: WorldLink;
  private readonly root: Phaser.GameObjects.Container;
  private readonly body: Phaser.GameObjects.Container;
  private readonly size: { w: number; h: number };
  private section: Section = lastSection;
  private category: ListingCategory | undefined = lastCategory;
  private sort: "price" | "-price" = "price";
  private listings: ListingView[] = [];
  private next: string | null = null;
  private open: ListingView | undefined;
  private selling: { item?: ItemView; stack?: string } | undefined;

  constructor(
    ctx: Ctx,
    page: Phaser.GameObjects.Container,
    size: { w: number; h: number },
    link: WorldLink,
  ) {
    this.ctx = ctx;
    this.link = link;
    this.size = size;
    this.root = ctx.scene.add.container(0, 0);
    page.add(this.root);
    const seg = new Segments(ctx, 9, 3, {
      items: [
        { id: "browse", label: t("market.browse") },
        { id: "mine", label: t("market.mine") },
        { id: "sell", label: t("market.sell") },
      ],
      selected: this.section,
      onChange: (id) => {
        this.section = id as Section;
        lastSection = this.section;
        this.open = undefined;
        this.selling = undefined;
        turnPage(this.body, () => void this.show());
      },
    });
    const wallet = new Label(ctx.scene, 0, 6, inventory.moneyText("pinecone"), {
      font: "galmuri9",
      color: "stone.dark",
    });
    wallet.at(size.w - 8 - wallet.width, 6);
    const coin = ctx.scene.add.image(wallet.obj.x - 14, 3, "ui", "icon/pinecone").setOrigin(0);
    const rule = ctx.scene.add.rectangle(8, 19, size.w - 16, 1, paint("stone.light")).setOrigin(0);
    this.body = ctx.scene.add.container(0, 24);
    this.root.add([seg, coin, wallet.obj, rule, this.body]);
    const off = inventory.watch(() => {
      wallet.set(inventory.moneyText("pinecone"));
      wallet.at(size.w - 8 - wallet.width, 6);
      coin.setX(wallet.obj.x - 14);
      if (this.section === "sell" && !this.selling) void this.show();
    });
    this.root.once(Phaser.GameObjects.Events.DESTROY, off);
    void this.show();
  }

  private clear(): void {
    for (const o of [...this.body.list]) o.destroy();
  }

  private async show(): Promise<void> {
    this.clear();
    if (this.section === "browse") {
      if (this.open) this.detail(this.open);
      else await this.browse(false);
    } else if (this.section === "mine") await this.mine();
    else if (this.selling) this.sellForm(this.selling);
    else this.bag();
  }

  // 사기 ------------------------------------------------------------------------------------------

  private async browse(more: boolean): Promise<void> {
    const r = await this.link.request("listing.browse", {
      sort: this.sort,
      ...(this.category ? { category: this.category } : {}),
      ...(more && this.next ? { after: this.next } : {}),
    });
    if (!this.root.active || this.section !== "browse" || this.open) return;
    if (!r.ok) {
      const said = refusal(r.code);
      if (said) toast(said);
      return;
    }
    this.listings = more ? [...this.listings, ...r.data.listings] : r.data.listings;
    this.next = r.data.next;
    this.drawBrowse();
  }

  private drawBrowse(): void {
    this.clear();
    const { ctx } = this;
    const cats = new Segments(ctx, 9, 0, {
      items: [
        { id: "all", label: t("market.all") },
        ...LISTING_CATEGORIES.map((c) => ({ id: c, label: term("listing", c) })),
      ],
      selected: this.category ?? "all",
      onChange: (id) => {
        this.category = id === "all" ? undefined : (id as ListingCategory);
        lastCategory = this.category;
        void this.browse(false);
      },
    });
    const order = new Button(ctx, this.size.w - 8 - 58, -2, {
      label: this.sort === "price" ? t("market.cheap") : t("market.dear"),
      kind: "text",
      onPress: () => {
        this.sort = this.sort === "price" ? "-price" : "price";
        void this.browse(false);
      },
    });
    order.setX(this.size.w - 8 - order.bounds().w);
    this.body.add([cats, order]);
    const rows: ListRow[] = this.listings.map((l) => this.listingRow(l, () => this.openListing(l)));
    if (this.next) {
      rows.push({
        draw: (into, w, _h, row) => {
          const label = text(
            into,
            0,
            5,
            t("board.next"),
            row.focused ? "navy.mid" : "stone.dark",
            "galmuri9",
          );
          label.at(Math.floor((w - label.width) / 2), 5);
          row.zone(0, 0, w, ROW, () => void this.browse(true));
        },
        activate: () => void this.browse(true),
      });
    }
    this.list(rows, 20);
    if (rows.length === 0) {
      const said = line("social.board.empty-trade");
      if (said) {
        this.body.add(
          new Label(ctx.scene, 16, 32, said, { font: "galmuri11", color: "stone.dark" }).obj,
        );
      }
    }
  }

  private listingRow(
    l: ListingView,
    onTap?: () => void,
    extra?: (into: Phaser.GameObjects.Container, w: number) => void,
  ): ListRow {
    const good = goodOf(l);
    return {
      draw: (into, w, _h, row) => {
        into.add(into.scene.add.image(12, 9, "ui", good.icon).setOrigin(0.5));
        const name = text(into, 24, 4, good.name, GRADE_INK[l.grade] ?? "ink.dark", "galmuri11");
        if (l.qty > 1) text(into, 28 + name.width, 5, `×${l.qty}`, "stone.dark", "galmuri9");
        const price = text(into, 0, 4, amount(l.unitPrice), "ink.dark", "galmuri11-bold");
        price.at(w - 6 - price.width, 4);
        into.add(into.scene.add.image(price.obj.x - 14, 3, "ui", "icon/pinecone").setOrigin(0));
        extra?.(into, price.obj.x - 18);
        if (onTap) row.zone(0, 0, w, ROW, onTap);
      },
      ...(onTap ? { activate: onTap } : {}),
    };
  }

  private openListing(l: ListingView): void {
    this.open = l;
    turnPage(this.body, () => this.detail(l));
  }

  /** One listing: what it is, its prices over 14 days, and 사기 with the total. */
  private detail(l: ListingView): void {
    this.clear();
    const { ctx, link } = this;
    const scene = ctx.scene;
    const good = goodOf(l);
    const back = new Button(ctx, 8, -2, {
      label: t("club.back"),
      kind: "text",
      onPress: () => {
        this.open = undefined;
        turnPage(this.body, () => this.drawBrowse());
      },
    });
    const cell = new ItemCell(ctx, 8, 16);
    cell.set({ icon: good.icon, grade: l.grade, ...(l.qty > 1 ? { count: l.qty } : {}) });
    const name = new Label(scene, 38, 18, good.name, {
      font: "galmuri11-bold",
      color: GRADE_INK[l.grade] ?? "ink.dark",
    });
    const facts: string[] = [];
    if (l.item) {
      facts.push(gradeName(l.grade), t("social.level", { n: l.item.level }));
      if (l.item.pilgi > 0) facts.push(`+${l.item.pilgi}`);
    }
    facts.push(l.seller.name, timeLeft(Date.parse(l.expiresAt)));
    const factLine = new Label(scene, 38, 31, facts.join(" · "), {
      font: "galmuri9",
      color: "stone.dark",
    });
    this.body.add([back, cell, name.obj, factLine.obj]);
    // The chart: 14 days of prices on graph paper.
    const chart = scene.add.container(8, 48);
    this.body.add(chart);
    void link
      .request("listing.history", { def: l.def, ...(l.item ? { grade: l.grade } : {}) })
      .then((r) => {
        if (r.ok && chart.active) drawChart(chart, r.data.history, 160, 64);
      });
    // 사기: how many (stacks sell in part), and the total.
    const x = 182;
    let qty = 1;
    const unit = BigInt(l.unitPrice);
    const mine = l.seller.id === link.me;
    const cost = new CostRow(ctx, x, 120, this.size.w - 8 - x, {
      label: t("market.buy"),
      onPress: () => void buy(),
    });
    const paintTotal = () => {
      const sum = unit * BigInt(qty);
      cost.setCosts([
        {
          icon: "icon/pinecone",
          need: Number(sum),
          have: inventory.money("pinecone"),
          text: amount(sum.toString()),
        },
      ]);
    };
    if (l.qty > 1) {
      this.body.add(
        new Stepper(ctx, x, 92, {
          min: 1,
          max: l.qty,
          value: 1,
          onChange: (v) => {
            qty = v;
            paintTotal();
          },
        }),
      );
    }
    paintTotal();
    cost.setBlocked(mine);
    this.body.add(cost.root);
    const buy = async () => {
      cost.setPending(true);
      const r = await inventory.op("listing.buy", { listing: l.id, qty, unitPrice: l.unitPrice });
      cost.setPending(false);
      if (!r.ok) {
        cost.refuse();
        const said = refusal(r.error);
        if (said) toast(said);
        return;
      }
      sound("stamp");
      const said = line("market.bought", { item: good.name });
      if (said) toast(said);
      this.open = undefined;
      void this.show();
    };
  }

  // 내 물건 -------------------------------------------------------------------------------------

  private async mine(): Promise<void> {
    const r = await this.link.request("listing.mine", {});
    if (!this.root.active || this.section !== "mine") return;
    if (!r.ok) return;
    const live = r.data.listings.filter((l) => l.state === "live" || l.state === undefined);
    const count = new Label(this.ctx.scene, 0, 0, `${live.length} / ${TRADE.board.listings}`, {
      font: "galmuri9",
      color: "stone.dark",
    });
    count.at(this.size.w - 8 - count.width, 0);
    this.body.add(count.obj);
    const rows = r.data.listings.map((l) =>
      this.listingRow(l, undefined, (into, right) => {
        const state = l.state ?? "live";
        const word =
          state === "live" ? timeLeft(Date.parse(l.expiresAt)) : t(`market.state.${state}`);
        const label = text(
          into,
          0,
          5,
          word,
          state === "sold" ? "grass.dark" : "stone.dark",
          "galmuri9",
        );
        label.at(right - label.width, 5);
        if (state === "live") {
          const take = text(into, 0, 5, t("market.cancel"), "red.mid", "galmuri9");
          take.at(right - label.width - 10 - take.width, 5);
        }
      }),
    );
    // A live listing's row takes it down.
    rows.forEach((row, i) => {
      const l = r.data.listings[i];
      if (l && (l.state ?? "live") === "live") row.activate = () => void this.cancel(l);
    });
    this.list(rows, 14);
  }

  private async cancel(l: ListingView): Promise<void> {
    const r = await inventory.op("listing.cancel", { listing: l.id });
    if (!r.ok) {
      const said = refusal(r.error);
      if (said) toast(said);
      return;
    }
    const said = line("market.withdrawn", { item: goodOf(l).name });
    if (said) toast(said);
    void this.show();
  }

  // 팔기 ----------------------------------------------------------------------------------------

  /** The bag as wells: what can be listed, and what cannot greyed. */
  private bag(): void {
    const { ctx } = this;
    const entries: { cell: CellItem; pick?: () => void }[] = [];
    for (const [id, n] of Object.entries(inventory.snap?.materials ?? {})) {
      if (!TRADABLE_STACK.test(id) || n <= 0) continue;
      entries.push({
        cell: { icon: materialGood(id).icon, count: n },
        pick: () => this.startSell({ stack: id }),
      });
    }
    const now = Date.now();
    for (const item of inventory.items()) {
      const ok =
        item.slot === null &&
        !item.bound &&
        !(item.tradableAt && Date.parse(item.tradableAt) > now);
      entries.push({
        cell: { icon: itemGood(item).icon, grade: item.grade, ...(ok ? {} : { dim: true }) },
        ...(ok ? { pick: () => this.startSell({ item }) } : {}),
      });
    }
    const cols = Math.floor((this.size.w - 16 + 2) / (CELL + 2));
    entries.slice(0, cols * 5).forEach((e, i) => {
      const cell = new ItemCell(
        ctx,
        8 + (i % cols) * (CELL + 2),
        Math.floor(i / cols) * (CELL + 2),
        {
          onPress: () => e.pick?.(),
        },
      );
      cell.set(e.cell);
      this.body.add(cell);
    });
  }

  private startSell(what: { item?: ItemView; stack?: string }): void {
    this.selling = what;
    turnPage(this.body, () => this.sellForm(what));
  }

  /** A unit price, a quantity for stacks, the fee paid now and what a sale brings after tax. */
  private sellForm(what: { item?: ItemView; stack?: string }): void {
    this.clear();
    const { ctx } = this;
    const scene = ctx.scene;
    const good = what.item ? itemGood(what.item) : materialGood(what.stack ?? "");
    const have = what.stack ? inventory.count(what.stack) : 1;
    const back = new Button(ctx, 8, -2, {
      label: t("club.back"),
      kind: "text",
      onPress: () => {
        this.selling = undefined;
        turnPage(this.body, () => this.bag());
      },
    });
    const cell = new ItemCell(ctx, 8, 16);
    cell.set({
      icon: good.icon,
      ...(what.item ? { grade: what.item.grade } : {}),
      ...(have > 1 ? { count: have } : {}),
    });
    const name = new Label(scene, 38, 18, good.name, {
      font: "galmuri11-bold",
      color: what.item ? (GRADE_INK[what.item.grade] ?? "ink.dark") : "ink.dark",
    });
    this.body.add([back, cell, name.obj]);
    let qty = have;
    let price = "";
    const field = new TextField(ctx, 8, 46, {
      label: t("market.price"),
      w: 120,
      maxLength: 15,
      onChange: (v) => {
        price = v.replace(/[^0-9]/g, "").replace(/^0+/, "");
        paint();
      },
      onSubmit: () => void list(),
    });
    field.field.inputMode = "numeric";
    this.body.add(field);
    if (have > 1) {
      this.body.add(
        new Stepper(ctx, 140, 59, {
          min: 1,
          max: have,
          value: have,
          onChange: (v) => {
            qty = v;
            paint();
          },
        }),
      );
    }
    // What a sale brings: the total, less the 5% tax.
    const gets = new Label(scene, 8, 86, "", { font: "galmuri9", color: "stone.dark" });
    this.body.add(gets.obj);
    const cost = new CostRow(ctx, 8, 104, this.size.w - 16, {
      label: t("market.list"),
      onPress: () => void list(),
    });
    this.body.add(cost.root);
    const paint = () => {
      const unit = AMOUNT.test(price) && price !== "0" ? BigInt(price) : 0n;
      const total = unit * BigInt(qty);
      const fee = listingFee(total);
      cost.setCosts([
        {
          icon: "icon/pinecone",
          need: Number(fee),
          have: inventory.money("pinecone"),
          text: amount(fee.toString()),
        },
      ]);
      cost.setBlocked(unit === 0n);
      gets.set(
        unit === 0n
          ? ""
          : `${amount(total.toString())} − ${amount(saleTax(total).toString())} = ${amount((total - saleTax(total)).toString())}`,
      );
    };
    paint();
    const list = async () => {
      if (!AMOUNT.test(price) || price === "0") {
        field.reject();
        return;
      }
      cost.setPending(true);
      const req = what.item
        ? { item: what.item.id, unitPrice: price }
        : { stack: what.stack ?? "", qty, unitPrice: price };
      const r = await inventory.op("listing.create", req);
      cost.setPending(false);
      if (!r.ok) {
        cost.refuse();
        const said = refusal(r.error);
        if (said) toast(said);
        return;
      }
      sound("stamp");
      const said = line("market.listed", { item: good.name });
      if (said) toast(said);
      this.selling = undefined;
      this.section = "mine";
      lastSection = "mine";
      void this.show();
    };
  }

  private list(rows: ListRow[], top: number): void {
    const visible = Math.max(1, Math.floor((this.size.h - 24 - top - 4) / ROW));
    this.body.add(new List(this.ctx, 8, top, { w: this.size.w - 16, visible, rowH: ROW, rows }));
  }
}

/**
 * Fourteen days of prices on graph paper: a bar to each day's mean, a whisker from its low to
 * its high, and nothing on a day nothing sold.
 */
function drawChart(
  into: Phaser.GameObjects.Container,
  days: readonly PriceDay[],
  w: number,
  h: number,
): void {
  const scene = into.scene;
  const [l, r, tt, b] = sliceOf("inset");
  into.add(scene.add.nineslice(0, 0, "ui", "inset/idle", w, h, l, r, tt, b).setOrigin(0));
  const g = scene.add.graphics();
  g.fillStyle(paint("stone.pale"));
  for (let y = 8; y < h - 3; y += 8) g.fillRect(3, y, w - 6, 1);
  const n = TRADE.board.historyDays;
  const top = Math.max(1, ...days.map((d) => num(d.high)));
  const slot = Math.floor((w - 8) / n);
  const plot = h - 10;
  const recent = days.slice(-n);
  recent.forEach((d, i) => {
    if (d.volume <= 0) return;
    const x = 4 + (n - recent.length + i) * slot;
    const y = (v: number) => Math.round(h - 4 - (plot * v) / top);
    g.fillStyle(paint("navy.light"));
    g.fillRect(x + 2, y(num(d.mean)), slot - 4, h - 4 - y(num(d.mean)));
    g.fillStyle(paint("navy.dark"));
    g.fillRect(x + Math.floor(slot / 2) - 1, y(num(d.high)), 1, y(num(d.low)) - y(num(d.high)) + 1);
  });
  into.add(g);
  const most = new Label(scene, 4, 3, amount(String(top)), {
    font: "galmuri9",
    color: "stone.dark",
  });
  into.add(most.obj);
}
