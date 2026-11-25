/**
 * Hit feel (PLAN §6 "Hit feel"): what each server record does to the screen and the speakers.
 * The server has already decided every hit; this only makes it felt.
 *
 * | Row | Here |
 * |---|---|
 * | Hitstop | target only: 50 ms light, 110 heavy, 130 crit, 150 kill, 160 Q.E.D. |
 * | Flash | full white for 2 frames on the player's own hits, a softer lift on anyone else's |
 * | Knockback | the server's track, a 1 to 3 px kick toward the knock, caught up after the stop |
 * | Trauma | own hits and hits taken only, see `TRAUMA` |
 * | Numbers | pooled, merged per target, Korean units, crits in their own font |
 * | Particles | pooled, capped per tier |
 * | Death | the monster's 3-frame pop, a burst, 4 to 6 debris, the drop arcs out |
 * | Sound | one call per hit to the mixer, which layers and limits voices |
 * | Squash | wind-up, landing, every hop, every hit |
 */
import { HitFlag, HurtFlag, Priv } from "@guago/shared";
import { type Bodies, type Body, Cat } from "./bodies.ts";
import { COMBAT } from "./catalog.ts";
import type { FightContext } from "./context.ts";
import type { Active, Effects } from "./effects.ts";
import { NumberStyle } from "./numbers.ts";
import { Bit } from "./particles.ts";
import { Layer } from "./pieces.ts";

/** Hitstop on the target, ms. */
export const STOP = {
  light: 50,
  heavy: 110,
  crit: 130,
  kill: 150,
  qed: 160,
  collision: 70,
} as const;
/** Trauma each event adds, 0 to 1. */
export const TRAUMA = {
  light: 0.04,
  heavy: 0.11,
  crit: 0.16,
  kill: 0.09,
  qed: 0.32,
  collision: 0.08,
  land: 0.14,
  hurtMin: 0.18,
  hurtMax: 0.5,
  down: 0.6,
  elite: 0.38,
  levelUp: 0.2,
} as const;
/** Most trauma own hits may add in one frame, so an orbit grinding a crowd does not blur. */
const HIT_TRAUMA_PER_FRAME = 0.18;
/** Collisions within this make a chain, ms (운동량's links 1 to 3). */
const CHAIN_MS = 320;

export interface Hit {
  target: number;
  amount: number;
  flags: number;
  slot: number;
  proof: number;
  kx: number;
  ky: number;
  count: number;
}

export interface FeedbackHooks {
  /** Book index of the local player's slot, or -1. */
  bookOf(slot: number): number;
  /** The local player's max HP, for how hard a hurt lands. */
  maxHp(): number;
  /** A big moment for the local player (level up, knock-out, revive). */
  moment(kind: number): void;
  /** An elite arrived: the screen notices. */
  elite(b: Body | undefined, x: number, y: number): void;
}

export class Feedback {
  private readonly ctx: FightContext;
  private readonly bodies: Bodies;
  private readonly effects: Effects;
  private readonly hooks: FeedbackHooks;
  private hitTrauma = 0;
  private chain = 0;
  private chainAt = -1e9;
  /** Own hits this frame, by target, so the flash bit of the same hit is not doubled. */
  readonly mineThisMessage = new Set<number>();
  /** Counts for the readout. */
  readonly counts = { hits: 0, kills: 0, hurts: 0, stops: 0 };
  /** The last own hits with their hitstop, for development checks; never drawn. */
  readonly log: { t: number; target: number; flags: number; stop: number; amount: number }[] = [];

  constructor(ctx: FightContext, bodies: Bodies, effects: Effects, hooks: FeedbackHooks) {
    this.ctx = ctx;
    this.bodies = bodies;
    this.effects = effects;
    this.hooks = hooks;
  }

  /** Called once a frame before anything adds trauma. */
  frame(): void {
    this.hitTrauma = 0;
  }

  private trauma(amount: number): void {
    this.ctx.trauma.add(amount);
  }

  private hitTraumaAdd(amount: number): void {
    const room = HIT_TRAUMA_PER_FRAME - this.hitTrauma;
    if (room <= 0) return;
    const a = Math.min(room, amount);
    this.hitTrauma += a;
    this.trauma(a);
  }

  /** One of the local player's merged hits from this tick. */
  hit(h: Hit): void {
    const b = this.bodies.get(h.target);
    this.counts.hits++;
    if (!b) return;
    const cat = this.ctx.cat;
    const f = h.flags;
    const crit = (f & HitFlag.Crit) !== 0;
    const kill = (f & HitFlag.Kill) !== 0;
    const qed = (f & HitFlag.Qed) !== 0;
    const collision = (f & HitFlag.Collision) !== 0;
    const dot = (f & HitFlag.Dot) !== 0;
    const blocked = (f & HitFlag.Blocked) !== 0;
    const heavy = (f & HitFlag.Heavy) !== 0 || h.count >= 3;
    const book = this.hooks.bookOf(h.slot);
    const art = book >= 0 ? cat.book(book) : null;
    const cls = art?.cls ?? (this.ctx.selfClass as "math");
    const mon = b.art;
    const x = b.x;
    const y = b.y;
    const mid = Math.round((b.headY + b.y) / 2);
    this.mineThisMessage.add(b.id);
    if (kill) {
      this.counts.kills++;
      this.ctx.sound.kill(this.ctx.now);
    }

    // Hitstop and flash on the target only; damage over time only ticks a flash.
    if (dot) {
      if (b.flash <= 0) {
        b.flash = 1;
        b.flashMode = 1;
      }
    } else {
      const stop = qed
        ? STOP.qed
        : kill
          ? STOP.kill
          : crit
            ? STOP.crit
            : heavy
              ? STOP.heavy
              : collision
                ? STOP.collision
                : STOP.light;
      this.bodies.struck(b, stop, heavy || crit || kill || qed, h.kx, h.ky);
      this.counts.stops++;
      if (this.log.length >= 64) this.log.shift();
      this.log.push({ t: this.ctx.now, target: b.id, flags: f, stop, amount: h.amount });
    }
    if (h.proof > 0) {
      b.proof = h.proof;
      b.proofAt = this.ctx.now;
      this.ctx.sound.proof(h.proof);
    }
    if (qed) b.proof = 0;

    // The number.
    const style = crit ? NumberStyle.Crit : dot || collision ? NumberStyle.Small : NumberStyle.Hit;
    this.ctx.numbers.show(b.id, x, b.headY - 2, h.amount, style);

    // Sparks: the class's colour, the hit's weight.
    const color = art?.color ?? cat.color("stone.bright");
    if (blocked) {
      this.effects.oneShot("fx-spark", "fx-spark/hit", x, mid, 1);
      this.ctx.particles.burst(Bit.Spark, x, mid, 5, cat.color("stone.bright"), 110, 0);
      this.ctx.sound.cue("sfx.monster.rational.hit", x, y, true);
    } else if (!dot) {
      // The spark sits on the near side of the target, toward the player, so the target's own
      // white flash shows beside it instead of under it.
      const spark = crit ? "fx-hit-crit" : heavy || kill ? "fx-hit-heavy" : "fx-hit-light";
      const ax = this.ctx.selfX - x;
      const ay = this.ctx.selfY - y;
      const ad = Math.hypot(ax, ay) || 1;
      const off = crit ? 8 : heavy || kill ? 7 : 5;
      this.effects.oneShot(
        spark,
        `${spark}/hit`,
        x + (ax / ad) * off,
        mid + (ay / ad) * off * 0.6 - 2,
        1,
      );
      this.ctx.particles.burst(
        Bit.Spark,
        x,
        mid,
        crit ? 7 : heavy ? 5 : 2,
        color,
        crit ? 140 : 100,
        0,
      );
    }
    if (collision) this.collision(b, h);

    // Weight on the screen and in the room.
    if (!dot) {
      this.hitTraumaAdd(
        qed
          ? TRAUMA.qed
          : crit
            ? TRAUMA.crit
            : kill
              ? TRAUMA.kill
              : heavy
                ? TRAUMA.heavy
                : TRAUMA.light,
      );
      if (crit || kill || heavy)
        this.ctx.lights.flash(x, mid, color, crit ? 40 : 30, crit ? 1.1 : 0.8, 160);
      this.ctx.sound.hit(
        cls,
        true,
        x,
        y,
        { heavy: heavy || collision, crit, kill },
        art?.impact ?? "",
        mon?.hitCue ?? "",
        mon?.dieCue ?? "",
      );
    }
  }

  /** 물리 운동량: a launched monster struck another. Shock lines, plum sparks, a climbing chain. */
  private collision(b: Body, h: Hit): void {
    const now = this.ctx.now;
    this.chain = now - this.chainAt < CHAIN_MS ? Math.min(3, this.chain + 1) : 1;
    this.chainAt = now;
    const cat = this.ctx.cat;
    const plum = cat.color("plum.light");
    const mid = (b.headY + b.y) / 2;
    const ang = Math.atan2(h.ky, h.kx);
    this.effects.oneShot("fx-hit-heavy", "fx-hit-heavy/hit", b.x, mid, 1, Layer.Glow, plum);
    this.ctx.particles.burst(
      Bit.Spark,
      b.x,
      mid,
      4 + this.chain * 2,
      plum,
      120 + this.chain * 30,
      0,
      ang,
      1.6,
    );
    this.ctx.particles.burst(Bit.Debris, b.x, b.y, 2, cat.color("stone.light"), 50, 2);
    this.ctx.sound.collide(this.chain, b.x, b.y);
    this.hitTraumaAdd(TRAUMA.collision * this.chain);
    this.ctx.lights.flash(b.x, mid, plum, 26 + this.chain * 6, 0.7 + this.chain * 0.2, 140);
  }

  /** The local player was hit. */
  hurt(source: number, amount: number, flags: number): void {
    const self = this.bodies.self;
    this.counts.hurts++;
    const x = this.ctx.selfX;
    const y = this.ctx.selfY;
    const cat = this.ctx.cat;
    if (flags & HurtFlag.Shielded && amount <= 0) {
      this.effects.oneShot(
        "fx-spark",
        "fx-spark/hit",
        x,
        y - 12,
        1,
        Layer.Glow,
        cat.color("sea.light"),
      );
      this.ctx.sound.self("sfx.reaction.neutralize");
      return;
    }
    if (self) this.bodies.hurt(self);
    const share = Math.min(1, amount / Math.max(1, this.hooks.maxHp()));
    this.trauma(TRAUMA.hurtMin + (TRAUMA.hurtMax - TRAUMA.hurtMin) * Math.min(1, share * 4));
    this.ctx.numbers.show(-1, x, y - 26, amount, NumberStyle.Hurt);
    this.ctx.particles.burst(Bit.Spark, x, y - 10, 4, cat.color("red.light"), 90, 0);
    const src = this.bodies.get(source);
    const cue =
      src?.art?.attackCue &&
      flags & (HurtFlag.Charge | HurtFlag.Blast | HurtFlag.Slam | HurtFlag.Shot)
        ? src.art.attackCue
        : (src?.art?.hitCue ?? "sfx.monster.odap.hit");
    this.ctx.sound.self(cue);
    this.ctx.sound.self("hit.physics.light");
    if (flags & (HurtFlag.Blast | HurtFlag.Slam)) {
      this.effects.oneShot(
        "fx-hit-heavy",
        "fx-hit-heavy/hit",
        x,
        y - 10,
        1,
        Layer.Glow,
        cat.color("red.light"),
      );
    }
  }

  /** A monster's death pop begins: the burst, debris, and the sound when it was not ours. */
  died(b: Body): void {
    const cat = this.ctx.cat;
    const art = b.art;
    if (!art) return;
    const mine = b.mineUntil > this.ctx.now;
    const mid = Math.round((b.headY + b.y) / 2);
    const alpha = mine ? 1 : 0.75;
    this.effects.oneShot(
      art.paper ? "fx-death-paper" : "fx-death",
      art.paper ? "fx-death-paper/die" : "fx-death/die",
      b.x,
      mid,
      alpha,
      Layer.Glow,
      undefined,
      b.elite ? 2 : 1,
    );
    const n = (b.elite ? 10 : 4) + Math.floor(Math.random() * 3);
    this.ctx.particles.burst(
      art.paper ? Bit.Paper : Bit.Debris,
      b.x,
      mid,
      n,
      art.paper ? 0xffffff : art.tint,
      b.elite ? 90 : 60,
      6,
    );
    if (art.paper) this.ctx.particles.burst(Bit.Debris, b.x, mid, 2, art.tint, 55, 6);
    if (!mine) this.ctx.sound.cue(art.dieCue, b.x, b.y, false);
    if (b.elite) {
      this.ctx.sound.cue(art.dieCue, b.x, b.y, true);
      if (mine) this.trauma(TRAUMA.elite * 0.6);
      this.ctx.lights.flash(b.x, mid, cat.color("plum.light"), 60, 1.2, 320);
    }
    void COMBAT;
  }

  /** An effect of the local player's landed: heavy ones shake and light the ground. */
  impact(a: Active, x: number, y: number): void {
    if (!a.mine || !a.art) return;
    const kind = a.art.kind;
    if (kind === "telegraph") {
      this.trauma(TRAUMA.land * 1.4);
      this.ctx.lights.flash(x, y, a.art.color, 54, 1.2, 260);
      this.ctx.particles.burst(Bit.Debris, x, y, 6, this.ctx.cat.color("clay.mid"), 70, 2);
    } else if (a.art.id === "holiday-physics") {
      this.trauma(TRAUMA.land);
      this.ctx.lights.flash(x, y, a.art.color, 36, 0.9, 200);
      this.ctx.particles.burst(Bit.Debris, x, y, 4, this.ctx.cat.color("stone.light"), 60, 1);
    }
  }

  /** A monster's tell fired. */
  fired(a: Active): void {
    this.ctx.sound.cue("combat.telegraph.fire", a.x, a.y, true);
    const d = Math.hypot(a.x - this.ctx.selfX, a.y - this.ctx.selfY);
    if (d < 120) this.trauma(0.12 * (1 - d / 120));
  }

  /** A public burst. */
  burst(kind: number, x: number, y: number, radius: number, owner: number): void {
    const cat = this.ctx.cat;
    const mine = owner === this.ctx.selfId && owner !== 0;
    const near = Math.hypot(x - this.ctx.selfX, y - this.ctx.selfY) < 260;
    if (kind < 16) {
      const r = cat.reactions[kind];
      const scale = Math.max(1, radius / 24);
      if (r?.vfx)
        this.effects.oneShot(
          r.vfx,
          null,
          x,
          y,
          mine ? 1 : 0.6,
          Layer.Ground,
          undefined,
          scale,
          true,
        );
      else {
        this.effects.oneShot(
          "fx-tome-impact",
          "fx-tome-impact/land",
          x,
          y,
          mine ? 1 : 0.6,
          Layer.Glow,
          cat.color("sea.light"),
          scale,
        );
      }
      this.ctx.particles.burst(Bit.Spark, x, y - 6, mine ? 8 : 3, cat.color("sea.light"), 120, 0);
      if (mine || near) this.ctx.sound.cue(r?.sfx ?? "sfx.reaction.combustion", x, y, mine);
      if (mine) {
        this.trauma(0.18);
        this.ctx.lights.flash(x, y, cat.color("sea.light"), radius + 16, 1, 260);
      }
      return;
    }
    switch (kind) {
      case 16: {
        // Q.E.D.
        this.effects.oneShot("fx-qed", "fx-qed/burst", x, y - 14, mine ? 1 : 0.6, Layer.Glow);
        this.ctx.particles.burst(
          Bit.Spark,
          x,
          y - 10,
          mine ? 12 : 4,
          cat.color("stone.bright"),
          150,
          0,
        );
        if (mine) {
          this.ctx.lights.flash(x, y, cat.color("stone.bright"), 48, 1.3, 300);
        } else if (near) this.ctx.sound.cue("sfx.signature.qed", x, y, false);
        return;
      }
      case 17: {
        // A 치유형 healed its neighbours: a green ring that says "this one first".
        this.ctx.particles.burst(Bit.Mote, x, y - 8, 8, cat.color("grass.light"), 30, 0);
        this.effects.oneShot(
          "fx-pickup",
          "fx-pickup/twinkle",
          x,
          y - 12,
          1,
          Layer.Glow,
          cat.color("grass.light"),
        );
        if (near) this.ctx.sound.cue("sfx.monster.element-water.attack", x, y, false);
        return;
      }
      case 18: {
        const b = this.bodies.get(owner);
        const at = b ?? { x, y };
        this.effects.oneShot(
          "fx-levelup",
          "fx-levelup/burst",
          at.x,
          at.y,
          mine ? 1 : 0.7,
          Layer.Glow,
        );
        this.ctx.particles.burst(
          Bit.Mote,
          at.x,
          at.y - 12,
          mine ? 18 : 6,
          cat.color("gold.light"),
          50,
          0,
        );
        if (mine) this.hooks.moment(Priv.LevelUp);
        return;
      }
      case 19: {
        const b = this.bodies.get(owner);
        this.hooks.elite(b, x, y);
        return;
      }
      case 20: {
        this.effects.oneShot("fx-revive", "fx-revive/glow", x, y, 1, Layer.Glow);
        this.ctx.particles.burst(Bit.Mote, x, y - 10, 10, cat.color("gold.pale"), 40, 0);
        if (near) this.ctx.sound.cue("combat.revive", x, y, mine);
        return;
      }
    }
  }

  /** Others' hits seen as a flash bit: a quiet sound, rate-limited by the mixer. */
  otherHit(b: Body, cls: string): void {
    if (b.cat !== Cat.Monster || !b.art) return;
    this.ctx.sound.hit(
      cls as "math",
      false,
      b.x,
      b.y,
      { heavy: false, crit: false, kill: false },
      "",
      b.art.hitCue,
      b.art.dieCue,
    );
    if (this.ctx.restraint.otherSparks > 0 && Math.random() < this.ctx.restraint.otherSparks) {
      this.effects.oneShot(
        "fx-hit-light",
        "fx-hit-light/hit",
        b.x,
        (b.headY + b.y) / 2,
        this.ctx.restraint.others,
      );
    }
  }
}
