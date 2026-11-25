import { EVOLUTION, hasUnlock, type ItemView, TIERS, TOOL_MAX_LEVEL } from "@guago/shared";
import type * as Phaser from "phaser";
import { t } from "../i18n/index.ts";
import {
  bookDef,
  bookGood,
  bookPower,
  GRADE_INK,
  gradeName,
  itemGood,
  materialGood,
} from "../items/catalog.ts";
import { inventory } from "../state/inventory.ts";
import { Button } from "../ui/button.ts";
import { ItemCard } from "../ui/item-card.ts";
import { CELL, type CellItem, dragGhost, ItemCell } from "../ui/item-cell.ts";
import { ItemGrid } from "../ui/item-grid.ts";
import { RedPen } from "../ui/marks.ts";
import { stamp, turnPage } from "../ui/motion.ts";
import { sound } from "../ui/sound.ts";
import { Label, wrap } from "../ui/text.ts";
import { paint } from "../ui/theme.ts";
import type { Ctx } from "../ui/widget.ts";
import { session } from "../world/session.ts";
import { onGone, opRefusal, SaidLine, walletRow } from "./common.ts";
import { registerMenuTab } from "./notebook.ts";
import { type StationArg, type StationKind, StationView } from "./stations.ts";

/**
 * 가방 (PLAN §8): what is worn on the left, books over tools, with the inspector under them for
 * whatever was picked; the bag on the right by kind; the wallet along the bottom. An item goes on
 * by its button or by dragging it to a slot, and comes off the same ways. Every change to an item
 * starts from the inspector, which names the obvious next action in ink.
 */

type Kind = "book" | "tool" | "material" | "snack";
const KINDS: readonly Kind[] = ["book", "tool", "material", "snack"];

type Pick = { readonly item: string } | { readonly stack: string };

export interface BagHost {
  station(arg: StationArg): void;
}

const COLS = 9;
const ROWS = 5;
const PITCH = CELL + 2;
const LEFT_W = 168;

export class BagView {
  readonly root: Phaser.GameObjects.Container;
  private readonly ctx: Ctx;
  private readonly host: BagHost;
  private readonly size: { w: number; h: number };
  private readonly bookSlots: ItemCell[] = [];
  private readonly toolSlots: ItemCell[] = [];
  private readonly grid: ItemGrid;
  private readonly card: ItemCard;
  private readonly inspector: Phaser.GameObjects.Container;
  private readonly said: SaidLine;
  private readonly kindTabs: { kind: Kind; button: Button; mark: Phaser.GameObjects.Rectangle }[] =
    [];
  private readonly pen: RedPen;
  private kind: Kind = "book";
  private pick: Pick | undefined;
  /** What the grid shows now, in order. */
  private shown: { item?: ItemView; stack?: string; count?: number }[] = [];
  /** Waiting for a slot to put this item in. */
  private choosing: ItemView | undefined;
  private pending = false;
  private tier = 0;

  constructor(
    ctx: Ctx,
    parent: Phaser.GameObjects.Container,
    size: { w: number; h: number },
    host: BagHost,
    select?: string,
  ) {
    this.ctx = ctx;
    this.host = host;
    this.size = size;
    const s = ctx.scene;
    this.root = s.add.container(0, 0);
    parent.add(this.root);
    this.card = new ItemCard(s);
    this.tier = inventory.snap?.progression.tier ?? 0;

    // Worn: books, then tools, three to a row; slots past the tier are locked.
    const tier = TIERS[this.tier] ?? TIERS[0];
    for (let i = 0; i < 6; i++) {
      const at = { x: 6 + (i % 3) * PITCH, y: 4 + Math.floor(i / 3) * PITCH };
      const book = new ItemCell(ctx, at.x, at.y, {
        locked: i >= (tier?.books ?? 2),
        onPress: () => this.pressSlot("book", i),
        onPeek: (on) => this.peekWorn("book", i, on),
        onDragStart: (p) => this.dragWorn("book", i, p),
      });
      const tool = new ItemCell(ctx, at.x + 92, at.y, {
        locked: i >= (tier?.tools ?? 1),
        onPress: () => this.pressSlot("tool", i),
        onPeek: (on) => this.peekWorn("tool", i, on),
        onDragStart: (p) => this.dragWorn("tool", i, p),
      });
      this.bookSlots.push(book);
      this.toolSlots.push(tool);
      this.root.add([book, tool]);
    }
    // A pencil line between the books and the tools.
    this.root.add(
      s.add.rectangle(6 + 3 * PITCH + 4, 6, 1, 2 * PITCH - 4, paint("stone.light")).setOrigin(0),
    );
    this.pen = new RedPen(s);
    this.root.add(this.pen.gfx);

    // The inspector: the picked item, its facts and what can be done with it.
    this.inspector = s.add.container(6, 4 + 2 * PITCH + 8);
    this.root.add(this.inspector);
    this.said = new SaidLine(s, this.root, 6, size.h - 36, LEFT_W - 10);

    // The bag: kinds as words along the top, the wells under them.
    let kx = LEFT_W + 6;
    for (const kind of KINDS) {
      const button = new Button(ctx, kx, 2, {
        kind: "text",
        label: t(`bag.kind.${kind}`),
        sound: "tab",
        onPress: () => this.setKind(kind),
      });
      const mark = s.add
        .rectangle(kx - 1, 15, button.bounds().w + 2, 1, paint("red.mid"))
        .setOrigin(0)
        .setVisible(false);
      this.root.add([button, mark]);
      this.kindTabs.push({ kind, button, mark });
      kx += button.bounds().w + 12;
    }
    this.grid = new ItemGrid(ctx, LEFT_W + 6, 20, {
      cols: COLS,
      rows: ROWS,
      onPick: (i) => this.pickShown(i),
      onPeek: (i, on, cell) => this.peekShown(i, on, cell),
      onDragStart: (i, p) => this.dragShown(i, p),
    });
    this.root.add(this.grid.root);
    const unwallet = walletRow(s, this.root, LEFT_W + 6, size.h - 14);

    const unwatch = inventory.watch(() => this.redraw());
    onGone(this.root, () => {
      unwatch();
      unwallet();
      this.card.hide(true);
    });
    // The inspector starts on what was asked for, else the first book worn.
    const first = select ? inventory.item(select) : inventory.worn("book").get(0);
    if (first) {
      this.kind = first.kind;
      this.pick = { item: first.id };
    }
    this.setKind(this.kind, true);
  }

  private setKind(kind: Kind, quiet = false): void {
    if (kind !== this.kind && !quiet) sound("tab");
    this.kind = kind;
    for (const k of this.kindTabs) k.mark.setVisible(k.kind === kind);
    this.redraw();
  }

  // Drawing ---------------------------------------------------------------------------------

  private redraw(): void {
    const snap = inventory.snap;
    if (!snap) return;
    if (snap.progression.tier !== this.tier) {
      // A new tier opens slots: the page is built again around the same pick.
      this.tier = snap.progression.tier;
    }
    const worn = { book: inventory.worn("book"), tool: inventory.worn("tool") };
    this.bookSlots.forEach((cell, i) => cell.set(this.cellOf(worn.book.get(i))));
    this.toolSlots.forEach((cell, i) => cell.set(this.cellOf(worn.tool.get(i))));
    this.shown = this.listFor(this.kind);
    this.grid.setItems(
      this.shown.map((e) =>
        e.item
          ? (this.cellOf(e.item) as CellItem)
          : { icon: materialGood(e.stack ?? "").icon, count: e.count ?? 0 },
      ),
    );
    // Keep the pick if it still exists; an item eaten by an operation lets go.
    const p = this.pick;
    if (p && "item" in p && !inventory.item(p.item)) this.pick = undefined;
    if (p && "stack" in p && inventory.count(p.stack) <= 0) this.pick = undefined;
    const index = this.shown.findIndex((e) =>
      this.pick && "item" in this.pick
        ? e.item?.id === this.pick.item
        : e.stack === (this.pick as { stack?: string } | undefined)?.stack,
    );
    this.grid.select(index >= 0 ? index : undefined);
    for (const [kind, cells] of [
      ["book", this.bookSlots],
      ["tool", this.toolSlots],
    ] as const) {
      cells.forEach((cell, i) => {
        const it = worn[kind].get(i);
        cell.setSelected(!!it && !!this.pick && "item" in this.pick && this.pick.item === it.id);
      });
    }
    this.drawInspector();
  }

  private cellOf(it: ItemView | undefined): CellItem | undefined {
    if (!it) return undefined;
    const good = itemGood(it);
    return {
      icon: good.icon,
      grade: it.kind === "book" ? it.grade : undefined,
      ...(it.kind === "book" && it.pilgi > 0 ? { badge: `+${it.pilgi}` } : {}),
      ...(it.kind === "tool" ? { badge: `${it.level}` } : {}),
      worn: it.slot !== null,
    } as CellItem;
  }

  /** The bag's contents of one kind: items not worn, strongest first; stacks by name. */
  private listFor(kind: Kind): { item?: ItemView; stack?: string; count?: number }[] {
    const snap = inventory.snap;
    if (!snap) return [];
    if (kind === "book" || kind === "tool") {
      return inventory
        .items(kind)
        .filter((i) => i.slot === null)
        .sort(
          (a, b) =>
            b.grade - a.grade ||
            b.level - a.level ||
            b.pilgi - a.pilgi ||
            a.def.localeCompare(b.def),
        )
        .map((item) => ({ item }));
    }
    const ids = Object.entries(snap.materials)
      .filter(
        ([id, n]) =>
          n > 0 && (kind === "snack" ? id.startsWith("snack:") : !id.startsWith("snack:")),
      )
      .map(([id, n]) => ({ stack: id, count: n }));
    const order = (id: string) => (id === "ink" ? 0 : id === "binding" ? 1 : 2);
    return ids.sort((a, b) => order(a.stack) - order(b.stack) || a.stack.localeCompare(b.stack));
  }

  // The inspector ---------------------------------------------------------------------------

  private drawInspector(): void {
    const s = this.ctx.scene;
    this.inspector.removeAll(true);
    const p = this.pick;
    if (!p) return;
    const w = LEFT_W - 10;
    let y = 0;
    const add = (o: Phaser.GameObjects.GameObject) => this.inspector.add(o);
    const actions: { id: string; label: string; ink?: boolean; run: () => void }[] = [];
    if ("item" in p) {
      const it = inventory.item(p.item);
      if (!it) return;
      const good = itemGood(it);
      const name = new Label(s, 0, y, good.name, {
        font: "galmuri11-bold",
        color: it.kind === "book" ? (GRADE_INK[it.grade] ?? "ink.dark") : "ink.dark",
        width: w,
      });
      add(name.obj);
      y += name.height + 2;
      const facts =
        it.kind === "book"
          ? [
              gradeName(it.grade),
              `Lv ${it.level}`,
              ...(it.pilgi > 0 ? [`${t("bag.pilgi")} +${it.pilgi}`] : []),
            ]
          : [`Lv ${it.level} / ${TOOL_MAX_LEVEL}`];
      add(new Label(s, 0, y, facts.join(" · "), { font: "galmuri9", color: "ink.mid" }).obj);
      y += 12;
      if (it.kind === "book") {
        add(
          new Label(s, 0, y, `${t("bag.power")} ${bookPower(it).toLocaleString("en-US")}`, {
            font: "galmuri9",
            color: "ink.dark",
          }).obj,
        );
        y += 12;
      }
      const rows = wrap(s, "galmuri9", good.desc, w).slice(0, 2);
      add(
        new Label(s, 0, y + 1, rows.join("\n"), {
          font: "galmuri9",
          color: "stone.dark",
          leading: 1,
        }).obj,
      );
      y += rows.length * 12 + 4;
      this.itemActions(it, actions);
    } else {
      const good = materialGood(p.stack);
      add(
        new Label(s, 0, y, good.name, { font: "galmuri11-bold", color: "ink.dark", width: w }).obj,
      );
      y += 15;
      add(
        new Label(s, 0, y, `× ${inventory.count(p.stack).toLocaleString("en-US")}`, {
          font: "galmuri9",
          color: "ink.mid",
        }).obj,
      );
      y += 12;
      const rows = wrap(s, "galmuri9", good.desc, w).slice(0, 2);
      add(
        new Label(s, 0, y + 1, rows.join("\n"), {
          font: "galmuri9",
          color: "stone.dark",
          leading: 1,
        }).obj,
      );
      y += rows.length * 12 + 4;
      if (p.stack.startsWith("sheet:")) {
        actions.push({
          id: "bind",
          label: t("bag.do.bind"),
          ink: inventory.count(p.stack) >= 20,
          run: () => this.host.station({ station: "bindery", def: p.stack.slice(6) }),
        });
      }
      if (p.stack === "snack:energy-drink") {
        actions.push({
          id: "drink",
          label: t("bag.do.drink"),
          ink: true,
          run: () => void this.run("drowsy.drink", {}),
        });
      }
    }
    // The actions, the obvious next one in ink, as many rows as they need.
    let bx = 0;
    let by = y;
    const firstInk = actions.findIndex((a) => a.ink);
    actions.forEach((a, i) => {
      const b = new Button(this.ctx, bx, by, {
        label: a.label,
        kind: i === (firstInk < 0 ? 0 : firstInk) ? "ink" : "paper",
        font: "galmuri9",
        h: 17,
        onPress: a.run,
      });
      if (bx > 0 && bx + b.bounds().w > w) {
        bx = 0;
        by += 20;
        b.setPosition(bx, by);
      }
      bx += b.bounds().w + 4;
      b.setEnabled(!this.pending);
      this.inspector.add(b);
    });
  }

  private itemActions(
    it: ItemView,
    out: { id: string; label: string; ink?: boolean; run: () => void }[],
  ): void {
    const worn = it.slot !== null;
    const prog = inventory.snap?.progression;
    if (worn)
      out.push({
        id: "unequip",
        label: t("bag.do.unequip"),
        run: () => void this.run("unequip", { item: it.id }),
      });
    else out.push({ id: "equip", label: t("bag.do.equip"), ink: true, run: () => this.equip(it) });
    if (it.kind === "book") {
      const ready = this.evolveReady(it);
      if (!it.evolved && ready)
        out.unshift({
          id: "evolve",
          label: t("bag.do.evolve"),
          ink: true,
          run: () => this.station("evolve", it),
        });
      out.push({
        id: "pilgi",
        label: t("bag.do.pilgi"),
        ink: worn,
        run: () => this.station("pilgi", it),
      });
      const copies = inventory
        .items("book")
        .filter((b) => b.def === it.def && b.grade === it.grade);
      if (copies.length >= 3 && it.grade < 4)
        out.push({ id: "forge", label: t("bag.do.forge"), run: () => this.station("forge", it) });
      if (inventory.count(`sheet:${it.def}`) > 0 && prog && it.level < prog.level) {
        out.push({ id: "feed", label: t("bag.do.feed"), run: () => this.station("feed", it) });
      }
    } else {
      const others = inventory.items("tool").filter((o) => o.def === it.def && o.id !== it.id);
      if (others.length > 0 && it.level < TOOL_MAX_LEVEL)
        out.push({ id: "merge", label: t("bag.do.merge"), run: () => this.station("merge", it) });
    }
  }

  private evolveReady(it: ItemView): boolean {
    const prog = inventory.snap?.progression;
    const tier = TIERS[prog?.tier ?? 0];
    if (!tier || !hasUnlock(tier, "evolution")) return false;
    if (it.grade < EVOLUTION.grade || it.level < EVOLUTION.level) return false;
    const def = bookDef(it.def);
    return inventory
      .items("tool")
      .some((tl) => tl.def === def?.tool && tl.level >= EVOLUTION.toolLevel);
  }

  private station(kind: StationKind, it: ItemView): void {
    this.card.hide(true);
    this.host.station({ station: kind, item: it.id });
  }

  // Picking, peeking and dragging -----------------------------------------------------------

  private pickShown(i: number): void {
    const e = this.shown[i];
    if (!e) return;
    this.choosing = undefined;
    this.pen.hide(80);
    this.pick = e.item ? { item: e.item.id } : { stack: e.stack ?? "" };
    this.said.clear();
    this.redraw();
  }

  private pressSlot(kind: "book" | "tool", slot: number): void {
    const choosing = this.choosing;
    if (choosing && choosing.kind === kind) {
      this.choosing = undefined;
      this.pen.hide(80);
      void this.run("equip", { item: choosing.id, slot }, { kind, slot });
      return;
    }
    const it = inventory.worn(kind).get(slot);
    if (!it) return;
    this.pick = { item: it.id };
    this.said.clear();
    this.redraw();
  }

  /** On: the first open slot, or, with every slot full, ring the slots and wait for one. */
  private equip(it: ItemView): void {
    const kind = it.kind;
    const tier = TIERS[inventory.snap?.progression.tier ?? 0];
    const open = kind === "book" ? (tier?.books ?? 2) : (tier?.tools ?? 1);
    const worn = inventory.worn(kind);
    for (let i = 0; i < open; i++) {
      if (!worn.has(i)) {
        void this.run("equip", { item: it.id, slot: i }, { kind, slot: i });
        return;
      }
    }
    this.choosing = it;
    const cells = kind === "book" ? this.bookSlots : this.toolSlots;
    const first = cells[0] as ItemCell;
    this.pen.box(first.x - 2, first.y - 2, 3 * PITCH + 2, (open > 3 ? 2 : 1) * PITCH + 2);
    this.pen.hide(0);
    this.pen.show(180);
    sound("page");
  }

  private peekShown(i: number, on: boolean, cell: ItemCell): void {
    if (!on) {
      this.card.hide();
      return;
    }
    const e = this.shown[i];
    if (!e) return;
    this.showCard(e.item, e.stack, cell);
  }

  private peekWorn(kind: "book" | "tool", slot: number, on: boolean): void {
    if (!on) {
      this.card.hide();
      return;
    }
    const it = inventory.worn(kind).get(slot);
    const cell = (kind === "book" ? this.bookSlots : this.toolSlots)[slot];
    if (it && cell) this.showCard(it, undefined, cell);
  }

  private showCard(it: ItemView | undefined, stack: string | undefined, cell: ItemCell): void {
    const at = cell.bounds();
    if (stack) {
      const g = materialGood(stack);
      this.card.show(at, {
        name: g.name,
        facts: [`× ${inventory.count(stack).toLocaleString("en-US")}`],
        note: g.desc,
      });
      return;
    }
    if (!it) return;
    const g = itemGood(it);
    if (it.kind === "tool") {
      this.card.show(at, {
        name: g.name,
        facts: [`Lv ${it.level} / ${TOOL_MAX_LEVEL}`],
        note: g.desc,
      });
      return;
    }
    // Compared with the copy of it that is worn, or else the weakest book worn.
    const worn = [...inventory.worn("book").values()].filter((w) => w.id !== it.id);
    const same = worn.find((w) => w.def === it.def);
    const weakest = worn.sort((a, b) => bookPower(a) - bookPower(b))[0];
    const against = it.slot === null ? (same ?? weakest) : undefined;
    const power = bookPower(it);
    this.card.show(at, {
      name: g.name,
      color: GRADE_INK[it.grade] ?? "ink.dark",
      facts: [
        gradeName(it.grade),
        `Lv ${it.level}`,
        ...(it.pilgi > 0 ? [`${t("bag.pilgi")} +${it.pilgi}`] : []),
      ],
      power: {
        label: t("bag.power"),
        value: power.toLocaleString("en-US"),
        ...(against ? { delta: power - bookPower(against) } : {}),
      },
      attack: firstSentence(g.desc),
      ...(it.evolved
        ? { note: t("bag.evolved"), noteColor: "gold.deep" }
        : this.evolveReady(it)
          ? { note: t("bag.evolveReady"), noteColor: "red.dark" }
          : {}),
    });
  }

  private dragShown(i: number, p: Phaser.Input.Pointer): void {
    const e = this.shown[i];
    if (!e?.item) return;
    this.card.hide(true);
    const it = e.item;
    dragGhost(this.ctx.scene, itemGood(it).icon, p, (x, y) => {
      const cells = it.kind === "book" ? this.bookSlots : this.toolSlots;
      const slot = cells.findIndex((c) => {
        const b = c.bounds();
        return x >= b.x - 3 && x < b.x + b.w + 3 && y >= b.y - 3 && y < b.y + b.h + 3;
      });
      if (slot >= 0) void this.run("equip", { item: it.id, slot }, { kind: it.kind, slot });
    });
  }

  private dragWorn(kind: "book" | "tool", slot: number, p: Phaser.Input.Pointer): void {
    const it = inventory.worn(kind).get(slot);
    if (!it) return;
    this.card.hide(true);
    dragGhost(this.ctx.scene, itemGood(it).icon, p, (x, y) => {
      const g = this.grid.root;
      const m = g.getWorldTransformMatrix();
      if (
        x >= m.tx - 4 &&
        y >= m.ty - 4 &&
        x < m.tx + this.grid.size.w + 4 &&
        y < m.ty + this.grid.size.h + 4
      ) {
        void this.run("unequip", { item: it.id });
        return;
      }
      // Dropped on another slot of its kind: it moves there.
      const cells = kind === "book" ? this.bookSlots : this.toolSlots;
      const to = cells.findIndex((c) => {
        const b = c.bounds();
        return x >= b.x - 3 && x < b.x + b.w + 3 && y >= b.y - 3 && y < b.y + b.h + 3;
      });
      if (to >= 0 && to !== slot)
        void this.run("equip", { item: it.id, slot: to }, { kind, slot: to });
    });
  }

  // Operations ------------------------------------------------------------------------------

  private async run(
    name: "equip" | "unequip" | "drowsy.drink",
    req: { item?: string; slot?: number } | Record<string, never>,
    landing?: { kind: "book" | "tool"; slot: number },
  ): Promise<void> {
    if (this.pending) return;
    this.pending = true;
    this.drawInspector();
    const r = await inventory.op(name as "equip", req as { item: string; slot: number });
    this.pending = false;
    if (!this.root.active) return;
    if (r.ok) {
      if (name === "equip" && landing) {
        const cell = (landing.kind === "book" ? this.bookSlots : this.toolSlots)[landing.slot];
        if (cell) stamp(cell, { x: cell.x, y: cell.y });
        sound("stamp");
      } else sound("confirm");
    } else {
      sound("error");
      this.said.say(opRefusal(r));
    }
    this.redraw();
  }
}

function firstSentence(text: string): string {
  const m = text.match(/^.*?[.!?](\s|$)/);
  return (m ? m[0] : text).trim();
}

/** The name a book shows: its evolution's, once it has evolved. */
export function bookName(def: string, evolved: boolean): string {
  return bookGood(def, evolved).name;
}

export function isStationArg(arg: unknown): arg is StationArg {
  return typeof arg === "object" && arg !== null && "station" in arg;
}

/** 가방 in the notebook: the bag, and each station turned to on the same page. */
export function registerBag(): void {
  registerMenuTab({
    id: "bag",
    label: t("menu.bag"),
    icon: "menu/bag",
    order: 10,
    build(ctx, page, size, arg) {
      const focus = () => ctx.scope.focus(ctx.scope.first(), "key");
      const host: BagHost & { bag(select?: string): void } = {
        bag(select) {
          turnPage(page, () => {
            page.removeAll(true);
            new BagView(ctx, page, size, host, select);
            focus();
          });
        },
        station(a) {
          turnPage(page, () => {
            page.removeAll(true);
            new StationView(ctx, page, size, a, (select) => host.bag(select));
            focus();
          });
        },
      };
      if (isStationArg(arg)) new StationView(ctx, page, size, arg, (select) => host.bag(select));
      else new BagView(ctx, page, size, host);
    },
  });
}
