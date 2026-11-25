import { narrative } from "@guago/content";
import {
  HELP_TEMPLATES,
  type HelpNoticeView,
  type HelpTemplate,
  type NoticeView,
} from "@guago/shared";
import type * as Phaser from "phaser";
import { refusal } from "../copy/lines.ts";
import { t } from "../i18n/index.ts";
import { amount, bookGood, termName } from "../items/catalog.ts";
import { cue } from "../sound/audio.ts";
import { inventory } from "../state/inventory.ts";
import { live } from "../state/live.ts";
import { Button } from "../ui/button.ts";
import { fade, layDown, stamp } from "../ui/motion.ts";
import { Tooltip } from "../ui/overlay.ts";
import { sound } from "../ui/sound.ts";
import { Label, measure, wrap } from "../ui/text.ts";
import { paint, sliceOf } from "../ui/theme.ts";
import type { Ctx } from "../ui/widget.ts";
import { session } from "../world/session.ts";
import { clockLeft } from "./character.ts";
import { onGone, opRefusal, SaidLine } from "./common.ts";
import { registerMenuTab } from "./notebook.ts";

/**
 * The 수행평가 board (PLAN §15): a corkboard with the player's notices pinned to it, by kind. Each
 * note says who posted it, what to do and how far along it is; a finished one takes a 받기 press,
 * and what it pays flies off the note into the wallet. The board turns over on a clock in the
 * corner, counting down to the reset.
 */

const N = narrative.NARRATIVE;
const QUESTS = new Map(N.quests.map((q) => [q.id, q]));
const STORY = new Map(N.story.map((s) => [s.id, s]));
const descriptions = new Map(N.descriptions.map((d) => [d.id, d]));

type Kind = "daily" | "weekly" | "story" | "help";
const KINDS: readonly Kind[] = ["daily", "weekly", "story", "help"];

/**
 * A pinned note, two rows of three on the cork. Inside it, top to bottom: who posted it, the
 * title, up to two rows of the body, then the footer: progress (or the note's button) over what
 * it pays. A body cut short ends on a word and an ellipsis, and the whole note shows on a hover
 * or a long press.
 */
const NOTE = { w: 132, h: 82, gap: 4 } as const;
const TITLE_Y = 17;
/** Where the body must end, and the footer's rows. */
const BODY_END = 52;
const BAR_Y = 56;
const ACT_Y = 52;
const PAY_Y = 67;

/** `text` in at most `max` rows of `width`; a cut ends its last row on a word and an ellipsis. */
function fitRows(
  scene: Phaser.Scene,
  text: string,
  width: number,
  max: number,
): { rows: string[]; cut: boolean } {
  const all = text ? wrap(scene, "galmuri9", text, width) : [];
  if (all.length <= max) return { rows: all, cut: false };
  if (max <= 0) return { rows: [], cut: true };
  const rows = all.slice(0, max);
  let last = rows[max - 1] ?? "";
  while (last && measure(scene, "galmuri9", `${last}…`) > width) {
    const space = last.lastIndexOf(" ");
    last = space > 0 ? last.slice(0, space) : last.slice(0, -1);
  }
  rows[max - 1] = `${last.replace(/[\s.,]+$/, "")}…`;
  return { rows, cut: true };
}

/** A notice slot value as words: places, monsters, books and people by their names. */
function slotText(v: string | number): string | number {
  if (typeof v === "number") return v;
  const d = descriptions.get(v);
  if (d) return N.ko[d.name] ?? v;
  const monster = termName("monster", v);
  if (monster) return monster;
  const book = bookGood(v);
  if (book.name !== v) return book.name;
  return v;
}

function fillSlots(text: string, slots: Record<string, string | number>): string {
  const values: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(slots)) values[k] = slotText(v);
  return narrative.fill(text, values);
}

export function noticeTitle(n: Pick<NoticeView, "template" | "cadence">): string {
  if (n.cadence === "story") return N.ko[STORY.get(n.template)?.title ?? ""] ?? "";
  return N.ko[QUESTS.get(n.template)?.title ?? ""] ?? "";
}

class BoardPage {
  private readonly ctx: Ctx;
  private readonly root: Phaser.GameObjects.Container;
  private readonly notes: Phaser.GameObjects.Container;
  private readonly clock: Phaser.GameObjects.Container;
  private readonly said: SaidLine;
  private readonly tip: Tooltip;
  private readonly kindTabs: { kind: Kind; mark: Phaser.GameObjects.Rectangle }[] = [];
  private kind: Kind = "daily";
  private pending = new Set<string>();

  constructor(ctx: Ctx, parent: Phaser.GameObjects.Container, size: { w: number; h: number }) {
    this.ctx = ctx;
    const s = ctx.scene;
    this.root = s.add.container(0, 0);
    this.tip = new Tooltip(s);
    parent.add(this.root);
    // The cork.
    const cork = s.add.graphics();
    cork.fillStyle(paint("wood.mid")).fillRect(2, 18, size.w - 4, size.h - 20);
    cork.fillStyle(paint("wood.dark"));
    for (let i = 0; i < 260; i++) {
      const x = 4 + ((i * 97) % (size.w - 8));
      const y = 20 + ((i * 53) % (size.h - 24));
      cork.fillRect(x, y, 1, 1);
    }
    cork.fillStyle(paint("wood.light"));
    for (let i = 0; i < 140; i++)
      cork.fillRect(4 + ((i * 131) % (size.w - 8)), 20 + ((i * 71) % (size.h - 24)), 1, 1);
    this.root.add(cork);
    let kx = 8;
    for (const kind of KINDS) {
      const b = new Button(ctx, kx, 2, {
        kind: "text",
        label: t(`board.kind.${kind}`),
        sound: "tab",
        onPress: () => this.setKind(kind),
      });
      const mark = s.add
        .rectangle(kx - 1, 15, b.size().w + 2, 1, paint("red.mid"))
        .setOrigin(0)
        .setVisible(false);
      this.root.add([b, mark]);
      this.kindTabs.push({ kind, mark });
      kx += b.size().w + 12;
    }
    this.clock = s.add.container(size.w - 70, 2);
    this.notes = s.add.container(0, 22);
    // One row under the notes, inside the cork.
    this.said = new SaidLine(s, this.root, 8, size.h - 11, size.w - 16);
    this.root.add([this.clock, this.notes]);
    const off = live.watch((_l, push) => {
      if (
        !push ||
        push.t === "board" ||
        push.t === "done" ||
        push.t === "help" ||
        push.t === "page"
      )
        this.draw();
    });
    const tick = s.time.addEvent({ delay: 1000, loop: true, callback: () => this.drawClock() });
    onGone(this.root, () => {
      off();
      tick.remove();
      this.tip.hide();
    });
    void live.read("board");
    void live.read("page");
    this.setKind("daily", true);
  }

  private setKind(kind: Kind, quiet = false): void {
    if (!quiet && kind !== this.kind) sound("tab");
    this.kind = kind;
    for (const k of this.kindTabs) k.mark.setVisible(k.kind === kind);
    this.draw();
  }

  private drawClock(): void {
    const s = this.ctx.scene;
    this.clock.removeAll(true);
    const p = live.page;
    if (!p || this.kind === "story" || this.kind === "help") return;
    const at = this.kind === "weekly" ? p.nextWeekly : p.nextDaily;
    const ms = Math.max(0, live.realMsUntil(at));
    // A small clock face, then the time left on it.
    const g = s.add.graphics();
    g.fillStyle(paint("stone.bright")).fillCircle(6, 7, 6);
    g.lineStyle(1, paint("ink.dark")).strokeCircle(6, 7, 6);
    const a = ((ms / 1000) % 60) / 60;
    g.lineBetween(
      6,
      7,
      6 + Math.round(Math.sin(a * Math.PI * 2) * 4),
      7 - Math.round(Math.cos(a * Math.PI * 2) * 4),
    );
    g.lineBetween(6, 7, 6, 4);
    this.clock.add(g);
    this.clock.add(new Label(s, 16, 3, clockLeft(ms), { font: "galmuri9", color: "ink.dark" }).obj);
  }

  private draw(): void {
    this.drawClock();
    this.tip.hide();
    this.notes.removeAll(true);
    const b = live.board;
    if (!b) return;
    if (this.kind === "help") {
      this.drawHelp();
      return;
    }
    const list =
      this.kind === "daily"
        ? [...b.daily, ...(b.repeat ? [b.repeat] : [])]
        : this.kind === "weekly"
          ? b.weekly
          : [...b.story].slice(-6);
    list.slice(0, 6).forEach((n, i) => {
      this.note(i, n);
    });
  }

  private place(i: number): { x: number; y: number } {
    return {
      x: 8 + (i % 3) * (NOTE.w + 8),
      y: 2 + Math.floor(i / 3) * (NOTE.h + NOTE.gap),
    };
  }

  /**
   * A note's paper, pin, poster, title and as much of the body as fits; returns the note. The
   * whole text, when cut, shows over the note on a hover or a long press.
   */
  private paper(
    i: number,
    pin: string,
    head: { poster: string; title: string; body: string },
    /** A button will stand over the bar: the body keeps a row clear above it. */
    button = false,
  ): Phaser.GameObjects.Container {
    const s = this.ctx.scene;
    const at = this.place(i);
    const c = s.add.container(at.x, at.y);
    this.notes.add(c);
    const [l, r, tt, bb] = sliceOf("tooltip");
    c.add(s.add.nineslice(0, 0, "ui", "tooltip/idle", NOTE.w, NOTE.h, l, r, tt, bb).setOrigin(0));
    c.add(s.add.circle(NOTE.w / 2, 3, 2, paint(pin)));
    if (head.poster)
      c.add(new Label(s, 6, 5, head.poster, { font: "galmuri9", color: "stone.dark" }).obj);
    const title = new Label(s, 6, TITLE_Y, head.title, {
      font: "galmuri11-bold",
      color: "ink.dark",
      width: NOTE.w - 12,
    });
    c.add(title.obj);
    const top = TITLE_Y + title.height - 2;
    const { rows, cut } = fitRows(
      s,
      head.body,
      NOTE.w - 12,
      Math.floor(((button ? BODY_END - 12 : BODY_END) - top + 3) / 12),
    );
    if (rows.length > 0) {
      c.add(
        new Label(s, 6, top, rows.join("\n"), { font: "galmuri9", color: "ink.mid", leading: 0 })
          .obj,
      );
    }
    if (cut) {
      // Over the paper and the words, never over the footer's button.
      const zone = s.add
        .zone(0, 0, NOTE.w, ACT_Y - 1)
        .setOrigin(0)
        .setInteractive();
      const show = () => {
        const m = c.getWorldTransformMatrix();
        this.tip.show(`${head.title}\n${head.body}`, { x: m.tx, y: m.ty, w: NOTE.w, h: NOTE.h });
      };
      zone.on("pointerover", show);
      zone.on("pointerdown", (p: Phaser.Input.Pointer) => {
        if (p.wasTouch) show();
      });
      zone.on("pointerout", () => this.tip.hide());
      zone.on("pointerup", (p: Phaser.Input.Pointer) => {
        if (p.wasTouch) this.tip.hide();
      });
      c.add(zone);
    }
    return c;
  }

  /**
   * The footer's progress: a bar with the count at its right, or, when a button stands at the
   * footer's right (`button` is its left edge), the bar alone up to it.
   */
  private progress(c: Phaser.GameObjects.Container, now: number, of: number, button?: number) {
    const s = this.ctx.scene;
    const share = Math.min(1, now / Math.max(1, of));
    let w = (button ?? NOTE.w - 6) - 4 - 6;
    if (button === undefined) {
      const count = new Label(s, 0, BAR_Y - 2, `${Math.min(now, of)}/${of}`, {
        font: "galmuri9",
        color: "ink.dark",
      });
      count.at(NOTE.w - 6 - count.width, BAR_Y - 2);
      c.add(count.obj);
      w = NOTE.w - 12 - count.width - 4;
    }
    c.add(s.add.rectangle(6, BAR_Y, w, 4, paint("stone.light")).setOrigin(0));
    c.add(
      s.add
        .rectangle(6, BAR_Y, Math.round(w * share), 4, paint(share >= 1 ? "grass.mid" : "sea.mid"))
        .setOrigin(0),
    );
  }

  /** A button at the footer's right: over the bar's end, or on the last row. */
  private action(
    c: Phaser.GameObjects.Container,
    label: string,
    run: () => void,
    opts: { sound?: "confirm"; y?: number } = {},
  ): Button {
    const { sound } = opts;
    const b = new Button(this.ctx, 0, opts.y ?? ACT_Y, {
      label,
      kind: "ink",
      font: "galmuri9",
      h: 15,
      ...(sound ? { sound } : {}),
      onPress: run,
    });
    b.setX(NOTE.w - 6 - b.size().w);
    c.add(b);
    return b;
  }

  /** One pinned notice. */
  private note(i: number, n: NoticeView): void {
    const s = this.ctx.scene;
    const q = QUESTS.get(n.template);
    const c = this.paper(
      i,
      "red.mid",
      {
        poster: q ? (N.ko[q.poster] ?? "") : "",
        title: noticeTitle(n),
        body: q ? fillSlots(N.ko[q.body] ?? "", n.slots) : "",
      },
      n.state === "done",
    );
    // How far along, or the 받기 on a finished one; under it, what it pays.
    let claim: Button | undefined;
    if (n.state === "done") {
      claim = this.action(c, t("board.claim"), () => void this.claim(n, c), {
        sound: "confirm",
      });
      claim.setEnabled(!this.pending.has(n.id));
    }
    this.progress(c, n.progress, n.target, claim?.x);
    const pay = s.add.container(6, PAY_Y);
    c.add(pay);
    let px = 0;
    const r2 = n.reward;
    const items: [string | null, number][] = [
      [null, r2.exp],
      ["icon/pinecone", r2.pinecone],
      ["icon/ink", r2.ink],
      ["material/binding", r2.binding],
      ["icon/page", r2.sheets],
      ["icon/merit", n.merit],
    ];
    for (const [icon, v] of items) {
      if (!v) continue;
      // Whatever does not fit on the note's last row is left for the claim to show.
      const lab = new Label(s, 0, 2, amount(v), { font: "galmuri9", color: "ink.dark" });
      const lead = icon ? 13 : 20;
      if (px + lead + lab.width > NOTE.w - 12) {
        lab.obj.destroy();
        break;
      }
      if (icon) pay.add(s.add.image(px, 0, "ui", icon).setOrigin(0));
      else pay.add(new Label(s, px, 2, "EXP", { font: "galmuri9", color: "sea.dark" }).obj);
      px += lead;
      lab.at(px, 2);
      pay.add(lab.obj);
      px += lab.width + 6;
    }
    if (n.state === "claimed") {
      // The 완료 stamp, a little crooked.
      const st = s.add.container(NOTE.w - 30, 30).setRotation(-0.2);
      const ring = s.add.circle(0, 0, 15).setStrokeStyle(2, paint("red.mid"));
      const w = new Label(s, 0, 0, t("board.done"), { font: "galmuri11-bold", color: "red.mid" });
      w.at(-Math.round(w.width / 2), -5);
      st.add([ring, w.obj]);
      c.add(st);
      c.setAlpha(0.75);
    }
  }

  private async claim(n: NoticeView, note: Phaser.GameObjects.Container): Promise<void> {
    if (this.pending.has(n.id)) return;
    this.pending.add(n.id);
    const r = await inventory.op("quest.claim", { quest: n.id });
    this.pending.delete(n.id);
    if (!this.root.active) return;
    if (!r.ok) {
      sound("error");
      this.said.say(opRefusal(r));
      this.draw();
      return;
    }
    // What it pays flies off the note toward the wallet, number by number.
    const s = this.ctx.scene;
    const m = note.getWorldTransformMatrix();
    const flies: [string, number][] = [
      ["icon/pinecone", n.reward.pinecone],
      ["icon/ink", n.reward.ink],
      ["icon/page", n.reward.sheets],
      ["icon/merit", n.merit],
    ];
    let k = 0;
    for (const [icon, v] of flies) {
      if (!v) continue;
      const fly = s.add.container(m.tx + 20 + k * 22, m.ty + NOTE.h - 20).setDepth(950);
      fly.add(s.add.image(0, 0, "ui", icon).setOrigin(0.5));
      const lab = new Label(s, 8, -4, `+${amount(v)}`, { font: "galmuri9", color: "gold.deep" });
      fly.add(lab.obj);
      s.tweens.add({
        targets: fly,
        y: fly.y - 26,
        duration: 500,
        delay: k * 120,
        ease: "Cubic.Out",
      });
      s.tweens.add({
        targets: fly,
        alpha: 0,
        duration: 300,
        delay: 700 + k * 120,
        onComplete: () => fly.destroy(),
      });
      s.time.delayedCall(k * 120, () => cue("sfx.pickup.cone", { volume: 0.7 }));
      k++;
    }
    sound("stamp");
    void live.read("board");
  }

  // 도움 notices ---------------------------------------------------------------------------------

  private drawHelp(): void {
    const b = live.board;
    if (!b) return;
    let i = 0;
    const draw = (n: HelpNoticeView, action: { label: string; run: () => void } | undefined) => {
      const q = QUESTS.get(n.template);
      const c = this.paper(i++, "gold.mid", {
        poster: q ? (N.ko[q.poster] ?? "") : "",
        title: q ? (N.ko[q.title] ?? "") : "",
        body: q ? fillSlots(N.ko[q.body] ?? "", { ...n.slots, player: n.poster.name }) : "",
      });
      // A 도움 notice pays nothing on paper: its button takes the last row, under the count.
      if (action) this.action(c, action.label, action.run, { y: NOTE.h - 17 });
      this.progress(c, n.progress, n.count);
    };
    if (b.help.mine)
      draw(
        b.help.mine,
        b.help.mine.state === "open"
          ? {
              label: t("board.help.cancel"),
              run: () => void this.help("cancel", { notice: b.help.mine?.id ?? "" }),
            }
          : undefined,
      );
    if (b.help.taken)
      draw(b.help.taken, {
        label: t("board.help.drop"),
        run: () => void this.help("drop", { notice: b.help.taken?.id ?? "" }),
      });
    for (const n of b.help.open.slice(0, 6 - i)) {
      draw(n, { label: t("board.help.take"), run: () => void this.help("take", { notice: n.id }) });
    }
    // With no notice of their own up, the player may ask for help.
    if (!b.help.mine && i < 6) {
      const at = this.place(i);
      let y = at.y + 6;
      for (const tpl of HELP_TEMPLATES.filter((x) => x !== "help-finish")) {
        const q = QUESTS.get(tpl);
        const btn = new Button(this.ctx, at.x + 6, y, {
          label: q ? (N.ko[q.title] ?? tpl) : tpl,
          font: "galmuri9",
          h: 17,
          onPress: () => void this.help("post", { template: tpl as HelpTemplate }),
        });
        this.notes.add(btn);
        y += 21;
      }
    }
  }

  private async help(
    action: "post" | "take" | "cancel" | "drop",
    body: { template?: HelpTemplate; notice?: string },
  ): Promise<void> {
    const link = session.link;
    if (!link) return;
    const r = await link.help(action, body);
    if (!this.root.active) return;
    if (!r.ok) {
      sound("error");
      this.said.say(refusal("live", r.code));
      return;
    }
    sound(action === "post" ? "stamp" : "confirm");
    await live.read("board");
  }
}

/** A notice finished in play: a note slides in at the right, stamped, without stopping anything. */
export function noticeDone(scene: Phaser.Scene, n: NoticeView, x: number, y: number): void {
  const c = scene.add.container(x, y).setDepth(640);
  const [l, r, tt, bb] = sliceOf("tooltip");
  const title = new Label(scene, 8, 8, noticeTitle(n), { font: "galmuri9", color: "ink.dark" });
  const w = Math.max(110, title.width + 40);
  c.add(scene.add.nineslice(0, 0, "ui", "tooltip/idle", w, 26, l, r, tt, bb).setOrigin(0));
  c.add(title.obj);
  const check = scene.add.image(w - 18, 7, "ui", "check/on").setOrigin(0);
  c.add(check);
  c.add(scene.add.circle(w / 2, 2, 2, paint("red.mid")));
  layDown(c, { x, y });
  scene.time.delayedCall(260, () => {
    stamp(check, { x: w - 18, y: 7 });
    sound("stamp");
  });
  scene.time.delayedCall(3200, () => fade(c, 0, 400, () => c.destroy()));
}

export function registerBoard(): void {
  registerMenuTab({
    id: "board",
    label: t("menu.board"),
    icon: "menu/quests",
    order: 30,
    build(ctx, page, size) {
      new BoardPage(ctx, page, size);
    },
  });
}
