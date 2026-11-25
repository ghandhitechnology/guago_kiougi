/**
 * Everything the fight draws that is not a body: every effect record the snapshot carries
 * (shots, lobs, orbits, beams, chains, cones, marks, waves, areas, dashes, monsters' tells and
 * public bursts), each moved on the client from its spawn record alone, plus the instant swing
 * the local player's own casts play before the server has answered.
 *
 * Timing: the player's own effects and the dangers aimed at them run on the newest snapshot's
 * clock, so they line up with the predicted body and with the hit records; everyone else's run
 * on the world clock with the bodies they come from.
 *
 * Drawing rules, from the effects artist: art is shown at ×1, or ×2 for an elite, never at a
 * fractional scale; anything drawn in aims or round is never turned, only beams and bolts are;
 * the last partial tile of a beam, bolt or lane is cropped, never squeezed; drawn art is never
 * tinted (only the old fallbacks are); a looping animation never ends on its own, so every
 * one-shot that plays one says how long it holds.
 */
import { BurstKind, FxKind, type WireFx } from "@guago/shared";
import * as Phaser from "phaser";
import type { Bodies, Body } from "./bodies.ts";
import { type BookArt, COMBAT } from "./catalog.ts";
import type { FightContext } from "./context.ts";
import { Bit } from "./particles.ts";
import { crop, Layer, type Piece, Pieces, show } from "./pieces.ts";

/** Chains, follow-ups and marks stay drawn this long, ticks (the step's FLASH_TICKS). */
const FLASH = 6;
/** A predicted cast the server has not answered within this is withdrawn, ms. */
const PREDICT_MS = 320;
/** Most pieces one effect uses. */
const MAX_PIECES = 32;
/** Ms per tick of the fight step. */
const TICK_MS = 50;
/** A line within this of horizontal or vertical is laid from the drawn strips, radians. */
const AXIS_SLACK = (12 * Math.PI) / 180;
/** Gap between the hazard dots of a monster's charge lane, px. */
const TELL_GAP = 7;
/** Strength of the light a monster's tell throws: low enough that its stripes stay readable. */
const TELL_LIGHT = 0.5;
/** Biggest enemy circle drawn at ×1 from `tele-circle`; up to twice that it is drawn at ×2. */
const CIRCLE_R1 = 33;

export class Active {
  fx = 0;
  kind = 0;
  owner = 0;
  def = 0;
  cast = 0;
  start = 0;
  x = 0;
  y = 0;
  angle = 0;
  radius = 0;
  length = 0;
  width = 0;
  count = 0;
  duration = 0;
  speed = 0;
  tx = 0;
  ty = 0;
  anchor = 0;
  period = 0;
  sweep = 0;
  spin = 0;
  a = 0;
  b = 0;
  c = 0;
  flags = 0;
  readonly chain = new Int32Array(16);
  readonly parents = new Int8Array(16);
  chainN = 0;
  /** The local player's, or a danger to them: drawn on the own clock. */
  own = false;
  mine = false;
  enemy = false;
  art: BookArt | null = null;
  /** Tick it ended early (hit, landed), or Infinity. */
  endTick = Number.POSITIVE_INFINITY;
  endX = 0;
  endY = 0;
  /** Impact already drawn. */
  landed = false;
  /** Pulses already drawn (cones, marks, areas). */
  pulses = 0;
  readonly pieces: Piece[] = [];
  /** A swing the client played at once, waiting for the server's record. */
  predicted = false;
  predictedAt = 0;
  /** The client's swing ran ahead of the server's record by this many ticks; eased away. */
  lead = 0;
  /** Origin offset from the server's spawn point to where the body was drawn, px, eased away. */
  ox = 0;
  oy = 0;
  alpha = 1;
  /** Rock specimen or polygon, cycled per cast. */
  variant = 0;
  /** The body's animation key, chosen once (a direction, a specimen, a face). */
  key = "";
}

/**
 * A one-shot piece on its way out: its animation playing once, a loop held for its time, then
 * what follows it (a fire's `out`, a label's `stuck`), and back to the pool.
 */
class Loose {
  p: Piece | null = null;
  /** 0 playing once, 1 holding a loop, 2 playing what follows once, 3 holding a still frame. */
  stage = 0;
  until = 0;
  hold = 0;
  next: string | null = null;
  /** Frame to stop on (a ring drawn per radius stops at the struck radius). */
  stopAt = "";
}

/** One of sixteen directions for art drawn turned in steps of 22.5°, 0 pointing right. */
export function dir16(angle: number): number {
  return ((Math.round(angle / (Math.PI / 8)) % 16) + 16) % 16;
}

/**
 * The right-angle turn that lays a horizontal strip along a line within 12° of horizontal or
 * vertical (right-angle turns keep every pixel), or NaN for a line that needs dots.
 */
export function axisTurn(angle: number): number {
  const q = Math.round(angle / (Math.PI / 2));
  return Math.abs(angle - q * (Math.PI / 2)) <= AXIS_SLACK ? q * (Math.PI / 2) : Number.NaN;
}

export interface EffectHooks {
  /** A body by entity id, for anchors and chains. */
  body(id: number): Body | undefined;
  /** An effect's impact landed where it ended (own impacts shake and light). */
  impact(a: Active, x: number, y: number): void;
  /** A burst record: reactions, Q.E.D., heals, level ups, elites, revives. */
  burst(kind: number, x: number, y: number, radius: number, owner: number): void;
  /** A tell fired. */
  fired(a: Active): void;
}

const tmp = { x: 0, y: 0 };

export class Effects {
  private readonly ctx: FightContext;
  readonly pieces: Pieces;
  private readonly bodies: Bodies;
  private readonly hooks: EffectHooks;
  private readonly live: Active[] = [];
  private readonly byFx = new Map<number, Active>();
  private readonly pool: Active[] = [];
  private readonly loose: Loose[] = [];
  private readonly loosePool: Loose[] = [];
  private others = 0;
  private rockTurn = 0;
  private turn = 0;
  /** Books the local player wears evolved, by rules index (from its inventory). */
  private readonly evolvedOwn = new Set<number>();
  /** The light a monster's tell throws on the ground. */
  private readonly tellColor: number;
  private frame = 0;
  /** Whether each animation key loops, from the art metadata. */
  private readonly loops = new Map<string, boolean>();
  /** The size a per-radius frame is drawn for (`r32`, `out48`), or NaN. */
  private readonly sizes = new Map<string, number>();

  constructor(ctx: FightContext, bodies: Bodies, hooks: EffectHooks) {
    this.ctx = ctx;
    this.bodies = bodies;
    this.hooks = hooks;
    this.pieces = new Pieces(ctx.scene, ctx.view, ctx.cat.meta);
    this.tellColor = ctx.cat.color("red.light");
    for (const [name, sp] of Object.entries(ctx.cat.meta.sprites)) {
      for (const [anim, def] of Object.entries(sp.anims))
        this.loops.set(`${name}/${anim}`, def.loop);
      for (const f of sp.frames) {
        const m = /(\d+)$/.exec(f);
        this.sizes.set(f, m ? Number(m[1]) : Number.NaN);
      }
    }
  }

  get count(): number {
    return this.live.length;
  }

  /** Which of the local player's books are evolved, by rules index. */
  setEvolved(books: Iterable<number>): void {
    this.evolvedOwn.clear();
    for (const b of books) this.evolvedOwn.add(b);
  }

  /** Whether the local player wears this book evolved. */
  ownEvolved(book: number): boolean {
    return this.evolvedOwn.has(book);
  }

  /** The frame among `frames` drawn for the size nearest `r`. */
  nearest(frames: readonly string[], r: number): string {
    let best = frames[0] ?? "";
    let bestD = Number.POSITIVE_INFINITY;
    for (const f of frames) {
      const size = this.sizes.get(f) ?? Number.NaN;
      if (Number.isNaN(size)) continue;
      const d = Math.abs(size - r);
      if (d < bestD) {
        bestD = d;
        best = f;
      }
    }
    return best;
  }

  private take(): Active {
    const a = this.pool.pop() ?? new Active();
    a.endTick = Number.POSITIVE_INFINITY;
    a.landed = false;
    a.pulses = 0;
    a.predicted = false;
    a.lead = 0;
    a.ox = 0;
    a.oy = 0;
    a.alpha = 1;
    a.chainN = 0;
    a.art = null;
    a.variant = 0;
    a.key = "";
    return a;
  }

  private free(a: Active): void {
    for (const p of a.pieces) this.pieces.give(p);
    a.pieces.length = 0;
    if (this.byFx.get(a.fx) === a) this.byFx.delete(a.fx);
    if (!a.own && !a.enemy) this.others--;
    this.pool.push(a);
  }

  /** A piece of an effect, made the first time it is asked for. */
  private piece(a: Active, i: number, layer: Layer = Layer.Glow): Piece {
    let p = a.pieces[i];
    if (!p) {
      p = this.pieces.take(layer);
      a.pieces[i] = p;
    }
    return p;
  }

  /** Hides pieces from `from` on. */
  private hideFrom(a: Active, from: number): void {
    for (let i = from; i < a.pieces.length; i++) a.pieces[i]?.s.setVisible(false);
  }

  /** An effect record from the snapshot, spawned at message tick `tick`. */
  spawn(f: WireFx, tick: number): void {
    const own = this.ctx.selfId !== 0 && f.owner === this.ctx.selfId;
    const enemy = f.kind === FxKind.Danger || f.kind === FxKind.EnemyShot;
    if (f.kind === FxKind.Burst) {
      this.hooks.burst(f.def, f.x, f.y, f.radius, f.owner);
      return;
    }
    // Other players' fireworks are capped; a dropped one is only not drawn.
    if (!own && !enemy && this.others >= this.ctx.restraint.otherEffects) return;
    let a: Active | undefined;
    if (own) a = this.adopt(f);
    const fresh = !a;
    a ??= this.take();
    const keepLead = a.predicted ? a.lead : 0;
    const px = a.predicted ? a.x : 0;
    const py = a.predicted ? a.y : 0;
    a.fx = f.fx;
    a.kind = f.kind;
    a.owner = f.owner;
    a.def = enemy ? f.def : f.def & 127;
    a.cast = f.cast;
    a.start = tick + f.start;
    a.x = f.x;
    a.y = f.y;
    a.angle = f.angle;
    a.radius = f.radius;
    a.length = f.length;
    a.width = f.width;
    a.count = f.count;
    a.duration = f.duration;
    a.speed = f.speed;
    a.tx = f.tx;
    a.ty = f.ty;
    a.anchor = f.anchor;
    a.period = f.period;
    a.sweep = f.sweep;
    a.spin = f.spin;
    a.a = f.a;
    a.b = f.b;
    a.c = f.c;
    a.flags = f.flags;
    a.chainN = Math.min(16, f.chain.length);
    for (let i = 0; i < a.chainN; i++) {
      a.chain[i] = f.chain[i] as number;
      a.parents[i] = f.parents[i] as number;
    }
    a.own = own || enemy;
    a.mine = own;
    a.enemy = enemy;
    // The record says whether the book is evolved; the player's own evolution shows from the
    // moment its operation lands, a snapshot or two before the records start saying so. A wave
    // from a book whose base form is no wave can only come from its evolution (왕도 → 유클리드).
    const book = f.def & 127;
    let evolved = !enemy && (f.evolved || (own && this.evolvedOwn.has(book)));
    if (!enemy && !evolved && f.kind === FxKind.Wave && this.ctx.cat.book(book).kind !== "wave")
      evolved = true;
    a.art = enemy ? null : this.ctx.cat.book(book, evolved);
    a.alpha = own || enemy ? 1 : this.ctx.restraint.others;
    if (a.predicted) {
      // The swing already on screen keeps going; the server's path takes over smoothly.
      a.predicted = false;
      const age = this.ctx.ownTick - a.start;
      a.lead = keepLead - age;
      a.ox = px - a.x;
      a.oy = py - a.y;
    }
    if (f.kind === FxKind.Shot && a.art?.id === "rock-box") a.variant = this.rockTurn++ % 3;
    this.byFx.set(a.fx, a);
    if (fresh) {
      if (!a.own && !a.enemy) this.others++;
      this.live.push(a);
      // The caster swings when its effect leaves its hands; on a dark map the cast lights the
      // ground there.
      const caster = enemy ? undefined : this.hooks.body(f.owner);
      if (caster) {
        this.bodies.attack(caster);
        if (a.art && (own || this.ctx.restraint.otherSparks > 0))
          this.castLight(caster.x, caster.y, a.art.color, own);
      }
    }
    if (enemy && f.kind === FxKind.Danger) {
      this.ctx.sound.cue("combat.telegraph.tick", f.x, f.y, true);
    }
  }

  /** The first swing the client predicted for this book that has not been answered yet. */
  private adopt(f: WireFx): Active | undefined {
    for (const a of this.live) {
      if (!a.predicted || a.def !== (f.def & 127)) continue;
      if (a.kind !== f.kind) continue;
      return a;
    }
    return undefined;
  }

  /** An effect ended early at (x, y): a shot hit, a lob landed, a pool merged. */
  end(fx: number, x: number, y: number, tick: number): void {
    const a = this.byFx.get(fx);
    if (!a) return;
    a.endTick = tick;
    a.endX = x;
    a.endY = y;
  }

  /**
   * The local player pressed a book: its swing plays now, before the server has answered.
   * Returns false when the book's attack has no shape worth predicting.
   */
  predict(book: number, x: number, y: number, angle: number): boolean {
    const art = this.ctx.cat.book(book);
    let kind: number;
    const shape = this.ctx.cat.shape(book);
    switch (art.kind) {
      case "projectile":
        kind = shape.lob ? FxKind.Lob : FxKind.Shot;
        break;
      case "beam":
        kind = FxKind.Beam;
        break;
      case "cone":
        kind = FxKind.Cone;
        break;
      default:
        return false;
    }
    const a = this.take();
    a.art = this.ctx.cat.book(book, this.evolvedOwn.has(book));
    a.fx = 0;
    a.kind = kind;
    a.owner = this.ctx.selfId;
    a.def = book;
    a.cast = 0;
    a.start = this.ctx.ownTick;
    a.x = x;
    a.y = y;
    a.angle = angle;
    a.radius = shape.radius;
    a.length = shape.length;
    a.width = shape.width;
    a.count = shape.count;
    a.duration = shape.duration;
    a.speed = shape.speed;
    a.tx = x + Math.cos(angle) * shape.reach;
    a.ty = y + Math.sin(angle) * shape.reach;
    a.a = shape.a;
    a.b = shape.b;
    a.c = 0;
    a.anchor = 0;
    a.own = true;
    a.mine = true;
    a.enemy = false;
    a.alpha = 1;
    a.predicted = true;
    a.predictedAt = this.ctx.now;
    this.live.push(a);
    this.castLight(x, y, a.art.color, true);
    return true;
  }

  /** A cast's light on the ground at the caster's hands; `FightLights` keeps it to dark maps. */
  private castLight(x: number, y: number, color: number, own: boolean): void {
    this.ctx.lights.glow(x, y - 10, color, own ? 32 : 20, own ? 0.5 : 0.25, own ? 180 : 120);
  }

  /**
   * On a dark map an effect carries its light while it flies or lies: a short flash at its
   * first drawn piece every few frames, the local player's often, anyone else's seldom and dim.
   */
  private carry(a: Active): void {
    const art = a.art;
    if (!art || !this.ctx.lights.dark) return;
    const every = a.mine ? 3 : 8;
    if ((this.frame + a.fx) % every !== 0) return;
    if (!a.mine && (this.ctx.restraint.otherSparks <= 0 || !this.ctx.lights.spare)) return;
    for (const p of a.pieces) {
      if (!p.inUse || !p.s.visible) continue;
      this.ctx.lights.glow(p.s.x, p.s.y, art.color, a.mine ? 24 : 16, a.mine ? 0.4 : 0.2, 120);
      return;
    }
  }

  update(dtMs: number): void {
    const now = this.ctx.now;
    this.frame++;
    for (let i = 0; i < this.live.length; ) {
      const a = this.live[i] as Active;
      if (a.predicted && now - a.predictedAt > PREDICT_MS) {
        // The server never cast it (cooldown, knocked out): it fades with no impact.
        a.alpha -= dtMs / 120;
        if (a.alpha <= 0) {
          this.live[i] = this.live[this.live.length - 1] as Active;
          this.live.pop();
          this.free(a);
          continue;
        }
      }
      if (a.lead !== 0) {
        const k = Math.exp(-dtMs / 140);
        a.lead = Math.abs(a.lead * k) < 0.01 ? 0 : a.lead * k;
        a.ox *= k;
        a.oy *= k;
      }
      const clock = a.own ? this.ctx.ownTick : this.ctx.tick;
      const t = clock - a.start + a.lead;
      const done = this.draw(a, t, clock);
      if (done) {
        this.live[i] = this.live[this.live.length - 1] as Active;
        this.live.pop();
        this.free(a);
        continue;
      }
      if (!a.enemy && t >= 0) this.carry(a);
      i++;
    }
    this.updateLoose(now);
  }

  /** Draws an effect at age `t` ticks; true when it is over. */
  private draw(a: Active, t: number, clock: number): boolean {
    if (t < 0) {
      for (const p of a.pieces) p.s.setVisible(false);
      return false;
    }
    switch (a.kind) {
      case FxKind.Shot:
      case FxKind.EnemyShot:
        return this.shot(a, t, clock);
      case FxKind.Lob:
        return this.lob(a, t, clock);
      case FxKind.Orbit:
        return this.orbit(a, t);
      case FxKind.Beam:
        return this.beam(a, t);
      case FxKind.Chain:
        return this.chainFx(a, t);
      case FxKind.Cone:
        return this.cone(a, t);
      case FxKind.Mark:
      case FxKind.Danger:
        return this.mark(a, t);
      case FxKind.Wave:
        return this.wave(a, t);
      case FxKind.Zone:
      case FxKind.Pool:
      case FxKind.Trail:
        return this.area(a, t);
      case FxKind.Dash:
        return this.dash(a, t);
      default:
        return true;
    }
  }

  /** Where an effect anchored on an entity is: the predicted body for the local player. */
  private anchorAt(id: number, out: { x: number; y: number }): boolean {
    if (id === 0) return false;
    if (id === this.ctx.selfId) {
      out.x = this.ctx.selfX;
      out.y = this.ctx.selfY;
      return true;
    }
    const b = this.hooks.body(id);
    if (!b) return false;
    out.x = b.x;
    out.y = b.y;
    return true;
  }

  /** The frame of a named animation at `secs` into it, held on its last frame or looped. */
  private frameAt(sprite: string, anim: string, secs: number): string {
    const def = this.ctx.cat.meta.sprites[sprite]?.anims[anim];
    if (!def || def.frames.length === 0) return this.ctx.cat.frame(sprite);
    const f = Math.floor(secs * Math.max(1, def.fps));
    const n = def.frames.length;
    return def.frames[def.loop ? f % n : Math.min(n - 1, f)] as string;
  }

  // Kinds ----------------------------------------------------------------------------------

  /**
   * The animation a moving body plays, chosen once: one of sixteen turned drawings by heading,
   * a rock's specimen, the next of several loops (acid then base, Na, He, Fe), or for art made of
   * single frames (the 수열 digits) the next frame, marked with `#`.
   */
  private bodyKey(a: Active, name: string, enemy: boolean): string {
    if (enemy) return "proj-shadow/fly";
    const sp = this.ctx.cat.meta.sprites[name];
    if (!sp) return "";
    const anims = sp.anims;
    if (anims.d0) return `${name}/d${dir16(a.angle)}`;
    const keys = Object.keys(anims);
    if (name === "fx-rock" || name === "evo-rock-cycle")
      return `${name}/${keys[a.variant % Math.max(1, keys.length)]}`;
    const loops = keys.filter((k) => anims[k]?.loop);
    if (loops.length > 1) return `${name}/${loops[this.turn++ % loops.length]}`;
    if (loops.length === 1) return `${name}/${loops[0]}`;
    if (keys.length > 1 && keys.every((k) => (anims[k]?.frames.length ?? 0) === 1))
      return `#${sp.frames[this.turn++ % sp.frames.length]}`;
    return keys[0] ? `${name}/${keys[0]}` : "";
  }

  private shot(a: Active, t: number, clock: number): boolean {
    const cat = this.ctx.cat;
    const life = a.speed > 0 ? a.length / a.speed : 20;
    const ended = clock >= a.endTick;
    const age = Math.min(t, life);
    let x = a.x + Math.cos(a.angle) * a.speed * age + a.ox;
    let y = a.y + Math.sin(a.angle) * a.speed * age + a.oy;
    if (ended) {
      x = a.endX;
      y = a.endY;
    }
    if (ended || t >= life) {
      if (!a.landed) {
        a.landed = true;
        this.impact(a, x, y, ended);
      }
      this.hideFrom(a, 0);
      return true;
    }
    const enemy = a.kind === FxKind.EnemyShot;
    const art = a.art;
    const body = enemy ? "proj-shadow" : (art?.body ?? "fx-book");
    const name = cat.has(body) ? body : "fx-book";
    const fallback = name === "fx-book";
    if (!a.key) a.key = this.bodyKey(a, name, enemy);
    const still = a.key.startsWith("#");
    const anim = still ? null : a.key || null;
    // A red rim under every enemy shot: danger is red, and only danger. The rim is the old mote
    // fallback, tinted, and drawn without adding so the red never turns to pink fog.
    if (enemy) {
      const rim = this.piece(a, 0);
      show(rim, COMBAT, cat.frame("fx-pickup"), null);
      rim.s.setBlendMode(Phaser.BlendModes.NORMAL);
      rim.s.setTint(this.tellColor).setAlpha(0.55 + 0.25 * Math.sin(this.ctx.now * 0.03));
      rim.s.setPosition(Math.round(x), Math.round(y));
    }
    const p = this.piece(a, enemy ? 1 : 0);
    const s = show(p, cat.atlas(name), still ? a.key.slice(1) : cat.frame(name), anim, false);
    s.setVisible(true).setAlpha(a.alpha);
    if (art?.turns) s.setRotation(a.angle);
    s.setPosition(Math.round(x), Math.round(y - (enemy ? 2 : 4)));
    if (fallback && art && !enemy) s.setTint(art.color);
    // Smear: two ghosts behind anything fast, untinted: the art already carries its colour.
    if (!enemy && a.speed >= 6) {
      for (let g = 1; g <= 2; g++) {
        const gp = this.piece(a, g);
        const gs = show(gp, cat.atlas(name), s.frame.name, null);
        gs.setVisible(true)
          .setAlpha(a.alpha * (g === 1 ? 0.45 : 0.2))
          .setRotation(s.rotation);
        gs.setPosition(
          Math.round(x - Math.cos(a.angle) * a.speed * 0.25 * g),
          Math.round(y - 4 - Math.sin(a.angle) * a.speed * 0.25 * g),
        );
        if (fallback && art) gs.setTint(art.color);
      }
    }
    return false;
  }

  private lob(a: Active, t: number, clock: number): boolean {
    const cat = this.ctx.cat;
    const flight = Math.max(1, a.duration);
    const ended = clock >= a.endTick;
    const f = Math.min(1, t / flight);
    let x = a.x + (a.tx - a.x) * f + a.ox;
    let y = a.y + (a.ty - a.y) * f + a.oy;
    if (ended && a.endX > 0) {
      x = a.endX;
      y = a.endY;
    }
    if (ended || f >= 1) {
      if (!a.landed) {
        a.landed = true;
        this.impact(a, x, y, true);
      }
      this.hideFrom(a, 0);
      return true;
    }
    const z = 4 * a.a * f * (1 - f);
    const art = a.art;
    const body = art?.body && cat.has(art.body) ? art.body : "fx-book";
    const p = this.piece(a, 0);
    const s = show(
      p,
      cat.atlas(body),
      cat.frame(body),
      body === art?.body ? art.bodyAnim : "fx-book/spin",
      false,
    );
    s.setVisible(true).setAlpha(a.alpha);
    s.setPosition(Math.round(x), Math.round(y - z - 3));
    if (body === "fx-book" && art) s.setTint(art.color);
    // Its shadow on the ground, small at the top of the arc and full as it lands.
    const sh = this.piece(a, 1);
    if (cat.has(`${body}-shadow`)) {
      const frames = cat.meta.sprites[`${body}-shadow`]?.frames ?? [];
      const idx = Math.min(
        frames.length - 1,
        Math.floor((1 - z / Math.max(1, a.a)) * frames.length),
      );
      const frame = frames[Math.max(0, idx)] ?? cat.frame(`${body}-shadow`);
      show(sh, COMBAT, frame, null);
    } else {
      show(sh, "effects", cat.frame("shadow-s"), null);
    }
    sh.s
      .setVisible(true)
      .setAlpha(0.8 * a.alpha)
      .setPosition(Math.round(x), Math.round(y));
    return false;
  }

  private orbit(a: Active, t: number): boolean {
    if (t >= a.duration) return true;
    if (!this.anchorAt(a.anchor, tmp)) return t > 2;
    const cat = this.ctx.cat;
    const art = a.art;
    const n = Math.max(1, Math.min(12, a.count));
    let body = art?.body && cat.has(art.body) ? art.body : "fx-book";
    let anim = body === art?.body ? art.bodyAnim : "fx-book/spin";
    if (body === "fx-wangdo") {
      // The polygon's sides follow the bodies: three a triangle, up to six a hexagon, past six
      // a circle.
      anim =
        n <= 3
          ? "fx-wangdo/tri"
          : n === 4
            ? "fx-wangdo/square"
            : n === 5
              ? "fx-wangdo/penta"
              : n === 6
                ? "fx-wangdo/hexa"
                : "fx-wangdo/circle";
    } else if (!art?.body || !cat.has(art.body)) {
      body = "fx-book";
    }
    // Grow in over the first two ticks, out over the last two.
    const grow = Math.min(1, t / 2, (a.duration - t) / 2);
    const turn = (2 * Math.PI * t) / Math.max(1, a.period);
    if (cat.meta.sprites[body]?.frames.includes(`${body}/rod`)) {
      // A pendulum: the pivot over the player, the rod in beads, the bob at the end. 푸코 진자
      // swings its own heavier bob over a dial on the ground that turns in its drawing.
      const extra = art?.extra && cat.meta.sprites[art.extra]?.anims.bob ? art.extra : null;
      const ang = a.angle + (a.sweep / 2) * Math.sin(turn) + a.spin * t;
      const r = a.radius * (0.5 + 0.5 * grow);
      const px = tmp.x;
      const py = tmp.y - 10;
      const beads = Math.max(2, Math.min(MAX_PIECES - 3, Math.round(r / 5)));
      for (let i = 0; i <= beads + 1; i++) {
        const p = this.piece(a, i);
        const f = i / (beads + 1);
        const bob = i === beads + 1;
        const frame = i === 0 ? `${body}/pivot` : bob ? `${body}/bob` : `${body}/rod`;
        if (bob && extra) show(p, cat.atlas(extra), `${extra}/bob`, null);
        else show(p, cat.atlas(body), frame, null);
        p.s.setVisible(true).setAlpha(a.alpha * Math.min(1, grow * 2));
        p.s.setPosition(
          Math.round(px + Math.cos(ang) * r * f),
          Math.round(py + Math.sin(ang) * r * f * 0.7),
        );
      }
      this.hideFrom(a, beads + 2);
      if (extra && cat.meta.sprites[extra]?.anims.turn) {
        const dial = this.piece(a, MAX_PIECES - 1, Layer.Ground);
        const frame = this.frameAt(extra, "turn", (t * TICK_MS) / 1000);
        show(dial, cat.atlas(extra), frame, null);
        const oy = cat.meta.sprites[extra]?.origin[1] ?? 0;
        dial.s.setOrigin(0.5, 0).setPosition(Math.round(tmp.x), Math.round(tmp.y - oy));
        dial.s.setVisible(true).setAlpha(a.alpha * Math.min(1, grow * 2));
      }
      return false;
    }
    for (let i = 0; i < n; i++) {
      let ang: number;
      if (a.sweep > 0) ang = a.angle + (a.sweep / 2) * Math.sin(turn) + a.spin * t;
      else ang = a.angle + turn + (i / n) * Math.PI * 2;
      const r = a.radius * (0.5 + 0.5 * grow);
      const x = tmp.x + Math.cos(ang) * r;
      const y = tmp.y - 8 + Math.sin(ang) * r * 0.7;
      const p = this.piece(a, i);
      const s = show(p, cat.atlas(body), cat.frame(body), anim, false);
      s.setVisible(true).setAlpha(a.alpha * Math.min(1, grow * 2));
      s.setPosition(Math.round(x), Math.round(y));
      if (body === "fx-book" && art) s.setTint(art.color);
    }
    this.hideFrom(a, n);
    return false;
  }

  private beam(a: Active, t: number): boolean {
    const life = Math.max(2, a.duration);
    if (t >= life) return true;
    const cat = this.ctx.cat;
    const art = a.art;
    const seg = art?.body && cat.has(art.body) ? art.body : "fx-graph-beam";
    const graph = seg === "fx-graph-beam" || seg === "evo-fourier";
    // The beam draws out over two ticks and thins out over the last two; in between it stands
    // at full strength, its navy edge holding on bright ground.
    const reach = a.length * Math.min(1, t / 2);
    const fade = Math.min(1, (life - t) / 2);
    let ox = a.x + a.ox;
    let oy = a.y - 6 + a.oy;
    if (a.mine) {
      ox = this.ctx.selfX + Math.cos(a.angle) * 6;
      oy = this.ctx.selfY - 8 + Math.sin(a.angle) * 6;
    }
    // The segment art carries the wave itself (푸리에's three harmonics are drawn in one): tiles
    // laid along the straight line and turned with it, the last one cut short.
    const sp = cat.meta.sprites[seg];
    const step = sp?.size[0] ?? 16;
    const h = sp?.size[1] ?? 15;
    const originY = (sp?.origin[1] ?? h / 2) / h;
    const n = Math.min(MAX_PIECES - 3, Math.ceil(reach / step));
    const cos = Math.cos(a.angle);
    const sin = Math.sin(a.angle);
    let lx = ox;
    let ly = oy;
    for (let i = 0; i < n; i++) {
      const left = Math.min(step, reach - i * step);
      const p = this.piece(a, i + 2);
      const s = show(
        p,
        cat.atlas(seg),
        cat.frame(seg),
        art?.body === seg ? art.bodyAnim : "fx-graph-beam/travel",
        false,
      );
      s.setVisible(true).setAlpha(a.alpha * fade);
      s.setOrigin(0, originY).setRotation(a.angle);
      crop(p, left, h);
      s.setPosition(Math.round(ox + cos * i * step), Math.round(oy + sin * i * step));
      lx = ox + cos * (i * step + left);
      ly = oy + sin * (i * step + left);
    }
    this.hideFrom(a, n + 2);
    // The graph's chalk origin and head belong to the graph; a laser is its line alone.
    const origin = this.piece(a, 0);
    const head = this.piece(a, 1);
    if (graph && cat.has("fx-graph-origin")) {
      show(origin, COMBAT, cat.frame("fx-graph-origin"), "fx-graph-origin/hold", false);
      origin.s
        .setVisible(true)
        .setAlpha(a.alpha * fade)
        .setPosition(Math.round(ox), Math.round(oy));
    } else origin.s.setVisible(false);
    if (graph && cat.has("fx-graph-head")) {
      show(head, COMBAT, cat.frame("fx-graph-head"), "fx-graph-head/pulse", false);
      head.s
        .setVisible(n > 0)
        .setAlpha(a.alpha * fade)
        .setPosition(Math.round(lx), Math.round(ly));
    } else head.s.setVisible(false);
    return false;
  }

  private chainFx(a: Active, t: number): boolean {
    if (t >= FLASH) return true;
    const cat = this.ctx.cat;
    const fade = Math.min(1, (FLASH - t) / 2);
    // Where the bolt lands: its node, or 맥스웰's field rings where it forks.
    const own = a.art?.hit && cat.has(a.art.hit) ? a.art : null;
    const node = own?.hit ?? "fx-bolt-node";
    const nodeAnim = own ? own.hitAnim : "fx-bolt-node/strike";
    let used = 0;
    for (let k = 0; k < a.chainN; k++) {
      // Each link appears a frame after the one before it: the bolt jumps.
      if (t * 3 < k) break;
      const to = this.hooks.body(a.chain[k] as number);
      if (!to) continue;
      const parent = a.parents[k] as number;
      let fx: number;
      let fy: number;
      if (parent < 0) {
        if (!this.anchorAt(a.owner, tmp)) {
          tmp.x = a.x;
          tmp.y = a.y;
        }
        fx = tmp.x;
        fy = tmp.y - 10;
      } else {
        const from = this.hooks.body(a.chain[parent] as number);
        if (!from) continue;
        fx = from.x;
        fy = from.headY + 6;
      }
      const ex = to.x;
      const ey = to.headY + 6;
      used = this.zigzag(a, used, fx, fy, ex, ey, k, fade);
      if (used >= MAX_PIECES - 1) break;
      const np = this.piece(a, used++);
      show(np, cat.atlas(node), cat.frame(node), nodeAnim, false);
      np.s
        .setVisible(true)
        .setAlpha(a.alpha * fade)
        .setPosition(Math.round(ex), Math.round(ey));
    }
    this.hideFrom(a, used);
    return false;
  }

  /**
   * Lightning from one point to another, never turned off the drawn angles: half the straight
   * run, the 45° run, the other half, each laid from the 0° and 45° bolt drawings turned only by
   * right angles (which keep every pixel), with the a, b and c variants swapped every frame. The
   * last drawing of a run is cropped where the run ends, keeping the bolt's full thickness.
   */
  private zigzag(
    a: Active,
    used: number,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    k: number,
    fade: number,
  ): number {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    const diag = Math.min(ax, ay);
    const sx = Math.sign(dx) || 1;
    const sy = Math.sign(dy) || 1;
    const horizontal = ax >= ay;
    const rest = (horizontal ? ax : ay) - diag;
    let x = x0;
    let y = y0;
    const flick = Math.floor(this.ctx.now / 50);
    for (let leg = 0; leg < 3; leg++) {
      const diagonal = leg === 1;
      const ux = diagonal || horizontal ? sx : 0;
      const uy = diagonal || !horizontal ? sy : 0;
      const len = diagonal ? diag : rest / 2;
      if (len < 1) continue;
      const sprite = diagonal ? "fx-bolt-diag" : "fx-bolt";
      // Pixels covered along each axis by one drawing.
      const step = diagonal ? 20 : 32;
      const rot = diagonal
        ? ux > 0
          ? uy > 0
            ? 0
            : -Math.PI / 2
          : uy > 0
            ? Math.PI / 2
            : Math.PI
        : ux > 0
          ? 0
          : ux < 0
            ? Math.PI
            : uy > 0
              ? Math.PI / 2
              : -Math.PI / 2;
      const n = Math.ceil(len / step);
      for (let i = 0; i < n && used < MAX_PIECES - 1; i++) {
        const part = Math.min(step, len - i * step);
        const p = this.piece(a, used++);
        const v = (k + i + flick) % 3 === 0 ? "a" : (k + i + flick) % 3 === 1 ? "b" : "c";
        const frames = this.ctx.cat.frames(sprite, v);
        show(
          p,
          COMBAT,
          frames[flick % Math.max(1, frames.length)] ?? this.ctx.cat.frame(sprite),
          null,
        );
        if (diagonal) {
          // The 45° drawing runs from (3, 3) towards its far corner, 3 px of bolt either side.
          p.s.setOrigin(3 / 26, 3 / 26);
          crop(p, part + 6, part + 6);
        } else {
          p.s.setOrigin(0, 6 / 13);
          crop(p, part, 13);
        }
        p.s
          .setRotation(rot)
          .setAlpha(a.alpha * fade)
          .setVisible(true);
        p.s.setPosition(Math.round(x + ux * step * i), Math.round(y + uy * step * i));
      }
      x += ux * len;
      y += uy * len;
    }
    return used;
  }

  private cone(a: Active, t: number): boolean {
    const life = a.a + Math.max(1, a.duration) + 2;
    if (t >= life) return true;
    const cat = this.ctx.cat;
    const art = a.art;
    let x = a.x;
    let y = a.y;
    if (a.mine) {
      x = this.ctx.selfX;
      y = this.ctx.selfY;
    } else if (a.anchor && this.anchorAt(a.anchor, tmp)) {
      x = tmp.x;
      y = tmp.y;
    }
    if (t < a.a) {
      this.hideFrom(a, 0);
      return false;
    }
    const fresh = a.pulses === 0;
    if (fresh) a.pulses = 1;
    if (art?.bare) {
      // No drawing of its own (실험 보고서): a spray of fuel drops along the aim, and each
      // target it hits wears its label.
      if (fresh)
        this.ctx.particles.burst(
          Bit.Spark,
          x + Math.cos(a.angle) * 6,
          y - 8 + Math.sin(a.angle) * 6,
          a.mine ? 8 : 3,
          cat.color("sea.light"),
          Math.max(60, a.length * 3),
          0,
          a.angle,
          Math.max(0.3, a.width * 2),
        );
      return false;
    }
    const body = art?.body && cat.has(art.body) && art.kind === "cone" ? art.body : "fx-slash";
    const anims = cat.meta.sprites[body]?.anims ?? {};
    const fade = a.alpha * Math.min(1, (life - t) / 2);
    if (anims.fan0) {
      // A spray drawn in sixteen directions: the one nearest the aim, never turned.
      const p = this.piece(a, 0);
      show(p, cat.atlas(body), cat.frame(body), `${body}/fan${dir16(a.angle)}`, fresh);
      p.s
        .setVisible(true)
        .setAlpha(fade)
        .setPosition(Math.round(x), Math.round(y - 8));
      return false;
    }
    if (cat.meta.sprites[body]?.frames.includes(`${body}/bond`)) {
      // A whip of atoms laid along the aim: carbon, bond, carbon …, the tip snapping at the end.
      // 고분자 closes every fourth carbon into a ring.
      const ring =
        art?.extra && cat.meta.sprites[art.extra]?.anims.ring ? `${art.extra}/ring` : null;
      const n = Math.min(MAX_PIECES, Math.max(2, Math.round(a.length / 7)));
      const grow = Math.min(1, (t - a.a + 1) / 2);
      const shown = Math.max(1, Math.round(n * grow));
      for (let i = 0; i < n; i++) {
        const p = this.piece(a, i);
        const last = i === shown - 1;
        const carbon = i % 2 === 0;
        if (!last && carbon && ring && i % 8 === 6)
          show(p, cat.atlas(art?.extra ?? body), ring, null);
        else {
          const frame = last ? `${body}/tip0` : carbon ? `${body}/carbon` : `${body}/bond`;
          show(
            p,
            cat.atlas(body),
            cat.meta.sprites[body]?.frames.includes(frame) ? frame : `${body}/carbon`,
            null,
          );
        }
        const d = 6 + i * 7;
        p.s.setVisible(i < shown).setAlpha(fade);
        p.s.setPosition(
          Math.round(x + Math.cos(a.angle) * d),
          Math.round(y - 8 + Math.sin(a.angle) * d),
        );
      }
      return false;
    }
    // The old fallback slash, in the class colour and turned to the aim, at ×1.
    const p = this.piece(a, 0);
    const anim = body === art?.body ? art.bodyAnim : "fx-slash/swing";
    const s = show(p, cat.atlas(body), cat.frame(body), anim, fresh);
    s.setVisible(true).setAlpha(fade);
    s.setOrigin(0.2, 0.5);
    if (body === "fx-slash") {
      if (art) s.setTint(art.color);
      s.setRotation(a.angle);
    }
    s.setPosition(Math.round(x + Math.cos(a.angle) * 4), Math.round(y - 8 + Math.sin(a.angle) * 4));
    return false;
  }

  /** A telegraph: the player's 예보 traced amber, or a monster's tell in hazard red. */
  private mark(a: Active, t: number): boolean {
    const cat = this.ctx.cat;
    const delay = Math.max(1, a.a);
    const repeats = a.kind === FxKind.Mark ? a.count : 0;
    const total = delay + repeats * Math.max(1, a.period) + FLASH;
    if (t >= total) return true;
    const line = a.kind === FxKind.Mark ? a.flags === 1 : a.length > 0;
    const enemy = a.kind === FxKind.Danger;
    // Strikes: the first at `delay`, then every `period`.
    const since = t - delay;
    const strikes =
      since < 0 ? 0 : 1 + Math.min(repeats, Math.floor(since / Math.max(1, a.period)));
    if (strikes > a.pulses) {
      a.pulses = strikes;
      if (enemy) this.hooks.fired(a);
      else this.impact(a, a.x, a.y, true);
    }
    const sinceStrike = strikes === 0 ? -1 : since - (strikes - 1) * Math.max(1, a.period);
    const charging = strikes === 0 || (strikes <= repeats && sinceStrike > FLASH);
    const progress = strikes === 0 ? t / delay : 1;
    if (line) {
      if (enemy) this.lane(a, strikes, sinceStrike, progress);
      else this.forecastLine(a, t, total, strikes, sinceStrike, charging, progress);
      return false;
    }
    if (!enemy && cat.has("fx-forecast-ring"))
      return this.forecastCircle(a, t, strikes, sinceStrike, charging, progress, delay);
    // A circle: the drawn ring at ×1, or ×2 for the wide slams, never between.
    const art = "tele-circle";
    const sp = cat.meta.sprites[art];
    const p = this.piece(a, 0, enemy ? Layer.Tell : Layer.Ground);
    const fill = sp?.anims.fill?.frames ?? [];
    const fire = sp?.anims.fire?.frames ?? [];
    const frame =
      strikes > 0 && !charging
        ? (fire[Math.floor(sinceStrike * 2) % Math.max(1, fire.length)] ?? "")
        : (fill[Math.min(fill.length - 1, Math.floor(progress * fill.length))] ?? "");
    if (frame) show(p, COMBAT, frame, null);
    const r = Math.max(8, a.radius);
    const scale = r <= CIRCLE_R1 ? 1 : 2;
    const oy = sp?.origin[1] ?? 13;
    p.s.setOrigin(0.5, 0).setScale(scale, scale);
    p.s.setPosition(Math.round(a.x), Math.round(a.y - oy * scale));
    p.s
      .setVisible(true)
      .setAlpha(a.alpha * (strikes > 0 && !charging ? Math.min(1, (FLASH - sinceStrike) / 3) : 1));
    if (enemy) this.pieces.tell(p, { color: this.tellColor, radius: r + 8, intensity: TELL_LIGHT });
    return false;
  }

  /**
   * A monster's charge lane. Near horizontal or vertical it is the drawn hazard strip laid tile
   * by tile and turned only by right angles, the last tile cropped; at any other angle it is a
   * run of striped hazard dots that never turn. Either way it lights from the monster outward
   * over the wind-up and flashes on the strike.
   */
  private lane(a: Active, strikes: number, sinceStrike: number, progress: number): void {
    const cat = this.ctx.cat;
    const cos = Math.cos(a.angle);
    const sin = Math.sin(a.angle);
    const fade = strikes > 0 ? Math.max(0, Math.min(1, (FLASH - sinceStrike) / 3)) : 1;
    const turn = axisTurn(a.angle);
    const sp = cat.meta.sprites["tele-line"];
    if (sp && !Number.isNaN(turn)) {
      const segLen = sp.size[0];
      const h = sp.size[1];
      const n = Math.min(MAX_PIECES, Math.max(1, Math.ceil(a.length / segLen)));
      const charge = sp.anims.charge?.frames ?? [];
      const fire = sp.anims.fire?.frames ?? [];
      for (let i = 0; i < n; i++) {
        const p = this.piece(a, i, Layer.Tell);
        const frame =
          strikes > 0
            ? (fire[Math.floor(sinceStrike * 2) % Math.max(1, fire.length)] ?? "")
            : (charge[Math.floor(this.ctx.now / 100 + i) % Math.max(1, charge.length)] ?? "");
        if (frame) show(p, COMBAT, frame, null);
        p.s.setOrigin(0, sp.origin[1] / h).setRotation(turn);
        crop(p, a.length - i * segLen, h);
        p.s.setAlpha(a.alpha * fade);
        p.s.setPosition(Math.round(a.x + cos * i * segLen), Math.round(a.y + sin * i * segLen));
        p.s.setVisible(true);
        this.pieces.tell(p, {
          color: this.tellColor,
          radius: segLen / 2 + 6,
          intensity: TELL_LIGHT,
        });
      }
      this.hideFrom(a, n);
      return;
    }
    if (!cat.has("tell-dot")) return;
    const n = Math.min(MAX_PIECES, Math.max(2, Math.floor(a.length / TELL_GAP)));
    const lit = strikes > 0 ? n : Math.floor(progress * n);
    const blink = Math.floor(this.ctx.now / 90) % 2 === 0;
    for (let i = 0; i < n; i++) {
      const p = this.piece(a, i, Layer.Tell);
      const frame =
        strikes > 0
          ? blink
            ? "tell-dot/fire"
            : "tell-dot/lit"
          : i < lit
            ? "tell-dot/lit"
            : "tell-dot/dim";
      show(p, COMBAT, frame, null);
      p.s.setOrigin(0.5, 0);
      p.s.setAlpha(a.alpha * fade);
      const d = (i + 1) * TELL_GAP;
      p.s.setPosition(Math.round(a.x + cos * d), Math.round(a.y + sin * d - 2));
      p.s.setVisible(true);
      // Every other dot throws light, so the run lights up as a band, not beads.
      if (i % 2 === 0) this.pieces.tell(p, { color: this.tellColor, radius: 9, intensity: 0.45 });
    }
    this.hideFrom(a, n);
  }

  /**
   * The player's line 예보. Near horizontal or vertical: the amber seismograph strip growing
   * over the delay, then the book's fault (지구는 둥글다's crack, 판 구조론's grinding plates)
   * opening along it, both turned only by right angles with their last tile cropped. At any other
   * angle: amber dots traced over the delay that flash on the strike while stones jump out.
   */
  private forecastLine(
    a: Active,
    t: number,
    total: number,
    strikes: number,
    sinceStrike: number,
    charging: boolean,
    progress: number,
  ): void {
    const cat = this.ctx.cat;
    const cos = Math.cos(a.angle);
    const sin = Math.sin(a.angle);
    const struck = strikes > 0 && !charging;
    const turn = axisTurn(a.angle);
    const strip = cat.meta.sprites["fx-forecast"];
    if (strip && !Number.isNaN(turn)) {
      const segLen = strip.size[0];
      const h = strip.size[1];
      const n = Math.min(MAX_PIECES / 2, Math.max(1, Math.ceil(a.length / segLen)));
      const warn = strip.anims.warn?.frames ?? [];
      const brk = strip.anims.break?.frames ?? [];
      for (let i = 0; i < n; i++) {
        const p = this.piece(a, i, Layer.Ground);
        const frame = struck
          ? (brk[Math.floor(sinceStrike) % Math.max(1, brk.length)] ?? "")
          : (warn[Math.min(warn.length - 1, Math.floor(progress * warn.length))] ?? "");
        if (frame) show(p, COMBAT, frame, null);
        p.s.setOrigin(0, strip.origin[1] / h).setRotation(turn);
        crop(p, a.length - i * segLen, h);
        p.s.setAlpha(a.alpha * (struck ? Math.min(1, (FLASH - sinceStrike) / 3) : 1));
        p.s.setPosition(Math.round(a.x + cos * i * segLen), Math.round(a.y + sin * i * segLen));
        p.s.setVisible(true);
      }
      this.hideFrom(a, n);
      // The fault opens along the line when the 예보 lands: a crack for the strike's flash, or
      // plates that keep grinding for as long as the mark lives.
      const fault = a.art?.body && cat.has(a.art.body) ? a.art.body : "fx-fault";
      const fs = cat.meta.sprites[fault];
      if (fs && strikes > 0) {
        const open = fs.anims.open;
        const grind = open ? null : (Object.keys(fs.anims)[0] ?? null);
        const showing = open ? sinceStrike < FLASH : true;
        const fl = fs.size[0];
        const fh = fs.size[1];
        const fn = Math.min(MAX_PIECES - n, Math.ceil(a.length / fl));
        for (let i = 0; i < fn; i++) {
          const p = this.piece(a, n + i, Layer.Ground);
          if (!showing) {
            p.s.setVisible(false);
            continue;
          }
          const frame = open
            ? (open.frames[Math.min(open.frames.length - 1, Math.floor(sinceStrike * 1.5))] ?? "")
            : this.frameAt(fault, grind ?? "", ((t - a.a) * TICK_MS) / 1000);
          if (frame) show(p, cat.atlas(fault), frame, null);
          p.s.setOrigin(0, fs.origin[1] / fh).setRotation(turn);
          crop(p, a.length - i * fl, fh);
          p.s.setPosition(Math.round(a.x + cos * i * fl), Math.round(a.y + sin * i * fl));
          const out = open ? (FLASH - sinceStrike) / 2 : (total - t) / 3;
          p.s.setVisible(true).setAlpha(a.alpha * Math.min(1, out));
        }
      }
      return;
    }
    if (!cat.has("forecast-dot")) return;
    const gap = 6;
    const n = Math.min(MAX_PIECES - 8, Math.max(2, Math.floor(a.length / gap)));
    const lit = strikes > 0 ? n : Math.floor(progress * n);
    const fade = struck ? Math.max(0, Math.min(1, (FLASH - sinceStrike) / 3)) : 1;
    for (let i = 0; i < n; i++) {
      const p = this.piece(a, i, Layer.Ground);
      const frame = struck
        ? "forecast-dot/fire"
        : i < lit
          ? "forecast-dot/lit"
          : "forecast-dot/dim";
      show(p, COMBAT, frame, null);
      p.s.setOrigin(0.5, 0).setAlpha(a.alpha * fade * (i < lit || struck ? 1 : 0.9));
      const d = (i + 0.5) * gap;
      p.s.setPosition(Math.round(a.x + cos * d), Math.round(a.y + sin * d - 2)).setVisible(true);
    }
    this.hideFrom(a, n);
    if (struck && sinceStrike < 0.5 && a.pulses > a.variant) {
      a.variant = a.pulses;
      for (let k = 0; k < 6; k++) {
        const f = (k + 0.5) / 6;
        const x = a.x + cos * a.length * f;
        const y = a.y + sin * a.length * f;
        this.ctx.particles.burst(Bit.Debris, x, y, 2, cat.color("clay.mid"), 55, 2);
        if (k % 2 === 0) this.oneShot("fx-rock-hit", "fx-rock-hit/metamorphic", x, y - 4, a.alpha);
      }
    }
  }

  /**
   * The player's own circular 예보: the amber ring traced over the delay, then whatever the book
   * sends down: a meteor falling the last stretch of the delay, a vent rumbling up and erupting,
   * the crater or lava left where it lands. All at ×1: the ring is drawn for radius 32, and a
   * radius between drawn sizes takes the nearest drawing, never a stretched one.
   */
  private forecastCircle(
    a: Active,
    t: number,
    strikes: number,
    sinceStrike: number,
    charging: boolean,
    progress: number,
    delay: number,
  ): boolean {
    const cat = this.ctx.cat;
    const art = a.art;
    const struck = strikes > 0 && !charging;
    const p = this.piece(a, 0, Layer.Ground);
    const warn = cat.frames("fx-forecast-ring", "warn");
    const brk = cat.frames("fx-forecast-ring", "break");
    const frame = struck
      ? (brk[Math.floor(sinceStrike * 2) % Math.max(1, brk.length)] ?? "")
      : (warn[Math.min(warn.length - 1, Math.floor(progress * warn.length))] ?? "");
    if (frame) show(p, COMBAT, frame, null);
    const oy = cat.meta.sprites["fx-forecast-ring"]?.origin[1] ?? 20;
    p.s.setOrigin(0.5, 0).setPosition(Math.round(a.x), Math.round(a.y - oy));
    p.s.setVisible(true).setAlpha(a.alpha * (struck ? Math.min(1, (FLASH - sinceStrike) / 3) : 1));
    const body = art?.body && cat.has(art.body) ? art.body : null;
    const sp = body ? cat.meta.sprites[body] : undefined;
    const left = strikes === 0 ? delay - t : -1;
    if (body && sp?.anims.fall) {
      // The meteor comes down its own diagonal over the last twelve ticks, never turned.
      const q = this.piece(a, 1);
      const fallT = 12;
      if (left > 0 && left < fallT) {
        const f = 1 - left / fallT;
        show(q, cat.atlas(body), cat.frame(body), `${body}/fall`, false);
        q.s.setVisible(true).setAlpha(a.alpha);
        q.s.setPosition(Math.round(a.x + 40 * (1 - f)), Math.round(a.y - 4 - 100 * (1 - f)));
      } else q.s.setVisible(false);
    } else if (body && sp?.anims.erupt) {
      // The vent: smoking, rumbling the last half of the delay, erupting on the strike.
      const q = this.piece(a, 1, Layer.Ground);
      const anim = struck ? "erupt" : progress > 0.5 && sp.anims.rumble ? "rumble" : "smoke";
      show(q, cat.atlas(body), cat.frame(body), `${body}/${anim}`, false);
      q.s
        .setOrigin(0.5, 1)
        .setVisible(true)
        .setAlpha(a.alpha)
        .setPosition(Math.round(a.x), Math.round(a.y + 2));
    }
    if (struck && a.landed === false) {
      a.landed = true;
      const hit = art?.hit && cat.has(art.hit) ? art.hit : null;
      const anims = hit ? cat.meta.sprites[hit]?.anims : undefined;
      if (hit && anims?.land) {
        // Land once, then what lies after it: a crater lingering, lava burning out.
        const after = anims.linger ? `${hit}/linger` : anims.burn ? `${hit}/burn` : null;
        this.oneShot(hit, `${hit}/land`, a.x, a.y, a.alpha, Layer.Ground, 1, true, 0, after);
      }
    }
    if (!struck && charging && strikes > 0) a.landed = false;
    return false;
  }

  private wave(a: Active, t: number): boolean {
    const out = a.radius / Math.max(0.1, a.speed);
    const pull = (a.flags & 1) !== 0;
    const life = a.a + out + a.duration + (pull ? out : 0) + 1;
    if (t >= life) return true;
    const since = t - a.a;
    if (since < 0) {
      this.hideFrom(a, 0);
      return false;
    }
    let r: number;
    if (since < out) r = a.speed * since;
    else if (since < out + a.duration) r = a.radius;
    else r = pull ? a.radius * (1 - (since - out - a.duration) / out) : a.radius;
    const cat = this.ctx.cat;
    const art = a.art;
    let cx = a.x;
    let cy = a.y;
    if (a.mine) {
      cx = this.ctx.selfX;
      cy = this.ctx.selfY;
    }
    const ring = art?.body ? cat.meta.sprites[art.body] : undefined;
    if (art?.body && ring?.anims.out) {
      // The ring is drawn once per radius: the frame nearest the wave's radius now, on the
      // way out and, for a pull, the inward ring on the way back; a drawn fade closes it.
      const back = pull && since >= out + a.duration && ring.anims.back;
      const frames = (back ? ring.anims.back?.frames : ring.anims.out.frames) ?? [];
      const fadeFrame = `${art.body}/fade`;
      const closing = !pull && life - t < 3 && ring.frames.includes(fadeFrame);
      const frame = closing ? fadeFrame : this.nearest(frames, r);
      const p = this.piece(a, 0, Layer.Ground);
      show(p, cat.atlas(art.body), frame, null);
      p.s.setOrigin(0.5, 0).setPosition(Math.round(cx), Math.round(cy - ring.origin[1]));
      p.s.setVisible(true).setAlpha(a.alpha);
      this.hideFrom(a, 1);
      return false;
    }
    // No art: the old ring of motes in the class colour.
    const n = Math.min(MAX_PIECES, Math.max(8, Math.round(r / 5)));
    const motes = cat.meta.sprites["fx-pickup"]?.frames ?? [];
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + t * 0.05;
      const p = this.piece(a, i);
      show(p, COMBAT, motes[(i + Math.floor(t)) % 4] ?? "", null);
      p.s.setVisible(true).setAlpha(a.alpha * Math.min(1, (life - t) / 3));
      if (art) p.s.setTint(art.color);
      p.s.setPosition(
        Math.round(cx + Math.cos(ang) * r),
        Math.round(cy - 4 + Math.sin(ang) * r * 0.6),
      );
    }
    this.hideFrom(a, n);
    return false;
  }

  /**
   * Lingering ground: pools, zones and trails, drawn with their own art at ×1 (the art is drawn
   * at the content's radius, and growth is its `grow` frames), or a ring of motes where none is
   * drawn. A zone's body is a drop that lands once on the mark (중력's apple, 생태계's seed) or a
   * cloud that rides over the student; a telegraph book's trail is its body's lava `flow`, or
   * nothing where the mark already draws it along the line.
   */
  private area(a: Active, t: number): boolean {
    const life = Math.max(1, a.duration);
    if (t >= life) return true;
    const cat = this.ctx.cat;
    const art = a.art;
    let cx = a.x;
    let cy = a.y;
    if (a.anchor && this.anchorAt(a.anchor, tmp)) {
      cx = tmp.x;
      cy = tmp.y;
    }
    const secs = (t * TICK_MS) / 1000;
    const leftSecs = ((life - t) * TICK_MS) / 1000;
    if (art?.kind === "telegraph") {
      const body = art.body && cat.meta.sprites[art.body]?.anims.flow ? art.body : null;
      if (!body) {
        this.hideFrom(a, 0);
        return false;
      }
      const p = this.piece(a, 0, Layer.Ground);
      show(p, cat.atlas(body), this.frameAt(body, "flow", secs), null);
      const oy = cat.meta.sprites[body]?.origin[1] ?? 0;
      p.s.setOrigin(0.5, 0).setPosition(Math.round(cx), Math.round(cy - oy));
      p.s.setVisible(true).setAlpha(a.alpha * Math.min(1, leftSecs / 0.3));
      return false;
    }
    const r = a.radius + a.speed * t;
    const name = art?.area && cat.has(art.area) ? art.area : null;
    const fadeIn = Math.min(1, t / 2);
    const fadeOut = Math.min(1, (life - t) / 4);
    const over =
      art?.body && art.body !== name && art.kind === "zone" && cat.has(art.body) ? art.body : null;
    if (over) {
      const p = this.piece(a, 1);
      const sp = cat.meta.sprites[over];
      const anims = sp?.anims ?? {};
      const keys = Object.keys(anims);
      const loop = keys.find((k) => anims[k]?.loop);
      if (loop) {
        // A cloud: it follows the student about 30 px over their feet, drifting.
        show(p, cat.atlas(over), cat.frame(over), `${over}/${loop}`, false);
        p.s.setVisible(true).setAlpha(a.alpha * fadeIn * fadeOut);
        p.s.setPosition(Math.round(cx), Math.round(cy - 30));
      } else {
        // A drop: it lands on the mark over its own animation, then is gone. An apple falls
        // the last 24 px as it plays; a seed plants where it lies.
        const first = keys[0] ?? "";
        const def = anims[first];
        const length = def ? def.frames.length / Math.max(1, def.fps) : 0;
        if (secs < length) {
          show(p, cat.atlas(over), this.frameAt(over, first, secs), null);
          const fall = first === "drop" ? 24 * (1 - secs / length) : 0;
          p.s.setVisible(true).setAlpha(a.alpha);
          p.s.setPosition(Math.round(cx), Math.round(cy - fall - 2));
        } else p.s.setVisible(false);
      }
    }
    if (name) {
      const p = this.piece(a, 0, Layer.Ground);
      const sp = cat.meta.sprites[name];
      const anims = sp?.anims ?? {};
      const keys = Object.keys(anims);
      // Spread or land, then loop, then dry or go out: whatever the area's art names.
      const loop = keys.find((k) => anims[k]?.loop) ?? keys[0] ?? "";
      const first = keys[0] ?? loop;
      const last = keys[keys.length - 1] ?? loop;
      const lead = (anims[first]?.frames.length ?? 1) / Math.max(1, anims[first]?.fps ?? 10);
      const tail = (anims[last]?.frames.length ?? 1) / Math.max(1, anims[last]?.fps ?? 10);
      let anim = loop;
      let at = secs;
      if (secs < lead && first !== loop) anim = first;
      else if (leftSecs < tail && last !== loop) {
        anim = last;
        at = tail - leftSecs;
      }
      const frame = this.frameAt(name, anim, at);
      if (frame) show(p, COMBAT, frame, null);
      const oy = sp?.origin[1] ?? (sp?.size[1] ?? 20) / 2;
      p.s.setOrigin(0.5, 0);
      p.s.setPosition(Math.round(cx), Math.round(cy - oy));
      p.s.setVisible(true).setAlpha(a.alpha);
      this.hideFrom(a, over ? 2 : 1);
      return false;
    }
    // No art yet: a slow ring of motes in the class colour.
    const n = Math.min(MAX_PIECES, Math.max(6, Math.round(r / 4)));
    const motes = cat.meta.sprites["fx-pickup"]?.frames ?? [];
    const from = over ? 2 : 0;
    for (let i = 0; i < n && from + i < MAX_PIECES; i++) {
      const ang = (i / n) * Math.PI * 2 + t * (a.spin !== 0 ? a.spin : 0.03);
      const p = this.piece(a, from + i);
      show(p, COMBAT, motes[(i + Math.floor(t / 2)) % 4] ?? "", null);
      p.s.setVisible(true).setAlpha(a.alpha * 0.8 * fadeIn * fadeOut);
      if (art) p.s.setTint(art.color);
      p.s.setPosition(
        Math.round(cx + Math.cos(ang) * r),
        Math.round(cy + Math.sin(ang) * r * 0.55),
      );
    }
    this.hideFrom(a, from + n);
    return false;
  }

  private dash(a: Active, t: number): boolean {
    const life = Math.max(FLASH, a.duration + 3);
    if (t >= life) return true;
    const cat = this.ctx.cat;
    const fade = Math.min(1, (life - t) / 3);
    const ang = Math.atan2(a.ty - a.y, a.tx - a.x);
    const body = a.art?.body && cat.has(a.art.body) ? a.art.body : null;
    const anims = body ? cat.meta.sprites[body]?.anims : undefined;
    if (body && anims?.leave && anims.arrive) {
      // A blink: the mark it leaves where it was and the one it lands on, the same tick. The
      // axes left behind on the ground are the trail's own art.
      const secs = (t * TICK_MS) / 1000;
      const p0 = this.piece(a, 0);
      const p1 = this.piece(a, 1);
      show(p0, cat.atlas(body), this.frameAt(body, "leave", secs), null);
      show(p1, cat.atlas(body), this.frameAt(body, "arrive", secs), null);
      p0.s
        .setVisible(true)
        .setAlpha(a.alpha * fade)
        .setPosition(Math.round(a.x), Math.round(a.y - 8));
      p1.s
        .setVisible(true)
        .setAlpha(a.alpha * fade)
        .setPosition(Math.round(a.tx), Math.round(a.ty - 8));
      return false;
    }
    if (body && anims?.d0) {
      // The bow wave, the drawing for its heading, rides in front of the student along the
      // dash, two fainter copies behind it.
      const key = `${body}/d${dir16(ang)}`;
      const f = a.duration > 0 ? Math.min(1, t / a.duration) : 1;
      let hx = a.x + (a.tx - a.x) * f;
      let hy = a.y + (a.ty - a.y) * f;
      if (a.mine) {
        hx = this.ctx.selfX;
        hy = this.ctx.selfY;
      }
      hx += Math.cos(ang) * 8;
      hy += Math.sin(ang) * 8 - 8;
      for (let i = 0; i < 3; i++) {
        const p = this.piece(a, i);
        show(p, cat.atlas(body), cat.frame(body), key, false);
        p.s.setVisible(true).setAlpha(a.alpha * fade * (i === 0 ? 1 : i === 1 ? 0.45 : 0.2));
        p.s.setPosition(
          Math.round(hx - Math.cos(ang) * 10 * i),
          Math.round(hy - Math.sin(ang) * 10 * i),
        );
      }
      return false;
    }
    const n = Math.min(6, Math.max(2, Math.round(Math.hypot(a.tx - a.x, a.ty - a.y) / 16)));
    for (let i = 0; i < n; i++) {
      const f = (i + 1) / (n + 1);
      const p = this.piece(a, i);
      show(p, COMBAT, cat.frame("fx-dodge-streak"), "fx-dodge-streak/streak", false);
      p.s
        .setVisible(true)
        .setAlpha(a.alpha * fade * (0.4 + 0.6 * f))
        .setRotation(ang)
        .setFlipX(false);
      p.s.setPosition(Math.round(a.x + (a.tx - a.x) * f), Math.round(a.y - 6 + (a.ty - a.y) * f));
    }
    return false;
  }

  // Impacts --------------------------------------------------------------------------------

  /** Where an effect lands: its impact art, sparks, and the hook for shake. */
  private impact(a: Active, x: number, y: number, hit: boolean): void {
    const cat = this.ctx.cat;
    if (a.kind === FxKind.EnemyShot) {
      this.oneShot("proj-shadow", "proj-shadow/pop", x, y - 2);
      return;
    }
    const art = a.art;
    if (!art) return;
    if (!hit && a.kind === FxKind.Shot) {
      // Out of range: a faint puff, no impact.
      this.oneShot("fx-pop", "fx-pop/die", x, y - 4, a.alpha * 0.5);
      return;
    }
    let name = art.hit && cat.has(art.hit) ? art.hit : null;
    let anim: string | null = name ? art.hitAnim : null;
    if (name === "fx-rock-hit")
      anim =
        ["fx-rock-hit/igneous", "fx-rock-hit/sedimentary", "fx-rock-hit/metamorphic"][a.variant] ??
        anim;
    if (!name) {
      name = "fx-hit-heavy";
      anim = "fx-hit-heavy/hit";
    }
    // Lobs land on the ground; everything else lands where it was.
    if (a.kind === FxKind.Lob) {
      if (art.area && cat.has(art.area) && art.area.endsWith("crater")) {
        this.oneShot(art.area, `${art.area}/land`, x, y, a.alpha, Layer.Ground, 1, true);
      }
      this.cue(name, x, y - 2, a.alpha, anim);
    } else if (a.kind !== FxKind.Mark) {
      this.cue(name, x, y - 4, a.alpha, anim);
    }
    this.hooks.impact(a, x, y);
  }

  /**
   * A book's landing art played the way it is drawn: a single animation once; a loop (a bleed,
   * a burn) held for a moment; an animation that settles into a loop (a label slapped on, then
   * stuck) played into it and held.
   */
  cue(
    sprite: string,
    x: number,
    y: number,
    alpha = 1,
    anim: string | null = null,
    layer: Layer = Layer.Glow,
  ): void {
    const sp = this.ctx.cat.meta.sprites[sprite];
    if (!sp) return;
    const keys = Object.keys(sp.anims);
    const key = anim ?? `${sprite}/${keys[0] ?? ""}`;
    if (this.loops.get(key)) {
      const last = keys[keys.length - 1];
      const out =
        last && !sp.anims[last]?.loop && key !== `${sprite}/${last}` ? `${sprite}/${last}` : null;
      this.oneShot(sprite, key, x, y, alpha, layer, 1, false, 600, out);
      return;
    }
    const second = keys[1];
    const settle = !anim && second && sp.anims[second]?.loop ? `${sprite}/${second}` : null;
    this.oneShot(sprite, key, x, y, alpha, layer, 1, false, settle ? 900 : 0, settle);
  }

  /**
   * Plays an animation once at (x, y) and hands the piece back when it ends. A looping
   * animation never ends, so it is refused unless `holdMs` says how long to hold it; `then`
   * plays after the first (once, or held for `holdMs` when it loops). `stopAt` ends early on a
   * frame (a ring drawn per radius stops at the size that was struck). Returns the sprite, so a
   * caller can flip it, or null when nothing plays.
   */
  oneShot(
    sprite: string,
    anim: string | null,
    x: number,
    y: number,
    alpha = 1,
    layer: Layer = Layer.Glow,
    scale = 1,
    ground = false,
    holdMs = 0,
    then: string | null = null,
    stopAt = "",
  ): Phaser.GameObjects.Sprite | null {
    const cat = this.ctx.cat;
    const sp = cat.meta.sprites[sprite];
    if (!sp) return null;
    const key = anim ?? `${sprite}/${Object.keys(sp.anims)[0] ?? ""}`;
    const exists = this.ctx.scene.anims.exists(key);
    const looping = exists && this.loops.get(key) === true;
    if (looping && holdMs <= 0) return null;
    if (then && this.loops.get(then) === true && holdMs <= 0) then = null;
    const p = this.pieces.take(layer);
    const s = show(p, cat.atlas(sprite), cat.frame(sprite), null);
    s.setAlpha(alpha).setScale(scale);
    if (ground || layer === Layer.Ground) {
      const oy = sp.origin[1];
      s.setOrigin(0.5, 0).setPosition(Math.round(x), Math.round(y - oy * scale));
    } else {
      // The art's own origin: a strike or a heal stands on its foot, a spark sits on its centre.
      s.setOrigin(sp.origin[0] / sp.size[0], sp.origin[1] / sp.size[1]);
      s.setPosition(Math.round(x), Math.round(y));
    }
    const l = this.loosePool.pop() ?? new Loose();
    l.p = p;
    l.hold = holdMs;
    l.next = then;
    l.stopAt = stopAt;
    if (!exists) {
      l.stage = 3;
      l.until = this.ctx.now + 200;
    } else {
      s.play(key);
      l.stage = looping ? 1 : 0;
      l.until = this.ctx.now + holdMs;
    }
    this.loose.push(l);
    return s;
  }

  /** Moves every one-shot along: the next stage when its animation or hold is over. */
  private updateLoose(now: number): void {
    for (let i = 0; i < this.loose.length; ) {
      const l = this.loose[i] as Loose;
      const s = (l.p as Piece).s;
      let done = false;
      if (l.stage === 0 || l.stage === 2) {
        if (l.stopAt && s.frame.name === l.stopAt) {
          s.anims.stop();
          l.stage = 3;
          l.until = now + 80;
        } else if (!s.anims.isPlaying) {
          if (l.stage === 0 && l.next) {
            const looping = this.loops.get(l.next) === true;
            s.play(l.next);
            l.next = null;
            l.stage = looping ? 1 : 2;
            l.until = now + l.hold;
          } else done = true;
        }
      } else if (now >= l.until) {
        if (l.stage === 1 && l.next) {
          s.play(l.next);
          l.next = null;
          l.stage = 2;
        } else done = true;
      }
      if (done) {
        this.pieces.give(l.p as Piece);
        l.p = null;
        this.loosePool.push(l);
        this.loose[i] = this.loose[this.loose.length - 1] as Loose;
        this.loose.pop();
        continue;
      }
      i++;
    }
  }

  /** Sparks in a colour at (x, y). */
  sparks(x: number, y: number, n: number, color: number, speed = 90): void {
    this.ctx.particles.burst(Bit.Spark, x, y, n, color, speed, 0);
  }

  clear(): void {
    for (const a of this.live) this.free(a);
    this.live.length = 0;
    this.byFx.clear();
    this.others = 0;
    for (const l of this.loose) {
      if (l.p) this.pieces.give(l.p);
      l.p = null;
      this.loosePool.push(l);
    }
    this.loose.length = 0;
  }

  destroy(): void {
    this.clear();
    this.pieces.destroy();
  }

  /** Number of burst kinds, for the hooks' switch. */
  static readonly Burst = BurstKind;
}
