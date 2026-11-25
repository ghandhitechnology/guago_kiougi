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
import { sound } from "../ui/sound.ts";
import { Label, wrap } from "../ui/text.ts";
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

const NOTE = { w: 132, h: 90 } as const;

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
  private readonly kindTabs: { kind: Kind; mark: Phaser.GameObjects.Rectangle }[] = [];
  private kind: Kind = "daily";
  private pending = new Set<string>();

  constructor(ctx: Ctx, parent: Phaser.GameObjects.Container, size: { w: number; h: number }) {
    this.ctx = ctx;
    const s = ctx.scene;
    this.root = s.add.container(0, 0);
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
        .rectangle(kx - 1, 15, b.bounds().w + 2, 1, paint("red.mid"))
        .setOrigin(0)
        .setVisible(false);
      this.root.add([b, mark]);
      this.kindTabs.push({ kind, mark });
      kx += b.bounds().w + 12;
    }
    this.clock = s.add.container(size.w - 70, 2);
    this.notes = s.add.container(0, 22);
    this.said = new SaidLine(s, this.root, 8, size.h - 14, size.w - 16);
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
    return { x: 8 + (i % 3) * (NOTE.w + 8), y: 4 + Math.floor(i / 3) * (NOTE.h + 6) };
  }

  /** One pinned notice. */
  private note(i: number, n: NoticeView): void {
    const s = this.ctx.scene;
    const at = this.place(i);
    const c = s.add.container(at.x, at.y);
    this.notes.add(c);
    const [l, r, tt, bb] = sliceOf("tooltip");
    c.add(s.add.nineslice(0, 0, "ui", "tooltip/idle", NOTE.w, NOTE.h, l, r, tt, bb).setOrigin(0));
    c.add(s.add.circle(NOTE.w / 2, 3, 2, paint("red.mid")));
    const q = QUESTS.get(n.template);
    const poster = q ? (N.ko[q.poster] ?? "") : "";
    if (poster) c.add(new Label(s, 6, 6, poster, { font: "galmuri9", color: "stone.dark" }).obj);
    const title = new Label(s, 6, 18, noticeTitle(n), {
      font: "galmuri11-bold",
      color: "ink.dark",
      width: NOTE.w - 12,
    });
    c.add(title.obj);
    let y = 18 + Math.min(title.height, 26) + 2;
    const body = q ? fillSlots(N.ko[q.body] ?? "", n.slots) : "";
    if (body) {
      const rows = wrap(s, "galmuri9", body, NOTE.w - 12).slice(0, 2);
      c.add(
        new Label(s, 6, y, rows.join("\n"), { font: "galmuri9", color: "ink.mid", leading: 0 }).obj,
      );
      y += rows.length * 11;
    }
    // How far along, and what it pays.
    const by = NOTE.h - 26;
    c.add(s.add.rectangle(6, by, NOTE.w - 40, 4, paint("stone.light")).setOrigin(0));
    const share = Math.min(1, n.progress / Math.max(1, n.target));
    c.add(
      s.add
        .rectangle(
          6,
          by,
          Math.round((NOTE.w - 40) * share),
          4,
          paint(share >= 1 ? "grass.mid" : "sea.mid"),
        )
        .setOrigin(0),
    );
    c.add(
      new Label(s, NOTE.w - 32, by - 3, `${Math.min(n.progress, n.target)}/${n.target}`, {
        font: "galmuri9",
        color: "ink.dark",
      }).obj,
    );
    const pay = s.add.container(6, NOTE.h - 16);
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
      if (icon) {
        pay.add(s.add.image(px, 0, "ui", icon).setOrigin(0));
        px += 13;
      } else {
        pay.add(new Label(s, px, 2, "EXP", { font: "galmuri9", color: "sea.dark" }).obj);
        px += 20;
      }
      const lab = new Label(s, px, 2, amount(v), { font: "galmuri9", color: "ink.dark" });
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
    } else if (n.state === "done") {
      const claim = new Button(this.ctx, NOTE.w - 46, NOTE.h - 24, {
        label: t("board.claim"),
        kind: "ink",
        font: "galmuri9",
        h: 17,
        sound: "confirm",
        onPress: () => void this.claim(n, c),
      });
      claim.setEnabled(!this.pending.has(n.id));
      c.add(claim);
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
    const s = this.ctx.scene;
    const b = live.board;
    if (!b) return;
    let i = 0;
    const draw = (n: HelpNoticeView, action: { label: string; run: () => void } | undefined) => {
      const at = this.place(i++);
      const c = s.add.container(at.x, at.y);
      this.notes.add(c);
      const [l, r, tt, bb] = sliceOf("tooltip");
      c.add(s.add.nineslice(0, 0, "ui", "tooltip/idle", NOTE.w, NOTE.h, l, r, tt, bb).setOrigin(0));
      c.add(s.add.circle(NOTE.w / 2, 3, 2, paint("gold.mid")));
      const q = QUESTS.get(n.template);
      c.add(
        new Label(s, 6, 6, q ? (N.ko[q.poster] ?? "") : "", {
          font: "galmuri9",
          color: "stone.dark",
        }).obj,
      );
      c.add(
        new Label(s, 6, 18, q ? (N.ko[q.title] ?? "") : "", {
          font: "galmuri11-bold",
          color: "ink.dark",
        }).obj,
      );
      const body = q ? fillSlots(N.ko[q.body] ?? "", { ...n.slots, player: n.poster.name }) : "";
      const rows = wrap(s, "galmuri9", body, NOTE.w - 12).slice(0, 3);
      c.add(
        new Label(s, 6, 34, rows.join("\n"), { font: "galmuri9", color: "ink.mid", leading: 0 })
          .obj,
      );
      c.add(
        new Label(s, 6, NOTE.h - 14, `${n.progress}/${n.count}`, {
          font: "galmuri9",
          color: "ink.dark",
        }).obj,
      );
      if (action) {
        const btn = new Button(this.ctx, NOTE.w - 46, NOTE.h - 24, {
          label: action.label,
          kind: "ink",
          font: "galmuri9",
          h: 17,
          onPress: action.run,
        });
        c.add(btn);
      }
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
