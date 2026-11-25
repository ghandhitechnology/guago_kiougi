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
import { CostRow } from "../ui/cost-row.ts";
import { CELL, type CellItem, ItemCell } from "../ui/item-cell.ts";
import { ItemGrid } from "../ui/item-grid.ts";
import { fade, shake, slide, stamp } from "../ui/motion.ts";
import { sound } from "../ui/sound.ts";
import { Stepper } from "../ui/stepper.ts";
import { Label } from "../ui/text.ts";
import { paint } from "../ui/theme.ts";
import type { Ctx } from "../ui/widget.ts";
import type { OpCall } from "../world-link.ts";
import { onGone, opRefusal, SaidLine } from "./common.ts";
import { evolutionMoment } from "./evolution.ts";

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
  /** A result is on show: changes wait until it has been seen. */
  private holding = false;
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
      if (!this.pending && !this.holding) this.redraw();
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
    const subject = bookDef(item.def)?.subject ?? "math";
    const wx = this.mid - 120;
    const well = this.well(wx, 14, cellOf(item));
    const name = this.label(wx - 8, 70, itemGood(item).name, GRADE_INK[item.grade] ?? "ink.dark");
    const from = this.label(this.mid - 40, 10, "", "ink.dark", "galmuri11-bold");
    from.obj.setScale(2);
    const chance = this.label(this.mid - 40, 46, "", "red.dark", "galmuri11-bold");
    chance.obj.setScale(2);
    // Pity earned by failing, in gold beside the odds it adds to.
    const pityText = this.label(0, 52, "", "gold.deep", "galmuri11-bold");
    // The chance as a bar: the book's own odds, and the pity earned by failing, in gold.
    const BAR = 150;
    const bx = this.mid - 40;
    const by = 80;
    this.stage.add(s.add.rectangle(bx, by, BAR, 6, paint("stone.light")).setOrigin(0));
    const base = s.add.rectangle(bx, by, 0, 6, paint("red.mid")).setOrigin(0);
    const pity = s.add.rectangle(bx, by, 0, 6, paint("gold.mid")).setOrigin(0);
    this.stage.add([base, pity]);
    // What one more + is worth: the power before and after.
    const powerWord = this.label(bx, 98, t("bag.power"), "stone.dark");
    const power = this.label(bx + powerWord.width + 6, 96, "", "ink.dark", "galmuri11-bold");
    const scratch = s.add.graphics();
    this.stage.add(scratch);
    const wb = { x: wx, y: 14, w: CELL * 2, h: CELL * 2 };
    const centre = { x: wb.x + wb.w / 2, y: wb.y + wb.h / 2 };
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
      pityText.set(pityShare > 0 ? `+${Math.round(pityShare * 100)}%` : "");
      pityText.at(bx + chance.width * 2 + 8, 52);
      power.set(
        `${bookPower(it).toLocaleString("en-US")}  →  ${bookPower({ ...it, pilgi: it.pilgi + 1 }).toLocaleString("en-US")}`,
      );
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
      const pityBefore = { x: pity.x, w: pity.width };
      this.pending = true;
      this.row.setPending(true);
      this.said.clear();
      // The pen scratches over the book while the answer comes.
      const started = Date.now();
      scratch.clear().setAlpha(1).lineStyle(1, paint("red.mid"), 1);
      let step = 0;
      const pen = s.time.addEvent({
        delay: 60,
        loop: true,
        callback: () => {
          step++;
          const x0 = wb.x + 4 + ((step * 7) % (wb.w - 8));
          const y0 = wb.y + 8 + ((step * 3) % (wb.h - 16));
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
      const after = inventory.item(item.id);
      const level = `+${after?.pilgi ?? it.pilgi + 1}`;
      if (r.outcome.success === true && failsBefore > 0) {
        // Pity: the gold the failures earned pours from the bar into the book, then the book
        // takes it in a gold flash, the + stamps in gold, and the whole page jolts.
        scratch.clear();
        const pours = Math.max(6, Math.min(16, failsBefore * 3));
        for (let i = 0; i < pours; i++) {
          const sq = s.add
            .rectangle(
              pityBefore.x + Math.random() * Math.max(4, pityBefore.w),
              by + 3,
              3,
              3,
              paint(i % 2 ? "gold.light" : "gold.pale"),
            )
            .setOrigin(0.5);
          this.stage.add(sq);
          s.tweens.add({
            targets: sq,
            x: centre.x,
            y: centre.y,
            duration: 300,
            delay: i * 22,
            ease: "Quad.In",
            onComplete: () => sq.destroy(),
          });
          if (i % 3 === 0) s.time.delayedCall(i * 22, () => sound("select"));
        }
        s.time.delayedCall(300 + pours * 22, () => {
          if (!this.root.active) return;
          this.flash(wb, "gold.pale");
          this.burst(centre.x, centre.y, "gold.light", 18, 40);
          this.ringOut(centre.x, centre.y, "gold.light");
          this.stampText(centre.x, centre.y, level, "gold.mid", 3);
          s.cameras.main.shake(180, 0.006);
          cue("jingle.level-up");
          cue(`hit.${subject}.crit`);
          sound("stamp");
          this.redraw();
        });
        return;
      }
      if (r.outcome.success === true) {
        // Success: the scratches turn to clean ink, the book flashes white, red ink bursts and
        // the new + stamps down over it.
        scratch.clear();
        this.flash(wb, "stone.bright");
        this.burst(centre.x, centre.y, "red.light", 12, 30);
        this.stampText(centre.x, centre.y, level, "red.mid", 2);
        stamp(well, { x: well.x, y: well.y, scale: 2 });
        s.cameras.main.shake(90, 0.003);
        cue("jingle.rare-drop");
        sound("stamp");
        this.redraw();
        return;
      }
      // Fail: the line smears grey, the book shudders and goes dull, and the pity it earned
      // floats up off the bar in gold while the bar grows.
      scratch.clear().lineStyle(1, paint("stone.dark"), 1);
      for (let i = 0; i < 5; i++)
        scratch.lineBetween(wb.x + 6 + i * 7, wb.y + 10, wb.x + 12 + i * 7, wb.y + wb.h - 10);
      shake(well, { x: well.x, y: well.y });
      well.setAlpha(0.55);
      s.tweens.add({ targets: well, alpha: 1, delay: 500, duration: 400 });
      sound("error");
      cue("page-flutter", { volume: 0.6 });
      this.redraw();
      const earned =
        Math.round((after?.next?.chance ?? it.next.chance) * 100) -
        Math.round(it.next.chance * 100);
      if (earned > 0) {
        const up = this.label(
          pity.x + pity.width + 4,
          by - 4,
          `+${earned}%`,
          "gold.deep",
          "galmuri11-bold",
        );
        up.obj.setAlpha(0);
        s.tweens.add({
          targets: up.obj,
          y: up.obj.y - 10,
          alpha: { from: 1, to: 0 },
          delay: 250,
          duration: 900,
          onComplete: () => up.obj.destroy(),
        });
        s.time.delayedCall(250, () => sound("select"));
      }
      s.time.delayedCall(700, () => fade(scratch, 0, 300, () => scratch.clear().setAlpha(1)));
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
      if (!this.holding) out.set({ icon: book.icon, grade: 0, dim: true });
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
      cue("page-flutter", { volume: 0.7 });
      // The sheets flutter over one by one and the thread follows them into the binding.
      const s = this.ctx.scene;
      const to = { x: out.x + CELL, y: out.y + CELL };
      for (let i = 0; i < 10; i++) {
        const p = s.add.image(sheets.x + CELL, sheets.y + CELL, "ui", "icon/page").setAlpha(0);
        this.stage.add(p);
        const lift = 18 + (i % 3) * 8;
        s.tweens.add({
          targets: p,
          x: to.x,
          alpha: { from: 1, to: 0.6 },
          duration: 420,
          delay: i * 55,
          ease: "Sine.InOut",
          onComplete: () => p.destroy(),
        });
        s.tweens.add({
          targets: p,
          y: { from: sheets.y + CELL, to: sheets.y + CELL - lift },
          duration: 210,
          delay: i * 55,
          yoyo: true,
          ease: "Quad.Out",
        });
        s.tweens.add({ targets: p, angle: (i % 2 ? 1 : -1) * 40, duration: 420, delay: i * 55 });
      }
      s.tweens.add({
        targets: binding,
        x: out.x,
        alpha: 0.2,
        duration: 380,
        delay: 420,
        ease: "Cubic.In",
        yoyo: true,
        hold: 160,
      });
      const r = await inventory.op("craft", { def });
      await wait(s, 900);
      this.pending = false;
      this.row.setPending(false);
      if (!this.root.active) return;
      if (!r.ok) {
        this.refuse(r);
        return;
      }
      // A new book: the binding flashes, the copy stamps down whole and the page jolts.
      out.set({ icon: book.icon, grade: 0 });
      this.flash({ x: out.x, y: out.y, w: CELL * 2, h: CELL * 2 }, "stone.bright");
      stamp(out, { x: out.x, y: out.y, scale: 2 });
      this.burst(to.x, to.y, "gold.pale", 14, 30);
      this.ringOut(to.x, to.y, "stone.mid", 56);
      s.cameras.main.shake(110, 0.004);
      sound("stamp");
      cue("sfx.pickup.page");
      cue("jingle.rare-drop");
      this.holding = true;
      s.time.delayedCall(1400, () => {
        this.holding = false;
        if (this.root.active) this.redraw();
      });
      this.redraw();
    };
  }

  // 제련 --------------------------------------------------------------------------------------

  private forge(item: ItemView): void {
    const s = this.ctx.scene;
    // The copy the station follows: the forge keeps one of the three, which may not be this one.
    let current = item.id;
    const pick = () => {
      const it = inventory.item(current);
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
    const PITCH = CELL * 2 + 6;
    const x0 = this.mid - 30 - 3 * PITCH;
    const wells = [0, 1, 2].map((i) => this.well(x0 + i * PITCH, 14, undefined, 2));
    this.arrow(this.mid + 6, 38);
    const out = this.well(this.mid + 40, 14, undefined, 2);
    const outName = this.label(this.mid + 30, 70, "");
    const to = { x: out.x + CELL, y: out.y + CELL };
    this.redraw = () => {
      const copies = pick();
      wells.forEach((w, i) => {
        w.set(copies[i] ? cellOf(copies[i] as ItemView) : undefined);
      });
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
      // Three into one: the copies slam together in the middle, one after another.
      wells.forEach((w, i) => {
        s.time.delayedCall(i * 150 + 240, () => {
          sound("stamp");
          this.flash({ x: out.x, y: out.y, w: CELL * 2, h: CELL * 2 }, "stone.bright");
          nudgeOut();
        });
        s.tweens.add({
          targets: w,
          x: out.x,
          y: out.y,
          alpha: 0,
          duration: 240,
          delay: i * 150,
          ease: "Cubic.In",
        });
      });
      const nudgeOut = () => shake(out, { x: out.x, y: out.y });
      const r = await inventory.op("forge", {
        items: copies.map((c) => c.id) as [string, string, string],
      });
      await wait(s, 760);
      wells.forEach((w, i) => {
        w.setPosition(x0 + i * PITCH, 14).setAlpha(1);
      });
      this.pending = false;
      this.row.setPending(false);
      if (!this.root.active) return;
      if (!r.ok) {
        this.refuse(r);
        this.redraw();
        return;
      }
      // The new grade: a flash, the copy stamps down in its new frame, light in the grade's
      // colour breaks out of it, and the grade's name lands over it.
      const kept = typeof r.outcome.item === "string" ? r.outcome.item : current;
      current = kept;
      const made = inventory.item(kept);
      const ink = GRADE_INK[made?.grade ?? 0] ?? "ink.dark";
      for (const w of wells) w.set(undefined);
      if (made) {
        out.set(cellOf(made));
        outName.set(`${gradeName(made.grade)} · Lv ${made.level}`);
        outName.color(ink);
      }
      this.flash({ x: out.x, y: out.y, w: CELL * 2, h: CELL * 2 }, "gold.pale");
      stamp(out, { x: out.x, y: out.y, scale: 2 });
      this.burst(to.x, to.y, "gold.light", 18, 40);
      this.ringOut(to.x, to.y, ink, 80);
      this.stampText(to.x, out.y - 2, gradeName(made?.grade ?? 0), ink, 2);
      s.cameras.main.shake(200, 0.008);
      sound("stamp");
      cue(`hit.${bookDef(item.def)?.subject ?? "math"}.heavy`);
      cue("jingle.level-up");
      this.holding = true;
      s.time.delayedCall(1600, () => {
        this.holding = false;
        if (this.root.active) this.redraw();
      });
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
      stamp(well, { x: well.x, y: well.y, scale: 2 });
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
    const paintPips = (lit: number, next: number) => {
      pips.forEach((p, i) => {
        p.setFillStyle(paint(i < lit ? "gold.mid" : i < next ? "gold.pale" : "stone.light"));
      });
    };
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
      stamp(into, { x: into.x, y: into.y, scale: 2 });
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
  private burst(x: number, y: number, color: string, count = 10, reach = 22): void {
    const s = this.ctx.scene;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const d = reach + (i % 3) * 6;
      const sq = s.add.rectangle(x, y, i % 3 === 0 ? 3 : 2, i % 3 === 0 ? 3 : 2, paint(color));
      sq.setOrigin(0.5);
      this.stage.add(sq);
      s.tweens.add({
        targets: sq,
        x: x + Math.cos(a) * d,
        y: y + Math.sin(a) * d,
        alpha: 0,
        duration: 420 + (i % 4) * 60,
        ease: "Cubic.Out",
        onComplete: () => sq.destroy(),
      });
    }
  }

  /** A ring breaking outward from a point. */
  private ringOut(x: number, y: number, color: string, reach = 70): void {
    const s = this.ctx.scene;
    const g = s.add.graphics();
    this.stage.add(g);
    const r = { v: 8 };
    s.tweens.add({
      targets: r,
      v: reach,
      duration: 420,
      ease: "Cubic.Out",
      onUpdate: () => {
        g.clear()
          .lineStyle(2, paint(color), 1 - r.v / reach)
          .strokeCircle(x, y, r.v);
      },
      onComplete: () => g.destroy(),
    });
  }

  /** The well lit up for two frames, then fading: a hit landing on the book. */
  private flash(at: { x: number; y: number; w: number; h: number }, color: string): void {
    const f = this.ctx.scene.add.rectangle(at.x, at.y, at.w, at.h, paint(color)).setOrigin(0);
    this.stage.add(f);
    this.ctx.scene.time.delayedCall(34, () => fade(f, 0, 200, () => f.destroy()));
  }

  /** A number stamped onto the page in ink, slamming down from big. */
  private stampText(x: number, y: number, text: string, color: string, scale = 2): void {
    const s = this.ctx.scene;
    const l = new Label(s, 0, 0, text, { font: "galmuri11-bold", color });
    const shadow = new Label(s, 1, 1, text, { font: "galmuri11-bold", color: "stone.bright" });
    const c = s.add.container(x, y, [shadow.obj, l.obj]);
    l.at(-Math.round(l.width / 2), -6);
    shadow.at(-Math.round(l.width / 2) + 1, -5);
    this.stage.add(c);
    c.setScale(scale * 2.5).setAlpha(0);
    s.tweens.add({ targets: c, scale, alpha: 1, duration: 140, ease: "Quad.In" });
    s.time.delayedCall(1400, () => fade(c, 0, 300, () => c.destroy()));
  }
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
