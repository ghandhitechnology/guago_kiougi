import { LIFECYCLES, narrative } from "@guago/content";
import type { NotebookBoss, NotebookPage } from "@guago/shared";
import * as Phaser from "phaser";
import { t } from "../i18n/index.ts";
import { cue } from "../sound/audio.ts";
import { live } from "../state/live.ts";
import { fade, shake, stamp } from "../ui/motion.ts";
import { sound } from "../ui/sound.ts";
import { ink, Label, wrap } from "../ui/text.ts";
import { paint } from "../ui/theme.ts";
import { type Ctx, Widget } from "../ui/widget.ts";
import { onGone, rightLabel, speakerName } from "./common.ts";
import { registerMenuTab } from "./notebook.ts";

/**
 * The 0조 연구노트 (PLAN §10): the notebook the twelve students carried, its pages torn out and
 * left as stubs on the rings. Each Page the server finishes grows back into a page. The live
 * page is written as the server plays it: a photograph pasted in for each scientist freed, the
 * day in red pen, the student who landed the final hit and those who topped each board in
 * pencil, and the weeks of the Page ruled along the bottom. A returned page carries 0조's own
 * notes in their own hands, the record beside them, and the school's 도장.
 */

const N = narrative.NARRATIVE;
const STUB_H = 16;
const SPINE = 44;
const RULE = 12;
const BOARDS: Readonly<
  Record<string, "research.board.damage" | "research.board.support" | "research.board.objectives">
> = {
  damage: "research.board.damage",
  support: "research.board.support",
  objectives: "research.board.objectives",
};
/** The ink each hand writes in: pencil, 서하's blue pen, and the hand nobody knows. */
const HAND: Readonly<Record<string, string>> = {
  print: "ink.dark",
  student: "ink.mid",
  seoha: "navy.mid",
  stranger: "plum.dark",
};

/** The page's own notes, from the story beat that returns it (`p<n>-page-returns`). */
function notesOf(
  page: number,
): { title: string; rows: { text: string; hand: string }[] } | undefined {
  const beat = N.story.find((b) => b.id === `p${page}-page-returns`);
  for (const step of beat?.lines ?? []) {
    if (step.do === "show") {
      return {
        title: N.ko[step.doc.title ?? ""] ?? "",
        rows: step.doc.rows.map((r) => ({ text: N.ko[r.text] ?? "", hand: r.hand ?? "student" })),
      };
    }
  }
  return undefined;
}

/** One stub on the rings: torn, the live page, or a page returned whole. */
class Stub extends Widget {
  private readonly onPick: () => void;
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly page: NotebookPage;
  private readonly num: Label;
  private chosen = false;

  constructor(ctx: Ctx, x: number, y: number, page: NotebookPage, onPick: () => void) {
    super(ctx, x, y, SPINE - 2, STUB_H - 1, 0);
    this.page = page;
    this.onPick = onPick;
    const s = ctx.scene;
    this.g = s.add.graphics();
    this.num = new Label(s, 13, 4, String(page.page), {
      font: "galmuri9",
      color: page.state === "stub" ? "stone.mid" : "ink.dark",
    });
    this.add([this.g, this.num.obj]);
    this.paint();
  }

  setChosen(on: boolean): void {
    this.chosen = on;
    this.paint();
  }

  private paint(): void {
    const g = this.g.clear();
    const torn = this.page.state === "stub";
    const w = torn ? 20 : SPINE - 4;
    // The strip of paper still on the rings.
    g.fillStyle(paint(this.chosen ? "stone.bright" : torn ? "stone.pale" : "stone.bright"));
    g.fillRect(8, 1, w - 8, STUB_H - 3);
    if (torn) {
      // Torn off: the edge is ragged where the page used to be.
      g.fillStyle(paint("stone.pale"));
      for (let y = 1; y < STUB_H - 2; y++) g.fillRect(w, y, [1, 3, 2, 0, 2, 1, 3][y % 7] ?? 1, 1);
      g.fillStyle(paint("stone.light"));
      for (let y = 1; y < STUB_H - 2; y++)
        g.fillRect(w + ([1, 3, 2, 0, 2, 1, 3][y % 7] ?? 1), y, 1, 1);
    } else {
      g.fillStyle(paint(this.page.state === "returned" ? "gold.mid" : "red.mid"));
      g.fillRect(w - 3, 1, 2, STUB_H - 3);
    }
    // The ring through the paper.
    g.fillStyle(paint("stone.dark")).fillRect(2, 5, 9, 3);
    g.fillStyle(paint("stone.light")).fillRect(3, 5, 7, 1);
    if (this.chosen) g.lineStyle(1, paint("red.mid")).strokeRect(8.5, 0.5, w - 8, STUB_H - 2);
  }

  protected fire(): void {
    if (this.page.state === "stub") {
      sound("error");
      shake(this, { x: this.x, y: this.y });
      return;
    }
    this.onPick();
  }

  protected refresh(): void {
    this.num.color(
      this.page.state === "stub" ? "stone.mid" : this.focused ? "red.dark" : "ink.dark",
    );
  }
}

class ResearchPage {
  private readonly ctx: Ctx;
  private readonly root: Phaser.GameObjects.Container;
  private readonly size: { w: number; h: number };
  private readonly sheet: Phaser.GameObjects.Container;
  private stubs: Stub[] = [];
  private chosen: number | undefined;
  /** Returned pages already stamped while this notebook was open. */
  private readonly stamped = new Set<number>();

  constructor(ctx: Ctx, parent: Phaser.GameObjects.Container, size: { w: number; h: number }) {
    this.ctx = ctx;
    this.size = size;
    const s = ctx.scene;
    this.root = s.add.container(0, 0);
    parent.add(this.root);
    this.sheet = s.add.container(SPINE + 4, 2);
    this.root.add(this.sheet);
    const off = live.watch((_l, push) => {
      if (!push || push.t === "notebook" || push.t === "page") this.draw();
    });
    onGone(this.root, off);
    void live.read("notebook");
    this.draw();
  }

  private draw(): void {
    const nb = live.notebook;
    if (!nb) return;
    for (const st of this.stubs) st.destroy();
    const top = Math.max(2, Math.floor((this.size.h - nb.pages.length * STUB_H) / 2));
    this.stubs = nb.pages.map((p, i) => {
      const st = new Stub(this.ctx, 0, top + i * STUB_H, p, () => this.show(p.page));
      this.root.add(st);
      return st;
    });
    const current = nb.pages.find((p) => p.state === "live");
    const last = [...nb.pages].reverse().find((p) => p.state === "returned");
    this.show(this.chosen ?? current?.page ?? last?.page ?? 1, true);
  }

  private show(n: number, quiet = false): void {
    const page = live.notebook?.pages.find((p) => p.page === n);
    if (!page) return;
    const turned = this.chosen !== n;
    this.chosen = n;
    this.stubs.forEach((st, i) => {
      st.setChosen(i + 1 === n);
    });
    if (turned && !quiet) sound("page");
    const sh = this.sheet;
    sh.removeAll(true);
    const w = this.size.w - SPINE - 8;
    const h = this.size.h - 6;
    this.paper(w, h);
    if (page.state === "stub") return;
    const notes = notesOf(page.page);
    const s = this.ctx.scene;
    // The heading, as the students wrote it, and the page's dates in red pen.
    const title = notes?.title || `0조 · ${page.page}`;
    sh.add(new Label(s, 30, 7, title, { font: "galmuri11-bold", color: "ink.dark" }).obj);
    const opened = live.page && live.page.page === page.page ? live.page.openedAt : undefined;
    const dates = [opened, page.sealedAt]
      .filter((d): d is number => typeof d === "number")
      .map(dateOf);
    if (dates.length) {
      sh.add(
        rightLabel(s, w - 10, 8, dates.join(" ~ ") + (page.state === "live" ? " ~" : ""), {
          font: "galmuri9",
          color: "red.mid",
        }).obj,
      );
    }
    if (page.state === "returned") this.returned(page, notes?.rows ?? [], w, h);
    else this.current(page, w, h);
    if (turned && !quiet) {
      sh.setAlpha(0.4);
      fade(sh, 1, 160);
    }
  }

  /** Cream paper, blue rules, the red margin, and a soft shadow under the sheet. */
  private paper(w: number, h: number): void {
    const s = this.ctx.scene;
    const g = s.add.graphics();
    g.fillStyle(paint("stone.light")).fillRect(2, 2, w, h);
    g.fillStyle(paint("stone.bright")).fillRect(0, 0, w, h);
    g.fillStyle(paint("sea.pale"));
    for (let y = 22; y < h - 4; y += RULE) g.fillRect(2, y, w - 4, 1);
    g.fillStyle(paint("rose.light")).fillRect(24, 0, 1, h);
    this.sheet.add(g);
  }

  /** The page being played: three photographs, the record under each, the weeks below. */
  private current(page: NotebookPage, w: number, h: number): void {
    const cols = Math.max(1, page.bosses.length);
    const colW = Math.floor((w - 36) / cols);
    page.bosses.forEach((b, i) => {
      this.bossColumn(30 + i * colW, 26, colW - 8, b, i);
    });
    this.weeks(page, 30, h - 22, w - 44);
  }

  private bossColumn(x: number, y: number, w: number, b: NotebookBoss, i: number): void {
    const s = this.ctx.scene;
    const sh = this.sheet;
    const freed = b.freedAt !== null;
    const state =
      live.page?.page === this.chosen ? live.page?.bosses[b.boss] : freed ? "freed" : "sealed";
    const px = x + Math.round((w - 48) / 2) + (i % 2 === 0 ? -2 : 2);
    this.photo(px, y, 48, b, state ?? "sealed");
    let ty = y + 53;
    if (state === "sealed") return;
    const center = (text: string, font: "galmuri9" | "galmuri11-bold", color: string) => {
      sh.add(new Label(s, x, ty, text, { font, color, width: w, align: "center" }).obj);
    };
    /** A label in pencil and a name in pen, centred together on one rule. */
    const pair = (label: string, name: string, color: string) => {
      const l = new Label(s, 0, ty, label, { font: "galmuri9", color: "stone.dark" });
      const n = new Label(s, 0, ty, name, { font: "galmuri9", color });
      const left = x + Math.round((w - l.width - 4 - n.width) / 2);
      l.at(left, ty);
      n.at(left + l.width + 4, ty);
      sh.add([l.obj, n.obj]);
    };
    center(speakerName(b.boss), "galmuri11-bold", freed ? "ink.dark" : "stone.mid");
    ty += 14;
    if (!freed || b.freedAt === null) return;
    center(dateOf(b.freedAt), "galmuri9", "red.mid");
    ty += RULE + 2;
    if (b.finalHit) {
      pair(t("research.finalHit"), b.finalHit.name, "navy.mid");
      ty += RULE;
    }
    for (const l of b.leaders) {
      const key = BOARDS[l.board];
      if (!key) continue;
      pair(t(key), l.name, "ink.dark");
      ty += RULE - 1;
    }
  }

  /**
   * A boss's place on the page: a photograph taped in once freed; while the boss is out there,
   * its shape in pencil; before it appears, only the pencilled frame waiting for it.
   */
  private photo(x: number, y: number, size: number, b: NotebookBoss, state: string): void {
    const s = this.ctx.scene;
    const sh = this.sheet;
    const freed = state === "freed";
    if (freed) {
      sh.add(s.add.rectangle(x + 1, y + 1, size + 4, size + 4, paint("stone.light")).setOrigin(0));
      sh.add(s.add.rectangle(x - 2, y - 2, size + 4, size + 4, paint("stone.pale")).setOrigin(0));
    } else {
      // A pencilled frame, dashed, where the photograph will go.
      const g = s.add.graphics();
      g.fillStyle(paint("stone.mid"));
      for (let i = 0; i < size; i += 4) {
        g.fillRect(x + i, y, 2, 1).fillRect(x + i, y + size - 1, 2, 1);
        g.fillRect(x, y + i, 1, 2).fillRect(x + size - 1, y + i, 1, 2);
      }
      sh.add(g);
    }
    const frame = `portrait-${b.boss === "aristotle" && freed ? "aristotle-freed" : b.boss}/neutral`;
    if (state !== "sealed" && s.textures.get("portraits").has(frame)) {
      const img = s.add.image(x + size / 2, y + size / 2, "portraits", frame).setOrigin(0.5);
      if (!freed) img.setTint(paint("stone.light")).setTintMode(Phaser.TintModes.FILL);
      sh.add(img);
    }
    if (freed) {
      // Two strips of tape, not quite level.
      sh.add(
        s.add
          .rectangle(x - 4, y - 3, 14, 5, paint("gold.pale"))
          .setOrigin(0)
          .setAlpha(0.8),
      );
      sh.add(
        s.add
          .rectangle(x + size - 10, y + size - 3, 14, 5, paint("gold.pale"))
          .setOrigin(0)
          .setAlpha(0.8),
      );
    }
  }

  /** The Page's weeks ruled out in pencil: today marked, each boss at the week it came. */
  private weeks(page: NotebookPage, x: number, y: number, w: number): void {
    const s = this.ctx.scene;
    const life = LIFECYCLES.find((l) => l.page === page.page);
    const g = s.add.graphics();
    const span = 13;
    const at = (week: number) => x + Math.round((w * week) / span);
    g.fillStyle(paint("stone.dark")).fillRect(x, y, w, 1);
    for (let k = 0; k <= span; k++)
      g.fillRect(at(k), y - (k % 13 === 0 ? 3 : 1), 1, k % 13 === 0 ? 7 : 3);
    this.sheet.add(g);
    for (const step of life?.steps ?? []) {
      if (!step.boss || step.week === undefined) continue;
      const b = page.bosses.find((x) => x.boss === step.boss);
      const done = b?.freedAt !== null && b?.freedAt !== undefined;
      this.sheet.add(
        s.add
          .image(at(step.week), y - 6, "ui", "map-dot/boss")
          .setOrigin(0.5)
          .setAlpha(done ? 1 : 0.5),
      );
      if (done)
        this.sheet.add(
          s.add.rectangle(at(step.week) - 3, y - 7, 7, 1, paint("red.mid")).setOrigin(0),
        );
    }
    const week = live.page?.page === page.page ? Math.min(span, live.page.week) : undefined;
    if (week !== undefined) {
      const cx = at(week);
      this.sheet.add(
        s.add.triangle(cx, y + 4, 0, 4, 6, 4, 3, 0, paint("red.mid")).setOrigin(0.5, 0),
      );
      this.sheet.add(
        new Label(s, cx + 6, y + 4, t("research.week", { n: week }), {
          font: "galmuri9",
          color: "red.dark",
        }).obj,
      );
    }
  }

  /** A returned page: 0조's own notes on the left, the record on the right, and the 도장. */
  private returned(
    page: NotebookPage,
    rows: { text: string; hand: string }[],
    w: number,
    h: number,
  ): void {
    const s = this.ctx.scene;
    const sh = this.sheet;
    const split = rows.length ? Math.round(w * 0.5) : 24;
    // Each note starts on the rule after the last one ended, its wrapped lines on the rules
    // below, a pixel or two off where the last hand started; what reaches the 도장 waits.
    let ny = 26;
    const floor = h - 44;
    rows.forEach((r, i) => {
      const jitter = [0, 2, 1, 3, 0, 2, 1][i % 7] ?? 0;
      const lines = wrap(s, "galmuri9", r.text, split - 40 - jitter);
      if (ny + lines.length * RULE > floor) return;
      const label = new Label(s, 30 + jitter, ny, lines.join("\n"), {
        font: "galmuri9",
        color: HAND[r.hand] ?? "ink.mid",
        leading: RULE - ink("galmuri9").line,
      });
      sh.add(label.obj);
      ny += lines.length * RULE;
    });
    if (rows.length)
      sh.add(s.add.rectangle(split - 4, 26, 1, h - 52, paint("stone.light")).setOrigin(0));
    // The record, one boss to a row: a small photograph, the day, and the names.
    const x = split + 4;
    const rowH = Math.floor((h - 34) / Math.max(1, page.bosses.length));
    page.bosses.forEach((b, i) => {
      const y = 26 + i * rowH;
      this.photo(x, y + 2, 30, { ...b, boss: b.boss }, b.freedAt !== null ? "freed" : "open");
      const tx = x + 38;
      sh.add(
        new Label(s, tx, y + 1, speakerName(b.boss), { font: "galmuri9", color: "ink.dark" }).obj,
      );
      if (b.freedAt !== null)
        sh.add(
          rightLabel(s, w - 10, y + 1, dateOf(b.freedAt), {
            font: "galmuri9",
            color: "red.mid",
          }).obj,
        );
      let ty = y + 13;
      if (b.finalHit) {
        sh.add(
          new Label(s, tx, ty, `${t("research.finalHit")} ${b.finalHit.name}`, {
            font: "galmuri9",
            color: "navy.mid",
          }).obj,
        );
        ty += RULE - 1;
      }
      const lead = b.leaders.map((l) => (BOARDS[l.board] ? l.name : "")).filter(Boolean);
      if (lead.length)
        sh.add(
          new Label(s, tx, ty, lead.join(" · "), {
            font: "galmuri9",
            color: "ink.mid",
            width: w - tx - 10,
          }).obj,
        );
    });
    this.seal(page, 30 + 26, h - 30);
  }

  /** The school's 도장, pressed once when the returned page is first opened. */
  private seal(page: NotebookPage, x: number, y: number): void {
    const s = this.ctx.scene;
    const c = s.add.container(x, y);
    const word = new Label(s, 0, 0, t("research.returned"), {
      font: "galmuri11-bold",
      color: "red.mid",
    });
    const bw = word.width + 10;
    const g = s.add.graphics();
    g.lineStyle(2, paint("red.mid")).strokeRect(-bw / 2, -10, bw, 20);
    g.lineStyle(1, paint("red.light")).strokeRect(-bw / 2 + 3, -7, bw - 6, 14);
    word.at(-Math.round(word.width / 2), -5);
    c.add([g, word.obj]).setAlpha(0.9);
    this.sheet.add(c);
    if (!this.stamped.has(page.page)) {
      this.stamped.add(page.page);
      stamp(c, { x, y });
      sound("stamp");
      cue("jingle.liberation", { volume: 0.5 });
    }
  }
}

function dateOf(serverMs: number): string {
  const d = new Date(serverMs);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

export function registerResearch(): void {
  registerMenuTab({
    id: "research",
    label: t("menu.research"),
    icon: "menu/notebook",
    order: 50,
    build(ctx, page, size) {
      new ResearchPage(ctx, page, size);
    },
  });
}
