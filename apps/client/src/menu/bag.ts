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
import { CELL, type CellItem, dragGhost, ItemCell, wellFrame } from "../ui/item-cell.ts";
import { ItemGrid } from "../ui/item-grid.ts";
import { RedPen } from "../ui/marks.ts";
import { fade, stamp, turnPage } from "../ui/motion.ts";
import { sound } from "../ui/sound.ts";
import { Label, measure, wrap } from "../ui/text.ts";
import { paint } from "../ui/theme.ts";
import type { Ctx } from "../ui/widget.ts";
import { onGone, opRefusal, SaidLine, walletRow } from "./common.ts";
import { registerMenuTab } from "./notebook.ts";
import { type StationArg, type StationKind, StationView } from "./stations.ts";

/**
 * 가방 (PLAN §8): what is worn on the left, books over tools, with the inspector under them for
 * whatever was picked: the item large in its well with its name, its power and 필기, its line,
 * and its actions along the foot of the page; the bag on the right by kind; the wallet along the
 * bottom. An item goes on by its button or by dragging it to a slot, and comes off the same ways.
 * Every change to an item starts from the inspector, which names the obvious next action in ink.
 */

type Kind = "book" | "tool" | "material" | "snack";
const KINDS: readonly Kind[] = ["book", "tool", "material", "snack"];

type Pick = { readonly item: string } | { readonly stack: string };

export interface BagHost {
  station(arg: StationArg): void;
}

const COLS = 9;
const ROWS = 6;
const PITCH = CELL + 2;
/** Worn books from the left edge, a pencil line, then worn tools; the bag starts past them. */
const BOOKS_X = 6;
const RULE_X = BOOKS_X + 3 * PITCH + 2;
const TOOLS_X = RULE_X + 4;
const LEFT_W = TOOLS_X + 3 * PITCH + 4;
/** The inspector under the worn wells, and where in it the item's line starts. */
const INSPECTOR_Y = 4 + 2 * PITCH + 8;
const DESC_Y = 2 * CELL + 22;

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
  /** The picked item's line; the school's answer takes its place while it is said. */
  private desc: Phaser.GameObjects.BitmapText | undefined;
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
      const at = { x: (i % 3) * PITCH, y: 4 + Math.floor(i / 3) * PITCH };
      const book = new ItemCell(ctx, BOOKS_X + at.x, at.y, {
        locked: i >= (tier?.books ?? 2),
        onPress: () => this.pressSlot("book", i),
        onPeek: (on) => this.peekWorn("book", i, on),
        onDragStart: (p) => this.dragWorn("book", i, p),
      });
      const tool = new ItemCell(ctx, TOOLS_X + at.x, at.y, {
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
    this.root.add(s.add.rectangle(RULE_X, 6, 1, 2 * PITCH - 4, paint("stone.light")).setOrigin(0));
    this.pen = new RedPen(s);
    this.root.add(this.pen.gfx);

    // The inspector: the picked item, its facts and what can be done with it.
    this.inspector = s.add.container(6, INSPECTOR_Y);
    this.root.add(this.inspector);
    // What the school says back to an action stands where the item's line was, by the buttons.
    this.said = new SaidLine(s, this.root, 6, INSPECTOR_Y + DESC_Y + 1, LEFT_W - 10);
    this.said.onShow = (on) => {
      if (this.desc?.active) fade(this.desc, on ? 0 : 1, on ? 80 : 200);
    };

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
        .rectangle(kx - 1, 15, button.size().w + 2, 1, paint("red.mid"))
        .setOrigin(0)
        .setVisible(false);
      this.root.add([button, mark]);
      this.kindTabs.push({ kind, button, mark });
      kx += button.size().w + 12;
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
    this.bookSlots.forEach((cell, i) => {
      cell.set(this.cellOf(worn.book.get(i)));
    });
    this.toolSlots.forEach((cell, i) => {
      cell.set(this.cellOf(worn.tool.get(i)));
    });
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
    this.desc = undefined;
    const p = this.pick;
    if (!p) return;
    const w = LEFT_W - 10;
    const add = (o: Phaser.GameObjects.GameObject) => this.inspector.add(o);
    const actions: { id: string; label: string; ink?: boolean; run: () => void }[] = [];
    let well: CellItem;
    let name: string;
    let nameInk = "ink.dark";
    const facts: [string, string][] = [];
    let text = "";
    if ("item" in p) {
      const it = inventory.item(p.item);
      if (!it) return;
      const good = itemGood(it);
      well = this.cellOf(it) as CellItem;
      name = good.name;
      text = good.desc;
      if (it.kind === "book") {
        nameInk = GRADE_INK[it.grade] ?? "ink.dark";
        facts.push([gradeName(it.grade), nameInk], [`Lv ${it.level}`, "ink.mid"]);
      } else facts.push([`Lv ${it.level} / ${TOOL_MAX_LEVEL}`, "ink.mid"]);
      this.itemActions(it, actions);
      if (it.kind === "book") this.powerRow(it);
    } else {
      const good = materialGood(p.stack);
      well = { icon: good.icon };
      name = good.name;
      text = good.desc;
      facts.push([`× ${inventory.count(p.stack).toLocaleString("en-US")}`, "ink.mid"]);
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
    // The item large in its well, its name and what it is beside it.
    const big = 2 * CELL;
    if (well.grade !== undefined)
      add(s.add.image(0, 0, "ui", wellFrame(well.grade)).setOrigin(0).setScale(2));
    add(
      s.add
        .image(big / 2, big / 2, "ui", well.icon)
        .setOrigin(0.5)
        .setScale(2),
    );
    const nameLabel = new Label(s, big + 6, 3, name, {
      font: "galmuri11-bold",
      color: nameInk,
      width: w - big - 6,
    });
    add(nameLabel.obj);
    let fx = big + 6;
    const fy = 3 + nameLabel.height + 1;
    for (const [i, [fact, color]] of facts.entries()) {
      if (i > 0) {
        add(new Label(s, fx, fy, "·", { font: "galmuri9", color: "stone.mid" }).obj);
        fx += 8;
      }
      const l = new Label(s, fx, fy, fact, { font: "galmuri9", color });
      add(l.obj);
      fx += l.width + 4;
    }
    // The actions along the foot of the page, the obvious next one in ink.
    const foot = this.size.h - INSPECTOR_Y - 18;
    const firstInk = actions.findIndex((a) => a.ink);
    const buttons = actions.map(
      (a, i) =>
        new Button(this.ctx, 0, 0, {
          label: a.label,
          kind: i === Math.max(0, firstInk) ? "ink" : "paper",
          font: "galmuri9",
          h: 17,
          onPress: a.run,
        }),
    );
    const rows: Button[][] = [[]];
    let bx = 0;
    for (const b of buttons) {
      if (bx > 0 && bx + b.size().w > w) {
        rows.push([]);
        bx = 0;
      }
      rows[rows.length - 1]?.push(b);
      bx += b.size().w + 4;
    }
    rows.forEach((row, r) => {
      let x = 0;
      for (const b of row) {
        b.setPosition(x, foot - (rows.length - 1 - r) * 20);
        x += b.size().w + 4;
        b.setEnabled(!this.pending);
        this.inspector.add(b);
      }
    });
    // The item's line fills what is between, in as many rows as it needs.
    if (text) {
      const lines = wrap(s, "galmuri9", text, w);
      // A book's power row stands over it; anything else starts right under its name.
      const top = "item" in p && inventory.item(p.item)?.kind === "book" ? DESC_Y : big + 8;
      const room = Math.max(1, Math.floor((foot - (rows.length - 1) * 20 - 4 - top) / 13));
      const shown = lines.length > room ? fitLines(s, lines, room, w) : lines;
      const d = new Label(s, 0, top + 1, shown.join("\n"), {
        font: "galmuri9",
        color: "stone.dark",
        leading: 1,
      });
      add(d.obj);
      this.desc = d.obj;
      if (this.said.root.length > 0) d.obj.setAlpha(0);
    }
  }

  /** A book's power, large, and its 필기 in red pen at the right, between its name and its line. */
  private powerRow(it: ItemView): void {
    const s = this.ctx.scene;
    const w = LEFT_W - 10;
    const y = 2 * CELL + 6;
    const label = new Label(s, 0, y + 2, t("bag.power"), { font: "galmuri9", color: "stone.dark" });
    const value = new Label(s, label.width + 4, y, bookPower(it).toLocaleString("en-US"), {
      font: "galmuri11-bold",
      color: "ink.dark",
    });
    this.inspector.add([label.obj, value.obj]);
    if (it.pilgi > 0) {
      const pen = new Label(s, 0, y, `+${it.pilgi}`, { font: "galmuri11-bold", color: "red.mid" });
      pen.at(w - pen.width, y);
      const word = new Label(s, 0, y + 2, t("bag.pilgi"), { font: "galmuri9", color: "red.dark" });
      word.at(w - pen.width - 4 - word.width, y + 2);
      this.inspector.add([word.obj, pen.obj]);
    }
    const note = it.evolved
      ? { text: t("bag.evolved"), color: "gold.deep" }
      : this.evolveReady(it)
        ? { text: t("bag.evolveReady"), color: "red.dark" }
        : undefined;
    // Beside the facts under the name, where there is room for it.
    if (note) {
      const n = new Label(s, 0, 0, note.text, { font: "galmuri9", color: note.color });
      n.at(w - n.width, 2 * CELL - 9);
      this.inspector.add(n.obj);
    }
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
    // The inspector says it all now; the card would only cover it.
    this.card.hide(true);
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
    this.card.hide(true);
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
    // What the inspector already shows gets no card over it.
    const p = this.pick;
    if (p && (("item" in p && p.item === it?.id) || ("stack" in p && p.stack === stack))) return;
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

/** Lines cut to `room` rows, the last ending in an ellipsis at a whole word where it can. */
function fitLines(scene: Phaser.Scene, lines: string[], room: number, w: number): string[] {
  const kept = lines.slice(0, room);
  let last = kept[room - 1] ?? "";
  while (last && measure(scene, "galmuri9", `${last}…`) > w) {
    const cut = last.lastIndexOf(" ");
    last = cut > 0 ? last.slice(0, cut) : last.slice(0, -1);
  }
  kept[room - 1] = `${last}…`;
  return kept;
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
