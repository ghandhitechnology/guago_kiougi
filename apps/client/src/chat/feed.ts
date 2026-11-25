import * as Phaser from "phaser";
import { fade, slide } from "../ui/motion.ts";
import { edges } from "../ui/screen.ts";
import type { ChatLog, LogLine } from "./log.ts";
import { drawRow, ROW, toRows } from "./rows.ts";

/**
 * Chat while nobody is reading it: bare lines over the world with an ink shadow and no card,
 * each fading on its own a few seconds after it came. During a fight there are fewer of them and
 * they go sooner, so the screen around the player stays clear for the horde.
 */

const WIDTH = 196;
/** Lines up at once, and how long each stays, at rest and in a fight. */
const CALM = { lines: 5, ms: 7000, perChar: 60, maxMs: 11000, alpha: 1 } as const;
const FIGHT = { lines: 2, ms: 3500, perChar: 20, maxMs: 5000, alpha: 0.85 } as const;
/** Phones keep the feed short: it sits beside the HUD's left column at the top. */
const PHONE_LINES = 3;

interface Entry {
  readonly line: LogLine;
  readonly root: Phaser.GameObjects.Container;
  readonly h: number;
  readonly chars: number;
  expires: number;
  leaving: boolean;
}

export class ChatFeed {
  readonly root: Phaser.GameObjects.Container;
  private readonly scene: Phaser.Scene;
  private readonly phone: boolean;
  private readonly entries: Entry[] = [];
  private readonly unlisten: () => void;
  private readonly unblock: () => void;
  private clock = 0;
  private fight = false;
  private hidden = false;

  constructor(scene: Phaser.Scene, log: ChatLog, phone: boolean) {
    this.scene = scene;
    this.phone = phone;
    this.root = scene.add.container(0, 0).setDepth(190);
    this.unlisten = log.onLine((line) => this.push(line));
    // A player blocked since: their lines already up go at once.
    this.unblock = log.onBlocks(() => {
      for (const e of this.entries) if (log.hidden(e.line)) this.leave(e, 120);
    });
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.tick, this);
    this.layout();
  }

  destroy(): void {
    this.unlisten();
    this.unblock();
    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.tick, this);
    this.root.destroy();
  }

  /** Where the feed sits: bottom left on a desktop, beside the HUD's left column on a phone. */
  layout(): void {
    const e = edges();
    this.root.setPosition(this.phone ? e.left + 104 : e.left, this.phone ? e.top : e.bottom);
    this.place(false);
  }

  /** In a fight the feed thins out; lines already up go sooner. */
  setFight(on: boolean): void {
    if (on === this.fight) return;
    this.fight = on;
    const rules = on ? FIGHT : CALM;
    for (const e of this.entries) e.expires = Math.min(e.expires, this.clock + this.life(e.chars));
    this.trim();
    fade(this.root, this.hidden ? 0 : rules.alpha, 160);
  }

  /** While the chat panel or a dialogue is up, the feed steps out of sight. */
  setHidden(on: boolean): void {
    this.hidden = on;
    fade(this.root, on ? 0 : (this.fight ? FIGHT : CALM).alpha, on ? 90 : 160);
  }

  private get maxLines(): number {
    const rules = this.fight ? FIGHT : CALM;
    return this.phone ? Math.min(PHONE_LINES, rules.lines) : rules.lines;
  }

  private life(chars: number): number {
    const r = this.fight ? FIGHT : CALM;
    return Math.min(r.maxMs, r.ms + chars * r.perChar);
  }

  private push(line: LogLine): void {
    const rows = toRows(this.scene, line, WIDTH);
    if (rows.length === 0) return;
    const root = this.scene.add.container(0, 0);
    rows.forEach((row, i) => {
      drawRow(this.scene, root, row, 0, i * ROW, { shadow: true });
    });
    const chars = [...line.text].length;
    const entry: Entry = {
      line,
      root,
      h: rows.length * ROW,
      chars,
      expires: this.clock + this.life(chars),
      leaving: false,
    };
    this.root.add(root);
    this.entries.push(entry);
    root.setAlpha(0);
    fade(root, 1, 140);
    this.trim();
    this.place(true, entry);
  }

  /** Past the line limit the oldest go at once. */
  private trim(): void {
    const live = this.entries.filter((e) => !e.leaving);
    for (const e of live.slice(0, Math.max(0, live.length - this.maxLines))) this.leave(e, 90);
  }

  private leave(e: Entry, ms = 300): void {
    if (e.leaving) return;
    e.leaving = true;
    fade(e.root, 0, ms, () => {
      e.root.destroy();
      const i = this.entries.indexOf(e);
      if (i >= 0) this.entries.splice(i, 1);
      this.place(true);
    });
  }

  /**
   * Stacks the lines: on a desktop the newest at the bottom with older ones above; on a phone
   * downward from the top. A new line slides in from a few pixels away.
   */
  private place(animate: boolean, fresh?: Entry): void {
    const live = this.entries.filter((e) => !e.leaving);
    if (this.phone) {
      let y = 0;
      for (const e of live) {
        const to = { x: 0, y };
        if (e === fresh) e.root.setPosition(0, y + 4);
        if (animate) slide(e.root, to, 140);
        else e.root.setPosition(to.x, to.y);
        y += e.h;
      }
      return;
    }
    let y = 0;
    for (let i = live.length - 1; i >= 0; i--) {
      const e = live[i] as Entry;
      y -= e.h;
      const to = { x: 0, y };
      if (e === fresh) e.root.setPosition(0, y + 4);
      if (animate) slide(e.root, to, 140);
      else e.root.setPosition(to.x, to.y);
    }
  }

  private tick(_t: number, delta: number): void {
    this.clock += delta;
    for (const e of this.entries) if (!e.leaving && this.clock >= e.expires) this.leave(e);
  }
}
