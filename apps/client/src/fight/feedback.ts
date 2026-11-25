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

import type { HitClass } from "@guago/audio";
import { HitFlag, HurtFlag, Priv } from "@guago/shared";
import { type Bodies, type Body, Cat } from "./bodies.ts";
import { CLASS_RAMP } from "./catalog.ts";
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
/** Kills in one snapshot that make one event: a merged burst, a rising note, a nudge. */
const MULTI_KILL = 3;
/** Multi-kills within this of each other climb in pitch, ms. */
const COMBO_MS = 2200;
/** Kill streaks that mark themselves on the player. */
const STREAKS = [10, 25, 50, 100] as const;

/** One of the local player's kills this snapshot, waiting to be shown alone or merged. */
interface Kill {
  x: number;
  y: number;
  head: number;
  id: number;
  amount: number;
  style: NumberStyle;
}

export interface Hit {
  target: number;
  amount: number;
  flags: number;
  slot: number;
  proof: number;
  /** Target's health share after the tick's hits, 0 to 255. */
  hp: number;
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
  /** Whether the local player wears the book with this id. */
  wears(bookId: string): boolean;
  /** The local player's kill streak passed a mark. */
  streak(mark: number): void;
  /** The class of the student in a seat, for the sound of their hits. */
  classOf(slot: number): string;
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
  /** The local player's kills in the snapshot being read, pooled. */
  private readonly kills: Kill[] = [];
  private killCount = 0;
  private comboAt = -1e9;
  private combo = 0;
  /** The last streak mark reached. */
  private streakMark = 0;
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
    b.ownHp = h.hp;
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

    // The number. A kill's waits for the end of the snapshot: several kills at once are one
    // event with one merged total.
    const style = crit ? NumberStyle.Crit : dot || collision ? NumberStyle.Small : NumberStyle.Hit;
    if (kill) {
      this.deferKill(b, h.amount, style);
      // The killing blow throws the body the way it was knocked, or away from the player.
      const kx = Math.hypot(h.kx, h.ky) > 0.01 ? h.kx : x - this.ctx.selfX;
      const ky = Math.hypot(h.kx, h.ky) > 0.01 ? h.ky : y - this.ctx.selfY;
      this.bodies.fling(b, kx, ky, heavy || crit ? 110 : 75);
    } else this.ctx.numbers.show(b.id, x, b.headY - 2, h.amount, style);
    // A heavy blow shoves what stands around the target.
    if ((heavy || crit || qed) && !dot) this.bodies.shove(x, y, qed ? 36 : 22, qed ? 3 : 1.5);

    // Sparks: the class's colour, the hit's weight.
    const color = art?.color ?? cat.color("stone.bright");
    if (blocked) {
      // The block is drawn from the side the hit came from, one of eight.
      const side = Math.atan2(this.ctx.selfY - y, this.ctx.selfX - x);
      const aim = ((Math.round(side / (Math.PI / 4)) % 8) + 8) % 8;
      this.effects.oneShot("fx-shield-block", `fx-shield-block/d${aim}`, x, mid, 1);
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
      // A cone's own mark on each target it hits: 실험 보고서's label, 해부's bleed.
      const own =
        art?.kind === "cone" && art.hit && !art.hit.startsWith("fx-hit-") ? art.hit : null;
      if (own) this.effects.cue(own, x, mid);
    }
    if (collision) this.collision(b, h, book);

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
      // Only the player's own crits light up (Q.E.D. lights with its burst); every other hit
      // would fog the target it lands on.
      if (crit && !qed) this.ctx.lights.strike(x, mid, color, 24, 0.6, 140);
      this.ctx.sound.hit(
        cls,
        true,
        x,
        y,
        { heavy: heavy || collision, crit, kill },
        art?.impact ?? "",
        mon?.hitCue ?? "",
        mon?.dieCue ?? (b.cat === Cat.Player ? "combat.knockout" : ""),
      );
    }
  }

  /**
   * 물리 운동량: a launched monster struck another. The heavy spark as drawn, plum sparks thrown
   * beside it along the knock, a climbing chain; 탄성 충돌 clacks.
   */
  private collision(b: Body, h: Hit, book: number): void {
    const now = this.ctx.now;
    this.chain = now - this.chainAt < CHAIN_MS ? Math.min(3, this.chain + 1) : 1;
    this.chainAt = now;
    const cat = this.ctx.cat;
    const plum = cat.color("plum.light");
    const mid = (b.headY + b.y) / 2;
    const ang = Math.atan2(h.ky, h.kx);
    this.effects.oneShot("fx-hit-heavy", "fx-hit-heavy/hit", b.x, mid, 1);
    if (book >= 0 && this.effects.ownEvolved(book)) {
      const evo = cat.book(book, true).hit;
      if (evo && evo !== cat.book(book).hit) this.effects.oneShot(evo, null, b.x, mid, 1);
    }
    this.ctx.particles.burst(
      Bit.Spark,
      b.x + Math.cos(ang) * 6,
      mid + Math.sin(ang) * 4,
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
  }

  private deferKill(b: Body, amount: number, style: NumberStyle): void {
    let k = this.kills[this.killCount];
    if (!k) {
      k = { x: 0, y: 0, head: 0, id: 0, amount: 0, style: NumberStyle.Hit };
      this.kills.push(k);
    }
    this.killCount++;
    k.x = b.x;
    k.y = b.y;
    k.head = b.headY;
    k.id = b.id;
    k.amount = amount;
    k.style = style;
  }

  /**
   * The end of a snapshot: its kills are shown. A few at once are each their own number; many
   * are one event: a merged burst where they fell, one big total, a note that climbs with each
   * multi-kill in a row, and the view nudged toward them. A kill streak marks itself on the
   * player as it passes 10, 25, 50 and 100.
   */
  flush(): void {
    const n = this.killCount;
    if (n === 0) return;
    this.killCount = 0;
    const cat = this.ctx.cat;
    if (n < MULTI_KILL) {
      for (let i = 0; i < n; i++) {
        const k = this.kills[i] as Kill;
        this.ctx.numbers.show(k.id, k.x, k.head - 2, k.amount, k.style);
      }
    } else {
      let cx = 0;
      let cy = 0;
      let top = Number.POSITIVE_INFINITY;
      let sum = 0;
      for (let i = 0; i < n; i++) {
        const k = this.kills[i] as Kill;
        cx += k.x;
        cy += k.y;
        top = Math.min(top, k.head);
        sum += k.amount;
      }
      cx /= n;
      cy /= n;
      const now = this.ctx.now;
      this.combo = now - this.comboAt < COMBO_MS ? this.combo + 1 : 0;
      this.comboAt = now;
      const ramp = CLASS_RAMP[this.ctx.selfClass as HitClass] ?? CLASS_RAMP.math;
      const color = cat.color(ramp[0]);
      const big = n >= 6 ? 2 : 1;
      this.effects.oneShot("fx-hit-crit", "fx-hit-crit/hit", cx, cy - 8, 1, Layer.Glow, big);
      this.ctx.particles.burst(Bit.Spark, cx, cy - 6, 10 + n * 2, color, 170, 0);
      this.ctx.particles.burst(Bit.Spark, cx, cy - 6, 6, cat.color("stone.bright"), 140, 0);
      this.ctx.particles.burst(Bit.Debris, cx, cy, 4 + n, cat.color("clay.light"), 90, 3);
      this.bodies.shove(cx, cy, 40 + n * 4, 3);
      this.ctx.numbers.total(cx, top - 4, sum);
      this.ctx.lights.strike(cx, cy - 8, color, 32, 0.8, 220);
      this.ctx.sound.multiKill(this.ctx.selfClass, n, this.combo, cx, cy);
      this.trauma(0.12 + Math.min(0.2, n * 0.025));
      const dx = cx - this.ctx.selfX;
      const dy = cy - this.ctx.selfY;
      const d = Math.hypot(dx, dy) || 1;
      this.ctx.trauma.nudge((dx / d) * 2, (dy / d) * 2);
    }
    const streak = this.ctx.sound.killStreak;
    if (streak < this.streakMark) this.streakMark = 0;
    for (const mark of STREAKS) {
      if (streak >= mark && this.streakMark < mark) {
        this.streakMark = mark;
        this.hooks.streak(mark);
      }
    }
    if (streak >= 200 && streak - this.streakMark >= 100) {
      this.streakMark = streak - (streak % 100);
      this.hooks.streak(this.streakMark);
    }
  }

  /** The local player was hit. */
  hurt(source: number, amount: number, flags: number): void {
    const self = this.bodies.self;
    this.counts.hurts++;
    const x = this.ctx.selfX;
    const y = this.ctx.selfY;
    const cat = this.ctx.cat;
    if (flags & HurtFlag.Shielded && amount <= 0) {
      this.effects.oneShot("fx-spark", "fx-spark/hit", x, y - 12, 1);
      this.ctx.sound.self("sfx.reaction.neutralize");
      return;
    }
    if (self) this.bodies.hurt(self);
    const share = Math.min(1, amount / Math.max(1, this.hooks.maxHp()));
    this.trauma(TRAUMA.hurtMin + (TRAUMA.hurtMax - TRAUMA.hurtMin) * Math.min(1, share * 4));
    this.ctx.numbers.show(-1, x, y - 26, amount, NumberStyle.Hurt);
    this.ctx.particles.burst(Bit.Spark, x, y - 10, 4, cat.color("red.light"), 90, 0);
    const src = this.bodies.get(source);
    if (src?.cat === Cat.Player) {
      // A duel: the other student's class lands on the player, heavy, with the hit's own spark.
      this.ctx.sound.hit(
        this.hooks.classOf(src.slot) as HitClass,
        false,
        src.x,
        src.y,
        { heavy: true, crit: false, kill: (flags & HurtFlag.Down) !== 0 },
        "",
        "",
        "",
      );
      this.effects.oneShot("fx-hit-heavy", "fx-hit-heavy/hit", x, y - 12, 1);
      const d = Math.hypot(x - src.x, y - src.y) || 1;
      this.ctx.trauma.nudge(((x - src.x) / d) * 1.5, ((y - src.y) / d) * 1.5);
      return;
    }
    const cue =
      src?.art?.attackCue &&
      flags & (HurtFlag.Charge | HurtFlag.Blast | HurtFlag.Slam | HurtFlag.Shot)
        ? src.art.attackCue
        : (src?.art?.hitCue ?? "sfx.monster.odap.hit");
    this.ctx.sound.self(cue);
    this.ctx.sound.self("hit.physics.light");
    if (flags & (HurtFlag.Blast | HurtFlag.Slam)) {
      this.effects.oneShot("fx-hit-heavy", "fx-hit-heavy/hit", x, y - 10, 1);
    }
  }

  /** A monster's death pop begins: the burst, debris, and the sound when it was not ours. */
  died(b: Body): void {
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
    }
  }

  /** An effect of the local player's landed: heavy ones shake the ground. */
  impact(a: Active, x: number, y: number): void {
    if (!a.mine || !a.art) return;
    const kind = a.art.kind;
    if (kind === "telegraph") {
      this.trauma(TRAUMA.land * 1.4);
      this.ctx.particles.burst(Bit.Debris, x, y, 6, this.ctx.cat.color("clay.mid"), 70, 2);
    } else if (a.art.id === "holiday-physics") {
      this.trauma(TRAUMA.land);
      this.ctx.particles.burst(Bit.Debris, x, y, 4, this.ctx.cat.color("stone.light"), 60, 1);
    }
  }

  /** A monster's tell fired: a bomber's blast, the golem's shockwave, a charge's kick-off. */
  fired(a: Active): void {
    this.ctx.sound.cue("combat.telegraph.fire", a.x, a.y, true);
    const cat = this.ctx.cat;
    if (a.def === 5) {
      this.effects.oneShot("fx-burst", "fx-burst/blast", a.x, a.y, 1, Layer.Ground);
      this.ctx.particles.burst(Bit.Debris, a.x, a.y, 6, cat.color("clay.light"), 80, 2);
    } else if (a.def === 9) {
      // The slam's ring is drawn per radius: it runs out through the drawn sizes and stops at
      // the one nearest the slam's (the enraged slam reaches the larger ones).
      const stop = this.effects.nearest(cat.frames("fx-shockwave", "out"), a.radius);
      this.effects.oneShot(
        "fx-shockwave",
        "fx-shockwave/out",
        a.x,
        a.y,
        1,
        Layer.Ground,
        1,
        0,
        null,
        stop,
      );
    } else if (a.def === 1) {
      // Dust kicked up behind the charger: drawn for a charge to the right, flipped for left.
      const dust = this.effects.oneShot("fx-dust", null, a.x, a.y, 1, Layer.Ground);
      dust?.setFlipX(Math.cos(a.angle) < 0);
    }
    const d = Math.hypot(a.x - this.ctx.selfX, a.y - this.ctx.selfY);
    if (d < 120) this.trauma(0.12 * (1 - d / 120));
  }

  /** A public burst. */
  burst(
    kind: number,
    x: number,
    y: number,
    _radius: number,
    owner: number,
    chain: readonly number[] = [],
  ): void {
    const cat = this.ctx.cat;
    const mine = owner === this.ctx.selfId && owner !== 0;
    const near = Math.hypot(x - this.ctx.selfX, y - this.ctx.selfY) < 260;
    if (kind < 16) {
      // Reactions are drawn at the size they burst at, ×1. A burning one (연소) holds its fire
      // for the burst's 0.6 s, then goes out.
      const r = cat.reactions[kind];
      const alpha = mine ? 1 : 0.6;
      const vfx = r?.vfx ?? null;
      const anims = vfx ? cat.meta.sprites[vfx]?.anims : undefined;
      if (vfx && anims) {
        const first = Object.keys(anims)[0] ?? "";
        const out = anims.out ? `${vfx}/out` : null;
        if (anims[first]?.loop)
          this.effects.oneShot(vfx, null, x, y, alpha, Layer.Ground, 1, 600, out);
        else this.effects.oneShot(vfx, null, x, y, alpha, Layer.Ground);
      } else this.effects.oneShot("fx-tome-impact", "fx-tome-impact/land", x, y, alpha);
      this.ctx.particles.burst(Bit.Spark, x, y - 6, mine ? 8 : 3, cat.color("sea.light"), 120, 0);
      if (mine || near) this.ctx.sound.cue(r?.sfx ?? "sfx.reaction.combustion", x, y, mine);
      if (mine) this.trauma(0.18);
      return;
    }
    switch (kind) {
      case 16: {
        // Q.E.D.: the big stamp when the local player's 증명 노트 is behind it.
        const big = mine && this.hooks.wears("proof-note") && cat.has("fx-qed-big");
        const qed = big ? "fx-qed-big" : "fx-qed";
        this.effects.oneShot(qed, `${qed}/burst`, x, y - 14, mine ? 1 : 0.6);
        this.ctx.particles.burst(
          Bit.Spark,
          x,
          y - 10,
          mine ? 12 : 4,
          cat.color("stone.bright"),
          150,
          0,
        );
        if (mine) this.ctx.lights.strike(x, y - 10, cat.color("stone.bright"), 24, 0.6, 200);
        else if (near) this.ctx.sound.cue("sfx.signature.qed", x, y, false);
        // 완전한 증명: the proof carries on to its neighbours along dashed chalk links, and each
        // is stamped where it stands.
        if (chain.length > 0 && cat.has("evo-complete-proof")) this.proofLinks(x, y, chain, mine);
        return;
      }
      case 17: {
        // A 치유형 healed its neighbours: a rose glow that says "this one first". Green is
        // 생명's, never a monster's.
        this.ctx.particles.burst(Bit.Mote, x, y - 8, 8, cat.color("rose.light"), 30, 0);
        this.effects.oneShot("fx-heal", "fx-heal/heal", x, y, 1, Layer.Glow, 1, 800);
        if (near) this.ctx.sound.cue("sfx.monster.element-water.attack", x, y, false);
        return;
      }
      case 18: {
        const b = this.bodies.get(owner);
        const at = b ?? { x, y };
        this.effects.oneShot("fx-levelup", "fx-levelup/burst", at.x, at.y, mine ? 1 : 0.7);
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
        this.effects.oneShot("fx-revive", "fx-revive/glow", x, y, 1, Layer.Glow, 1, 1000);
        this.ctx.particles.burst(Bit.Mote, x, y - 10, 10, cat.color("gold.pale"), 40, 0);
        if (near) this.ctx.sound.cue("combat.revive", x, y, mine);
        return;
      }
    }
  }

  /** Links from a Q.E.D. to the neighbours it carried to: link pieces every 9 px, a stamp on each. */
  private proofLinks(x: number, y: number, chain: readonly number[], mine: boolean): void {
    const alpha = mine ? 1 : this.ctx.restraint.others + 0.3;
    for (const id of chain) {
      const b = this.bodies.get(id);
      if (!b) continue;
      const tx = b.x;
      const ty = (b.headY + b.y) / 2;
      const dx = tx - x;
      const dy = ty - (y - 10);
      const len = Math.hypot(dx, dy);
      const ang = Math.atan2(dy, dx);
      const n = Math.min(10, Math.floor(len / 9));
      for (let i = 1; i < n; i++) {
        const f = i / n;
        this.effects
          .oneShot(
            "evo-complete-proof",
            "evo-complete-proof/link",
            x + dx * f,
            y - 10 + dy * f,
            alpha,
          )
          ?.setRotation(ang);
      }
      this.effects.oneShot("evo-complete-proof", "evo-complete-proof/stamp", tx, ty - 6, alpha);
    }
  }

  /** Others' hits seen as a flash bit: a quiet sound, rate-limited by the mixer. */
  otherHit(b: Body, cls: string): void {
    if (b.cat === Cat.Minion) return;
    this.ctx.sound.hit(
      cls as "math",
      false,
      b.x,
      b.y,
      { heavy: b.cat === Cat.Player, crit: false, kill: false },
      "",
      b.art?.hitCue ?? "",
      b.art?.dieCue ?? "",
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
