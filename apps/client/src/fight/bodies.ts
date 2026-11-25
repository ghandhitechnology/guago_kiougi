/**
 * Everything in the fight that has a body: monsters, other players, minions and the local
 * player. Positions come from the snapshot's dead-reckoned ticks through a `Track`, sampled a
 * little in the past; each body has its own clock offset so hitstop can freeze one target and
 * let it catch up afterwards without a snap. Sprites are pooled and handed to the map view, which
 * sorts, shadows and lights them.
 */
import { Leave, MState, TICK_MS, type WireMember, WireMinion, WirePlayer } from "@guago/shared";
import * as Phaser from "phaser";
import type { MonsterArt } from "./catalog.ts";
import { COMBAT } from "./catalog.ts";
import type { FightContext } from "./context.ts";
import { Bit } from "./particles.ts";
import { type Point, Track } from "./track.ts";

export const Cat = { Monster: 0, Player: 1, Minion: 2 } as const;
export type Cat = (typeof Cat)[keyof typeof Cat];

/** Player state bits on the wire. */
export const PState = { Down: 4, Rolling: 8, Reviving: 16 } as const;

/** After hitstop a body runs this much faster than real time until it has caught up. */
const CATCH_UP = 1.2;
/** Squash spring: stiffness and damping per second. */
const SPRING_K = 320;
const SPRING_C = 16;
/** A monster rising out of the ground takes this long. */
const ARRIVE_MS = 380;
/** A despawned monster fades this long. */
const FADE_MS = 220;

const DIRS = ["down", "up", "side", "side"] as const;
/** Every rig frame name by facing and animation, made once so drawing a student allocates nothing. */
interface RigFrames {
  readonly idle: readonly string[];
  readonly walk: readonly string[];
  readonly attack: readonly string[];
  readonly hit: readonly string[];
  readonly ko: readonly string[];
}
const RIG_FRAMES: readonly RigFrames[] = DIRS.map((d) => {
  const names = (prefix: string, n: number) =>
    Array.from({ length: n }, (_, i) => `${d}/${prefix}${i}`);
  return {
    idle: names("idle", 2),
    walk: names("walk", 4),
    attack: names("attack", 4),
    hit: [`${d}/hit`],
    ko: [`${d}/ko`],
  };
});
/** Walk cycle length in px: four frames at 8 fps at the base 60 px/s. */
const STRIDE = 30;
const ATTACK_MS = 300;
const HURT_MS = 140;

const scratch: Point = { x: 0, y: 0 };

export class Body {
  id = 0;
  kind = 0;
  slot = 0;
  cat: Cat = Cat.Monster;
  self = false;
  member: WireMember | null = null;
  readonly track = new Track();
  sprite!: Phaser.GameObjects.Sprite;
  inView = false;
  /** Drawn feet. */
  x = 0;
  y = 0;
  /** Drawn movement last frame, px. */
  dx = 0;
  dy = 0;
  state = 0;
  hp = 255;
  status = 0;
  elite = false;
  art: MonsterArt | null = null;
  anim = "";
  // Hit feel.
  stopUntil = 0;
  /**
   * Hitstop asked for by a hit that arrived between frames, ms: it starts on the next drawn
   * frame, so a 50 ms stop holds three frames at 60 fps and not two.
   */
  stopPending = 0;
  stopHeavy = false;
  lag = 0;
  /** Frames of flash still to draw. */
  flash = 0;
  flashMode = 0;
  /** The flash tint is on the sprite and comes off on the first frame after it. */
  flashing = false;
  squash = 0;
  squashV = 0;
  /** Kick in pixels on top of the track, from the last hit, decaying. */
  kickX = 0;
  kickY = 0;
  lastFrame = -1;
  /** 0 alive, 1 died and waiting for its hitstop, 2 popping, 3 fading out. */
  dying = 0;
  doneAt = 0;
  /** Tick it died at: it pops when the world clock gets there. */
  dieTick = 0;
  arriveAt = 0;
  /** Hit by the local player until then, ms: its statuses and stacks show. */
  mineUntil = 0;
  /** Health share after the local player's last hit on it (the hit record's), 255 unknown. */
  ownHp = 255;
  proof = 0;
  proofAt = 0;
  // Students.
  texture = "";
  walk = 0;
  idleAt = 0;
  attackAt = -1e9;
  hurtAt = -1e9;
  downSince = 0;
  facing = 0;
  /** Last fuse blink state, and when the current state began, ms. */
  blink = false;
  stateAt = 0;
  aura: Phaser.GameObjects.Sprite | null = null;
  /** The local player's ring on the ground. */
  ring: Phaser.GameObjects.Sprite | null = null;
  stars: Phaser.GameObjects.Sprite | null = null;
  glow: Phaser.GameObjects.Sprite | null = null;

  get down(): boolean {
    return this.cat === Cat.Player && (this.state & PState.Down) !== 0;
  }

  /** Top of the head, for numbers and bars. */
  get headY(): number {
    if (this.cat === Cat.Player) return this.y - 24;
    if (this.cat === Cat.Minion) return this.y - 12;
    const h = this.art?.height ?? 16;
    return this.y - (this.elite ? h * 2 - 4 : h - 2);
  }

  get mstate(): number {
    return this.state & 15;
  }
}

export interface BodiesHooks {
  /** Texture of the look a player slot wears. */
  look(slot: number): string;
  /** A monster's death pop starts: bursts, debris and the sound of other players' kills. */
  died(b: Body): void;
  /** A body is about to leave for good. */
  gone(b: Body): void;
  /** A student's foot landed. */
  step(b: Body): void;
}

export class Bodies {
  readonly byId = new Map<number, Body>();
  private readonly pool: Body[] = [];
  private readonly sprites: Phaser.GameObjects.Sprite[] = [];
  private readonly ctx: FightContext;
  private readonly hooks: BodiesHooks;
  /** The local player's body, once the snapshot has shown it. */
  self: Body | null = null;
  monsters = 0;
  players = 0;

  constructor(ctx: FightContext, hooks: BodiesHooks) {
    this.ctx = ctx;
    this.hooks = hooks;
  }

  private sprite(): Phaser.GameObjects.Sprite {
    const s = this.sprites.pop();
    if (s) return s;
    return new Phaser.GameObjects.Sprite(this.ctx.scene, 0, 0, COMBAT);
  }

  private release(s: Phaser.GameObjects.Sprite): void {
    s.anims.stop();
    s.setVisible(false).clearTint().setAlpha(1).setScale(1).setFlipX(false).setRotation(0);
    this.sprites.push(s);
  }

  get(id: number): Body | undefined {
    return this.byId.get(id);
  }

  /** The local player's slot became known: its body, if already in view, is the local player's. */
  markSelf(slot: number): void {
    for (const b of this.byId.values()) {
      if (b.cat !== Cat.Player || b.self === (b.slot === slot)) continue;
      b.self = b.slot === slot;
      if (b.self) this.self = b;
      else if (this.self === b) this.self = null;
    }
  }

  /** A member came into view. */
  enter(m: WireMember, tick: number): void {
    if (m.kind === 255) return;
    const old = this.byId.get(m.id);
    if (old) this.drop(old);
    const b = this.pool.pop() ?? new Body();
    b.id = m.id;
    b.kind = m.kind;
    b.slot = m.slot;
    b.member = m;
    b.cat = m.kind === WirePlayer ? Cat.Player : m.kind === WireMinion ? Cat.Minion : Cat.Monster;
    b.self = b.cat === Cat.Player && m.slot === this.ctx.selfSlot;
    b.track.reset();
    b.track.push(tick, m.qx / 4, m.qy / 4);
    b.x = m.qx / 4;
    b.y = m.qy / 4;
    b.dx = 0;
    b.dy = 0;
    b.state = m.state;
    b.hp = m.hp;
    b.status = m.status;
    b.elite = b.cat === Cat.Monster && (m.state & 32) !== 0;
    b.art = b.cat === Cat.Monster ? this.ctx.cat.monster(m.kind) : null;
    b.anim = "";
    b.stopUntil = 0;
    b.stopPending = 0;
    b.lag = 0;
    b.flash = 0;
    b.flashing = false;
    b.squash = 0;
    b.squashV = 0;
    b.kickX = 0;
    b.kickY = 0;
    b.lastFrame = -1;
    b.dying = 0;
    b.mineUntil = 0;
    b.ownHp = 255;
    b.proof = 0;
    b.walk = Math.random() * STRIDE;
    b.idleAt = Math.random() * 1000;
    b.attackAt = -1e9;
    b.hurtAt = -1e9;
    b.downSince = 0;
    b.facing = m.state & 3;
    b.texture = "";
    b.arriveAt = b.cat === Cat.Monster && (m.state & 15) === MState.Arrive ? this.ctx.now : 0;
    this.byId.set(b.id, b);
    if (b.self) this.self = b;
    if (b.cat === Cat.Monster) this.monsters++;
    else if (b.cat === Cat.Player) this.players++;
    // The local player is drawn by the movement code's prediction; it still gets a body here
    // so its state bits, effects and feedback have somewhere to live.
    const s = this.sprite();
    b.sprite = s;
    this.dress(b);
    s.setVisible(true).setAlpha(1);
    const shadow =
      b.cat === Cat.Monster && b.art
        ? b.elite
          ? "shadow-l"
          : b.art.shadow
        : b.cat === Cat.Minion
          ? "shadow-s"
          : "shadow-m";
    this.ctx.view.addEntity(s, {
      shadow: { texture: "effects", frame: this.ctx.cat.frame(shadow) },
      focus: b.self,
    });
    b.inView = true;
    if (b.arriveAt > 0) {
      this.ctx.particles.burst(Bit.Debris, b.x, b.y, 3, this.ctx.cat.color("clay.light"), 30, 1);
    }
  }

  /** Textures, frames and animation for a body as it is now. */
  private dress(b: Body): void {
    const s = b.sprite;
    const cat = this.ctx.cat;
    if (b.cat === Cat.Monster && b.art) {
      const name = b.elite && b.art.elite ? b.art.elite : b.art.sprite;
      s.setTexture(cat.atlas(name), cat.frame(name));
      this.playState(b);
      s.anims.setProgress(Math.random());
      if (b.elite) this.addAura(b);
    } else if (b.cat === Cat.Minion) {
      s.setTexture(COMBAT, cat.frame("fx-cell"));
      s.play("fx-cell/idle");
      s.anims.setProgress(Math.random());
      const owner = this.ownerOf(b);
      s.setAlpha(owner ? 1 : this.ctx.restraint.others + 0.25);
    } else {
      b.texture = this.hooks.look(b.slot);
      s.setTexture(b.texture, RIG_FRAMES[0]?.idle[0]);
    }
  }

  private ownerOf(b: Body): boolean {
    return b.slot === this.ctx.selfSlot;
  }

  /** The animation for a monster's state. */
  private playState(b: Body): void {
    if (!b.art) return;
    const anims = b.elite && b.art.eliteAnims ? b.art.eliteAnims : b.art.anims;
    const key = anims[b.state & 15] ?? anims[MState.Move] ?? "";
    if (key && key !== b.anim) {
      b.anim = key;
      b.sprite.play(key, true);
      b.lastFrame = -1;
    }
  }

  private addAura(b: Body): void {
    if (b.aura) return;
    const a = this.sprite();
    a.setTexture(COMBAT, this.ctx.cat.frame("fx-elite-aura")).play("fx-elite-aura/aura");
    a.setVisible(true).setAlpha(0.9);
    // Sorted with the elite by its feet, a hair behind it.
    this.ctx.view.addEntity(a, { shadow: false, lit: false });
    b.aura = a;
  }

  /** A member left view. */
  leave(m: WireMember, reason: number, tick: number): void {
    const b = this.byId.get(m.id);
    if (!b) return;
    if (reason === Leave.Died && b.cat === Cat.Monster) {
      b.dying = 1;
      b.doneAt = this.ctx.now;
      b.dieTick = tick;
      b.track.push(tick, m.qx / 4, m.qy / 4);
      return;
    }
    if (reason === Leave.Gone && b.cat === Cat.Monster) {
      b.dying = 3;
      b.doneAt = this.ctx.now + FADE_MS;
      return;
    }
    this.drop(b);
  }

  /** Takes a body out for good. */
  private drop(b: Body): void {
    this.hooks.gone(b);
    this.byId.delete(b.id);
    if (b.cat === Cat.Monster) this.monsters--;
    else if (b.cat === Cat.Player) this.players--;
    if (this.self === b) this.self = null;
    for (const extra of [b.aura, b.ring, b.stars, b.glow]) {
      if (!extra) continue;
      this.ctx.view.removeEntity(extra);
      this.release(extra);
    }
    b.aura = null;
    b.ring = null;
    b.stars = null;
    b.glow = null;
    if (b.inView) this.ctx.view.removeEntity(b.sprite);
    b.inView = false;
    this.release(b.sprite);
    b.member = null;
    this.pool.push(b);
  }

  /** After a snapshot: every member's position for this tick, and what changed. */
  sync(tick: number, members: ReadonlyMap<number, WireMember>): void {
    for (const m of members.values()) {
      const b = this.byId.get(m.id);
      if (!b || b.dying) continue;
      b.member = m;
      b.track.push(tick, m.qx / 4, m.qy / 4);
      if (m.state !== b.state) this.stateChanged(b, m.state);
      if (m.hp !== b.hp) b.hp = m.hp;
      if (m.status !== b.status) b.status = m.status;
      if (m.flash && b.flash <= 0 && b.cat === Cat.Monster) {
        // Someone hit it; the local player's own hits upgrade this when their record arrives.
        b.flash = 2;
        b.flashMode = 1;
      }
    }
  }

  private stateChanged(b: Body, state: number): void {
    const before = b.state;
    b.state = state;
    if (b.cat === Cat.Monster) {
      const elite = (state & 32) !== 0;
      if (elite !== b.elite) {
        b.elite = elite;
        b.anim = "";
        this.dress(b);
      }
      const from = before & 15;
      const to = state & 15;
      if (from !== to) {
        b.stateAt = this.ctx.now;
        this.playState(b);
        if (to === MState.Windup || to === MState.Fuse) this.kick(b, -0.6);
        else if (to === MState.Charge || to === MState.Rush) this.kick(b, -0.9);
        else if (from === MState.Charge || to === MState.Slam) this.kick(b, 1);
        else if (from === MState.Arrive) b.arriveAt = 0;
      }
    } else if (b.cat === Cat.Player) {
      const wasDown = (before & PState.Down) !== 0;
      const isDown = (state & PState.Down) !== 0;
      if (isDown && !wasDown) {
        b.downSince = this.ctx.now;
        this.kick(b, 1.2);
      } else if (!isDown && wasDown) {
        this.kick(b, -1.2);
      }
      if ((state & PState.Rolling) !== 0 && (before & PState.Rolling) === 0) this.kick(b, -0.7);
    } else if (b.cat === Cat.Minion && state !== before) {
      this.kick(b, 0.6);
    }
  }

  /** Squash (positive) or stretch (negative) impulse. */
  kick(b: Body, amount: number): void {
    b.squashV += amount * 9;
  }

  /** The local player hit this body: white flash, target-only hitstop, a kick in the knock direction. */
  struck(b: Body, stopMs: number, heavy: boolean, kx: number, ky: number): void {
    b.flash = 2;
    b.flashMode = 0;
    if (stopMs > b.stopPending) {
      if (b.stopUntil <= this.ctx.now) b.sprite.anims.pause();
      b.stopPending = stopMs;
      b.stopHeavy = heavy;
    }
    const k = Math.hypot(kx, ky);
    if (k > 0.01) {
      const push = Math.min(3, 0.6 + k * 0.5);
      b.kickX = (kx / k) * push;
      b.kickY = (ky / k) * push * 0.6;
    }
    this.kick(b, heavy ? 0.9 : 0.5);
    b.mineUntil = this.ctx.now + 4000;
  }

  /** The local player was hurt. */
  hurt(b: Body): void {
    b.flash = 3;
    b.flashMode = 2;
    b.hurtAt = this.ctx.now;
    this.kick(b, 0.8);
  }

  /** A student starts a cast. */
  attack(b: Body): void {
    b.attackAt = this.ctx.now;
  }

  update(dtMs: number, renderTick: number): void {
    const now = this.ctx.now;
    const dtTicks = dtMs / TICK_MS;
    const dt = Math.min(0.05, dtMs / 1000);
    for (const b of this.byId.values()) {
      if (b.stopPending > 0) {
        // A hair under, so a stop of exactly three frames never rounds up to four.
        b.stopUntil = Math.max(b.stopUntil, now + b.stopPending - 1);
        b.stopPending = 0;
      }
      // Position.
      const frozen = now < b.stopUntil;
      if (b.self) {
        const px = b.x;
        const py = b.y;
        b.x = this.ctx.selfX;
        b.y = this.ctx.selfY;
        b.dx = b.x - px;
        b.dy = b.y - py;
      } else if (frozen) {
        b.lag += dtTicks;
        b.dx = 0;
        b.dy = 0;
      } else if (b.dying !== 2) {
        if (b.lag > 0) b.lag = Math.max(0, b.lag - dtTicks * (CATCH_UP - 1));
        b.track.sample(renderTick - b.lag, scratch);
        b.dx = scratch.x - b.x;
        b.dy = scratch.y - b.y;
        b.x = scratch.x;
        b.y = scratch.y;
      }
      if (!frozen && b.stopUntil > 0) {
        b.stopUntil = 0;
        b.sprite.anims.resume();
      }
      // Squash spring.
      b.squashV += (-SPRING_K * b.squash - SPRING_C * b.squashV) * dt;
      b.squash += b.squashV * dt;
      if (Math.abs(b.squash) < 0.002 && Math.abs(b.squashV) < 0.02) {
        b.squash = 0;
        b.squashV = 0;
      }
      b.kickX *= 0.82;
      b.kickY *= 0.82;
      if (b.cat === Cat.Monster) this.drawMonster(b, frozen);
      else if (b.cat === Cat.Player) this.drawStudent(b, dtMs);
      else this.drawMinion(b);
      this.drawFlash(b);
    }
    // Deaths and fades that are due.
    for (const b of this.byId.values()) {
      if (
        b.dying === 1 &&
        now >= b.stopUntil &&
        (this.ctx.tick >= b.dieTick - 0.5 || now - b.doneAt > 400)
      )
        this.pop(b);
      else if ((b.dying === 2 || b.dying === 3) && now >= b.doneAt) this.drop(b);
    }
  }

  private drawMonster(b: Body, frozen: boolean): void {
    const s = b.sprite;
    const now = this.ctx.now;
    const ms = b.state & 15;
    let sq = b.squash;
    if (!frozen && b.dying === 0) {
      // Hops land with a squash; wind-ups shiver tall; charges stretch along the run.
      if (b.art?.hops && ms === MState.Move) {
        const f = s.anims.currentFrame?.index ?? 0;
        if (f !== b.lastFrame) {
          if (f === 1 && b.lastFrame > 1) b.squashV += 3.2;
          b.lastFrame = f;
        }
      }
      if (ms === MState.Windup || ms === MState.Fire || ms === MState.Cast)
        sq -= 0.1 + 0.05 * Math.sin(now * 0.06);
      else if (ms === MState.Fuse) sq += 0.08 + 0.06 * Math.sin(now * 0.05);
      else if (ms === MState.Charge || ms === MState.Rush) sq -= 0.16;
    }
    let sx = 1 + sq * 0.28;
    let sy = 1 - sq * 0.28;
    if (ms === MState.Charge || ms === MState.Rush) {
      // A run stretches along the way it goes, not up.
      const t = sx;
      sx = sy;
      sy = t;
    }
    if (b.arriveAt > 0) {
      const f = Math.min(1, (now - b.arriveAt) / ARRIVE_MS);
      sy *= 0.15 + 0.85 * f * (2 - f);
      if (f >= 1) b.arriveAt = 0;
    }
    if (b.dying === 3) s.setAlpha(Math.max(0, (b.doneAt - now) / FADE_MS));
    const shake = frozen && b.stopHeavy ? ((now / 16) & 1 ? 1 : -1) : 0;
    s.setScale(sx, sy);
    s.setFlipX((b.state & 16) === 0);
    s.setPosition(Math.round(b.x + b.kickX + shake), Math.round(b.y + b.kickY));
    if (b.aura) {
      b.aura.setPosition(s.x, s.y - 0.01);
      b.aura.setVisible(b.dying === 0);
    }
    // A fuse blinks faster as it burns down.
    if (ms === MState.Fuse && b.dying === 0 && b.flash <= 0) {
      // The blink rate climbs from 6 to 20 a second over the fuse.
      const t = (now - b.stateAt) / 1000;
      const on = Math.sin(2 * Math.PI * (6 * t + 9 * t * t)) > 0.3;
      if (on !== b.blink) {
        b.blink = on;
        if (on) s.setTint(0xffffff).setTintMode(Phaser.TintModes.ADD);
        else s.clearTint();
      }
    } else if (b.blink) {
      b.blink = false;
      s.clearTint();
    }
  }

  private drawStudent(b: Body, dtMs: number): void {
    const s = b.sprite;
    const now = this.ctx.now;
    b.facing = b.self ? this.ctx.selfFacing : b.state & 3;
    const rig = RIG_FRAMES[b.facing] ?? (RIG_FRAMES[0] as RigFrames);
    const moved = Math.hypot(b.dx, b.dy);
    let frames: readonly string[] | undefined;
    let i = 0;
    const down = (b.state & PState.Down) !== 0;
    if (down) {
      frames = rig.ko;
    } else if (now - b.attackAt < ATTACK_MS) {
      frames = rig.attack;
      i = Math.min(3, Math.floor(((now - b.attackAt) / ATTACK_MS) * 4));
    } else if (now - b.hurtAt < HURT_MS) {
      frames = rig.hit;
    } else if (b.self && this.ctx.selfPose && moved <= 0.02) {
      // A story scene's pose (`FightView.poseSelf`), held on its last frame.
      const pose = this.ctx.selfPose;
      frames = pose.frames[b.facing];
      const n = frames?.length ?? 1;
      i = Math.min(n - 1, Math.floor(((now - pose.since) * pose.fps) / 1000));
    } else if (moved > 0.02) {
      if (b.self) this.ctx.selfPose = undefined;
      const before = Math.floor((b.walk / STRIDE) * 4);
      b.walk = (b.walk + moved) % STRIDE;
      frames = rig.walk;
      i = Math.floor((b.walk / STRIDE) * 4);
      if (i !== before && i % 2 === 0) this.hooks.step(b);
      b.idleAt = now;
    } else {
      frames = rig.idle;
      i = Math.floor((now - b.idleAt) / 500) % 2;
    }
    const tex = this.hooks.look(b.slot);
    if (tex !== b.texture) {
      b.texture = tex;
      s.setTexture(tex);
    }
    const frame = frames?.[i];
    if (frame && s.frame.name !== frame) s.setFrame(frame, false, false);
    const sq = b.squash;
    // An emote's tween owns the scale while it plays.
    if (!this.ctx.scene.tweens.isTweening(s)) s.setScale(1 + sq * 0.22, 1 - sq * 0.22);
    s.setFlipX(b.facing === 2);
    s.setPosition(Math.round(b.x + b.kickX), Math.round(b.y + b.kickY));
    // Others fade a little so the local player always reads first, who also stands in a ring.
    s.setAlpha(b.self ? 1 : 0.92);
    if (b.self) this.selfRing(b);
    this.downMarks(b, down);
    void dtMs;
  }

  private selfRing(b: Body): void {
    if (!b.ring) {
      const r = this.sprite();
      r.setTexture(COMBAT, this.ctx.cat.frame("self-ring")).setVisible(true).setAlpha(0.9);
      this.ctx.view.addEntity(r, { shadow: false, lit: false });
      b.ring = r;
    }
    // A hair above the feet in the sort, so the ring lies under its student.
    b.ring.setPosition(Math.round(b.x), Math.round(b.y) - 0.02);
  }

  /** Stars over a downed student and the glow of a revive in progress. */
  private downMarks(b: Body, down: boolean): void {
    if (down && !b.stars) {
      const st = this.sprite();
      st.setTexture(COMBAT, this.ctx.cat.frame("fx-ko-stars")).play("fx-ko-stars/spin");
      st.setVisible(true);
      this.ctx.view.addEffect(st);
      b.stars = st;
    } else if (!down && b.stars) {
      this.ctx.view.removeEntity(b.stars);
      b.stars.setVisible(false);
      this.release(b.stars);
      b.stars = null;
    }
    if (b.stars) b.stars.setPosition(b.sprite.x, b.sprite.y - 14);
    const reviving = down && (b.state & PState.Reviving) !== 0;
    if (reviving && !b.glow) {
      const g = this.sprite();
      g.setTexture(COMBAT, this.ctx.cat.frame("fx-revive")).play("fx-revive/glow");
      g.setVisible(true);
      this.ctx.view.addEffect(g);
      b.glow = g;
    } else if (!reviving && b.glow) {
      b.glow.setVisible(false);
      this.release(b.glow);
      b.glow = null;
    }
    if (b.glow) b.glow.setPosition(b.sprite.x, b.sprite.y + 2);
  }

  private drawMinion(b: Body): void {
    const s = b.sprite;
    const moving = Math.hypot(b.dx, b.dy) > 0.05;
    const key = moving ? "fx-cell/move" : "fx-cell/idle";
    if (b.anim !== key) {
      b.anim = key;
      s.play(key, true);
    }
    if (Math.abs(b.dx) > 0.05) s.setFlipX(b.dx < 0);
    s.setScale(1 + b.squash * 0.25, 1 - b.squash * 0.25);
    s.setPosition(Math.round(b.x), Math.round(b.y));
  }

  /**
   * The flash, drawn for exactly `flash` frames (PLAN §6: two for a hit): the player's own hit is
   * solid white, a hurt solid red, anyone else's hit a softer lift.
   */
  private drawFlash(b: Body): void {
    const s = b.sprite;
    if (b.flash <= 0) {
      if (b.flashing) {
        b.flashing = false;
        if (!b.blink) s.clearTint();
      }
      return;
    }
    b.flash--;
    b.flashing = true;
    if (b.flashMode === 0) s.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    else if (b.flashMode === 2)
      s.setTint(this.ctx.cat.color("red.light")).setTintMode(Phaser.TintModes.FILL);
    else s.setTint(0x505050).setTintMode(Phaser.TintModes.ADD);
  }

  /** The death pop: the monster's own three frames, a burst, debris; the body goes when it ends. */
  private pop(b: Body): void {
    const art = b.art;
    b.dying = 2;
    const s = b.sprite;
    s.clearTint();
    s.anims.resume();
    const die = b.elite ? (art?.eliteDie ?? art?.die) : art?.die;
    let ms = 220;
    if (die) {
      s.play(die);
      const a = s.anims.currentAnim;
      if (a) ms = (a.frames.length / Math.max(1, a.frameRate)) * 1000;
    } else s.setVisible(false);
    b.doneAt = this.ctx.now + Math.max(120, Math.min(400, ms));
    if (b.aura) b.aura.setVisible(false);
    this.hooks.died(b);
  }

  /** Every monster within `r` of (x, y), for area hits drawn on the client. */
  forEachNear(x: number, y: number, r: number, fn: (b: Body) => void): void {
    const r2 = r * r;
    for (const b of this.byId.values()) {
      if (b.cat !== Cat.Monster || b.dying) continue;
      const dx = b.x - x;
      const dy = b.y - y;
      if (dx * dx + dy * dy <= r2) fn(b);
    }
  }

  clear(): void {
    for (const b of [...this.byId.values()]) this.drop(b);
  }

  destroy(): void {
    this.clear();
    for (const s of this.sprites) s.destroy();
    this.sprites.length = 0;
  }
}
