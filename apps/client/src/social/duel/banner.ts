import { DUEL_TIMING } from "@guago/content";
import { type FloorView, TICK_MS } from "@guago/shared";
import * as Phaser from "phaser";
import { cue } from "../../sound/audio.ts";
import { fade, slide } from "../../ui/motion.ts";
import { screen } from "../../ui/screen.ts";
import { sound } from "../../ui/sound.ts";
import { Label } from "../../ui/text.ts";
import { sliceOf } from "../../ui/theme.ts";
import type { FightFeed } from "../../world-events.ts";
import { term } from "../words.ts";

const W = 232;
const H = 27;
/** Under the HUD's top row and the place banner, clear of both. */
const TOP = 62;
const BAR_W = 88;
const PIP = 7;
/** Last seconds of a round, when the clock turns red and ticks. */
const LAST = 10;
const TICKING = 5;
/** Where the bar ends: whatever stands under it starts below this. */
export const BANNER_BOTTOM = TOP + H;
/** A round's whole length in seconds. */
const ROUND_S = (DUEL_TIMING.round * TICK_MS) / 1000;

type Fighter = FloorView["fighters"][number];

/** `m:ss` for a number of seconds. */
export function minutes(s: number): string {
  const whole = Math.max(0, Math.ceil(s));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/** Side 1's colour and side 2's (청 and 백), as the bars fill. */
export const SIDE_FILL = ["duel-fill/a", "duel-fill/b"] as const;
/** The same as outlined chips, for paper and for marks. */
export const SIDE_CHIP = ["duel-chip/a", "duel-chip/b"] as const;

export type RoundEnd = "ko" | "time" | "forfeit";

interface Side {
  readonly name: Label;
  readonly flag: Phaser.GameObjects.Image;
  readonly fill: Phaser.GameObjects.NineSlice;
  readonly pips: Phaser.GameObjects.Image[];
  share: number;
}

/**
 * A 콜로세움 floor on screen, for its fighters and for whoever watches from the ring: a dark bar
 * with each side's name and health share, the rounds each has won in sockets by the clock (two
 * fill a best of three), and the round clock counting down from the floor's `endsAt`. Each
 * round opens with the score dropping in under the bar while the count of three is stamped where
 * the clock stands, and closes with how it ended, under the bar: a burst for a knockout, the
 * clock when time ran out (the fuller bar takes it), a white flag when a side left. The middle
 * of the screen stays the fighters'. Nothing on it speaks of levels or gear: everyone fights on
 * the same kit.
 */
export class FloorBanner {
  private readonly scene: Phaser.Scene;
  private readonly me: () => string | undefined;
  private root: Phaser.GameObjects.Container | undefined;
  private sides: [Side, Side] | undefined;
  private clock: Label | undefined;
  /** The count of three, stamped in the clock's place. */
  private count: Phaser.GameObjects.BitmapText | undefined;
  private view: FloorView | undefined;
  private feed: FightFeed | undefined;
  private shownCount = -1;
  private lastSecond = -1;
  /** A mark stamped under the bar: the round on, or how it ended. */
  private middle: Phaser.GameObjects.GameObject | undefined;
  private roundCard: Phaser.GameObjects.Container | undefined;
  private hidden = false;
  /** A round was decided: by which side (0 for a draw) and how, as the banner read it. */
  onRound: ((winner: number, end: RoundEnd) => void) | undefined;

  constructor(scene: Phaser.Scene, me: () => string | undefined) {
    this.scene = scene;
    this.me = me;
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.tick, this);
  }

  get match(): number {
    return this.view?.match ?? 0;
  }

  /** The floor as the server now says, or nothing to take the bar away. */
  set(view: FloorView | undefined, feed: FightFeed | undefined): void {
    const live = view && view.match !== 0 && view.phase !== "idle" ? view : undefined;
    const before = this.view;
    this.view = live;
    this.feed = feed;
    if (!live) {
      this.takeDown();
      return;
    }
    if (!this.root || before?.match !== live.match) {
      this.takeDown(true);
      this.build(live);
    }
    this.names(live);
    this.score(live, before?.match === live.match ? before : undefined);
    if (before?.phase !== live.phase || before?.round !== live.round) this.entered(live, before);
  }

  /** Out of the way while a menu is open; back when it closes. */
  setVisible(on: boolean): void {
    this.hidden = !on;
    if (this.root) fade(this.root, on ? 1 : 0, 120);
  }

  destroy(): void {
    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.tick, this);
    this.takeDown(true);
  }

  // ── Building ──────────────────────────────────────────────────────────────

  private build(view: FloorView): void {
    const scene = this.scene;
    const [l, r, t, b] = sliceOf("hud-plate");
    const back = scene.add.nineslice(0, 0, "ui", "hud-plate/idle", W, H, l, r, t, b).setOrigin(0);
    const parts: Phaser.GameObjects.GameObject[] = [back];
    const [gl, gr, gt, gb] = sliceOf("bar-thin");
    const [fl, fr, ft, fb] = sliceOf("duel-fill");
    const cx = W / 2;
    const wins = DUEL_TIMING.wins;
    const make = (i: 0 | 1): Side => {
      const left = i === 0;
      const gx = left ? 6 : W - 6 - BAR_W;
      const groove = scene.add
        .nineslice(gx, 16, "ui", "bar-thin/idle", BAR_W, 5, gl, gr, gt, gb)
        .setOrigin(0);
      const fill = scene.add
        .nineslice(gx + 1, 17, "ui", SIDE_FILL[i], BAR_W - 2, 3, fl, fr, ft, fb)
        .setOrigin(0);
      const name = new Label(scene, 0, 4, "", {
        font: "galmuri9",
        color: "stone.bright",
        width: BAR_W,
        align: left ? "left" : "right",
      });
      name.at(gx, 4);
      const flag = scene.add.image(0, 2, "ui", "duel-icon/flag").setOrigin(0).setVisible(false);
      const pips: Phaser.GameObjects.Image[] = [];
      for (let k = 0; k < wins; k++) {
        // Each side's sockets fill outward from the clock.
        const x = left ? cx - 2 - (k + 1) * (PIP + 1) + 1 : cx + 2 + k * (PIP + 1);
        pips.push(scene.add.image(x, 15, "ui", "duel-pip/off").setOrigin(0));
      }
      parts.push(groove, fill, name.obj, flag, ...pips);
      return { name, flag, fill, pips, share: 1 };
    };
    this.sides = [make(0), make(1)];
    const clock = new Label(scene, cx - 20, 3, minutes(ROUND_S), {
      font: "galmuri11-bold",
      color: "stone.bright",
      width: 40,
      align: "center",
    });
    const count = scene.add
      .bitmapText(cx, H / 2, "dmg-crit", "")
      .setOrigin(0.5)
      .setVisible(false);
    parts.push(clock.obj, count);
    this.clock = clock;
    this.count = count;
    const x = Math.round((screen.w - W) / 2);
    const root = scene.add
      .container(x, TOP - 10, parts)
      .setDepth(640)
      .setAlpha(0);
    this.root = root;
    this.shownCount = -1;
    this.lastSecond = -1;
    if (!this.hidden) {
      sound("page");
      slide(root, { x, y: TOP }, 200);
      fade(root, 1, 200);
    }
    this.names(view);
    this.score(view, undefined);
  }

  private names(view: FloorView): void {
    const sides = this.sides;
    if (!sides) return;
    const me = this.me();
    for (const i of [0, 1] as const) {
      const side = sides[i];
      const list = view.fighters.filter((f) => f.team === i + 1);
      const first = list[0]?.name ?? "";
      const text = list.length > 1 ? `${first} +${list.length - 1}` : first;
      side.name.set(text);
      side.name.color(list.some((f) => f.id === me) ? "gold.light" : "stone.bright");
      const out = list.length > 0 && list.some((f) => f.out);
      side.flag.setVisible(out);
      // The flag sits after the name, toward the clock.
      const gx = i === 0 ? 6 : W - 6 - BAR_W;
      side.flag.setX(i === 0 ? gx + side.name.width + 3 : gx + BAR_W - side.name.width - 12);
    }
  }

  /** The sockets: a round newly won is stamped in. */
  private score(view: FloorView, before: FloorView | undefined): void {
    const sides = this.sides;
    if (!sides) return;
    view.score.forEach((won, i) => {
      const side = sides[i as 0 | 1];
      side.pips.forEach((pip, k) => {
        const on = k < won;
        const was = pip.frame.name === "duel-pip/on";
        pip.setFrame(on ? "duel-pip/on" : "duel-pip/off");
        if (on && !was && before) {
          pip.setScale(2.2);
          this.scene.tweens.add({ targets: pip, scale: 1, duration: 160, ease: "Quad.In" });
        }
      });
    });
  }

  // ── Phases ────────────────────────────────────────────────────────────────

  private entered(view: FloorView, before: FloorView | undefined): void {
    const same = before?.match === view.match ? before : undefined;
    if (view.phase === "countdown") {
      this.shownCount = -1;
      this.dropRoundCard(view);
      this.clock?.set(minutes(ROUND_S)).color("stone.bright");
    } else if (view.phase === "fight") {
      this.showCount(undefined);
      this.lowerRoundCard();
      this.stampMiddle(this.scene.add.image(0, 0, "ui", "duel-icon/mark").setOrigin(0.5));
      cue("whistle", { volume: 0.7 });
    } else if (view.phase === "pause" && same) {
      this.roundEnded(view, same);
    } else if (view.phase === "over" && same && this.timeRanOut(same)) {
      // The last round: the result card says the rest.
      this.clock?.set(minutes(0)).color("red.light");
    }
  }

  /**
   * How the round just played ended, under the bar: a side gone (the flag), a side knocked out
   * (the burst), or else decided on health share (the clock), whether the clock ran out, the
   * round went idle or the match ran long. The clock itself only reads 0:00 when it did run out.
   */
  private roundEnded(view: FloorView, before: FloorView): void {
    const won = view.score.findIndex((s, i) => s > (before.score[i] ?? 0));
    const left = view.fighters.some((f, i) => f.out && !before.fighters[i]?.out);
    const down = [1, 2].some((team) => {
      const standing = view.fighters.filter((f) => f.team === team && !f.out);
      return standing.length > 0 && standing.every((f) => (this.feed?.health(f.sid) ?? 1) <= 0);
    });
    const end: RoundEnd = left ? "forfeit" : down ? "ko" : "time";
    if (this.timeRanOut(before)) this.clock?.set(minutes(0)).color("red.light");
    this.clearMiddle();
    const mark = end === "forfeit" ? "flag" : end === "ko" ? "burst" : "clock";
    const parts: Phaser.GameObjects.GameObject[] = [
      this.scene.add.image(0, 0, "ui", `duel-icon/${mark}`).setOrigin(0.5),
    ];
    // The side that took it, as its chip under the mark; nothing for a drawn round.
    if (won >= 0) {
      parts.push(this.scene.add.image(0, 8, "ui", SIDE_CHIP[won as 0 | 1]).setOrigin(0.5, 0));
    }
    this.stampMiddle(this.scene.add.container(0, 0, parts));
    sound("stamp");
    this.onRound?.(won + 1, end);
  }

  /** Whether the round that was being fought ran to the end of its clock. */
  private timeRanOut(before: FloorView): boolean {
    const tick = this.feed?.tick() ?? 0;
    return before.phase === "fight" && before.endsAt > 0 && tick >= before.endsAt - 2;
  }

  /** The score drops in under the bar as each round's count begins. */
  private dropRoundCard(view: FloorView): void {
    const scene = this.scene;
    this.roundCard?.destroy();
    const parts: Phaser.GameObjects.GameObject[] = [];
    const said = `${view.round}${term("label", "duel-round")}`;
    const digits = (n: number) => scene.add.bitmapText(0, 0, "dmg", String(n)).setOrigin(0);
    const a = digits(view.score[0]);
    const b = digits(view.score[1]);
    const dash = scene.add.bitmapText(0, 0, "dmg", "-").setOrigin(0);
    const chipA = scene.add.image(0, 0, "ui", SIDE_CHIP[0]).setOrigin(0);
    const chipB = scene.add.image(0, 0, "ui", SIDE_CHIP[1]).setOrigin(0);
    const row = [chipA, a, dash, b, chipB];
    const gaps = [5, 3, 3, 5];
    const rowW = row.reduce((s, o, i) => s + o.width + (gaps[i] ?? 0), 0);
    const label = new Label(scene, 0, 4, said, { font: "galmuri9", color: "gold.light" });
    const w = Math.max(rowW, label.width) + 16;
    const top = 16;
    let x = Math.round((w - rowW) / 2);
    row.forEach((o, i) => {
      const tall = o === chipA || o === chipB;
      o.setPosition(x, top + (tall ? 3 : 0));
      x += o.width + (gaps[i] ?? 0);
    });
    label.at(Math.round((w - label.width) / 2), 4);
    const h = top + 18;
    const [l, r, t, bt] = sliceOf("hud-plate");
    const back = scene.add.nineslice(0, 0, "ui", "hud-plate/idle", w, h, l, r, t, bt).setOrigin(0);
    parts.push(back, ...row, label.obj);
    const cx = Math.round((screen.w - w) / 2);
    const y = TOP + H + 4;
    const card = scene.add
      .container(cx, y - 8, parts)
      .setDepth(639)
      .setAlpha(0);
    this.roundCard = card;
    if (this.hidden) return;
    sound("page");
    slide(card, { x: cx, y }, 180);
    fade(card, 1, 180);
    scene.time.delayedCall(1900, () => {
      if (this.roundCard === card) this.lowerRoundCard();
    });
  }

  private lowerRoundCard(): void {
    const card = this.roundCard;
    this.roundCard = undefined;
    if (!card) return;
    slide(card, { x: card.x, y: card.y - 6 }, 160);
    fade(card, 0, 160, () => card.destroy());
  }

  /** The count of three where the clock stands, stamped in; nothing gives the clock back. */
  private showCount(n: number | undefined): void {
    const count = this.count;
    if (!count) return;
    this.clock?.obj.setVisible(n === undefined);
    count.setVisible(n !== undefined);
    if (n === undefined) return;
    count.setText(String(n)).setScale(2).setAlpha(0);
    this.scene.tweens.killTweensOf(count);
    this.scene.tweens.add({ targets: count, scale: 1, alpha: 1, duration: 120, ease: "Quad.In" });
    sound("stamp");
  }

  /** Lands a mark under the bar, twice its size, then lifts it. */
  private stampMiddle(obj: Phaser.GameObjects.GameObject): void {
    this.clearMiddle();
    const o = obj as Phaser.GameObjects.Image;
    const x = Math.round(screen.w / 2);
    const y = BANNER_BOTTOM + 14;
    o.setPosition(x, y);
    o.setDepth(641);
    o.setScale(3).setAlpha(0);
    this.middle = o;
    if (this.hidden) {
      o.setVisible(false);
      return;
    }
    this.scene.tweens.chain({
      targets: o,
      tweens: [
        { scale: 2, alpha: 1, duration: 120, ease: "Quad.In" },
        { y: y - 4, alpha: 0, delay: 900, duration: 220, ease: "Quad.In" },
      ],
      onComplete: () => {
        if (this.middle === o) this.middle = undefined;
        o.destroy();
      },
    });
  }

  private clearMiddle(): void {
    const m = this.middle;
    this.middle = undefined;
    if (m) {
      this.scene.tweens.killTweensOf(m);
      m.destroy();
    }
  }

  private takeDown(now = false): void {
    const root = this.root;
    this.root = undefined;
    this.sides = undefined;
    this.clock = undefined;
    this.count = undefined;
    this.clearMiddle();
    const card = this.roundCard;
    this.roundCard = undefined;
    card?.destroy();
    if (!root) return;
    if (now) {
      root.destroy();
      return;
    }
    slide(root, { x: root.x, y: TOP - 10 }, 180);
    fade(root, 0, 180, () => root.destroy());
  }

  // ── Every frame ───────────────────────────────────────────────────────────

  private tick(): void {
    const view = this.view;
    const sides = this.sides;
    const feed = this.feed;
    if (!view || !sides || !feed) return;
    const now = feed.tick();
    if (now <= 0) return;
    // Health shares: every fighter's share added up, out of the side's whole. A side left
    // standing on more of it when the clock runs out takes the round.
    for (const i of [0, 1] as const) {
      const list = view.fighters.filter((f) => f.team === i + 1);
      const share = sideShare(list, feed);
      this.drawShare(sides[i], i, share);
    }
    const left = view.endsAt - now;
    if (view.phase === "countdown") {
      const n = Math.ceil((left * TICK_MS) / 1000);
      if (n !== this.shownCount && n >= 1 && n <= 3) {
        this.shownCount = n;
        this.showCount(n);
      }
    } else if (view.phase === "fight") {
      const s = Math.max(0, (left * TICK_MS) / 1000);
      const whole = Math.ceil(s);
      if (whole !== this.lastSecond) {
        this.lastSecond = whole;
        this.clock?.set(minutes(s)).color(whole <= LAST ? "red.light" : "stone.bright");
        if (whole <= TICKING && whole > 0) cue("combat.telegraph.tick", { volume: 0.5 });
      }
    }
  }

  private drawShare(side: Side, i: 0 | 1, share: number): void {
    if (Math.abs(share - side.share) < 0.002) return;
    side.share = share;
    const full = BAR_W - 2;
    const w = Math.round(full * share);
    side.fill.setVisible(w >= 2);
    if (w < 2) return;
    side.fill.setSize(w, 3);
    // Side 1 empties toward the clock from its name, side 2 the other way.
    const gx = i === 0 ? 6 : W - 6 - BAR_W;
    side.fill.setX(i === 0 ? gx + 1 : gx + 1 + full - w);
  }
}

/** A side's health as one share: its fighters' shares added up, over how many it started with. */
function sideShare(list: readonly Fighter[], feed: FightFeed): number {
  if (list.length === 0) return 0;
  let sum = 0;
  for (const f of list) {
    if (f.out) continue;
    sum += f.sid ? (feed.health(f.sid) ?? 1) : 0;
  }
  return Math.max(0, Math.min(1, sum / list.length));
}
