import {
  AMOUNT,
  directTax,
  type ItemView,
  TRADABLE_STACK,
  TRADE,
  type TradeOfferView,
  type TradePerson,
  type TradeUpdate,
} from "@guago/shared";
import type * as Phaser from "phaser";
import { t } from "../i18n/index.ts";
import { amount, GRADE_INK, gradeName, itemGood, materialGood } from "../items/catalog.ts";
import { inventory } from "../state/inventory.ts";
import { Button } from "../ui/button.ts";
import { FocusScope, popScope, pushScope } from "../ui/focus.ts";
import { type CardData, ItemCard } from "../ui/item-card.ts";
import { CELL, type CellItem, ItemCell } from "../ui/item-cell.ts";
import { fade, shake, stamp } from "../ui/motion.ts";
import { toast } from "../ui/overlay.ts";
import { Panel } from "../ui/panel.ts";
import { sound } from "../ui/sound.ts";
import { Stepper } from "../ui/stepper.ts";
import { Label } from "../ui/text.ts";
import { TextField } from "../ui/textfield.ts";
import { paint } from "../ui/theme.ts";
import type { Ctx } from "../ui/widget.ts";
import type { WorldLink } from "../world-link.ts";
import type { Slips } from "./slips.ts";
import { line, refusal, timeLeft } from "./words.ts";

/** What is offered, as both windows show it: items by id, stacks by count, 솔방울. */
interface Offer {
  items: string[];
  stacks: Record<string, number>;
  pinecone: string;
}

const EMPTY: TradeOfferView = { items: [], stacks: {}, pinecone: "0" };
const W = 466;
const H = 262;
const TRAY_COLS = 6;
const TRAY_ROWS = 2;
const BAG_COLS = 12;
const BAG_ROWS = 3;
const GAP = 2;

/** Why an item of the player's cannot go in a trade, or nothing when it can. */
function blocked(item: ItemView, now = Date.now()): "worn" | "bound" | "cooldown" | undefined {
  if (item.slot !== null) return "worn";
  if (item.bound) return "bound";
  if (item.tradableAt && Date.parse(item.tradableAt) > now) return "cooldown";
  return undefined;
}

function itemCell(item: ItemView, dim = false): CellItem {
  const good = itemGood(item);
  return {
    icon: good.icon,
    grade: item.grade,
    ...(item.pilgi > 0 ? { badge: `+${item.pilgi}` } : {}),
    ...(item.slot !== null ? { worn: true } : {}),
    ...(dim ? { dim: true } : {}),
  };
}

function itemCardData(item: ItemView): CardData {
  const good = itemGood(item);
  const why = blocked(item);
  const facts = [gradeName(item.grade), t("social.level", { n: item.level })];
  if (item.pilgi > 0) facts.push(`+${item.pilgi}`);
  return {
    name: good.name,
    color: GRADE_INK[item.grade] ?? "ink.dark",
    facts,
    ...(why === "cooldown" && item.tradableAt
      ? { note: timeLeft(Date.parse(item.tradableAt)), noteColor: "red.mid" }
      : {}),
  };
}

/**
 * The direct trade window (PLAN §13): what the player gives on the left, what they get on the
 * right, each side under its owner's name with a seal that lands when that side confirms and is
 * torn off the moment either offer changes. 솔방울 coming in show the 5% tax taken from them.
 * The bag sits underneath: a press puts a thing up or takes it down; what cannot be traded is
 * greyed with its reason as a mark (worn, bound, or the hours until it can go again).
 */
export class TradeWindow {
  readonly session: string;
  private readonly scene: Phaser.Scene;
  private readonly link: WorldLink;
  private readonly partner: TradePerson;
  private readonly scope = new FocusScope();
  private readonly ctx: Ctx;
  private readonly dim: Phaser.GameObjects.Rectangle;
  private readonly panel: Panel;
  private readonly card: ItemCard;
  private readonly layer: Phaser.GameObjects.Container;
  /** The bag under the trays, drawn on its own so it can redraw alone. */
  private readonly bagLayer: Phaser.GameObjects.Container;
  private offers: Record<string, TradeOfferView> = {};
  private confirmed: string[] = [];
  private version = 0;
  private expiresAt = 0;
  private bagPage = 0;
  private mine: Offer = { items: [], stacks: {}, pinecone: "0" };
  private seals: Record<"me" | "them", Phaser.GameObjects.Image> = {} as never;
  private confirm!: Button;
  private coins!: TextField;
  private clockLabel!: Label;
  private notice!: Label;
  private finished = false;
  private closing = false;
  private readonly offInv: () => void;
  private readonly onClosed: () => void;

  constructor(
    scene: Phaser.Scene,
    link: WorldLink,
    open: Extract<TradeUpdate, { t: "open" }>,
    onClosed: () => void,
  ) {
    this.scene = scene;
    this.link = link;
    this.session = open.session;
    this.partner = open.with;
    this.onClosed = onClosed;
    this.ctx = { scene, scope: this.scope };
    const sw = scene.scale.width;
    const sh = scene.scale.height;
    this.dim = scene.add
      .rectangle(0, 0, sw, sh, paint("ink.deep"))
      .setOrigin(0)
      .setAlpha(0)
      .setDepth(880)
      .setInteractive();
    fade(this.dim, 0.6, 140);
    this.panel = new Panel(this.ctx, Math.round((sw - W) / 2), Math.round((sh - H) / 2), W, H, {
      title: t("social.trade"),
      onClose: () => void this.cancel(),
    }).setDepth(881);
    this.card = new ItemCard(scene, 960);
    this.layer = scene.add.container(0, 0);
    this.bagLayer = scene.add.container(0, 0);
    this.panel.add([this.layer, this.bagLayer]);
    this.build();
    this.scope.onBack = () => void this.cancel();
    pushScope(this.scope);
    this.panel.open();
    this.apply(open);
    this.offInv = inventory.watch(() => this.drawBag());
    const said = line("trade.opened", { player: this.partner.name });
    if (said) toast(said);
  }

  /** A push for this window's session. */
  apply(u: TradeUpdate): void {
    if (u.session !== this.session || this.closing) return;
    switch (u.t) {
      case "open":
        this.offers = u.offers;
        this.confirmed = u.confirmed;
        this.version = u.version;
        this.expiresAt = u.expiresAt;
        this.drawOffers(false);
        return;
      case "offer": {
        const hadSeal = this.confirmed.length > 0;
        const who = this.changedBy(u.offers);
        this.offers = u.offers;
        this.version = u.version;
        this.confirmed = [];
        this.drawOffers(hadSeal);
        if (hadSeal && who) {
          const said = line("trade.changed", { player: who });
          if (said) this.say(said, "red.mid");
        }
        return;
      }
      case "confirm":
        this.landSeals(u.confirmed);
        this.confirmed = u.confirmed;
        this.version = u.version;
        this.paintConfirm();
        if (u.confirmed.length === 1 && u.confirmed[0] === this.link.me) {
          const said = line("trade.confirm-offer");
          if (said) this.say(said, "ink.dark");
        }
        return;
      case "done": {
        this.finished = true;
        inventory.applyChange(u.change);
        const taxed = u.tax !== "0";
        const said = taxed
          ? line("trade.done", { price: amount(u.tax) })
          : line("trade.done-untaxed");
        if (said) toast(said);
        sound("stamp");
        this.scene.time.delayedCall(700, () => this.close());
        return;
      }
      case "failed": {
        this.confirmed = [];
        this.version = u.version;
        this.drawOffers(true);
        if (u.error === "server_error") {
          // The server could not finish: the bag shows what is true now.
          void inventory.load();
          const said = line("trade.failed-server");
          if (said) this.say(said, "ink.dark", 0);
          this.finished = true;
        } else {
          const said = line("trade.failed") ?? refusal(u.error);
          if (said) this.say(said, "red.mid");
        }
        return;
      }
      case "closed": {
        if (!this.finished) {
          const id = `trade.closed.${u.reason}`;
          const said = line(id, { player: this.partner.name });
          if (said) toast(said);
          this.close();
        }
        return;
      }
      case "invite":
        return;
    }
  }

  private build(): void {
    const { scene, ctx } = this;
    const page = this.panel.page;
    const x0 = page.x + 6;
    const trayW = TRAY_COLS * (CELL + GAP) - GAP;
    const rightX = page.x + page.w - 6 - trayW;
    // Names over the trays, the arrows between them.
    const me = new Label(scene, x0, page.y + 4, this.myName(), {
      font: "galmuri11-bold",
      color: "ink.dark",
    });
    const them = new Label(scene, rightX, page.y + 4, this.partner.name, {
      font: "galmuri11-bold",
      color: "ink.dark",
    });
    const arrows = scene.add
      .image(Math.round(page.x + page.w / 2 - 6), page.y + 36, "ui", "swap/idle")
      .setOrigin(0);
    this.panel.add([me.obj, them.obj, arrows]);
    // Seal places: dashed rings until a side confirms.
    for (const [side, x] of [
      ["me", x0 + trayW - 21],
      ["them", rightX + trayW - 21],
    ] as const) {
      this.panel.add(scene.add.image(x, page.y, "ui", "seal/off").setOrigin(0));
      const seal = scene.add.image(x, page.y, "ui", "seal/on").setOrigin(0).setVisible(false);
      this.panel.add(seal);
      this.seals[side] = seal;
    }
    // My 솔방울, typed; theirs, written.
    const coinY = page.y + 20 + TRAY_ROWS * (CELL + GAP) + 4;
    this.panel.add(scene.add.image(x0, coinY + 4, "ui", "icon/pinecone").setOrigin(0));
    this.coins = new TextField(ctx, x0 + 15, coinY, {
      w: 90,
      maxLength: 15,
      enterKeyHint: "done",
      onSubmit: () => this.setCoins(),
    });
    this.coins.value = "0";
    this.coins.field.inputMode = "numeric";
    this.coins.field.addEventListener("blur", () => this.setCoins());
    const wallet = new Label(scene, x0 + 110, coinY + 6, "", {
      font: "galmuri9",
      color: "stone.dark",
    });
    this.panel.add([this.coins, wallet.obj]);
    const paintWallet = () => wallet.set(`/ ${inventory.moneyText("pinecone")}`);
    paintWallet();
    // The notice line across the window: a change, a confirm, a failure.
    this.notice = new Label(scene, page.x + 8, coinY + 24, "", {
      font: "galmuri9",
      color: "ink.dark",
      width: page.w - 16,
    });
    this.panel.add(this.notice.obj);
    const rule = scene.add
      .rectangle(page.x + 6, coinY + 38, page.w - 12, 1, paint("stone.light"))
      .setOrigin(0);
    this.panel.add(rule);
    // The confirm, with the window's time left beside it.
    this.confirm = new Button(ctx, page.x + page.w - 6 - 74, page.y + page.h - 6 - 21, {
      label: t("trade.confirm"),
      kind: "ink",
      w: 74,
      sound: "confirm",
      onPress: () => void this.press(),
    });
    this.clockLabel = new Label(scene, 0, 0, "", { font: "galmuri9", color: "stone.dark" });
    this.panel.add([this.confirm, this.clockLabel.obj]);
    this.scene.time.addEvent({
      delay: 1000,
      loop: true,
      callback: () => {
        if (this.closing) return;
        const left = Math.max(0, Math.ceil((this.expiresAt - Date.now()) / 1000));
        this.clockLabel.set(`${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`);
        this.clockLabel.at(this.confirm.x - 8 - this.clockLabel.width, this.confirm.y + 6);
        paintWallet();
      },
    });
  }

  private myName(): string {
    return [...this.link.presence.values()].find((p) => p.id === this.link.me)?.name ?? "";
  }

  /** Who changed their side since the last view, by name. */
  private changedBy(next: Record<string, TradeOfferView>): string | undefined {
    const same = (a?: TradeOfferView, b?: TradeOfferView) =>
      JSON.stringify(a ?? EMPTY) === JSON.stringify(b ?? EMPTY);
    if (!same(this.offers[this.partner.id], next[this.partner.id])) return this.partner.name;
    if (this.link.me && !same(this.offers[this.link.me], next[this.link.me])) {
      return this.myName();
    }
    return undefined;
  }

  private say(text: string, color: string, ms = 3200): void {
    this.notice.set(text).color(color);
    this.notice.obj.setAlpha(1);
    if (ms > 0) {
      this.scene.time.delayedCall(ms, () => {
        if (this.notice.obj.text === text) fade(this.notice.obj, 0, 300);
      });
    }
  }

  /** Both trays, the seals as they stand, and the bag. */
  private drawOffers(tear: boolean): void {
    for (const o of [...this.layer.list]) o.destroy();
    const page = this.panel.page;
    const trayW = TRAY_COLS * (CELL + GAP) - GAP;
    const mine = this.offers[this.link.me ?? ""] ?? EMPTY;
    const theirs = this.offers[this.partner.id] ?? EMPTY;
    this.mine = {
      items: [...mine.items.map((i) => i.id)],
      stacks: { ...mine.stacks },
      pinecone: mine.pinecone,
    };
    this.tray(page.x + 6, page.y + 20, mine, true);
    this.tray(page.x + page.w - 6 - trayW, page.y + 20, theirs, false);
    // Their 솔방울, and the tax that comes off them on the way in.
    const coinY = page.y + 20 + TRAY_ROWS * (CELL + GAP) + 4;
    const rx = page.x + page.w - 6 - trayW;
    if (theirs.pinecone !== "0") {
      this.layer.add(this.scene.add.image(rx, coinY + 4, "ui", "icon/pinecone").setOrigin(0));
      const n = new Label(this.scene, rx + 15, coinY + 5, amount(theirs.pinecone), {
        font: "galmuri11-bold",
        color: "ink.dark",
      });
      const tax = directTax(BigInt(theirs.pinecone));
      const after = new Label(this.scene, 0, coinY + 6, `− ${amount(tax.toString())}`, {
        font: "galmuri9",
        color: "red.mid",
      });
      after.at(rx + 19 + n.width, coinY + 6);
      this.layer.add([n.obj, after.obj]);
    }
    if (document.activeElement !== this.coins.field) this.coins.value = mine.pinecone;
    if (tear) this.tearSeals();
    else for (const side of ["me", "them"] as const) this.seals[side].setVisible(this.sealed(side));
    this.paintConfirm();
    this.drawBag();
  }

  private sealed(side: "me" | "them"): boolean {
    const id = side === "me" ? this.link.me : this.partner.id;
    return id !== undefined && this.confirmed.includes(id);
  }

  /** A changed offer: both seals are torn off, visibly. */
  private tearSeals(): void {
    for (const side of ["me", "them"] as const) {
      const seal = this.seals[side];
      if (!seal.visible) continue;
      sound("error");
      shake(seal, { x: seal.x, y: seal.y });
      this.scene.tweens.add({
        targets: seal,
        alpha: 0,
        y: seal.y + 6,
        duration: 260,
        delay: 140,
        onComplete: () =>
          seal
            .setVisible(false)
            .setAlpha(1)
            .setY(seal.y - 6),
      });
    }
  }

  private landSeals(next: string[]): void {
    for (const side of ["me", "them"] as const) {
      const id = side === "me" ? this.link.me : this.partner.id;
      const was = id !== undefined && this.confirmed.includes(id);
      const now = id !== undefined && next.includes(id);
      if (now && !was) {
        const seal = this.seals[side];
        sound("stamp");
        stamp(seal, { x: seal.x, y: seal.y });
      }
    }
  }

  private paintConfirm(): void {
    const mineSealed = this.sealed("me");
    const both = this.sealed("me") && this.sealed("them");
    this.confirm.setEnabled(!mineSealed && !both && !this.finished);
  }

  /** One side's tray: its items and stacks in wells. */
  private tray(x: number, y: number, offer: TradeOfferView, mine: boolean): void {
    const entries: { cell: CellItem; card: CardData; take?: () => void }[] = [];
    for (const item of offer.items) {
      entries.push({
        cell: itemCell(item),
        card: itemCardData(item),
        ...(mine ? { take: () => this.toggleItem(item.id) } : {}),
      });
    }
    for (const [id, n] of Object.entries(offer.stacks)) {
      const good = materialGood(id);
      entries.push({
        cell: { icon: good.icon, count: n },
        card: { name: good.name, facts: [amount(n)] },
        ...(mine ? { take: () => this.setStack(id, 0) } : {}),
      });
    }
    this.wells(x, y, TRAY_COLS, TRAY_ROWS, entries);
  }

  private wells(
    x: number,
    y: number,
    cols: number,
    rows: number,
    entries: { cell?: CellItem; card?: CardData; take?: () => void; mark?: string }[],
    into = this.layer,
  ): void {
    for (let i = 0; i < cols * rows; i++) {
      const e = entries[i];
      const cx = x + (i % cols) * (CELL + GAP);
      const cy = y + Math.floor(i / cols) * (CELL + GAP);
      const cell = new ItemCell(this.ctx, cx, cy, {
        onPress: () => e?.take?.(),
        onPeek: (on) => {
          if (on && e?.card) {
            const b = cell.bounds();
            this.card.show(b, e.card);
          } else this.card.hide();
        },
      });
      cell.set(e?.cell);
      into.add(cell);
      if (e?.mark) into.add(this.scene.add.image(cx + 8, cy + 7, "ui", e.mark).setOrigin(0));
    }
  }

  /** The bag under the trays: tradable things first, the rest greyed with their mark. */
  private drawBag(): void {
    if (this.closing || !this.bagLayer.active) return;
    for (const o of [...this.bagLayer.list]) o.destroy();
    const page = this.panel.page;
    const top = page.y + 20 + TRAY_ROWS * (CELL + GAP) + 4 + 42;
    const offered = new Set(this.mine.items);
    const items = inventory.items().filter((i) => !offered.has(i.id));
    items.sort((a, b) => Number(blocked(a) !== undefined) - Number(blocked(b) !== undefined));
    const entries: { cell?: CellItem; card?: CardData; take?: () => void; mark?: string }[] = [];
    for (const [id, n] of Object.entries(inventory.snap?.materials ?? {})) {
      if (!TRADABLE_STACK.test(id)) continue;
      const left = n - (this.mine.stacks[id] ?? 0);
      if (left <= 0) continue;
      const good = materialGood(id);
      entries.push({
        cell: { icon: good.icon, count: left },
        card: { name: good.name, facts: [amount(left)] },
        take: () => this.pickStack(id, left),
      });
    }
    for (const item of items) {
      const why = blocked(item);
      entries.push({
        cell: itemCell(item, why !== undefined),
        card: itemCardData(item),
        ...(why === undefined ? { take: () => this.toggleItem(item.id) } : {}),
        ...(why === "bound"
          ? { mark: "lock/idle" }
          : why === "cooldown"
            ? { mark: "icon/pool" }
            : {}),
      });
    }
    const per = BAG_COLS * BAG_ROWS;
    const pages = Math.max(1, Math.ceil(entries.length / per));
    this.bagPage = Math.min(this.bagPage, pages - 1);
    this.wells(
      page.x + 6,
      top,
      BAG_COLS,
      BAG_ROWS,
      entries.slice(this.bagPage * per),
      this.bagLayer,
    );
    if (pages > 1) {
      const turn = new Button(this.ctx, page.x + 6 + BAG_COLS * (CELL + GAP) + 4, top, {
        label: `${this.bagPage + 1}/${pages}`,
        w: 34,
        h: 19,
        font: "galmuri9",
        onPress: () => {
          this.bagPage = (this.bagPage + 1) % pages;
          this.drawBag();
        },
      });
      this.bagLayer.add(turn);
    }
  }

  private toggleItem(id: string): void {
    const has = this.mine.items.includes(id);
    if (!has && this.mine.items.length >= TRADE.maxItems) {
      sound("error");
      return;
    }
    const items = has ? this.mine.items.filter((i) => i !== id) : [...this.mine.items, id];
    void this.send({ ...this.mine, items });
  }

  /** A stack from the bag: how many, on a small stepper, then up it goes. */
  private pickStack(id: string, max: number): void {
    if (max === 1) {
      this.setStack(id, (this.mine.stacks[id] ?? 0) + 1);
      return;
    }
    const good = materialGood(id);
    const scope = new FocusScope();
    const ctx = { scene: this.scene, scope };
    const sw = this.scene.scale.width;
    const sh = this.scene.scale.height;
    const pw = 170;
    const ph = 76;
    const panel = new Panel(ctx, Math.round((sw - pw) / 2), Math.round((sh - ph) / 2), pw, ph, {
      kind: "dialog",
    }).setDepth(950);
    let n = max;
    const name = new Label(this.scene, 12, 10, good.name, {
      font: "galmuri11-bold",
      color: "ink.dark",
    });
    const stepper = new Stepper(ctx, 12, 28, {
      min: 1,
      max,
      value: max,
      onChange: (v) => {
        n = v;
      },
    });
    const close = () => {
      popScope(scope);
      panel.hide(() => panel.destroy());
    };
    const go = new Button(ctx, pw - 12 - 60, ph - 12 - 21, {
      label: t("trade.put"),
      kind: "ink",
      w: 60,
      sound: "confirm",
      onPress: () => {
        close();
        this.setStack(id, (this.mine.stacks[id] ?? 0) + n);
      },
    });
    panel.add([name.obj, stepper, go]);
    scope.onBack = close;
    pushScope(scope);
    panel.open();
    scope.focus(go, "key");
  }

  private setStack(id: string, n: number): void {
    const stacks = { ...this.mine.stacks };
    if (n > 0) stacks[id] = n;
    else delete stacks[id];
    if (Object.keys(stacks).length > TRADE.maxStacks) {
      sound("error");
      return;
    }
    void this.send({ ...this.mine, stacks });
  }

  private setCoins(): void {
    const raw = this.coins.value.replace(/[^0-9]/g, "").replace(/^0+(?=\d)/, "") || "0";
    if (!AMOUNT.test(raw)) {
      this.coins.reject();
      return;
    }
    this.coins.value = raw;
    if (raw === this.mine.pinecone) return;
    void this.send({ ...this.mine, pinecone: raw });
  }

  /** The player's whole side, replaced; the server bumps the version and clears both seals. */
  private async send(offer: Offer): Promise<void> {
    sound("select");
    const r = await this.link.request("trade.offer", { session: this.session, ...offer });
    if (!r.ok) {
      sound("error");
      const said = refusal(r.code);
      if (said) this.say(said, "red.mid");
    }
  }

  private async press(): Promise<void> {
    if (this.finished) return;
    this.confirm.setEnabled(false);
    const r = await this.link.request("trade.confirm", {
      session: this.session,
      version: this.version,
    });
    if (!r.ok) {
      sound("error");
      const said = refusal(r.code);
      if (said) this.say(said, "red.mid");
      this.paintConfirm();
    }
  }

  private async cancel(): Promise<void> {
    if (this.finished) {
      this.close();
      return;
    }
    await this.link.request("trade.cancel", { session: this.session });
    this.close();
  }

  close(): void {
    if (this.closing) return;
    this.closing = true;
    this.offInv();
    this.card.hide(true);
    popScope(this.scope);
    fade(this.dim, 0, 120, () => this.dim.destroy());
    this.panel.hide(() => {
      this.panel.destroy();
      this.onClosed();
    });
  }
}

/**
 * Direct trade as the player meets it: asking from the card, the invite slip with its fuse for
 * the one asked, and the window for both once accepted. One window at a time.
 */
export function watchTrades(scene: Phaser.Scene, link: WorldLink, slips: Slips) {
  let window: TradeWindow | undefined;
  /** Sessions this player asked for, and those they were asked to, by the other's name. */
  const asked = new Map<string, string>();
  const invited = new Map<string, string>();
  const off = link.on((e) => {
    if (e.type !== "trade") return;
    const u = e.update;
    if (u.t === "invite") {
      if (link.isBlocked(u.from.id)) return;
      invited.set(u.session, u.from.name);
      slips.push({
        key: `trade:${u.session}`,
        icon: "swap/idle",
        title: u.from.name,
        sub: t("social.trade"),
        expiresAt: u.expiresAt,
        accept: () => void link.request("trade.accept", { session: u.session }),
        decline: () => void link.request("trade.decline", { session: u.session }),
      });
      return;
    }
    if (u.t === "open") {
      slips.drop(`trade:${u.session}`);
      asked.delete(u.session);
      invited.delete(u.session);
      window?.close();
      window = new TradeWindow(scene, link, u, () => {
        window = undefined;
      });
      return;
    }
    if (u.t === "closed" && window?.session !== u.session) {
      slips.drop(`trade:${u.session}`);
      // An answer to an ask: declined or lapsed, said from whichever side this player was on.
      const them = asked.get(u.session);
      const me = invited.get(u.session);
      asked.delete(u.session);
      invited.delete(u.session);
      const pair = u.reason === "declined" || u.reason === "expired";
      const said = them
        ? line(`trade.closed.${u.reason}`, { player: them })
        : me && pair
          ? line(`trade.closed.${u.reason}-self`)
          : undefined;
      if (said) toast(said);
      return;
    }
    window?.apply(u);
  });
  return {
    /** Asks someone to trade, from their card. */
    async ask(target: { id: string; name: string }): Promise<void> {
      const r = await link.request("trade.request", { to: target.id });
      if (!r.ok) {
        sound("error");
        const said = refusal(r.code);
        if (said) toast(said);
        return;
      }
      asked.set(r.data.session, target.name);
      const said = line("trade.request-sent", { player: target.name });
      if (said) toast(said);
    },
    get open(): boolean {
      return window !== undefined;
    },
    destroy(): void {
      off();
      window?.close();
    },
  };
}
