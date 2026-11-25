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
import { holdToasts, toast } from "../ui/overlay.ts";
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
const TRAY_COLS = 6;
const TRAY_ROWS = 2;
const BAG_ROWS = 3;
const GAP = 2;
const PAD = 6;
const TRAY_W = TRAY_COLS * (CELL + GAP) - GAP;
/** Between the two trays, where the arrows sit; the bag below spans both trays exactly. */
const MID = 28;
const BAG_COLS = (2 * TRAY_W + MID + GAP) / (CELL + GAP);
/** Page rows, from the page's top: the trays, each side's 솔방울, the notice, the bag. */
const TRAY_Y = 22;
const COIN_Y = TRAY_Y + TRAY_ROWS * (CELL + GAP) + 2;
/** Under each side's 솔방울: the tax and what arrives on the other side. */
const TAX_Y = COIN_Y + 22;
const NOTICE_Y = TAX_Y + 13;
const RULE_Y = NOTICE_Y + 12;
const BAG_Y = RULE_Y + 4;
const FOOT_Y = BAG_Y + BAG_ROWS * (CELL + GAP) + 2;
const BUTTON_H = 21;
/** The panel around it: the page sits 7 in from the left and 19 down, 4 short on the right. */
const W = 2 * PAD + 2 * TRAY_W + MID + 11;
const H = FOOT_Y + BUTTON_H + 4 + 23;

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
 * torn off the moment either offer changes. Each side's 솔방울 sit under its tray with the 5%
 * tax and what arrives on the other side; my seal lands in a dent beside 확정.
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
  /** Writes the time left and the wallet; once a second, and as the window opens. */
  private tick: () => void = () => {};
  private notice!: Label;
  private finished = false;
  private closing = false;
  private readonly offInv: () => void;
  private readonly unhold: () => void;
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
    this.unhold = holdToasts(() => this.panel.toastSpot());
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
        this.tick();
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
    const leftX = page.x + PAD;
    const rightX = leftX + TRAY_W + MID;
    // Names over the trays, the arrows between them.
    const me = new Label(scene, leftX, page.y + 6, this.myName(), {
      font: "galmuri11-bold",
      color: "ink.dark",
    });
    const them = new Label(scene, rightX, page.y + 6, this.partner.name, {
      font: "galmuri11-bold",
      color: "ink.dark",
    });
    const arrows = scene.add
      .image(leftX + TRAY_W + Math.floor((MID - 13) / 2), page.y + TRAY_Y + 20, "ui", "swap/idle")
      .setOrigin(0);
    this.panel.add([me.obj, them.obj, arrows]);
    // My 솔방울, typed under my tray.
    const coinY = page.y + COIN_Y;
    this.panel.add(scene.add.image(leftX, coinY + 3, "ui", "icon/pinecone").setOrigin(0));
    this.coins = new TextField(ctx, leftX + 15, coinY, {
      w: 70,
      h: 18,
      maxLength: 15,
      enterKeyHint: "done",
      onSubmit: () => this.setCoins(),
    });
    this.coins.value = "0";
    this.coins.field.inputMode = "numeric";
    this.coins.field.addEventListener("blur", () => this.setCoins());
    this.panel.add(this.coins);
    // The notice line across the window: a change, a confirm, a failure.
    this.notice = new Label(scene, leftX + 2, page.y + NOTICE_Y, "", {
      font: "galmuri9",
      color: "ink.dark",
      width: page.w - 2 * PAD - 4,
    });
    this.panel.add(this.notice.obj);
    const rule = scene.add
      .rectangle(leftX, page.y + RULE_Y, page.w - 2 * PAD, 1, paint("stone.light"))
      .setOrigin(0);
    this.panel.add(rule);
    // Under the bag: what I hold in 솔방울; the confirm, my seal's place and the time left.
    const footY = page.y + FOOT_Y;
    this.panel.add(scene.add.image(leftX, footY + 4, "ui", "icon/pinecone").setOrigin(0));
    const wallet = new Label(scene, leftX + 15, footY + 6, "", {
      font: "galmuri9",
      color: "stone.dark",
    });
    this.panel.add(wallet.obj);
    const paintWallet = () => wallet.set(amount(inventory.moneyText("pinecone")));
    paintWallet();
    this.confirm = new Button(ctx, page.x + page.w - PAD - 74, footY, {
      label: t("trade.confirm"),
      kind: "ink",
      w: 74,
      sound: "confirm",
      onPress: () => void this.press(),
    });
    this.clockLabel = new Label(scene, 0, 0, "", { font: "galmuri9", color: "stone.dark" });
    this.panel.add([this.confirm, this.clockLabel.obj]);
    // Seals: mine lands in the dent beside 확정, theirs on the dashed ring by their name.
    for (const [side, x, y, empty] of [
      ["me", this.confirm.x - 4 - 21, footY, "seal/slot"],
      ["them", rightX + TRAY_W - 21, page.y, "seal/off"],
    ] as const) {
      this.panel.add(scene.add.image(x, y, "ui", empty).setOrigin(0));
      const seal = scene.add.image(x, y, "ui", "seal/on").setOrigin(0).setVisible(false);
      this.panel.add(seal);
      this.seals[side] = seal;
    }
    this.tick = () => {
      if (this.closing) return;
      const left = Math.max(0, Math.ceil((this.expiresAt - Date.now()) / 1000));
      this.clockLabel.set(`${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`);
      this.clockLabel.at(this.seals.me.x - 6 - this.clockLabel.width, footY + 6);
      paintWallet();
    };
    this.scene.time.addEvent({ delay: 1000, loop: true, callback: this.tick });
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
    const leftX = page.x + PAD;
    const rightX = leftX + TRAY_W + MID;
    const mine = this.offers[this.link.me ?? ""] ?? EMPTY;
    const theirs = this.offers[this.partner.id] ?? EMPTY;
    this.mine = {
      items: [...mine.items.map((i) => i.id)],
      stacks: { ...mine.stacks },
      pinecone: mine.pinecone,
    };
    this.tray(leftX, page.y + TRAY_Y, mine, true);
    this.tray(rightX, page.y + TRAY_Y, theirs, false);
    // Their 솔방울, written; each side's line ends in the tax and what arrives on the other side.
    const coinY = page.y + COIN_Y;
    if (theirs.pinecone !== "0") {
      this.layer.add(this.scene.add.image(rightX, coinY + 3, "ui", "icon/pinecone").setOrigin(0));
      const n = new Label(this.scene, rightX + 15, coinY + 5, amount(theirs.pinecone), {
        font: "galmuri11-bold",
        color: "ink.dark",
      });
      this.layer.add(n.obj);
    }
    this.arrival(leftX + 15, page.y + TAX_Y, mine.pinecone);
    this.arrival(rightX + 15, page.y + TAX_Y, theirs.pinecone);
    if (document.activeElement !== this.coins.field) this.coins.value = mine.pinecone;
    if (tear) this.tearSeals();
    else for (const side of ["me", "them"] as const) this.seals[side].setVisible(this.sealed(side));
    this.paintConfirm();
    this.drawBag();
  }

  /** `−tax → what arrives` from `x`: the 5% off 솔방울 on their way across. */
  private arrival(x: number, y: number, moved: string): void {
    if (!AMOUNT.test(moved) || moved === "0") return;
    const tax = directTax(BigInt(moved));
    const net = BigInt(moved) - tax;
    const arrive = new Label(this.scene, 0, y, amount(net.toString()), {
      font: "galmuri9",
      color: "ink.dark",
    });
    const arrow = new Label(this.scene, 0, y, "→", { font: "galmuri9", color: "stone.dark" });
    const cut = new Label(this.scene, 0, y, `−${amount(tax.toString())}`, {
      font: "galmuri9",
      color: "red.mid",
    });
    cut.at(x, y);
    arrow.at(x + cut.width + 3, y);
    arrive.at(x + cut.width + arrow.width + 6, y);
    this.layer.add([cut.obj, arrow.obj, arrive.obj]);
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
        smallCount: true,
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
    const top = page.y + BAG_Y;
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
      page.x + PAD,
      top,
      BAG_COLS,
      BAG_ROWS,
      entries.slice(this.bagPage * per),
      this.bagLayer,
    );
    if (pages > 1) {
      const turn = new Button(this.ctx, page.x + PAD + 72, page.y + FOOT_Y + 1, {
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
    this.unhold();
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
