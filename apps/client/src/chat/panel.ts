import * as Phaser from "phaser";
import { t } from "../i18n/index.ts";
import { FocusScope, finePointer, popScope, pushScope } from "../ui/focus.ts";
import { fade, shake, slide } from "../ui/motion.ts";
import { edges } from "../ui/screen.ts";
import { sound } from "../ui/sound.ts";
import { Label } from "../ui/text.ts";
import { TextField } from "../ui/textfield.ts";
import { paint, sliceOf } from "../ui/theme.ts";
import { worldView } from "../world/view.ts";
import type { WorldLink } from "../world-link.ts";
import { refusalText } from "./copy.ts";
import { ChatFeed } from "./feed.ts";
import { ChatLog, TABS, type Tab } from "./log.ts";
import { drawRow, FONT, NAME_COLOR, ROW, type Row, toRows } from "./rows.ts";

/**
 * The chat (PLAN §12). At rest it is only the feed: bare lines over the world that fade on their
 * own. The panel, with its channel tabs, scrollback and eraser scrollbar, comes up with motion
 * when the player presses Enter, taps the chat button, or rests the mouse over the chat corner,
 * and goes again when they are done. On a phone it opens at the top of the screen with the input
 * line first, where an on-screen keyboard rising from the bottom cannot reach it.
 */

const W = 200;
const PAD = 5;
const TAB_H = 14;
const INPUT_H = 20;
/** The mouse rests this long over the chat corner before the panel comes up, and leaves it this long before it goes. */
const PEEK_IN_MS = 140;
const PEEK_OUT_MS = 700;

export interface ChatLayout {
  /** Phones: the panel opens at the top, input first. */
  readonly top: boolean;
  /** Rows of scrollback on screen at most. */
  readonly rows: number;
}

export class ChatPanel {
  readonly root: Phaser.GameObjects.Container;
  readonly log: ChatLog;
  private readonly feed: ChatFeed;
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
  private readonly closeMark: Phaser.GameObjects.Rectangle;
  private readonly scope = new FocusScope();
  /** Rows of scrollback on screen now: as many as the open tab has, up to the layout's. */
  private shownRows = 0;
  private rest = { x: 6, y: 0 };
  private scroll = 0;
  private rows: Row[] = [];
  private typing = false;
  private peeking = false;
  private hidden = false;
  private hover = 0;
  private sending = false;
  private whisperTo: string | undefined;
  /** Who whispered last: the 귓속말 tab answers them when no one else is picked. */
  private replyTo: string | undefined;
  /** Told when the panel comes up or goes, so the HUD's chat button can step aside. */
  onShownChange: ((shown: boolean) => void) | undefined;
  private wasShown = false;
  private readonly unlisten: () => void;

  constructor(scene: Phaser.Scene, link: WorldLink, layout: ChatLayout) {
    this.scene = scene;
    this.link = link;
    this.layout = layout;
    this.log = new ChatLog(link);
    this.feed = new ChatFeed(scene, this.log, layout.top);
    this.root = scene.add.container(6, 0).setDepth(200).setVisible(false).setAlpha(0);

    const [l, r, tt, b] = sliceOf("hud-plate");
    this.card = scene.add.nineslice(0, 0, "ui", "hud-plate/idle", W, 10, l, r, tt, b).setOrigin(0);
    // The card swallows clicks so the world under it never takes them; a click on it starts a line.
    this.card.setInteractive();
    this.card.on("wheel", (_p: unknown, _dx: number, dy: number) => this.scrollBy(dy > 0 ? -1 : 1));
    this.card.on("pointerup", () => this.open());
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
    // Puts the panel away; on a desktop the mouse leaving does the same.
    const close = scene.add
      .zone(W - 20, 0, 20, TAB_H + 4)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true });
    this.closeMark = scene.add.rectangle(W - 15, 0, 8, 2, paint("stone.dark")).setOrigin(0);
    close.on("pointerover", () => this.closeMark.setFillStyle(paint("stone.bright")));
    close.on("pointerout", () => this.closeMark.setFillStyle(paint("stone.dark")));
    close.on("pointerup", () => this.putAway());
    this.root.add([this.closeMark, close]);

    this.body = scene.add.container(0, 0);
    const [sl, sr, st, sb] = sliceOf("scroll-track");
    this.track = scene.add
      .nineslice(W - PAD - 5, 0, "ui", "scroll-track/idle", 5, 14, sl, sr, st, sb)
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
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.tick, this);
    this.root.once(Phaser.GameObjects.Events.DESTROY, () => {
      worldView.onNameTap = undefined;
      scene.events.off(Phaser.Scenes.Events.UPDATE, this.tick, this);
      unbubble();
      this.unlisten();
      this.feed.destroy();
      this.log.dispose();
      popScope(this.scope);
    });
    this.place(false);
    this.layoutTabs();
  }

  private get logH(): number {
    return this.shownRows > 0 ? this.shownRows * ROW + 2 : 0;
  }

  private get shown(): boolean {
    return (this.typing || this.peeking) && !this.hidden;
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
    if (this.typing) {
      this.field.focusField();
      return;
    }
    // Already up under the mouse: the input line opening is the only change to hear.
    if (this.shown) sound("open");
    this.typing = true;
    pushScope(this.scope);
    this.refreshPrefix();
    this.place(true);
    this.scope.focus(this.field, "key");
    this.field.focusField();
  }

  closeInput(): void {
    if (!this.typing) return;
    this.typing = false;
    sound("close");
    popScope(this.scope);
    this.field.field.blur();
    // The mouse may still be over the corner: the panel stays up until it leaves.
    this.peeking = this.pointerOver();
    this.place(true);
  }

  destroy(): void {
    this.root.destroy();
  }

  /** Fits the panel and the feed to the screen again, after it changed size. */
  relayout(): void {
    this.feed.layout();
    this.place(false);
  }

  /** In a fight the feed thins out and goes sooner. */
  setFight(on: boolean): void {
    this.feed.setFight(on);
  }

  /** Steps out of sight while something else holds the screen, keeping its state. */
  setHidden(on: boolean): void {
    if (on && this.typing) this.closeInput();
    this.hidden = on;
    this.place(true);
  }

  private putAway(): void {
    if (this.typing) this.closeInput();
    this.peeking = false;
    this.hover = -PEEK_OUT_MS * 2;
    this.place(true);
  }

  /** On a desktop, resting the mouse over the chat corner brings the panel up. */
  private tick(_t: number, delta: number): void {
    if (this.layout.top || !finePointer() || this.typing || this.hidden) return;
    const over = this.pointerOver();
    this.hover = over ? Math.max(0, this.hover) + delta : Math.min(0, this.hover) - delta;
    const want = this.peeking ? this.hover > -PEEK_OUT_MS : this.hover >= PEEK_IN_MS;
    if (want !== this.peeking) {
      this.peeking = want;
      this.place(true);
    }
  }

  /** Whether the mouse is over the panel, or over the corner the feed sits in. */
  private pointerOver(): boolean {
    const p = this.scene.input.activePointer;
    const e = edges();
    if (this.shown) {
      const x = this.rest.x;
      const y = this.rest.y;
      return p.x >= x && p.x < x + W && p.y >= y && p.y < y + this.card.height;
    }
    return p.x >= e.left && p.x < e.left + W && p.y >= e.bottom - 64 && p.y <= e.bottom;
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
    const logGap = this.logH > 0 ? 2 : 0;
    const h = PAD + TAB_H + this.logH + logGap + PAD + inputH;
    const top = this.layout.top;
    const inputY = top ? PAD : PAD + TAB_H + this.logH + logGap + 4;
    const tabsY = top ? PAD + inputH : PAD;
    const logY = tabsY + TAB_H;
    for (const tab of this.tabs) {
      tab.label.at(tab.label.obj.x, tabsY + 3);
      tab.mark.setY(tabsY + 3);
      tab.zone.setY(tabsY - 2);
    }
    this.underline.setY(tabsY + 14);
    this.body.setY(logY);
    this.track.setY(logY).setSize(5, Math.max(1, this.logH));
    this.closeMark.setY(tabsY + 5);
    this.inputRow.setY(inputY).setVisible(this.typing);
    this.prefix.at(PAD + 1, Math.floor((INPUT_H - 9) / 2));
    this.field.setY(0);
    this.card.setSize(W, h);
    const e = edges();
    this.rest = { x: e.left, y: top ? e.top : e.bottom - h };
    const shown = this.shown;
    // Coming up, the card rises a few pixels into place; going, it sinks and fades.
    const away = { x: this.rest.x, y: this.rest.y + (top ? -6 : 6) };
    if (shown && !this.wasShown) {
      this.root.setVisible(true).setPosition(away.x, away.y);
      slide(this.root, this.rest, 150);
      fade(this.root, 1, 150);
      sound("open");
    } else if (!shown && this.wasShown) {
      slide(this.root, away, 120);
      fade(this.root, 0, 120);
    } else if (animate && shown) slide(this.root, this.rest, 140);
    else if (shown) this.root.setPosition(this.rest.x, this.rest.y);
    if (shown !== this.wasShown) {
      this.wasShown = shown;
      this.onShownChange?.(shown);
    }
    this.feed.setHidden(shown || this.hidden);
    this.drawRows();
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
    const said = refusalText(result);
    if (said) this.log.note(said);
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
      if (open) this.underline.setX(tab.label.obj.x - 1).setSize(tab.label.width + 2, 1);
    }
    const width = W - PAD * 2 - 9;
    this.rows = this.log
      .linesFor(this.log.active)
      .flatMap((line) => toRows(this.scene, line, width));
    // An empty tab has no rows at all: the card is the tabs and, while typing, the input.
    const want = Math.min(this.layout.rows, this.rows.length);
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
      drawRow(this.scene, this.body, row, PAD + 1, y, { onName: (name) => this.open(name) });
    });
    const scrolls = this.rows.length > n && n > 0;
    const max = Math.max(0, this.rows.length - n);
    const th = Math.max(14, Math.round((this.logH * n) / Math.max(n, this.rows.length)));
    this.thumb.setSize(5, Math.min(th, Math.max(1, this.logH)));
    const room = this.logH - this.thumb.height;
    this.thumb.setY(this.track.y + Math.round(room * (max === 0 ? 1 : 1 - this.scroll / max)));
    this.track.setVisible(scrolls);
    this.thumb.setVisible(scrolls);
  }
}
