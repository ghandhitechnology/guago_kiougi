import * as Phaser from "phaser";
import { t } from "../i18n/index.ts";
import { FocusScope, popScope, pushScope } from "../ui/focus.ts";
import { fade, shake, slide } from "../ui/motion.ts";
import { sound } from "../ui/sound.ts";
import { Label, measure, wrap } from "../ui/text.ts";
import { TextField } from "../ui/textfield.ts";
import { paint, sliceOf } from "../ui/theme.ts";
import { worldView } from "../world/view.ts";
import type { WorldLink } from "../world-link.ts";
import { refusalText } from "./copy.ts";
import { ChatLog, type LogLine, TABS, type Tab, type Tone } from "./log.ts";

/**
 * The chat panel (PLAN §12). On a desktop it sits at the bottom left, open, and Enter starts a
 * line. On a phone it is closed until the chat button opens it at the top of the screen, with the
 * input line first, where an on-screen keyboard rising from the bottom cannot reach it.
 *
 * Chat is text and only text: every line is drawn with the bitmap font, so nothing in it can be a
 * link or markup (PLAN §12, §22).
 */

const W = 200;
const ROW = 12;
const PAD = 5;
const TAB_H = 14;
const INPUT_H = 20;
const FONT = "galmuri9" as const;

const NAME_COLOR: Readonly<Record<Tone, string>> = {
  world: "navy.pale",
  near: "stone.bright",
  whisper: "plum.pale",
  party: "sea.pale",
  club: "grass.pale",
  system: "gold.light",
  refusal: "red.light",
};
const TEXT_COLOR: Readonly<Record<Tone, string>> = {
  world: "stone.pale",
  near: "stone.pale",
  whisper: "plum.pale",
  party: "sea.pale",
  club: "grass.pale",
  system: "gold.light",
  refusal: "red.light",
};

/** One visual row: pieces of text, masked runs and a clickable name, left to right. */
interface Piece {
  readonly kind: "text" | "name" | "mask";
  readonly text: string;
  readonly color: string;
}
interface Row {
  readonly pieces: readonly Piece[];
  readonly line: LogLine;
}

export interface ChatLayout {
  /** Phones: the panel opens at the top, input first. */
  readonly top: boolean;
  /** Rows of scrollback on screen. */
  readonly rows: number;
}

export class ChatPanel {
  readonly root: Phaser.GameObjects.Container;
  readonly log: ChatLog;
  private readonly scene: Phaser.Scene;
  private readonly link: WorldLink;
  private readonly layout: ChatLayout;
  private readonly card: Phaser.GameObjects.NineSlice;
  private readonly tabs: {
    tab: Tab;
    label: Label;
    mark: Phaser.GameObjects.Image;
    zone: Phaser.GameObjects.Zone;
  }[] = [];
  private readonly underline: Phaser.GameObjects.Rectangle;
  private readonly body: Phaser.GameObjects.Container;
  private readonly track: Phaser.GameObjects.NineSlice;
  private readonly thumb: Phaser.GameObjects.NineSlice;
  private readonly inputRow: Phaser.GameObjects.Container;
  private readonly prefix: Label;
  private readonly field: TextField;
  private readonly collapsed: Phaser.GameObjects.Container;
  private readonly foldMark: Phaser.GameObjects.Rectangle;
  private readonly collapsedMark: Phaser.GameObjects.Image;
  private readonly scope = new FocusScope();
  /** Rows of scrollback on screen now: as many as there are lines, from two up to the layout's. */
  private shownRows = 2;
  private rest = { x: 6, y: 0 };
  private scroll = 0;
  private rows: Row[] = [];
  private typing = false;
  private shown = true;
  private sending = false;
  private whisperTo: string | undefined;
  /** Told when the panel unfolds or folds, so the HUD's chat button can step aside. */
  onShownChange: ((shown: boolean) => void) | undefined;
  /** Who whispered last: the 귓속말 tab answers them when no one else is picked. */
  private replyTo: string | undefined;
  private readonly unlisten: () => void;

  constructor(scene: Phaser.Scene, link: WorldLink, layout: ChatLayout) {
    this.scene = scene;
    this.link = link;
    this.layout = layout;
    this.log = new ChatLog(link);
    this.root = scene.add.container(6, 0).setDepth(200);

    const [l, r, tt, b] = sliceOf("hud-plate");
    this.card = scene.add.nineslice(0, 0, "ui", "hud-plate/idle", W, 10, l, r, tt, b).setOrigin(0);
    // The card swallows clicks so the world under it never takes them.
    this.card.setInteractive();
    this.card.on("wheel", (_p: unknown, _dx: number, dy: number) => this.scrollBy(dy > 0 ? -1 : 1));
    this.root.add(this.card);

    // Channel tabs: words on the card, the open one underlined, an unread mark on the others.
    for (const tab of TABS) {
      const label = new Label(scene, 0, 0, t(`chat.tab.${tab}`), {
        font: FONT,
        color: "stone.dark",
      });
      const mark = scene.add.image(0, 0, "ui", "pin/unread").setOrigin(0).setVisible(false);
      const zone = scene.add
        .zone(0, 0, label.width + 10, TAB_H)
        .setOrigin(0)
        .setInteractive({ useHandCursor: true });
      zone.on("pointerup", () => this.pickTab(tab));
      this.root.add([label.obj, mark, zone]);
      this.tabs.push({ tab, label, mark, zone });
    }
    this.underline = scene.add.rectangle(0, 0, 10, 1, paint("gold.mid")).setOrigin(0);
    this.root.add(this.underline);
    // Folds the panel away into its button; phones close it.
    const fold = scene.add
      .zone(W - 20, 0, 20, TAB_H + 4)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true });
    this.foldMark = scene.add.rectangle(W - 15, 0, 8, 2, paint("stone.dark")).setOrigin(0);
    fold.on("pointerover", () => this.foldMark.setFillStyle(paint("stone.bright")));
    fold.on("pointerout", () => this.foldMark.setFillStyle(paint("stone.dark")));
    fold.on("pointerup", () => this.fold());
    this.root.add([this.foldMark, fold]);

    this.body = scene.add.container(0, 0);
    const [sl, sr, st, sb] = sliceOf("scroll-track");
    this.track = scene.add
      .nineslice(W - PAD - 5, 0, "ui", "scroll-track/idle", 5, this.logH, sl, sr, st, sb)
      .setOrigin(0);
    const [hl, hr, ht, hb] = sliceOf("scroll-thumb");
    this.thumb = scene.add
      .nineslice(W - PAD - 5, 0, "ui", "scroll-thumb/idle", 5, 14, hl, hr, ht, hb)
      .setOrigin(0);
    this.thumb.setInteractive({ draggable: true, useHandCursor: true });
    this.thumb.on("drag", (_p: unknown, _x: number, y: number) => this.dragThumb(y));
    this.root.add([this.body, this.track, this.thumb]);

    // The input line: where the next line goes, then the answer box.
    this.inputRow = scene.add.container(0, 0);
    this.prefix = new Label(scene, PAD + 1, 0, "", { font: FONT, color: "stone.light" });
    this.field = new TextField({ scene, scope: this.scope }, 0, 0, {
      w: W - PAD * 2 - 40,
      h: INPUT_H - 2,
      maxLength: 240,
      enterKeyHint: "send",
      onSubmit: () => void this.submit(),
    });
    // Tab while typing moves to the next channel instead of out of the box.
    (this.field as unknown as { nav: (k: string) => boolean }).nav = (k) => {
      if (k !== "next" && k !== "prev") return false;
      const open = this.openTabs();
      const i = open.indexOf(this.log.active);
      this.pickTab(open[(i + (k === "next" ? 1 : open.length - 1)) % open.length] as Tab);
      return true;
    };
    this.inputRow.add([this.prefix.obj, this.field]);
    this.root.add(this.inputRow);
    this.scope.onBack = () => this.closeInput();

    // Folded: one button with the chat mark, and the unread mark when something came in.
    this.collapsed = scene.add.container(6, 0).setDepth(200).setVisible(false).setAlpha(0);
    const [pl, pr, pt, pb] = sliceOf("hud-plate");
    this.collapsedMark = scene.add.image(16, 1, "ui", "pin/unread").setOrigin(0).setVisible(false);
    const button = scene.add
      .nineslice(0, 0, "ui", "hud-plate/idle", 20, 18, pl, pr, pt, pb)
      .setOrigin(0);
    button.setInteractive({ useHandCursor: true }).on("pointerup", () => this.unfold());
    this.collapsed.add([
      button,
      scene.add.image(4, 3, "ui", "icon/chat").setOrigin(0),
      this.collapsedMark,
    ]);

    this.unlisten = this.log.on(() => this.redraw());
    // 주변 lines are said aloud: a bubble over whoever said it.
    const unbubble = link.on((e) => {
      if (e.type === "chat" && e.line.ch === "near" && e.line.from.sid) {
        worldView.overlays?.say(e.line.from.sid, e.line.text);
      }
      if (e.type === "chat" && e.line.ch === "whisper" && e.line.from.id !== link.me) {
        this.replyTo = e.line.from.name;
        if (this.log.active === "whisper" && !this.whisperTo) {
          this.whisperTo = this.replyTo;
          this.refreshPrefix();
        }
      }
      if (e.type === "social") this.layoutTabs();
      if (e.type === "status" && e.status === "reconnecting")
        this.log.note(t("chat.status.reconnecting"), "system");
      if (e.type === "status" && e.status === "replaced")
        this.log.note(t("chat.status.replaced"), "system");
    });
    // A player's nameplate clicked in the world starts a whisper to them.
    worldView.onNameTap = (_id, name, kind) => {
      if (kind === "player") this.open(name);
    };
    this.root.once(Phaser.GameObjects.Events.DESTROY, () => {
      worldView.onNameTap = undefined;
      unbubble();
      this.unlisten();
      this.log.dispose();
      this.collapsed.destroy();
      popScope(this.scope);
    });
    this.place(false);
    this.layoutTabs();
    if (layout.top) {
      this.shown = false;
      this.root.setVisible(false).setAlpha(0);
    }
  }

  private get logH(): number {
    return this.shownRows * ROW + 2;
  }

  get isTyping(): boolean {
    return this.typing;
  }

  /** Opens the input line, on the open tab or as a whisper to someone. */
  open(whisperTo?: string): void {
    if (whisperTo) {
      this.whisperTo = whisperTo;
      this.log.setActive("whisper");
    } else if (this.log.active === "whisper") this.whisperTo ??= this.replyTo;
    if (!this.shown) this.unfold(false);
    if (this.typing) {
      this.field.focusField();
      return;
    }
    this.typing = true;
    sound("open");
    pushScope(this.scope);
    this.place(true);
    this.scope.focus(this.field, "key");
    this.field.focusField();
    this.refreshPrefix();
  }

  closeInput(): void {
    if (!this.typing) return;
    this.typing = false;
    sound("close");
    popScope(this.scope);
    this.field.field.blur();
    this.place(true);
    if (this.layout.top) this.fold();
  }

  destroy(): void {
    this.root.destroy();
  }

  private pickTab(tab: Tab): void {
    if (tab === this.log.active) return;
    sound("tab");
    this.whisperTo = tab === "whisper" ? (this.whisperTo ?? this.replyTo) : undefined;
    this.scroll = 0;
    this.log.setActive(tab);
    this.refreshPrefix();
  }

  private refreshPrefix(): void {
    const tab = this.log.active;
    const text =
      tab === "whisper" && this.whisperTo
        ? t("chat.to", { name: this.whisperTo })
        : t(`chat.tab.${tab}`);
    this.prefix.set(text);
    const pw = Math.min(70, this.prefix.width + 6);
    this.field.setX(PAD + pw);
    this.field.setBoxWidth(W - PAD * 2 - pw);
    this.prefix.color(tab === "near" ? "stone.light" : NAME_COLOR[tab]);
  }

  /** Stacks tabs, scrollback and the input inside the card, and puts the card in its corner. */
  private place(animate: boolean): void {
    const inputH = this.typing ? INPUT_H + 4 : 0;
    const h = PAD + TAB_H + this.logH + PAD + inputH;
    const top = this.layout.top;
    const inputY = top ? PAD : PAD + TAB_H + this.logH + 4;
    const tabsY = top ? PAD + inputH : PAD;
    const logY = tabsY + TAB_H;
    for (const tab of this.tabs) {
      tab.label.at(tab.label.obj.x, tabsY + 3);
      tab.mark.setY(tabsY + 3);
      tab.zone.setY(tabsY - 2);
    }
    this.body.setY(logY);
    this.track.setY(logY).setSize(5, this.logH);
    this.foldMark.setY(tabsY + 5);
    this.inputRow.setY(inputY).setVisible(this.typing);
    this.prefix.at(PAD + 1, Math.floor((INPUT_H - 9) / 2));
    this.field.setY(0);
    this.card.setSize(W, h);
    this.rest = { x: 6, y: top ? 4 : 270 - 6 - h };
    this.collapsed.setY(top ? 4 : 270 - 6 - 18);
    if (animate) slide(this.root, this.rest, 140);
    else this.root.setPosition(this.rest.x, this.rest.y);
    this.drawRows();
  }

  private fold(): void {
    if (this.typing) this.closeInput();
    if (!this.shown) return;
    this.shown = false;
    this.onShownChange?.(false);
    sound("close");
    fade(this.root, 0, 120);
    if (!this.layout.top) fade(this.collapsed, 1, 120);
  }

  private unfold(withSound = true): void {
    if (this.shown) return;
    this.shown = true;
    this.onShownChange?.(true);
    if (withSound) sound("open");
    this.root.setVisible(true);
    fade(this.root, 1, 140);
    fade(this.collapsed, 0, 100);
    this.collapsedMark.setVisible(false);
  }

  /** The tabs the player can use now: 파티 and 동아리 only while in one. */
  private openTabs(): Tab[] {
    const social = this.link.social;
    return TABS.filter(
      (tab) =>
        (tab !== "party" || social.party !== null) && (tab !== "club" || social.club !== null),
    );
  }

  /** Lays the open tabs along the card, closer together when all five are there. */
  private layoutTabs(): void {
    const open = this.openTabs();
    if (!open.includes(this.log.active)) this.pickTab("near");
    const gap = open.length > 3 ? 10 : 16;
    let tx = PAD + 1;
    for (const tab of this.tabs) {
      const on = open.includes(tab.tab);
      tab.label.obj.setVisible(on);
      tab.zone.setVisible(on);
      if (tab.zone.input) tab.zone.input.enabled = on;
      if (!on) {
        tab.mark.setVisible(false);
        continue;
      }
      tab.label.at(tx, tab.label.obj.y);
      tab.mark.setX(tx + tab.label.width + 2);
      tab.zone.setX(tx - 3);
      tx += tab.label.width + gap;
    }
    this.redraw();
  }

  /** Steps out of sight while something else holds the screen, keeping its state. */
  setHidden(on: boolean): void {
    if (on && this.typing) this.closeInput();
    fade(this.root, !on && this.shown ? 1 : 0, 120);
    if (this.collapsed.visible) fade(this.collapsed, on || this.shown ? 0 : 1, 120);
  }

  /** Shows or hides the folded chat button: phones use the HUD's own chat button instead. */
  setFoldedButton(on: boolean): void {
    this.collapsed.setVisible(on && !this.shown);
  }

  private async submit(): Promise<void> {
    const text = this.field.value.trim();
    if (!text) {
      this.closeInput();
      return;
    }
    if (this.sending) return;
    const tab = this.log.active;
    if (tab === "whisper" && !this.whisperTo) {
      sound("error");
      this.field.reject();
      return;
    }
    this.sending = true;
    // Nothing shows before the server answers; the box holds the line meanwhile.
    this.field.setAlpha(0.6);
    const result = await this.link.send(tab, text, this.whisperTo);
    this.sending = false;
    this.field.setAlpha(1);
    if (result.ok) {
      this.field.value = "";
      sound("confirm");
      this.scroll = 0;
      this.redraw();
      return;
    }
    sound("error");
    this.log.note(refusalText(result));
    this.field.reject();
    shake(this.inputRow, { x: 0, y: this.inputRow.y });
  }

  private scrollBy(lines: number): void {
    const max = Math.max(0, this.rows.length - this.shownRows);
    const next = Math.max(0, Math.min(max, this.scroll + lines));
    if (next === this.scroll) return;
    this.scroll = next;
    this.drawRows();
  }

  private dragThumb(y: number): void {
    const max = Math.max(0, this.rows.length - this.shownRows);
    const room = this.logH - this.thumb.height;
    const k = room > 0 ? 1 - Math.max(0, Math.min(1, (y - this.track.y) / room)) : 0;
    this.scroll = Math.round(k * max);
    this.drawRows();
  }

  /** Re-wraps the open tab's lines into rows. */
  private redraw(): void {
    for (const tab of this.tabs) {
      const open = tab.tab === this.log.active;
      tab.label.color(open ? "stone.bright" : "stone.dark");
      tab.mark.setVisible(tab.label.obj.visible && !open && this.log.unread.has(tab.tab));
      if (open) {
        this.underline
          .setPosition(tab.label.obj.x - 1, tab.label.obj.y + 11)
          .setSize(tab.label.width + 2, 1);
      }
    }
    this.collapsedMark.setVisible(!this.shown && this.log.unread.size > 0);
    const width = W - PAD * 2 - 9;
    this.rows = this.log
      .linesFor(this.log.active)
      .flatMap((line) => toRows(this.scene, line, width));
    const want = Math.max(2, Math.min(this.layout.rows, this.rows.length));
    if (want !== this.shownRows) {
      this.shownRows = want;
      this.place(true);
      return;
    }
    this.drawRows();
  }

  private drawRows(): void {
    this.body.removeAll(true);
    const n = this.shownRows;
    const end = this.rows.length - this.scroll;
    const visible = this.rows.slice(Math.max(0, end - n), end);
    visible.forEach((row, i) => {
      // Newest at the bottom, nearest the input on a desktop; the same order on a phone.
      const y = (n - visible.length + i) * ROW + 1;
      let x = PAD + 1;
      for (const piece of row.pieces) {
        if (piece.kind === "mask") {
          // A word the filter took out: a strip of ink over where it was, not asterisks.
          const w = measure(this.scene, FONT, piece.text);
          this.body.add(this.scene.add.rectangle(x, y + 3, w, 7, paint("ink.light")).setOrigin(0));
          x += w + 1;
          continue;
        }
        const label = new Label(this.scene, x, y + 2, piece.text, {
          font: FONT,
          color: piece.color,
        });
        this.body.add(label.obj);
        if (piece.kind === "name" && row.line.from && !row.line.mine) {
          const name = row.line.from.name;
          const zone = this.scene.add
            .zone(x - 1, y, label.width + 2, ROW)
            .setOrigin(0)
            .setInteractive({ useHandCursor: true });
          zone.on("pointerup", () => this.open(name));
          this.body.add(zone);
        }
        x += label.width + (piece.kind === "name" ? 5 : 1);
      }
    });
    const max = Math.max(0, this.rows.length - n);
    const th = Math.max(14, Math.round((this.logH * n) / Math.max(n, this.rows.length)));
    this.thumb.setSize(5, th);
    const room = this.logH - th;
    this.thumb.setY(this.track.y + Math.round(room * (max === 0 ? 1 : 1 - this.scroll / max)));
    this.track.setVisible(this.rows.length > n);
    this.thumb.setVisible(this.rows.length > n);
  }
}

/** A log line as rows of pieces, wrapped to `width`. */
function toRows(scene: Phaser.Scene, line: LogLine, width: number): Row[] {
  const name = line.from
    ? line.mine && line.to
      ? t("chat.to", { name: line.to })
      : line.from.name
    : undefined;
  const head = name ? `${name} ` : "";
  const full = head + line.text;
  const wrapped = wrap(scene, FONT, full, width);
  const rows: Row[] = [];
  let at = 0;
  for (const text of wrapped) {
    // Find where this wrapped row sits in the full line (wrapping drops the spaces it breaks on).
    const start = full.indexOf(text, at);
    const from = start < 0 ? at : start;
    at = from + text.length;
    const pieces: Piece[] = [];
    let i = from;
    while (i < at) {
      if (i < head.length) {
        const end = Math.min(at, head.length);
        pieces.push({
          kind: "name",
          text: full.slice(i, end).trimEnd(),
          color: NAME_COLOR[line.mine ? "system" : line.tone],
        });
        i = end;
        continue;
      }
      const star = full[i] === "*";
      let j = i;
      while (j < at && (full[j] === "*") === star) j++;
      pieces.push({
        kind: star ? "mask" : "text",
        text: full.slice(i, j),
        color: TEXT_COLOR[line.tone],
      });
      i = j;
    }
    rows.push({ pieces, line });
  }
  return rows;
}
