import { formatKorean } from "@guago/shared";
import type * as Phaser from "phaser";

/** PLAN §6: at most 40 damage numbers on screen. */
export const MAX_NUMBERS = 40;
/**
 * New numbers a frame may add. Past it, only crits and hits well above the recent average still
 * get one: a sweep through thirty monsters shows its biggest hits, not thirty labels.
 */
const NEW_PER_FRAME = 2;
/** Ordinary hits on screen at once; past it the oldest of them is let go early. */
const MAX_SMALL = 12;
/** A number that has taken this many hits is a merged total and moves up to the big font. */
const BIG_AFTER = 3;
/** A hit on the same target within this keeps growing the same number. */
const MERGE_MS = 420;
const LIFE_MS = 680;
const BIG_LIFE_MS = 900;
const FADE_MS = 160;
/** The arc: thrown up and away from the player, falling back a little before it fades. */
const RISE = 105;
const SIDE = 22;
const GRAVITY = 300;
/** The player's own body, around their feet: no number is drawn over it. */
const BODY_HALF_W = 9;
const BODY_TOP = 28;
const BODY_BOTTOM = 3;
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
  /** Several hits or kills merged into one event: the big font. */
  Total: 5,
} as const;
export type NumberStyle = (typeof NumberStyle)[keyof typeof NumberStyle];

/** The digit fonts as drawn: outlined, no box; small for hits, big for crits and totals. */
const FONT: Readonly<Record<NumberStyle, string>> = {
  [NumberStyle.Hit]: "dmg-small",
  [NumberStyle.Crit]: "dmg-crit",
  [NumberStyle.Small]: "dmg-small",
  [NumberStyle.Hurt]: "dmg-small-crit",
  [NumberStyle.Heal]: "dmg-small",
  [NumberStyle.Total]: "dmg",
};

interface Num {
  readonly text: Phaser.GameObjects.BitmapText;
  target: number;
  style: NumberStyle;
  amount: number;
  /** ms since it last grew. */
  age: number;
  /** ms since its arc started. */
  total: number;
  life: number;
  /** Where its arc starts, and the arc's sideways and upward speeds, px/s. */
  x: number;
  y: number;
  vx: number;
  vy: number;
  pop: number;
  alive: boolean;
  /** Order it appeared in, for recycling the oldest. */
  born: number;
  /** Hits merged into it. */
  hits: number;
}

const big = (s: NumberStyle) => s === NumberStyle.Crit || s === NumberStyle.Total;

/**
 * Pooled damage numbers (PLAN §6): forty at most, rapid hits on one target merging into one
 * number that grows, Korean units (만, 억, 조). Each is the bitmap digits as drawn, with no box:
 * small for ordinary hits, the big fonts only for crits and merged totals. A number is thrown up
 * and away from the player in a short arc, so it leaves the body it belongs to instead of
 * covering it, and it is never drawn over the player.
 */
export class DamageNumbers {
  private readonly pool: Num[] = [];
  private serial = 0;
  private side = 1;
  /** Hits on screen right now. */
  visible = 0;
  private added = 0;
  private average = 0;
  /** Where the player stands this frame. */
  private selfX = 0;
  private selfY = 0;

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
        life: LIFE_MS,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
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
    // A tick of damage over time can be a fraction; a number that would read 0 is not shown,
    // but it still adds to a number already growing on that target.
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
      n.hits++;
      // A crit inside a merge makes the whole number a crit; enough hits make it a total.
      const next =
        style === NumberStyle.Crit || n.style === NumberStyle.Crit
          ? NumberStyle.Crit
          : n.hits >= BIG_AFTER
            ? NumberStyle.Total
            : n.style;
      if (next !== n.style) {
        n.style = next;
        n.text.setFont(FONT[next]);
      }
      n.age = 0;
      n.pop = 1;
      n.life = big(n.style) ? BIG_LIFE_MS : LIFE_MS;
      // It grows where its target is: the arc starts again from over the head.
      this.throwFrom(n, x, y);
      n.text.setText(formatKorean(n.amount));
      return;
    }
    if (amount < 1) return;
    // A plain hit over the frame's budget only shows when it stands out.
    const standout =
      style === NumberStyle.Crit ||
      style === NumberStyle.Hurt ||
      style === NumberStyle.Total ||
      amount > this.average * 2;
    this.average = this.average === 0 ? amount : this.average * 0.95 + amount * 0.05;
    if (this.added >= NEW_PER_FRAME && !standout) return;
    this.added++;
    if (!big(style) && style !== NumberStyle.Hurt) this.retireSmall();
    n = this.free();
    n.alive = true;
    n.target = target;
    n.style = style;
    n.amount = amount;
    n.age = 0;
    n.pop = 1;
    n.life = big(style) ? BIG_LIFE_MS : LIFE_MS;
    n.born = this.serial++;
    n.hits = 1;
    n.text.setFont(FONT[style]);
    n.text.setText(formatKorean(amount)).setVisible(true).setAlpha(1);
    n.text.clearTint();
    if (style === NumberStyle.Heal) n.text.setTint(0xacd26a);
    this.throwFrom(n, x, y);
  }

  /**
   * One merged total for an event made of many hits (a multi-kill): the big font, thrown from
   * the middle of it.
   */
  total(x: number, y: number, amount: number): void {
    this.show(-1, x, y, amount, NumberStyle.Total);
  }

  /** Starts a number's arc at (x, y): up, and away from the player's side. */
  private throwFrom(n: Num, x: number, y: number): void {
    const dx = x - this.selfX;
    let side: number;
    if (Math.abs(dx) > 4) side = Math.sign(dx);
    else {
      this.side = -this.side;
      side = this.side;
    }
    n.x = x;
    n.y = y;
    n.total = 0;
    n.vx = side * SIDE * (0.6 + Math.random() * 0.8) * (big(n.style) ? 0.5 : 1);
    n.vy = -RISE * (0.9 + Math.random() * 0.2) * (big(n.style) ? 1.1 : 1);
  }

  /** Lets the oldest ordinary hit go early when too many are up. */
  private retireSmall(): void {
    let count = 0;
    let oldest: Num | undefined;
    for (const p of this.pool) {
      if (!p.alive || big(p.style) || p.style === NumberStyle.Hurt) continue;
      count++;
      if (!oldest || p.born < oldest.born) oldest = p;
    }
    if (count >= MAX_SMALL && oldest) oldest.age = Math.max(oldest.age, oldest.life - FADE_MS);
  }

  private free(): Num {
    let oldest: Num | undefined;
    for (const p of this.pool) {
      if (!p.alive) return p;
      if (!oldest || p.born < oldest.born) oldest = p;
    }
    return oldest as Num;
  }

  /** Moves every number along its arc; (selfX, selfY) is where the player is drawn. */
  update(dtMs: number, selfX: number, selfY: number): void {
    this.added = 0;
    this.selfX = selfX;
    this.selfY = selfY;
    let visible = 0;
    for (const n of this.pool) {
      if (!n.alive) continue;
      n.age += dtMs;
      n.total += dtMs;
      if (n.age >= n.life) {
        n.alive = false;
        n.text.setVisible(false);
        continue;
      }
      visible++;
      const s = n.total / 1000;
      // Each new hit kicks it up a pixel or two for a beat; pops are whole pixels, never a scale.
      n.pop = Math.max(0, n.pop - dtMs / 110);
      const kick = Math.round(n.pop * (big(n.style) ? 3 : 2));
      let x = Math.round(n.x + n.vx * s);
      const y = Math.round(n.y + n.vy * s + 0.5 * GRAVITY * s * s) - kick;
      const shake = n.style === NumberStyle.Crit && n.age < 100 ? ((n.age / 34) & 1 ? 1 : -1) : 0;
      // Never over the player: a number that would cross their body steps out to its side.
      const half = n.text.width / 2;
      if (
        x + half > selfX - BODY_HALF_W &&
        x - half < selfX + BODY_HALF_W &&
        y > selfY - BODY_TOP &&
        y - n.text.height < selfY + BODY_BOTTOM
      ) {
        x =
          x >= selfX
            ? Math.ceil(selfX + BODY_HALF_W + half + 1)
            : Math.floor(selfX - BODY_HALF_W - half - 1);
      }
      n.text.setPosition(x + shake, y).setDepth(DEPTH + (big(n.style) ? 1 : 0) + n.born * 1e-6);
      const left = n.life - n.age;
      n.text.setAlpha(left < FADE_MS ? left / FADE_MS : 1);
    }
    this.visible = visible;
  }

  destroy(): void {
    for (const n of this.pool) n.text.destroy();
    this.pool.length = 0;
  }
}
