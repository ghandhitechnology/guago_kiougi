import { CODEX_SETS, monsterById, narrative } from "@guago/content";
import * as Phaser from "phaser";
import { t } from "../i18n/index.ts";
import { bookGood, termName } from "../items/catalog.ts";
import { cue } from "../sound/audio.ts";
import { live } from "../state/live.ts";
import { Button } from "../ui/button.ts";
import { List, type ListRow } from "../ui/list.ts";
import { fade, layDown, slide, turnPage } from "../ui/motion.ts";
import { edges } from "../ui/screen.ts";
import { sound } from "../ui/sound.ts";
import { Label, wrap } from "../ui/text.ts";
import { paint, sliceOf } from "../ui/theme.ts";
import type { Ctx } from "../ui/widget.ts";
import { onGone, rightLabel } from "./common.ts";
import { registerMenuTab } from "./notebook.ts";
import { momentSlot } from "./stack.ts";

/**
 * The 도감 (PLAN §15): four sections, each one set. The list on the left names what is found and
 * blacks out what is not, an 오개념 counting its kills toward that entry's own threshold; the
 * page on the right is the entry, its picture a silhouette until found, its text in leaves the
 * player turns. Under the list, the section's set and what finishing it gives for good.
 */

const N = narrative.NARRATIVE;
type Entry = (typeof N.codex)[number];
type Section = Entry["section"];
const SECTIONS: readonly { section: Section; set: string }[] = [
  { section: "scientist", set: "p1-scientists" },
  { section: "misconception", set: "p1-misconceptions" },
  { section: "book", set: "launch-books" },
  { section: "school", set: "campus" },
];
const ko = (k: string | undefined) => (k ? (N.ko[k] ?? "") : "");
const LIST_W = 150;
const ROW = 11;

/** The parts of an entry's page, in reading order. */
function entryText(e: Entry): { label?: string; text: string }[] {
  switch (e.section) {
    case "scientist":
      return [
        { text: ko(e.who) },
        { label: t("codex.right"), text: ko(e.right) },
        { label: t("codex.wrong"), text: ko(e.wrong) },
        { label: t("codex.replaced"), text: ko(e.replaced) },
      ];
    case "misconception":
      return [{ text: ko(e.body) }];
    case "book":
      return [{ text: ko(e.flavor) }, { text: ko(e.concept) }];
    default:
      return [{ text: ko((e as { body?: string }).body) }];
  }
}

/** Kills toward an 오개념 entry and the entry's own threshold; undefined for other entries. */
function killsOf(e: Entry): { have: number; need: number } | undefined {
  if (e.unlock.when !== "kills") return undefined;
  const kills = e.unlock.monsters.reduce((n, m) => n + (live.codex?.kills[m] ?? 0), 0);
  return { have: Math.min(kills, e.unlock.count), need: e.unlock.count };
}

function unlockedAt(id: string): number | undefined {
  return live.codex?.unlocked.find((u) => u.id === id)?.at;
}

/** The entry's picture: a scientist's portrait, an 오개념's monster, a book's cover. */
function picture(e: Entry): { atlas: string; frame: string; scale: number } | undefined {
  if (e.section === "scientist")
    return { atlas: "portraits", frame: `portrait-${e.id}/neutral`, scale: 1 };
  if (e.section === "book") return { atlas: "ui", frame: bookGood(e.id).icon, scale: 2 };
  if (e.section === "misconception" && e.unlock.when === "kills") {
    const id = e.unlock.monsters[0];
    if (!id) return undefined;
    const sprite = monsterById(id).sprite;
    return { atlas: "core", frame: `${sprite}/idle0`, scale: 1 };
  }
  return undefined;
}

/** A framed picture taped to the page: the found one in colour, the rest as a silhouette. */
function framed(
  scene: Phaser.Scene,
  e: Entry,
  open: boolean,
  size: number,
): Phaser.GameObjects.Container | undefined {
  const pic = picture(e);
  if (!pic || !scene.textures.exists(pic.atlas) || !scene.textures.get(pic.atlas).has(pic.frame))
    return undefined;
  const c = scene.add.container(0, 0);
  c.add(
    scene.add
      .rectangle(0, 0, size, size, paint("stone.bright"))
      .setOrigin(0)
      .setStrokeStyle(1, paint("stone.mid")),
  );
  const img = scene.add.image(0, 0, pic.atlas, pic.frame).setOrigin(0);
  const room = size - 4;
  const big = Math.max(img.width, img.height);
  if (big > room) {
    // Too big for a small frame (a portrait on a card): the face, from the top middle.
    const cx = Math.round((img.width - room) / 2);
    img.setCrop(cx, 2, room, room).setPosition(2 - cx, 0);
  } else {
    const k = Math.max(1, Math.floor(room / big));
    img
      .setScale(k)
      .setPosition(Math.round((size - img.width * k) / 2), Math.round((size - img.height * k) / 2));
  }
  if (!open) img.setTint(paint("ink.mid")).setTintMode(Phaser.TintModes.FILL).setAlpha(0.9);
  c.add(img);
  c.add(
    scene.add
      .rectangle(Math.round(size / 2) - 9, -3, 18, 6, paint("gold.pale"))
      .setOrigin(0)
      .setAlpha(0.85),
  );
  return c;
}

class CodexPage {
  private readonly ctx: Ctx;
  private readonly root: Phaser.GameObjects.Container;
  private readonly size: { w: number; h: number };
  private readonly detail: Phaser.GameObjects.Container;
  private readonly setRow: Phaser.GameObjects.Container;
  private readonly tabs: {
    section: Section;
    button: Button;
    mark: Phaser.GameObjects.Rectangle;
  }[] = [];
  private readonly pager: { prev: Button; next: Button; count: Label };
  private list: List | undefined;
  private section: Section = "scientist";
  private picked = 0;
  private leaf = 0;
  private leaves = 1;

  constructor(
    ctx: Ctx,
    parent: Phaser.GameObjects.Container,
    size: { w: number; h: number },
    open?: string,
  ) {
    this.ctx = ctx;
    this.size = size;
    const s = ctx.scene;
    this.root = s.add.container(0, 0);
    parent.add(this.root);
    let x = 8;
    for (const { section } of SECTIONS) {
      const button = new Button(ctx, x, 3, {
        kind: "text",
        label: `${t(`codex.section.${section}`)} 0/0`,
        sound: "tab",
        onPress: () => this.setSection(section),
      });
      const mark = s.add
        .rectangle(x - 1, 16, button.size().w + 2, 1, paint("red.mid"))
        .setOrigin(0)
        .setVisible(false);
      this.root.add([button, mark]);
      this.tabs.push({ section, button, mark });
      x += button.size().w + 12;
    }
    this.detail = s.add.container(LIST_W + 20, 22);
    this.setRow = s.add.container(8, size.h - 36);
    this.root.add([this.detail, this.setRow]);
    // Turning the leaves of a long entry.
    const px = size.w - 8;
    const py = size.h - 16;
    const prev = new Button(ctx, px - 44, py, {
      kind: "text",
      icon: "arrow/left",
      sound: "tab",
      onPress: () => this.turn(-1),
    });
    const next = new Button(ctx, px - 10, py, {
      kind: "text",
      icon: "arrow/right",
      sound: "tab",
      onPress: () => this.turn(1),
    });
    const count = new Label(s, px - 30, py + 3, "", {
      font: "galmuri9",
      color: "stone.dark",
      width: 18,
      align: "center",
    });
    this.root.add([prev, next, count.obj]);
    this.pager = { prev, next, count };
    const off = live.watch((_l, push) => {
      if (!push || push.t === "codex" || push.t === "unlock") this.draw();
    });
    onGone(this.root, off);
    void live.read("codex");
    const e = open ? N.codex.find((c) => c.id === open) : undefined;
    if (e) this.section = e.section;
    this.setSection(this.section, true, open);
  }

  private entries(section = this.section): Entry[] {
    return N.codex.filter((e) => e.section === section);
  }

  private setSection(section: Section, quiet = false, open?: string): void {
    if (!quiet && section === this.section) return;
    this.section = section;
    for (const tab of this.tabs) tab.mark.setVisible(tab.section === section);
    const i = open ? this.entries().findIndex((e) => e.id === open) : 0;
    this.picked = Math.max(0, i);
    this.leaf = 0;
    this.list?.destroy();
    this.list = undefined;
    this.draw();
  }

  private draw(): void {
    const s = this.ctx.scene;
    for (const tab of this.tabs) {
      const all = this.entries(tab.section);
      const found = all.filter((e) => unlockedAt(e.id) !== undefined).length;
      tab.button.setText(`${t(`codex.section.${tab.section}`)} ${found}/${all.length}`);
    }
    const list = this.entries();
    const rows: ListRow[] = list.map((e, i) => ({
      draw: (into, w, h, rc) => {
        const open = unlockedAt(e.id) !== undefined;
        const kills = killsOf(e);
        if (open) {
          into.add(new Label(s, 4, 4, ko(e.name), { font: "galmuri9", color: "ink.dark" }).obj);
        } else {
          // Not found yet: the name is blacked out with a marker.
          const bar = Math.min(kills ? w - 52 : w - 12, 10 + ko(e.name).length * 7);
          into.add(s.add.rectangle(4, 5, bar, 7, paint("ink.mid")).setOrigin(0));
        }
        if (!open && kills) {
          const label = rightLabel(s, w - 6, 4, `${kills.have}/${kills.need}`, {
            font: "galmuri9",
            color: "red.dark",
          });
          into.add(label.obj);
          into.add(s.add.rectangle(4, h - 3, w - 10, 1, paint("stone.light")).setOrigin(0));
          into.add(
            s.add
              .rectangle(
                4,
                h - 3,
                Math.round(((w - 10) * kills.have) / kills.need),
                1,
                paint("red.mid"),
              )
              .setOrigin(0),
          );
        }
        rc.zone(0, 0, w, h, () => this.pick(i));
      },
      activate: () => this.pick(i),
    }));
    const visible = Math.max(4, Math.floor((this.size.h - 22 - 40) / 16));
    if (!this.list) {
      this.list = new List(this.ctx, 8, 22, { w: LIST_W, visible, rows, selected: this.picked });
      this.root.add(this.list);
    } else {
      this.list.setRows(rows);
      this.list.choose(this.picked);
    }
    this.drawEntry(list[this.picked]);
    this.drawSet();
  }

  private pick(i: number): void {
    if (i === this.picked) return;
    this.picked = i;
    this.leaf = 0;
    sound("page");
    this.list?.choose(i);
    turnPage(this.detail, () => this.drawEntry(this.entries()[i]));
  }

  private turn(by: number): void {
    const to = Phaser.Math.Clamp(this.leaf + by, 0, this.leaves - 1);
    if (to === this.leaf) return;
    this.leaf = to;
    turnPage(this.detail, () => this.drawEntry(this.entries()[this.picked]));
  }

  private drawEntry(e: Entry | undefined): void {
    const s = this.ctx.scene;
    this.detail.removeAll(true);
    this.leaves = 1;
    this.showPager();
    if (!e) return;
    const at = unlockedAt(e.id);
    const open = at !== undefined;
    const w = this.size.w - LIST_W - 34;
    const pic = framed(s, e, open, 52);
    const textX = pic ? 60 : 0;
    if (pic) this.detail.add(pic);
    // The name, or a strip of marker where it will be.
    if (open) {
      this.detail.add(
        new Label(s, textX, 3, ko(e.name), {
          font: "galmuri11-bold",
          color: "ink.dark",
          width: w - textX - 50,
        }).obj,
      );
      this.detail.add(
        rightLabel(s, w, 4, dateOf(at), {
          font: "galmuri9",
          color: "red.mid",
        }).obj,
      );
    } else {
      this.detail.add(
        s.add
          .rectangle(textX, 4, Math.min(w - textX, 16 + ko(e.name).length * 9), 9, paint("ink.mid"))
          .setOrigin(0),
      );
    }
    const y = 20;
    if (e.section === "scientist" && open) {
      const rows = wrap(s, "galmuri9", ko(e.era), w - textX).slice(0, 2);
      this.detail.add(
        new Label(s, textX, y, rows.join("\n"), { font: "galmuri9", color: "red.dark", leading: 1 })
          .obj,
      );
    }
    const kills = killsOf(e);
    if (kills && !open) {
      // How far the hunt has come: a ruled bar under the blacked-out name.
      const bw = w - textX;
      this.detail.add(s.add.rectangle(textX, y + 6, bw, 4, paint("stone.light")).setOrigin(0));
      this.detail.add(
        s.add
          .rectangle(
            textX,
            y + 6,
            Math.max(1, Math.round((bw * kills.have) / kills.need)),
            4,
            paint("red.mid"),
          )
          .setOrigin(0),
      );
      this.detail.add(
        new Label(s, textX, y + 14, `${kills.have} / ${kills.need}`, {
          font: "galmuri9",
          color: "red.dark",
        }).obj,
      );
    }
    const top = pic ? 60 : 34;
    const bottom = this.size.h - 22 - 20;
    if (!open) {
      // Locked: three lines of marker where the entry will be written.
      const widths = [0.92, 0.78, 0.55];
      widths.forEach((k, i) => {
        this.detail.add(
          s.add
            .rectangle(0, top + i * ROW + 2, Math.round(w * k), 6, paint("stone.light"))
            .setOrigin(0),
        );
      });
      return;
    }
    // The entry's text, laid into leaves that fit the page.
    const lines: { text: string; color: string; gap: number }[] = [];
    for (const part of entryText(e)) {
      if (!part.text) continue;
      if (part.label) lines.push({ text: part.label, color: "red.dark", gap: 0 });
      const rows = wrap(s, "galmuri9", part.text, w);
      rows.forEach((r, i) => {
        lines.push({ text: r, color: "ink.mid", gap: i === rows.length - 1 ? 4 : 0 });
      });
    }
    const leaves: (typeof lines)[] = [[]];
    let h = 0;
    for (const l of lines) {
      if (h + ROW > bottom - top && (leaves.at(-1)?.length ?? 0) > 0) {
        leaves.push([]);
        h = 0;
      }
      leaves.at(-1)?.push(l);
      h += ROW + l.gap;
    }
    // A label never ends a leaf on its own.
    for (let i = 0; i < leaves.length - 1; i++) {
      const leaf = leaves[i] ?? [];
      const last = leaf.at(-1);
      if (last && last.color === "red.dark")
        leaves[i + 1]?.unshift(leaf.pop() as (typeof lines)[number]);
    }
    this.leaves = leaves.length;
    this.leaf = Math.min(this.leaf, this.leaves - 1);
    let ly = top;
    for (const l of leaves[this.leaf] ?? []) {
      this.detail.add(new Label(s, 0, ly, l.text, { font: "galmuri9", color: l.color }).obj);
      ly += ROW + l.gap;
    }
    this.showPager();
  }

  private showPager(): void {
    const many = this.leaves > 1;
    this.pager.prev.setVisible(many).setEnabled(many && this.leaf > 0);
    this.pager.next.setVisible(many).setEnabled(many && this.leaf < this.leaves - 1);
    this.pager.count.obj.setVisible(many);
    this.pager.count.set(`${this.leaf + 1}/${this.leaves}`);
  }

  /** The section's set: how much of it is found, and what finishing it gives. */
  private drawSet(): void {
    const s = this.ctx.scene;
    const c = this.setRow;
    c.removeAll(true);
    const id = SECTIONS.find((x) => x.section === this.section)?.set;
    const def = CODEX_SETS.find((x) => x.id === id);
    if (!def) return;
    const view = live.codex?.sets.find((x) => x.id === id);
    const have = view?.have ?? this.entries().filter((e) => unlockedAt(e.id) !== undefined).length;
    const need = view?.need ?? def.entries.length;
    const done = view?.done ?? have >= need;
    const bonus = `${t(`codex.bonus.${def.bonus.stat}`)} +${Math.round(def.bonus.amount * 100)}%`;
    c.add(s.add.rectangle(0, 0, LIST_W, 1, paint("stone.light")).setOrigin(0));
    c.add(new Label(s, 0, 4, setName(def.id), { font: "galmuri9", color: "ink.dark" }).obj);
    c.add(
      rightLabel(s, LIST_W, 4, `${have}/${need}`, {
        font: "galmuri9",
        color: "stone.dark",
      }).obj,
    );
    c.add(s.add.rectangle(0, 15, LIST_W, 3, paint("stone.light")).setOrigin(0));
    c.add(
      s.add
        .rectangle(
          0,
          15,
          Math.round((LIST_W * have) / Math.max(1, need)),
          3,
          paint(done ? "gold.mid" : "sea.mid"),
        )
        .setOrigin(0),
    );
    const b = new Label(s, 0, 21, bonus, {
      font: "galmuri9",
      color: done ? "gold.deep" : "stone.mid",
    });
    c.add(b.obj);
    if (done) c.add(s.add.image(b.width + 4, 19, "ui", "check/on").setOrigin(0));
  }
}

function setName(id: string): string {
  return termName("set", id);
}

function dateOf(serverMs: number): string {
  const d = new Date(serverMs);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * 도감 entries found in play: a small card slides in under the minimap with the entry's picture
 * and name and leaves on its own; a set the find completes follows in gold with its bonus. The
 * player keeps playing throughout.
 */
export function codexUnlocked(scene: Phaser.Scene, ids: readonly string[]): void {
  const found = ids
    .map((id) => N.codex.find((c) => c.id === id))
    .filter((e): e is Entry => Boolean(e));
  found.forEach((entry, i) => {
    scene.time.delayedCall(i * 700, () => card(scene, entry));
  });
  const sets = CODEX_SETS.filter(
    (set) =>
      set.entries.some((e) => ids.includes(e)) &&
      set.entries.every((e) => unlockedAt(e) !== undefined),
  );
  sets.forEach((set, i) => {
    scene.time.delayedCall(found.length * 700 + 500 + i * 900, () => setCard(scene, set));
  });
}

function card(scene: Phaser.Scene, entry: Entry): void {
  const e = edges();
  const c = scene.add.container(0, 0).setDepth(645);
  const [l, r, tt, bb] = sliceOf("tooltip");
  const pic = framed(scene, entry, true, 26);
  const px = pic ? 32 : 8;
  const tag = new Label(scene, px, 5, t("menu.codex"), { font: "galmuri9", color: "red.dark" });
  const name = new Label(scene, px, 16, ko(entry.name), {
    font: "galmuri11-bold",
    color: "ink.dark",
  });
  const w = Math.max(tag.width, name.width) + px + 10;
  c.add(scene.add.nineslice(0, 0, "ui", "tooltip/idle", w, 34, l, r, tt, bb).setOrigin(0));
  if (pic) c.add(pic.setPosition(5, 5));
  c.add([tag.obj, name.obj]);
  const x = e.right - w - 4;
  const y = momentSlot(scene, 34, 3700);
  c.setPosition(x + 24, y).setAlpha(0);
  slide(c, { x, y }, 200);
  fade(c, 1, 200);
  cue("page-flutter");
  cue("sfx.pickup.page", { volume: 0.6 });
  scene.time.delayedCall(3400, () => {
    slide(c, { x: x + 24, y }, 200);
    fade(c, 0, 200, () => c.destroy());
  });
}

function setCard(scene: Phaser.Scene, set: (typeof CODEX_SETS)[number]): void {
  const e = edges();
  const c = scene.add.container(0, 0).setDepth(646);
  const [l, r, tt, bb] = sliceOf("tooltip");
  const name = new Label(scene, 8, 6, setName(set.id), {
    font: "galmuri11-bold",
    color: "gold.deep",
  });
  const bonus = new Label(
    scene,
    8,
    20,
    `${t(`codex.bonus.${set.bonus.stat}`)} +${Math.round(set.bonus.amount * 100)}%`,
    {
      font: "galmuri9",
      color: "ink.dark",
    },
  );
  const w = Math.max(name.width, bonus.width) + 30;
  c.add(scene.add.nineslice(0, 0, "ui", "tooltip/idle", w, 34, l, r, tt, bb).setOrigin(0));
  c.add(scene.add.rectangle(2, 2, w - 4, 2, paint("gold.mid")).setOrigin(0));
  c.add([name.obj, bonus.obj]);
  c.add(scene.add.image(w - 16, 12, "ui", "check/on").setOrigin(0));
  const x = Math.round((e.left + e.right - w) / 2);
  const y = e.top + 40;
  layDown(c, { x, y });
  cue("jingle.rare-drop");
  scene.time.delayedCall(4200, () => fade(c, 0, 300, () => c.destroy()));
}

export function registerCodex(): void {
  registerMenuTab({
    id: "codex",
    label: t("menu.codex"),
    icon: "menu/codex",
    order: 40,
    build(ctx, page, size, arg) {
      new CodexPage(ctx, page, size, typeof arg === "string" ? arg : undefined);
    },
  });
}
