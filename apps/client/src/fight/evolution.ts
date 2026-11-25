import * as Phaser from "phaser";
import type { Bodies } from "./bodies.ts";
import { COMBAT } from "./catalog.ts";
import type { FightContext } from "./context.ts";
import type { Effects } from "./effects.ts";
import { Bit } from "./particles.ts";
import { Layer, type Piece } from "./pieces.ts";

/** Milestones of the moment, ms from its start. */
const RISE_MS = 460;
const TURN_MS = 470;
const SINK_AT = 1750;
const SINK_MS = 260;
const NAME_MS = 2000;
const RING_MS = 520;
/** The ring runs out this far, px, pushing what it passes. */
const RING_R = 104;
const RING_MOTES = 28;
/** Over the student's feet: the cover's rest and the name's line. */
const COVER_Y = 38;
const NAME_Y = 58;
const UI = "ui";
/** Over the damage numbers, under the screen pieces. */
const DEPTH = 22;

export interface EvolutionSpec {
  /** Rules index of the evolved book. */
  readonly book: number;
  /** The book's cover and the evolved cover, frames of the UI kit's `book` sprite. */
  readonly from: string;
  readonly to: string;
  /** The evolved book's name, as the player reads it. */
  readonly name: string;
  /** Called on the turn: the book's casts are evolved from then on. */
  readonly evolved: () => void;
}

function easeOutBack(t: number): number {
  const c = 1.9;
  const u = t - 1;
  return 1 + (c + 1) * u * u * u + c * u * u;
}

/**
 * A book evolving, played on the local player while the fight goes on (never a global freeze in
 * a shared map). Every piece is the art at whole-number scales; the cover is the UI kit's book at
 * ×2, the name the bold Galmuri.
 */
export class EvolutionMoment {
  private readonly ctx: FightContext;
  private readonly bodies: Bodies;
  private readonly effects: Effects;
  private readonly spec: EvolutionSpec;
  private readonly cover: Phaser.GameObjects.Image;
  private readonly name: Phaser.GameObjects.BitmapText;
  private readonly ring: Piece[] = [];
  private readonly start: number;
  private turned = false;
  private sank = false;

  constructor(
    scene: Phaser.Scene,
    ctx: FightContext,
    bodies: Bodies,
    effects: Effects,
    spec: EvolutionSpec,
  ) {
    this.ctx = ctx;
    this.bodies = bodies;
    this.effects = effects;
    this.spec = spec;
    this.start = ctx.now;
    const cat = ctx.cat;
    // The kit's frames pivot on their corner; the cover turns about its middle.
    this.cover = scene.add.image(0, 0, UI, spec.from).setOrigin(0.5).setScale(2).setDepth(DEPTH);
    this.cover.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    this.name = scene.add
      .bitmapText(0, 0, "galmuri11-bold", spec.name)
      .setOrigin(0.5, 1)
      .setDepth(DEPTH + 1)
      .setTint(cat.color("gold.pale"))
      .setDropShadow(1, 1, cat.color("ink.deep"), 1)
      .setVisible(false);
    const color = cat.book(spec.book, true).color;
    const x = ctx.selfX;
    const y = ctx.selfY;
    // The book is called up out of the student: light drawn in, the student stretched tall.
    ctx.sound.self("jingle.jeonjik");
    ctx.particles.burst(Bit.Gather, x, y - 12, 18, color, 30, 0);
    ctx.particles.burst(Bit.Gather, x, y - 12, 10, cat.color("gold.pale"), 22, 0);
    ctx.trauma.add(0.12);
    const self = bodies.self;
    if (self) {
      self.flash = 3;
      self.flashMode = 0;
      bodies.kick(self, -1.8);
    }
    this.place(0);
  }

  /** Moves the moment along; false once it is over and everything it drew is gone. */
  update(now: number): boolean {
    const t = now - this.start;
    if (!this.turned && t >= TURN_MS) this.turn();
    this.place(t);
    this.ringFrame(t);
    if (!this.sank && t >= SINK_AT + SINK_MS) this.sink();
    if (t >= TURN_MS + NAME_MS) {
      this.done();
      return false;
    }
    return true;
  }

  /** The cover and the name where they are at `t`. */
  private place(t: number): void {
    const x = Math.round(this.ctx.selfX);
    const y = this.ctx.selfY;
    // Out of the chest with an overshoot, a hover, then back down into the student.
    let lift: number;
    if (t < RISE_MS) lift = 12 + (COVER_Y - 12) * easeOutBack(t / RISE_MS);
    else if (t < SINK_AT) lift = COVER_Y + Math.round(Math.sin((t - RISE_MS) * 0.006));
    else lift = COVER_Y - (COVER_Y - 12) * Math.min(1, (t - SINK_AT) / SINK_MS) ** 2;
    // It shivers harder and flashes faster as the turn comes.
    let jx = 0;
    if (t > 240 && t < TURN_MS) {
      const k = (t - 240) / (TURN_MS - 240);
      jx = Math.round(Math.sin(t * 0.9) * (1 + k * 1.5));
      const white = Math.floor(t / (70 - 45 * k)) % 2 === 0;
      if (white) this.cover.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
      else this.cover.clearTint();
    } else if (t >= 60 && t < 240) this.cover.clearTint();
    // The turned cover pops a size up for three frames.
    const pop = this.turned && t - TURN_MS < 50 ? 3 : 2;
    this.cover
      .setScale(pop)
      .setPosition(x + jx, Math.round(y - lift))
      .setVisible(!this.sank);
    if (this.turned) {
      const n = t - TURN_MS;
      const drop = n < 220 ? Math.round(8 * (1 - easeOutBack(n / 220))) : 0;
      const fade = NAME_MS - n < 300 ? Math.max(0, (NAME_MS - n) / 300) : 1;
      this.name
        .setVisible(true)
        .setPosition(x, Math.round(y - NAME_Y - drop))
        .setAlpha(fade);
    }
  }

  /** The cover turns into the evolved cover: the flash, the ring, the salute, the name. */
  private turn(): void {
    this.turned = true;
    const ctx = this.ctx;
    const cat = ctx.cat;
    this.cover.setFrame(this.spec.to).setOrigin(0.5).clearTint();
    this.spec.evolved();
    const x = ctx.selfX;
    const y = ctx.selfY;
    const color = cat.book(this.spec.book, true).color;
    const gold = cat.color("gold.pale");
    // The one flash past the usual caps: an evolution lights the field around the player.
    ctx.lights.burst(x, y - 16, gold, 88, 1.15, 800);
    ctx.lights.burst(x, y - 16, color, 56, 0.8, 500);
    this.effects.oneShot("fx-hit-crit", "fx-hit-crit/hit", x, y - COVER_Y, 1, Layer.Glow, 2);
    this.effects.oneShot("fx-levelup", "fx-levelup/burst", x, y, 1);
    ctx.particles.burst(Bit.Spark, x, y - COVER_Y, 24, gold, 220, 0);
    ctx.particles.burst(Bit.Spark, x, y - COVER_Y, 16, color, 180, 0);
    ctx.particles.burst(Bit.Mote, x, y - 12, 24, color, 70, 0);
    ctx.sound.self("sfx.signature.qed", 7);
    ctx.trauma.add(0.42);
    const self = this.bodies.self;
    if (self) {
      self.flash = 2;
      self.flashMode = 0;
      this.bodies.kick(self, 1.4);
    }
    for (let i = 0; i < RING_MOTES; i++) {
      const p = this.effects.pieces.take(Layer.Glow);
      p.s.setTexture(COMBAT, cat.frame("fx-pickup")).play("fx-pickup/twinkle");
      p.s.setBlendMode(Phaser.BlendModes.ADD);
      p.s.setTint(i % 2 === 0 ? gold : color);
      this.ring.push(p);
    }
    this.effects.salute(this.spec.book, x, y, ctx.selfFacing);
  }

  /** The ring runs out from the player, pushing the monsters it passes back. */
  private ringFrame(t: number): void {
    if (this.ring.length === 0) return;
    const n = t - TURN_MS;
    if (n >= RING_MS) {
      this.releaseRing();
      return;
    }
    const f = n / RING_MS;
    const r = 10 + (RING_R - 10) * (1 - (1 - f) ** 3);
    const x = this.ctx.selfX;
    const y = this.ctx.selfY;
    for (let i = 0; i < this.ring.length; i++) {
      const p = this.ring[i] as Piece;
      const a = (i / this.ring.length) * Math.PI * 2 + f * 0.6;
      p.s.setPosition(Math.round(x + Math.cos(a) * r), Math.round(y - 4 + Math.sin(a) * r * 0.6));
      p.s.setAlpha(f < 0.7 ? 1 : (1 - f) / 0.3);
    }
    // What the ring passes is thrown back, the near ones hardest.
    this.bodies.shove(x, y, r + 6, 5 * (1 - f) + 1);
  }

  private releaseRing(): void {
    for (const p of this.ring) this.effects.pieces.give(p);
    this.ring.length = 0;
  }

  /** The cover goes back into the student in a twinkle. */
  private sink(): void {
    this.sank = true;
    const ctx = this.ctx;
    const color = ctx.cat.book(this.spec.book, true).color;
    ctx.particles.burst(Bit.Mote, ctx.selfX, ctx.selfY - 12, 12, color, 40, 0);
    this.effects.oneShot("fx-pop", "fx-pop/die", ctx.selfX, ctx.selfY - 12, 1);
  }

  /** Takes everything the moment drew away. */
  done(): void {
    this.releaseRing();
    this.cover.destroy();
    this.name.destroy();
  }
}
