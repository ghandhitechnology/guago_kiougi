import type * as Phaser from "phaser";
import { type Body, Cat } from "./bodies.ts";
import { COMBAT } from "./catalog.ts";
import type { FightContext } from "./context.ts";

const UI = "ui";
/** Over the world, under the numbers. */
const DEPTH = 12;
const BAR_W = 18;
const ELITE_W = 26;
/** Other students show a bar only this hurt or worse. */
const OTHER_LOW = 0.4;
/** The lag fill drains this fast after holding, of the bar per second. */
const LAG_HOLD_MS = 260;
const LAG_RATE = 1.2;
const MAX_BARS = 24;
const MAX_BADGES = 24;
const PROOF_FRAMES = Array.from({ length: 11 }, (_, i) => `fx-proof/n${Math.max(1, i)}`);
const FILLS: Readonly<Record<string, string>> = {
  hp: "fill-tiny/hp",
  ally: "fill-tiny/ally",
  elite: "fill-tiny/elite",
};

interface Bar {
  readonly frame: Phaser.GameObjects.NineSlice;
  readonly lag: Phaser.GameObjects.NineSlice;
  readonly fill: Phaser.GameObjects.NineSlice;
  owner: number;
  shown: number;
  lagShown: number;
  lagHold: number;
  seen: boolean;
}

/**
 * What sits over heads, kept to what reads a fight: a bar under the local player's feet, bars
 * over hurt elites and bosses and over students in trouble, the statuses and 증명 stacks on the
 * local player's own targets. Everything is the UI kit's art and is pooled.
 */
export class Overlays {
  private readonly ctx: FightContext;
  private readonly bars: Bar[] = [];
  private readonly badges: Phaser.GameObjects.Image[] = [];
  private readonly proofs: Phaser.GameObjects.Image[] = [];
  private usedBadges = 0;
  private usedProofs = 0;
  /** Status indices drawn as badges, in priority order. */
  private readonly shown: readonly number[];
  private readonly badgeFrames: readonly (readonly [string, string])[];

  constructor(ctx: FightContext) {
    this.ctx = ctx;
    const ids = ctx.cat.statusIds;
    const want = [
      "burn",
      "flammable",
      "acid",
      "base",
      "metal",
      "wet",
      "sodium",
      "bleed",
      "infection",
      "mark",
      "slow",
      "armorBreak",
    ];
    const frames = ctx.cat.meta.sprites.status?.frames ?? [];
    const shown: number[] = [];
    const bf: [string, string][] = [];
    for (const id of want) {
      const i = ids.indexOf(id);
      const name = id === "armorBreak" ? "armor-break" : id;
      if (i < 0 || !frames.includes(`status/${name}0`)) continue;
      shown.push(i);
      bf[i] = [`status/${name}0`, `status/${name}1`];
    }
    this.shown = shown;
    this.badgeFrames = bf;
  }

  private bar(owner: number): Bar {
    for (const b of this.bars) if (b.owner === owner) return b;
    let free = this.bars.find((b) => b.owner === -1);
    if (!free && this.bars.length < MAX_BARS) {
      const s = this.ctx.scene;
      const frame = s.add.nineslice(0, 0, UI, "bar-thin/idle", BAR_W, 5, 2, 2, 2, 2);
      const lag = s.add.nineslice(0, 0, UI, "fill-tiny/lag", BAR_W - 2, 3, 1, 1, 1, 1);
      const fill = s.add.nineslice(0, 0, UI, "fill-tiny/hp", BAR_W - 2, 3, 1, 1, 1, 1);
      for (const o of [frame, lag, fill]) o.setOrigin(0, 0).setDepth(DEPTH).setVisible(false);
      free = { frame, lag, fill, owner: -1, shown: 1, lagShown: 1, lagHold: 0, seen: false };
      this.bars.push(free);
    }
    if (!free) free = this.bars[0] as Bar;
    free.owner = owner;
    free.shown = -1;
    free.lagShown = -1;
    free.lagHold = 0;
    return free;
  }

  private placeBar(
    b: Bar,
    x: number,
    y: number,
    w: number,
    share: number,
    kind: string,
    dt: number,
  ): void {
    b.seen = true;
    if (b.shown < 0) {
      b.shown = share;
      b.lagShown = share;
    }
    if (share < b.shown) b.lagHold = LAG_HOLD_MS;
    b.shown = share;
    if (b.lagHold > 0) b.lagHold -= dt;
    else b.lagShown = Math.max(share, b.lagShown - (LAG_RATE * dt) / 1000);
    if (b.lagShown < share) b.lagShown = share;
    const inner = w - 2;
    const left = Math.round(x - w / 2);
    const top = Math.round(y);
    b.frame.setSize(w, 5).setPosition(left, top).setVisible(true);
    const fw = Math.max(0, Math.round(inner * share));
    const lw = Math.max(0, Math.round(inner * b.lagShown));
    const frame = FILLS[kind] ?? "fill-tiny/hp";
    if (b.fill.frame.name !== frame) b.fill.setFrame(frame);
    b.fill
      .setSize(Math.max(2, fw), 3)
      .setPosition(left + 1, top + 1)
      .setVisible(fw > 0);
    b.lag
      .setSize(Math.max(2, lw), 3)
      .setPosition(left + 1, top + 1)
      .setVisible(lw > fw);
  }

  /** Draws what each body needs this frame. */
  update(bodies: Iterable<Body>, dtMs: number, selfHp: number, selfBar: boolean): void {
    for (const b of this.bars) b.seen = false;
    this.usedBadges = 0;
    this.usedProofs = 0;
    const now = this.ctx.now;
    for (const b of bodies) {
      if (b.dying) continue;
      if (b.cat === Cat.Player) {
        const share = b.self ? selfHp : b.hp / 255;
        if ((b.self && selfBar) || (!b.self && (share < OTHER_LOW || b.down))) {
          const bar = this.bar(b.id);
          const y = b.self ? b.y + 3 : b.headY - 6;
          this.placeBar(bar, b.x, y, BAR_W, share, b.self ? "hp" : "ally", dtMs);
        }
        continue;
      }
      if (b.cat !== Cat.Monster) continue;
      if (b.hp < 255 && (b.elite || b.hp > 0)) {
        const bar = this.bar(b.id);
        this.placeBar(bar, b.x, b.headY - 7, ELITE_W, b.hp / 255, b.elite ? "elite" : "hp", dtMs);
      }
      if (b.mineUntil < now) continue;
      // The local player's own targets: their statuses and stacks.
      let n = 0;
      if (b.status !== 0) {
        for (const i of this.shown) {
          if (n >= 2 || this.usedBadges >= MAX_BADGES) break;
          if (((b.status >> i) & 1) === 0) continue;
          this.badge(b, i, n++);
        }
      }
      if (b.proof > 0 && now - b.proofAt < 2000) this.proof(b, n);
    }
    for (const bar of this.bars) {
      if (bar.seen) continue;
      bar.owner = -1;
      bar.frame.setVisible(false);
      bar.fill.setVisible(false);
      bar.lag.setVisible(false);
    }
    for (let i = this.usedBadges; i < this.badges.length; i++) this.badges[i]?.setVisible(false);
    for (let i = this.usedProofs; i < this.proofs.length; i++) this.proofs[i]?.setVisible(false);
  }

  private badge(b: Body, status: number, slot: number): void {
    let img = this.badges[this.usedBadges];
    if (!img) {
      img = this.ctx.scene.add
        .image(0, 0, COMBAT, "status/burn0")
        .setDepth(DEPTH)
        .setOrigin(0.5, 1);
      this.badges.push(img);
    }
    this.usedBadges++;
    const frames = this.badgeFrames[status];
    if (!frames) return;
    const bob = Math.floor((this.ctx.now + status * 137) / 400) % 2;
    img.setFrame(frames[bob] as string);
    img.setVisible(true).setPosition(Math.round(b.x - 5 + slot * 10), Math.round(b.headY - 2));
  }

  private proof(b: Body, slot: number): void {
    let img = this.proofs[this.usedProofs];
    if (!img) {
      img = this.ctx.scene.add
        .image(0, 0, COMBAT, "fx-proof/n1")
        .setDepth(DEPTH + 1)
        .setOrigin(0.5, 1);
      this.proofs.push(img);
    }
    this.usedProofs++;
    const n = Math.max(1, Math.min(10, b.proof));
    // Nine blinks: the next hit proves it.
    const frame = PROOF_FRAMES[
      n >= 9 && Math.floor(this.ctx.now / 80) % 2 === 0 ? 10 : n
    ] as string;
    img.setFrame(frame);
    img
      .setVisible(true)
      .setPosition(Math.round(b.x + slot * 8), Math.round(b.headY - (slot > 0 ? 12 : 3)));
  }

  destroy(): void {
    for (const b of this.bars) {
      b.frame.destroy();
      b.fill.destroy();
      b.lag.destroy();
    }
    for (const i of [...this.badges, ...this.proofs]) i.destroy();
  }
}
