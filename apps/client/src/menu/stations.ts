import {
  BIND,
  bindCost,
  bookExpToNext,
  EVOLUTION,
  feedSheets,
  forgeFee,
  hasUnlock,
  type ItemView,
  TIERS,
  TOOL_MAX_LEVEL,
} from "@guago/shared";
import type * as Phaser from "phaser";
import { t } from "../i18n/index.ts";
import {
  amount,
  bookDef,
  bookGood,
  bookPower,
  GRADE_INK,
  gradeName,
  itemGood,
  termName,
  toolGood,
} from "../items/catalog.ts";
import { cue } from "../sound/audio.ts";
import { inventory } from "../state/inventory.ts";
import { live } from "../state/live.ts";
import { Button } from "../ui/button.ts";
import { type Cost, CostRow } from "../ui/cost-row.ts";
import { CELL, type CellItem, ItemCell } from "../ui/item-cell.ts";
import { ItemGrid } from "../ui/item-grid.ts";
import { fade, shake, slide, stamp } from "../ui/motion.ts";
import { screen } from "../ui/screen.ts";
import { sound } from "../ui/sound.ts";
import { Stepper } from "../ui/stepper.ts";
import { Label } from "../ui/text.ts";
import { paint } from "../ui/theme.ts";
import type { Ctx } from "../ui/widget.ts";
import type { OpCall } from "../world-link.ts";
import { onGone, opRefusal, SaidLine } from "./common.ts";

/**
 * The six ways an item changes (PLAN §8), each one small screen on the notebook page: what goes
 * in on the left, what comes out on the right, what it costs along the bottom, and one button.
 * The press is a moment: the pen scratches before a 필기 lands, three copies slam into one, and an
 * evolution takes the whole screen with the book's own effect art.
 */

export type StationKind = "pilgi" | "forge" | "feed" | "merge" | "evolve" | "bindery";

export interface StationArg {
  readonly station: StationKind;
  /** The item it works on; absent when opened from the world, which asks for one first. */
  readonly item?: string;
  /** 제본: the book whose 낱장 are bound. */
  readonly def?: string;
}

/** The least time the pen scratches before a 필기's result shows, so it is felt. */
const SCRATCH_MS = 900;

const page = () => live.page?.page ?? 1;

export class StationView {
  readonly root: Phaser.GameObjects.Container;
  private readonly ctx: Ctx;
  private readonly size: { w: number; h: number };
  private readonly back: (select?: string) => void;
  private readonly arg: StationArg;
  private readonly stage: Phaser.GameObjects.Container;
  private readonly said: SaidLine;
  private readonly row: CostRow;
  private pending = false;
  /** Drawn on every inventory change; stations set it to redraw what they show. */
  private redraw: () => void = () => {};

  constructor(
    ctx: Ctx,
    parent: Phaser.GameObjects.Container,
    size: { w: number; h: number },
    arg: StationArg,
    back: (select?: string) => void,
  ) {
    this.ctx = ctx;
    this.size = size;
    this.back = back;
    this.arg = arg;
    const s = ctx.scene;
    this.root = s.add.container(0, 0);
    parent.add(this.root);
    const home = new Button(ctx, 4, 1, {
      kind: "text",
      icon: "arrow/left",
      label: t("menu.bag"),
      sound: "close",
      onPress: () => this.back(arg.item),
    });
    const title = new Label(s, 0, 3, t(`station.${arg.station}`), {
      font: "galmuri11-bold",
      color: "ink.dark",
    });
    title.at(Math.round((size.w - title.width) / 2), 3);
    this.stage = s.add.container(0, 22);
    this.said = new SaidLine(s, this.root, 8, size.h - 48, size.w - 16);
    this.row = new CostRow(ctx, 8, size.h - 26, size.w - 16, {
      label: t(`station.do.${arg.station}`),
      onPress: () => void this.press(),
    });
    this.root.add([home, title.obj, this.stage, this.row.root]);
    const unwatch = inventory.watch(() => {
      if (!this.pending) this.redraw();
    });
    onGone(this.root, unwatch);
    this.build();
  }

  private build(): void {
    const a = this.arg;
    const item = a.item ? inventory.item(a.item) : undefined;
    if (a.station === "bindery") {
      if (a.def) this.bindery(a.def);
      else this.pickSheets();
      return;
    }
    if (!item) {
      this.pickItem();
      return;
    }
    switch (a.station) {
      case "pilgi":
        this.pilgi(item);
        break;
      case "forge":
        this.forge(item);
        break;
      case "feed":
        this.feed(item);
        break;
      case "merge":
        this.merge(item);
        break;
      case "evolve":
        this.evolve(item);
        break;
    }
  }

  private get mid(): number {
    return Math.round(this.size.w / 2);
  }

  /** A big well for the thing at the centre of a station. */
  private well(x: number, y: number, item: CellItem | undefined, scale = 2): ItemCell {
    const c = new ItemCell(this.ctx, x, y);
    c.set(item).setScale(scale);
    this.stage.add(c);
    return c;
  }

  private label(
    x: number,
    y: number,
    text: string,
    color = "ink.dark",
    font: "galmuri9" | "galmuri11" | "galmuri11-bold" = "galmuri9",
  ) {
    const l = new Label(this.ctx.scene, x, y, text, { font, color });
    this.stage.add(l.obj);
    return l;
  }

  private arrow(x: number, y: number): void {
    this.stage.add(this.ctx.scene.add.image(x, y, "ui", "arrow/right").setOrigin(0.5).setScale(2));
  }

  // Picking what a station works on, when the world opened it ------------------------------

  private pickItem(): void {
    const kind = this.arg.station === "merge" ? "tool" : "book";
    const items = inventory
      .items(kind)
      .sort((a, b) => b.grade - a.grade || b.level - a.level || a.def.localeCompare(b.def));
    const grid = new ItemGrid(this.ctx, this.mid - Math.round((8 * (CELL + 2)) / 2), 6, {
      cols: 8,
      rows: 4,
      onPick: (i) => {
        const it = items[i];
        if (!it) return;
        this.root.removeAll(true);
        this.root.destroy();
        const parent = this.root.parentContainer;
        if (parent)
          new StationView(this.ctx, parent, this.size, { ...this.arg, item: it.id }, this.back);
      },
    });
    grid.setItems(items.map((it) => cellOf(it)));
    this.stage.add(grid.root);
    this.row.root.setVisible(false);
  }

  private pickSheets(): void {
    const stacks = Object.entries(inventory.snap?.materials ?? {})
      .filter(([id, n]) => id.startsWith("sheet:") && n > 0)
      .sort((a, b) => b[1] - a[1]);
    const grid = new ItemGrid(this.ctx, this.mid - Math.round((8 * (CELL + 2)) / 2), 6, {
      cols: 8,
      rows: 4,
      onPick: (i) => {
        const id = stacks[i]?.[0];
        const parent = this.root.parentContainer;
        if (!id || !parent) return;
        this.root.destroy();
        new StationView(
          this.ctx,
          parent,
          this.size,
          { station: "bindery", def: id.slice(6) },
          this.back,
        );
      },
    });
    grid.setItems(stacks.map(([id, n]) => ({ icon: bookGood(id.slice(6)).icon, count: n })));
    this.stage.add(grid.root);
    this.row.root.setVisible(false);
  }

  // 필기 --------------------------------------------------------------------------------------

  private pilgi(item: ItemView): void {
    const s = this.ctx.scene;
    const wx = this.mid - 120;
    const well = this.well(wx, 14, cellOf(item));
    const name = this.label(wx - 8, 70, itemGood(item).name, GRADE_INK[item.grade] ?? "ink.dark");
    const from = this.label(this.mid - 40, 10, "", "ink.dark", "galmuri11-bold");
    from.obj.setScale(2);
    const chance = this.label(this.mid - 40, 46, "", "red.dark", "galmuri11-bold");
    chance.obj.setScale(2);
    // The chance as a bar: the book's own odds, and the pity earned by failing, in gold.
    const BAR = 150;
    const bx = this.mid - 40;
    const by = 80;
    this.stage.add(s.add.rectangle(bx, by, BAR, 6, paint("stone.light")).setOrigin(0));
    const base = s.add.rectangle(bx, by, 0, 6, paint("red.mid")).setOrigin(0);
    const pity = s.add.rectangle(bx, by, 0, 6, paint("gold.mid")).setOrigin(0);
    this.stage.add([base, pity]);
    const scratch = s.add.graphics();
    this.stage.add(scratch);
    this.redraw = () => {
      const it = inventory.item(item.id);
      if (!it) return;
      well.set(cellOf(it));
      name.set(itemGood(it).name);
      from.set(`+${it.pilgi}  →  +${it.pilgi + 1}`);
      const odds = it.next;
      const c = odds?.chance ?? 0;
      chance.set(`${Math.round(c * 100)}%`);
      const pityShare = Math.min(c, 0.1 * it.pilgiFails);
      slide(base, { x: bx, y: by }, 0);
      s.tweens.add({ targets: base, width: Math.round(BAR * (c - pityShare)), duration: 220 });
      s.tweens.add({
        targets: pity,
        x: bx + Math.round(BAR * (c - pityShare)),
        width: Math.round(BAR * pityShare),
        duration: 320,
      });
      this.row.setCosts(
        odds
          ? [
              { icon: "icon/ink", need: odds.ink, have: inventory.count("ink") },
              {
                icon: "icon/pinecone",
                need: odds.pinecone,
                have: inventory.money("pinecone"),
                text: amount(odds.pinecone),
              },
            ]
          : [],
      );
    };
    this.redraw();
    this.press = async () => {
      const it = inventory.item(item.id);
      if (!it?.next || this.pending) return;
      const failsBefore = it.pilgiFails;
      this.pending = true;
      this.row.setPending(true);
      this.said.clear();
      // The pen scratches over the book while the answer comes.
      const started = Date.now();
      const wb = { x: wx, y: 14, w: CELL * 2, h: CELL * 2 };
      scratch.clear().lineStyle(1, paint("red.mid"), 1);
      let step = 0;
      const pen = s.time.addEvent({
        delay: 60,
        loop: true,
        callback: () => {
          step++;
          const x0 = wb.x + 4 + ((step * 7) % (wb.w - 8));
          const y0 = wb.y + 8 + (Math.floor((step * 3) / 1) % (wb.h - 16));
          scratch.lineBetween(x0, y0, x0 + 6, y0 + (step % 2 === 0 ? 4 : -4));
          if (step % 2 === 0) sound("type");
        },
      });
      const r = await inventory.op("pilgi", { item: it.id, chance: it.next.chance });
      await wait(s, SCRATCH_MS - (Date.now() - started));
      pen.remove();
      this.pending = false;
      this.row.setPending(false);
      if (!this.root.active) return;
      if (!r.ok) {
        scratch.clear();
        this.refuse(r);
        this.redraw();
        return;
      }
      const success = r.outcome.success === true;
      if (success) {
        scratch.clear();
        const pityLanded = failsBefore > 0;
        this.burst(wb.x + wb.w / 2, wb.y + wb.h / 2, pityLanded ? "gold.light" : "stone.bright");
        const after = inventory.item(item.id);
        this.stampText(
          wb.x + wb.w / 2,
          wb.y + wb.h / 2,
          `+${after?.pilgi ?? it.pilgi + 1}`,
          pityLanded ? "gold.mid" : "red.mid",
        );
        cue(pityLanded ? "jingle.level-up" : "jingle.rare-drop");
        sound("stamp");
      } else {
        // The line smears grey, the book shudders, and the pity bar grows.
        scratch.clear().lineStyle(1, paint("stone.dark"), 1);
        for (let i = 0; i < 5; i++)
          scratch.lineBetween(wb.x + 6 + i * 7, wb.y + 10, wb.x + 12 + i * 7, wb.y + wb.h - 10);
        shake(well, { x: well.x, y: well.y });
        sound("error");
        cue("page-flutter", { volume: 0.6 });
        s.time.delayedCall(600, () => fade(scratch, 0, 300, () => scratch.clear().setAlpha(1)));
      }
      this.redraw();
    };
  }

  // 제본 --------------------------------------------------------------------------------------

  private bindery(def: string): void {
    const sheet = `sheet:${def}`;
    const book = bookGood(def);
    const x0 = this.mid - 130;
    const sheets = this.well(x0, 14, { icon: "icon/page", count: 0 });
    const binding = this.well(x0 + 62, 14, { icon: "material/binding" });
    this.arrow(this.mid + 20, 38);
    const out = this.well(this.mid + 60, 14, { icon: book.icon, grade: 0, dim: true });
    this.label(this.mid + 52, 70, book.name, GRADE_INK[0]);
    const count = this.label(x0, 70, "");
    this.redraw = () => {
      const have = inventory.count(sheet);
      sheets.set({ icon: "icon/page", count: have });
      count.set(`${Math.min(have, BIND.sheets)} / ${BIND.sheets}`);
      count.color(have < BIND.sheets ? "red.dark" : "ink.mid");
      const cost = bindCost(def, page());
      this.row.setCosts([
        { icon: "icon/page", need: BIND.sheets, have },
        { icon: "material/binding", need: BIND.binding, have: inventory.count("binding") },
        {
          icon: "icon/pinecone",
          need: cost.pinecone ?? 0,
          have: inventory.money("pinecone"),
          text: amount(cost.pinecone ?? 0),
        },
      ]);
    };
    this.redraw();
    this.press = async () => {
      if (this.pending) return;
      this.pending = true;
      this.row.setPending(true);
      cue("chalk");
      // The sheets and the thread go into the middle while the table works.
      const s = this.ctx.scene;
      for (const w of [sheets, binding]) {
        s.tweens.add({
          targets: w,
          x: this.mid + 60,
          alpha: 0.2,
          duration: 380,
          ease: "Cubic.In",
          yoyo: true,
          hold: 120,
        });
      }
      const r = await inventory.op("craft", { def });
      await wait(s, 700);
      this.pending = false;
      this.row.setPending(false);
      if (!this.root.active) return;
      if (!r.ok) {
        this.refuse(r);
        return;
      }
      out.set({ icon: book.icon, grade: 0 });
      stamp(out, { x: out.x, y: out.y });
      this.burst(out.x + CELL, out.y + CELL, "stone.bright");
      sound("stamp");
      cue("sfx.pickup.page");
      this.redraw();
    };
  }

  // 제련 --------------------------------------------------------------------------------------

  private forge(item: ItemView): void {
    const s = this.ctx.scene;
    const pick = () => {
      const it = inventory.item(item.id);
      if (!it) return [];
      const others = inventory
        .items("book")
        .filter(
          (b) => b.id !== it.id && b.def === it.def && b.grade === it.grade && b.slot === null,
        )
        .sort((a, b) => bookPower(a) - bookPower(b))
        .slice(0, 2);
      return [it, ...others];
    };
    const x0 = this.mid - 150;
    const wells = [0, 1, 2].map((i) => this.well(x0 + i * 40, 26, undefined, 1.5));
    this.arrow(this.mid + 6, 44);
    const out = this.well(this.mid + 40, 14, undefined, 2);
    const outName = this.label(this.mid + 30, 70, "");
    this.redraw = () => {
      const copies = pick();
      wells.forEach((w, i) => w.set(copies[i] ? cellOf(copies[i] as ItemView) : undefined));
      const top = copies.reduce<ItemView | undefined>(
        (a, b) => (!a || b.level > a.level ? b : a),
        undefined,
      );
      if (top && top.grade < 4) {
        const pen = Math.max(...copies.map((c) => c.pilgi));
        out.set({
          icon: itemGood(top).icon,
          grade: top.grade + 1,
          ...(pen > 0 ? { badge: `+${pen}` } : {}),
          dim: copies.length < 3,
        });
        outName.set(`${gradeName(top.grade + 1)} · Lv ${top.level}`);
        outName.color(GRADE_INK[top.grade + 1] ?? "ink.dark");
      }
      const fee = top ? forgeFee(top.grade as 0, page()) : 0;
      this.row.setBlocked(copies.length < 3);
      this.row.setCosts([
        { icon: "icon/pinecone", need: fee, have: inventory.money("pinecone"), text: amount(fee) },
      ]);
    };
    this.redraw();
    this.press = async () => {
      const copies = pick();
      if (copies.length < 3 || this.pending) return;
      this.pending = true;
      this.row.setPending(true);
      // Three into one: the copies slam together in the middle.
      wells.forEach((w, i) => {
        s.time.delayedCall(i * 140, () => sound("stamp"));
        s.tweens.add({
          targets: w,
          x: this.mid + 40,
          y: 26,
          alpha: 0.3,
          duration: 260,
          delay: i * 140,
          ease: "Cubic.In",
        });
      });
      const r = await inventory.op("forge", {
        items: copies.map((c) => c.id) as [string, string, string],
      });
      await wait(s, 650);
      wells.forEach((w, i) => {
        w.setPosition(x0 + i * 40, 26).setAlpha(1);
      });
      this.pending = false;
      this.row.setPending(false);
      if (!this.root.active) return;
      if (!r.ok) {
        this.refuse(r);
        this.redraw();
        return;
      }
      stamp(out, { x: out.x, y: out.y });
      this.burst(out.x + CELL, out.y + CELL, "gold.light");
      cue("jingle.level-up");
      this.redraw();
    };
  }

  // 먹이기 -------------------------------------------------------------------------------------

  private feed(item: ItemView): void {
    const s = this.ctx.scene;
    const sheet = `sheet:${item.def}`;
    const owner = () => inventory.snap?.progression.level ?? 1;
    const preview = (n: number) => {
      const it = inventory.item(item.id);
      if (!it) return undefined;
      const r = feedSheets(
        { item: toBookItem(it), purse: { [sheet]: n } as never },
        Math.max(1, n),
        owner(),
      );
      return r.ok ? r.state : undefined;
    };
    /** Sheets that still do anything: past the owner's level the rest would be wasted. */
    const useful = () => preview(inventory.count(sheet))?.used ?? 0;
    const wx = this.mid - 130;
    const well = this.well(wx, 14, cellOf(item));
    this.label(wx - 8, 70, itemGood(item).name, GRADE_INK[item.grade] ?? "ink.dark");
    const lv = this.label(this.mid - 30, 12, "", "ink.dark", "galmuri11-bold");
    lv.obj.setScale(2);
    this.stage.add(s.add.rectangle(this.mid - 30, 50, 150, 5, paint("stone.light")).setOrigin(0));
    const bar = s.add.rectangle(this.mid - 30, 50, 0, 5, paint("sea.mid")).setOrigin(0);
    this.stage.add(bar);
    let n = 1;
    const stepper = new Stepper(this.ctx, this.mid - 30, 64, {
      min: 1,
      max: Math.max(1, useful()),
      value: 1,
      onChange: (v) => {
        n = v;
        this.redraw();
      },
    });
    this.stage.add(stepper);
    this.redraw = () => {
      const it = inventory.item(item.id);
      if (!it) return;
      well.set(cellOf(it));
      stepper.setMax(Math.max(1, useful()));
      const after = preview(n);
      lv.set(
        after && after.item.level !== it.level
          ? `Lv ${it.level}  →  ${after.item.level}`
          : `Lv ${it.level}`,
      );
      const next = after?.item ?? toBookItem(it);
      const need = bookExpToNext(next.level);
      s.tweens.add({
        targets: bar,
        width: Math.round((150 * Math.min(need, next.exp)) / Math.max(1, need)),
        duration: 160,
      });
      this.row.setBlocked(useful() <= 0);
      this.row.setCosts([{ icon: "icon/page", need: n, have: inventory.count(sheet) }]);
    };
    this.redraw();
    this.press = async () => {
      if (this.pending) return;
      this.pending = true;
      this.row.setPending(true);
      // The sheets fly into the book, a flutter of pages.
      for (let i = 0; i < Math.min(n, 8); i++) {
        const p = s.add.image(this.mid + 60, 96, "ui", "icon/page").setAlpha(0);
        this.stage.add(p);
        s.tweens.add({
          targets: p,
          x: wx + CELL,
          y: 14 + CELL,
          alpha: { from: 1, to: 0 },
          duration: 380,
          delay: i * 60,
          onComplete: () => p.destroy(),
        });
      }
      cue("page-flutter");
      const r = await inventory.op("feed", { item: item.id, count: n });
      await wait(s, 450);
      this.pending = false;
      this.row.setPending(false);
      if (!this.root.active) return;
      if (!r.ok) {
        this.refuse(r);
        return;
      }
      stamp(well, { x: well.x, y: well.y });
      sound("confirm");
      n = 1;
      this.redraw();
    };
  }

  // 합치기 -------------------------------------------------------------------------------------

  private merge(item: ItemView): void {
    const s = this.ctx.scene;
    const from = () =>
      inventory
        .items("tool")
        .filter((o) => o.def === item.def && o.id !== item.id && o.slot === null)
        .sort((a, b) => a.level - b.level)[0];
    const x0 = this.mid - 130;
    const into = this.well(x0, 14, cellOf(item));
    const other = this.well(x0 + 62, 14, undefined);
    this.label(x0 - 4, 70, toolGood(item.def).name);
    const pips: Phaser.GameObjects.Rectangle[] = [];
    for (let i = 0; i < TOOL_MAX_LEVEL; i++) {
      const p = s.add
        .rectangle(this.mid + 30 + i * 16, 36, 12, 12, paint("stone.light"))
        .setOrigin(0);
      pips.push(p);
      this.stage.add(p);
    }
    const paintPips = (lit: number, next: number) =>
      pips.forEach((p, i) =>
        p.setFillStyle(paint(i < lit ? "gold.mid" : i < next ? "gold.pale" : "stone.light")),
      );
    this.redraw = () => {
      const it = inventory.item(item.id);
      const f = from();
      if (!it) return;
      into.set(cellOf(it));
      other.set(f ? cellOf(f) : undefined);
      paintPips(it.level, Math.min(TOOL_MAX_LEVEL, it.level + (f?.level ?? 0)));
      this.row.setBlocked(!f || it.level >= TOOL_MAX_LEVEL);
      this.row.setCosts([]);
    };
    this.redraw();
    this.press = async () => {
      const f = from();
      if (!f || this.pending) return;
      this.pending = true;
      this.row.setPending(true);
      s.tweens.add({ targets: other, x: x0 + 20, duration: 220, ease: "Cubic.In", yoyo: true });
      const r = await inventory.op("merge", { into: item.id, from: f.id });
      await wait(s, 300);
      this.pending = false;
      this.row.setPending(false);
      if (!this.root.active) return;
      if (!r.ok) {
        this.refuse(r);
        return;
      }
      const level = Number(r.outcome.level ?? 0);
      for (let i = 0; i < level; i++) s.time.delayedCall(i * 90, () => sound("select"));
      s.time.delayedCall(level * 90, () => sound("stamp"));
      stamp(into, { x: into.x, y: into.y });
      this.redraw();
    };
  }

  // 진화 --------------------------------------------------------------------------------------

  private evolve(item: ItemView): void {
    const s = this.ctx.scene;
    const def = bookDef(item.def);
    const linked = () =>
      inventory
        .items("tool")
        .filter((tl) => tl.def === def?.tool)
        .sort((a, b) => b.level - a.level)[0];
    const wx = this.mid - 140;
    const well = this.well(wx, 14, cellOf(item));
    const toolWell = this.well(wx + 62, 14, undefined);
    this.label(wx - 4, 70, itemGood(item).name, GRADE_INK[item.grade] ?? "ink.dark");
    const checks = s.add.container(this.mid - 10, 6);
    this.stage.add(checks);
    this.redraw = () => {
      const it = inventory.item(item.id);
      if (!it) return;
      const tool = linked();
      well.set(cellOf(it));
      toolWell.set(tool ? cellOf(tool) : { icon: toolGood(def?.tool ?? "").icon, dim: true });
      const prog = inventory.snap?.progression;
      const tier = TIERS[prog?.tier ?? 0];
      const rows: [string, boolean][] = [
        [`${gradeName(EVOLUTION.grade)}`, it.grade >= EVOLUTION.grade],
        [`Lv ${EVOLUTION.level}`, it.level >= EVOLUTION.level],
        [
          `${toolGood(def?.tool ?? "").name} Lv ${EVOLUTION.toolLevel}`,
          (tool?.level ?? 0) >= EVOLUTION.toolLevel,
        ],
        [termName("tier", "third-year"), !!tier && hasUnlock(tier, "evolution")],
      ];
      checks.removeAll(true);
      rows.forEach(([text, ok], i) => {
        checks.add(s.add.image(0, i * 16, "ui", ok ? "check/on" : "check/off").setOrigin(0));
        checks.add(
          new Label(s, 16, i * 16 + 2, text, {
            font: "galmuri9",
            color: ok ? "ink.dark" : "stone.dark",
          }).obj,
        );
      });
      this.row.setBlocked(it.evolved || !rows.every(([, ok]) => ok));
      this.row.setCosts([]);
    };
    this.redraw();
    this.press = async () => {
      const tool = linked();
      if (!tool || this.pending) return;
      this.pending = true;
      this.row.setPending(true);
      const done = evolutionMoment(s, item);
      const r = await inventory.op("evolve", { item: item.id, tool: tool.id });
      this.pending = false;
      this.row.setPending(false);
      if (!r.ok) {
        done.abort();
        this.refuse(r);
        return;
      }
      done.land(() => this.back(item.id));
    };
  }

  // Shared ------------------------------------------------------------------------------------

  private press: () => Promise<void> = async () => {};

  private refuse(r: OpCall): void {
    sound("error");
    this.row.refuse();
    this.said.say(opRefusal(r));
  }

  /** Bright squares bursting out from a point: a moment landing. */
  private burst(x: number, y: number, color: string): void {
    const s = this.ctx.scene;
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const sq = s.add.rectangle(x, y, 2, 2, paint(color)).setOrigin(0.5);
      this.stage.add(sq);
      s.tweens.add({
        targets: sq,
        x: x + Math.cos(a) * (22 + (i % 3) * 6),
        y: y + Math.sin(a) * (22 + (i % 3) * 6),
        alpha: 0,
        duration: 420,
        ease: "Cubic.Out",
        onComplete: () => sq.destroy(),
      });
    }
  }

  /** A number stamped onto the page in ink, slamming down from big. */
  private stampText(x: number, y: number, text: string, color: string): void {
    const s = this.ctx.scene;
    const l = new Label(s, 0, 0, text, { font: "galmuri11-bold", color });
    const c = s.add.container(x, y, [l.obj]).setScale(2);
    l.at(-Math.round(l.width / 2), -6);
    this.stage.add(c);
    c.setScale(5).setAlpha(0);
    s.tweens.add({ targets: c, scale: 2, alpha: 1, duration: 140, ease: "Quad.In" });
    s.time.delayedCall(1400, () => fade(c, 0, 300, () => c.destroy()));
  }
}

/**
 * An evolution takes the whole screen: the ink rises, the book hangs in the middle with its own
 * effect art turning round it, light breaks, and the new book is stamped with its new name.
 * `land` plays the reveal once the server agrees; `abort` lets the ink fall back.
 */
function evolutionMoment(
  scene: Phaser.Scene,
  item: ItemView,
): { land: (then: () => void) => void; abort: () => void } {
  const def = bookDef(item.def);
  const before = bookGood(item.def, false);
  const after = bookGood(item.def, true);
  const cx = Math.round(screen.w / 2);
  const cy = Math.round(screen.h / 2) - 10;
  const dim = scene.add
    .rectangle(0, 0, screen.w, screen.h, paint("ink.deep"))
    .setOrigin(0)
    .setAlpha(0)
    .setInteractive();
  const rays = scene.add.graphics();
  const ring = scene.add.container(cx, cy);
  const icon = scene.add.image(cx, cy, "ui", before.icon).setOrigin(0.5).setScale(4);
  const root = scene.add.container(0, 0, [dim, rays, ring, icon]).setDepth(3000);
  fade(dim, 0.92, 400);
  sound("open");
  cue(def?.cues.cast ?? "chalk");
  // The book's own effect art, from its attack, circling it.
  const body = def?.evolution.cues.body ?? def?.cues.body;
  const frames =
    body && scene.textures.exists("combat")
      ? scene.textures
          .get("combat")
          .getFrameNames()
          .filter((f) => f.startsWith(`${body}/`))
          .sort()
      : [];
  const sprites = frames.length
    ? [0, 1, 2, 3, 4, 5].map((i) => {
        const sp = scene.add
          .image(
            Math.cos((i / 6) * Math.PI * 2) * 52,
            Math.sin((i / 6) * Math.PI * 2) * 52,
            "combat",
            frames[0],
          )
          .setScale(2);
        ring.add(sp);
        return sp;
      })
    : [];
  let k = 0;
  const spin = scene.time.addEvent({
    delay: 70,
    loop: true,
    callback: () => {
      k++;
      ring.rotation += 0.06;
      for (const [i, sp] of sprites.entries())
        sp.setFrame(frames[(k + i) % frames.length] as string);
      rays.clear();
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 + k * 0.03;
        rays.lineStyle(
          1,
          paint(i % 2 ? "gold.pale" : "stone.bright"),
          0.25 + 0.15 * Math.sin(k / 4 + i),
        );
        rays.lineBetween(
          cx + Math.cos(a) * 30,
          cy + Math.sin(a) * 30,
          cx + Math.cos(a) * 200,
          cy + Math.sin(a) * 200,
        );
      }
      icon.y = cy + (k % 6 < 3 ? -1 : 0);
    },
  });
  const close = (then?: () => void) => {
    spin.remove();
    fade(root, 0, 300, () => {
      root.destroy();
      then?.();
    });
  };
  return {
    abort: () => close(),
    land: (then) => {
      scene.time.delayedCall(1100, () => {
        const flash = scene.add
          .rectangle(0, 0, screen.w, screen.h, paint("stone.bright"))
          .setOrigin(0);
        root.add(flash);
        fade(flash, 0, 500, () => flash.destroy());
        icon.setFrame(after.icon).setOrigin(0.5);
        stamp(icon, { x: cx, y: cy });
        icon.setScale(4);
        cue("jingle.liberation");
        sound("stamp");
        const name = new Label(scene, 0, 0, after.name, {
          font: "galmuri11-bold",
          color: "gold.light",
        });
        name.obj.setScale(2);
        name.at(cx - name.width, cy + 48);
        root.add(name.obj);
        name.obj.setAlpha(0);
        fade(name.obj, 1, 400);
        // Any press goes back to the bag, the new book picked.
        scene.time.delayedCall(900, () => {
          dim.once("pointerup", () => close(then));
          scene.input.keyboard?.once("keydown", () => close(then));
        });
      });
    },
  };
}

function cellOf(it: ItemView): CellItem {
  const good = itemGood(it);
  return {
    icon: good.icon,
    ...(it.kind === "book" ? { grade: it.grade } : {}),
    ...(it.kind === "book" && it.pilgi > 0 ? { badge: `+${it.pilgi}` } : {}),
    ...(it.kind === "tool" ? { badge: `${it.level}` } : {}),
    worn: it.slot !== null,
  };
}

function toBookItem(it: ItemView) {
  return {
    id: it.id,
    def: it.def,
    grade: it.grade as 0,
    level: it.level,
    exp: it.exp,
    pilgi: it.pilgi,
    pilgiFails: it.pilgiFails,
    evolved: it.evolved,
  };
}

function wait(scene: Phaser.Scene, ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((ok) => scene.time.delayedCall(ms, ok));
}
