import { formatKorean } from "@guago/shared";
import type * as Phaser from "phaser";

/** PLAN §6: at most 40 damage numbers on screen. */
export const MAX_NUMBERS = 40;
/** A number that has taken this many hits moves up to the big font. */
const BIG_AFTER = 3;
/** A hit on the same target within this keeps growing the same number. */
const MERGE_MS = 420;
const LIFE_MS = 720;
const FADE_MS = 180;
/** Above the world, under the reticle. */
const DEPTH = 20;

export const NumberStyle = {
  /** The player's own hit. */
  Hit: 0,
  Crit: 1,
  /** Damage over time and collisions: small. */
  Small: 2,
  /** Damage the player took. */
  Hurt: 3,
  /** Healing and shields. */
  Heal: 4,
} as const;
export type NumberStyle = (typeof NumberStyle)[keyof typeof NumberStyle];

const FONT: Readonly<Record<NumberStyle, string>> = {
  [NumberStyle.Hit]: "dmg-small",
  [NumberStyle.Crit]: "dmg-crit",
  [NumberStyle.Small]: "dmg-small",
  [NumberStyle.Hurt]: "dmg-small-crit",
  [NumberStyle.Heal]: "dmg-small",
};

interface Num {
  readonly text: Phaser.GameObjects.BitmapText;
  target: number;
  style: NumberStyle;
  amount: number;
  /** ms since it last grew. */
  age: number;
  /** ms since it appeared. */
  total: number;
  x: number;
  y: number;
  drift: number;
  pop: number;
  alive: boolean;
  /** Order it appeared in, for recycling the oldest. */
  born: number;
  /** Hits merged into it. */
  hits: number;
}

/**
 * Pooled damage numbers (PLAN §6): forty at most, rapid hits on one target merging into one
 * number that grows and pops each time it is added to, Korean units (만, 억, 조), crits in their
 * own font and bigger. A number rises and eases out; when every slot is taken the oldest goes.
 */
export class DamageNumbers {
  private readonly pool: Num[] = [];
  private serial = 0;
  private side = 1;
  /** Hits on screen right now. */
  visible = 0;
  /** Extra scale and rise for small screens are not needed: the game is drawn at 480×270. */
  constructor(scene: Phaser.Scene) {
    for (let i = 0; i < MAX_NUMBERS; i++) {
      const text = scene.add.bitmapText(0, 0, FONT[NumberStyle.Hit], "");
      text.setOrigin(0.5, 1).setDepth(DEPTH).setVisible(false);
      this.pool.push({
        text,
        target: -1,
        style: NumberStyle.Hit,
        amount: 0,
        age: 0,
        total: 0,
        x: 0,
        y: 0,
        drift: 0,
        pop: 0,
        alive: false,
        born: 0,
        hits: 0,
      });
    }
  }

  /**
   * A number for `amount` over target `target` at (x, y), the point above its head. Hits on the
   * same target in quick succession add to the one already showing.
   */
  show(target: number, x: number, y: number, amount: number, style: NumberStyle): void {
    if (amount <= 0) return;
    const merges = style !== NumberStyle.Hurt && style !== NumberStyle.Heal;
    let n: Num | undefined;
    if (merges && target >= 0) {
      for (const p of this.pool) {
        if (!p.alive || p.target !== target || p.age > MERGE_MS) continue;
        if (p.style === NumberStyle.Hurt || p.style === NumberStyle.Heal) continue;
        n = p;
        break;
      }
    }
    if (n) {
      n.amount += amount;
      // A crit inside a merge makes the whole number a crit.
      if (style === NumberStyle.Crit && n.style !== NumberStyle.Crit) {
        n.style = style;
        n.text.setFont(FONT[style]);
      }
      n.age = 0;
      n.hits++;
      if (n.style === NumberStyle.Hit && n.hits >= BIG_AFTER && n.text.font !== "dmg")
        n.text.setFont("dmg");
      n.pop = style === NumberStyle.Crit ? 1 : 0.7;
      n.x = x;
      n.y = Math.min(n.y, y);
      n.text.setText(formatKorean(n.amount));
      return;
    }
    n = this.free();
    n.alive = true;
    n.target = target;
    n.style = style;
    n.amount = amount;
    n.age = 0;
    n.total = 0;
    n.x = x + (Math.random() - 0.5) * 8;
    n.y = y - Math.random() * 4;
    this.side = -this.side;
    n.drift = this.side * (2 + Math.random() * 4);
    n.pop = style === NumberStyle.Crit ? 1.2 : 0.8;
    n.born = this.serial++;
    n.hits = 1;
    n.text.setFont(FONT[style]);
    n.text.setText(formatKorean(amount)).setVisible(true).setAlpha(1);
    n.text.clearTint();
    if (style === NumberStyle.Heal) n.text.setTint(0xacd26a);
  }

  private free(): Num {
    let oldest: Num | undefined;
    for (const p of this.pool) {
      if (!p.alive) return p;
      if (!oldest || p.born < oldest.born) oldest = p;
    }
    return oldest as Num;
  }

  update(dtMs: number): void {
    let visible = 0;
    for (const n of this.pool) {
      if (!n.alive) continue;
      n.age += dtMs;
      n.total += dtMs;
      if (n.age >= LIFE_MS) {
        n.alive = false;
        n.text.setVisible(false);
        continue;
      }
      visible++;
      // Rise fast, then hang: ease out over the life since it last grew.
      const f = Math.min(1, n.total / LIFE_MS);
      const rise = 16 * (1 - (1 - f) * (1 - f));
      n.pop = Math.max(0, n.pop - dtMs / 90);
      const crit = n.style === NumberStyle.Crit;
      // Pops are whole steps so the font keeps its pixels: a crit doubles for a beat, any
      // other number kicks up a few pixels each time it grows.
      const scale = crit && n.pop > 0.5 ? 2 : 1;
      const kick = Math.round(n.pop * 4);
      const shake = crit && n.age < 120 ? (Math.random() < 0.5 ? -1 : 1) : 0;
      n.text
        .setScale(scale)
        .setPosition(Math.round(n.x + n.drift * f + shake), Math.round(n.y - rise - kick))
        .setDepth(DEPTH + (crit ? 1 : 0) + n.born * 1e-6);
      const left = LIFE_MS - n.age;
      n.text.setAlpha(left < FADE_MS ? left / FADE_MS : 1);
    }
    this.visible = visible;
  }

  destroy(): void {
    for (const n of this.pool) n.text.destroy();
    this.pool.length = 0;
  }
}
