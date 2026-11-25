/**
 * Everything the fight draws that is not a body: every effect record the snapshot carries
 * (shots, lobs, orbits, beams, chains, cones, marks, waves, areas, dashes, monsters' tells and
 * public bursts), each moved on the client from its spawn record alone, plus the instant swing
 * the local player's own casts play before the server has answered.
 *
 * Timing: the player's own effects and the dangers aimed at them run on the newest snapshot's
 * clock, so they line up with the predicted body and with the hit records; everyone else's run
 * on the world clock with the bodies they come from.
 */
import { BurstKind, FxKind, type WireFx } from "@guago/shared";
import * as Phaser from "phaser";
import type { Bodies, Body } from "./bodies.ts";
import { type BookArt, COMBAT } from "./catalog.ts";
import type { FightContext } from "./context.ts";
import { Bit } from "./particles.ts";
import { Layer, type Piece, Pieces, show } from "./pieces.ts";

/** Chains, follow-ups and marks stay drawn this long, ticks (the step's FLASH_TICKS). */
const FLASH = 6;
/** A predicted cast the server has not answered within this is withdrawn, ms. */
const PREDICT_MS = 320;
/** Most pieces one effect uses. */
const MAX_PIECES = 32;

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

/** One of sixteen directions for art drawn turned in steps of 22.5°, 0 pointing right. */
export function dir16(angle: number): number {
  return ((Math.round(angle / (Math.PI / 8)) % 16) + 16) % 16;
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
  private others = 0;
  private rockTurn = 0;
  private turn = 0;
  /** Books the local player wears evolved, by rules index (from its inventory). */
  private readonly evolvedOwn = new Set<number>();

  constructor(ctx: FightContext, bodies: Bodies, hooks: EffectHooks) {
    this.ctx = ctx;
    this.bodies = bodies;
    this.hooks = hooks;
    this.pieces = new Pieces(ctx.scene, ctx.view);
  }

  get count(): number {
    return this.live.length;
  }

  /** Which of the local player's books are evolved, by rules index. */
  setEvolved(books: Iterable<number>): void {
    this.evolvedOwn.clear();
    for (const b of books) this.evolvedOwn.add(b);
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
  private piece(a: Active, i: number, layer: Layer = Layer.Glow, additive = false): Piece {
    let p = a.pieces[i];
    if (!p) {
      p = this.pieces.take(layer, additive);
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
    // moment its operation lands, a snapshot or two before the records start saying so.
    const evolved = !enemy && (f.evolved || (own && this.evolvedOwn.has(f.def & 127)));
    a.art = enemy ? null : this.ctx.cat.book(f.def & 127, evolved);
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
      // The caster swings when its effect leaves its hands.
      const caster = enemy ? undefined : this.hooks.body(f.owner);
      if (caster) this.bodies.attack(caster);
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
    return true;
  }

  update(dtMs: number): void {
    const now = this.ctx.now;
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
      i++;
    }
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
    if (!a.key) a.key = this.bodyKey(a, name, enemy);
    const still = a.key.startsWith("#");
    const anim = still ? null : a.key || null;
    // A red rim under every enemy shot: danger is red, and only danger.
    if (enemy) {
      const rim = this.piece(a, 0, Layer.Glow, true);
      show(rim, COMBAT, cat.frame("fx-pickup"), null);
      rim.s.setTint(cat.color("red.light")).setAlpha(0.55 + 0.25 * Math.sin(this.ctx.now * 0.03));
      rim.s.setPosition(Math.round(x), Math.round(y));
    }
    const p = this.piece(a, enemy ? 1 : 0);
    const s = show(p, cat.atlas(name), still ? a.key.slice(1) : cat.frame(name), anim, false);
    s.setVisible(true).setAlpha(a.alpha);
    if (art?.turns) s.setRotation(a.angle);
    s.setPosition(Math.round(x), Math.round(y - (enemy ? 2 : 4)));
    if (name === "fx-book" && art && !enemy) s.setTint(art.color);
    // Smear: two ghosts behind anything fast.
    if (!enemy && a.speed >= 6) {
      for (let g = 1; g <= 2; g++) {
        const gp = this.piece(a, g);
        const gs = show(gp, cat.atlas(name), s.frame.name, null);
        gs.setFrame(s.frame.name, false, false);
        gs.setVisible(true)
          .setAlpha(a.alpha * (g === 1 ? 0.45 : 0.2))
          .setRotation(s.rotation);
        gs.setPosition(
          Math.round(x - Math.cos(a.angle) * a.speed * 0.25 * g),
          Math.round(y - 4 - Math.sin(a.angle) * a.speed * 0.25 * g),
        );
        if (art) gs.setTint(art.color);
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
      sh.s.setAlpha(0.35 * a.alpha);
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
      const shape = ["tri", "tri", "square", "penta", "hexa", "circle"][Math.min(5, n)] ?? "tri";
      anim = `fx-wangdo/${shape}`;
    } else if (!art?.body || !cat.has(art.body)) {
      body = "fx-book";
    }
    // Grow in over the first two ticks, out over the last two.
    const grow = Math.min(1, t / 2, (a.duration - t) / 2);
    const turn = (2 * Math.PI * t) / Math.max(1, a.period);
    if (cat.meta.sprites[body]?.frames.includes(`${body}/rod`)) {
      // A pendulum: the pivot over the player, the rod in beads, the bob at the end.
      const ang = a.angle + (a.sweep / 2) * Math.sin(turn) + a.spin * t;
      const r = a.radius * (0.5 + 0.5 * grow);
      const px = tmp.x;
      const py = tmp.y - 10;
      const beads = Math.max(2, Math.min(MAX_PIECES - 2, Math.round(r / 5)));
      for (let i = 0; i <= beads + 1; i++) {
        const p = this.piece(a, i);
        const f = i / (beads + 1);
        const frame = i === 0 ? `${body}/pivot` : i === beads + 1 ? `${body}/bob` : `${body}/rod`;
        show(p, cat.atlas(body), frame, null);
        p.s.setVisible(true).setAlpha(a.alpha * Math.min(1, grow * 2));
        p.s.setPosition(
          Math.round(px + Math.cos(ang) * r * f),
          Math.round(py + Math.sin(ang) * r * f * 0.7),
        );
      }
      this.hideFrom(a, beads + 2);
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
    // The beam draws out over two ticks and thins out over the last two.
    const reach = a.length * Math.min(1, t / 2);
    const fade = Math.min(1, (life - t) / 2);
    let ox = a.x + a.ox;
    let oy = a.y - 6 + a.oy;
    if (a.mine) {
      ox = this.ctx.selfX + Math.cos(a.angle) * 6;
      oy = this.ctx.selfY - 8 + Math.sin(a.angle) * 6;
    }
    // The segment art carries the wave itself: segments tile along the straight line, and a
    // higher harmonic is drawn flatter.
    const step = cat.meta.sprites[seg]?.size[0] ?? 16;
    const n = Math.min(MAX_PIECES - 3, Math.ceil(reach / step));
    const cos = Math.cos(a.angle);
    const sin = Math.sin(a.angle);
    const flat = a.count > 1 ? Math.max(0.35, 1 / a.count) : 1;
    let lx = ox;
    let ly = oy;
    for (let i = 0; i < n; i++) {
      const left = Math.min(step, reach - i * step);
      const p = this.piece(a, i + 2);
      const s = show(
        p,
        cat.atlas(seg),
        cat.frame(seg),
        art?.body === seg ? art.bodyAnim : null,
        false,
      );
      s.setVisible(true).setAlpha(a.alpha * fade);
      s.setOrigin(0, 0.5)
        .setRotation(a.angle)
        .setScale(left / step, flat);
      s.setPosition(Math.round(ox + cos * i * step), Math.round(oy + sin * i * step));
      if (seg !== art?.body && art) s.setTint(art.color);
      lx = ox + cos * (i * step + left);
      ly = oy + sin * (i * step + left);
    }
    this.hideFrom(a, n + 2);
    const origin = this.piece(a, 0, Layer.Glow, true);
    if (cat.has("fx-graph-origin")) {
      show(origin, COMBAT, cat.frame("fx-graph-origin"), "fx-graph-origin/hold", false);
      origin.s
        .setVisible(true)
        .setAlpha(a.alpha * fade)
        .setPosition(Math.round(ox), Math.round(oy));
      if (art && art.cls !== "math") origin.s.setTint(art.color);
    }
    const head = this.piece(a, 1, Layer.Glow, true);
    if (cat.has("fx-graph-head")) {
      show(head, COMBAT, cat.frame("fx-graph-head"), "fx-graph-head/pulse", false);
      head.s
        .setVisible(n > 0)
        .setAlpha(a.alpha * fade)
        .setPosition(Math.round(lx), Math.round(ly));
      if (art && art.cls !== "math") head.s.setTint(art.color);
    }
    return false;
  }

  private chainFx(a: Active, t: number): boolean {
    if (t >= FLASH) return true;
    const cat = this.ctx.cat;
    const fade = Math.min(1, (FLASH - t) / 2);
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
      const node = this.piece(a, used++, Layer.Glow, true);
      show(node, COMBAT, cat.frame("fx-bolt-node"), "fx-bolt-node/strike", false);
      node.s
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
   * right angles (which keep every pixel), with the a, b and c variants swapped every frame.
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
    const legs: [number, number, number][] = [
      [horizontal ? sx : 0, horizontal ? 0 : sy, rest / 2],
      [sx, sy, diag],
      [horizontal ? sx : 0, horizontal ? 0 : sy, rest / 2],
    ];
    const flick = Math.floor(this.ctx.now / 50);
    for (const [ux, uy, len] of legs) {
      if (len < 1) continue;
      const diagonal = ux !== 0 && uy !== 0;
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
        const part = Math.min(step, len - i * step) / step;
        const p = this.piece(a, used++, Layer.Glow, true);
        const v = ["a", "b", "c"][(k + i + flick) % 3] as string;
        const frames = this.ctx.cat.frames(sprite, v);
        show(
          p,
          COMBAT,
          frames[flick % Math.max(1, frames.length)] ?? this.ctx.cat.frame(sprite),
          null,
        );
        if (diagonal) p.s.setOrigin(3 / 26, 3 / 26).setScale(part, part);
        else p.s.setOrigin(0, 6 / 13).setScale(part, 1);
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
    const body = art?.body && cat.has(art.body) && art.kind === "cone" ? art.body : "fx-slash";
    const anims = cat.meta.sprites[body]?.anims ?? {};
    const fade = a.alpha * Math.min(1, (life - t) / 2);
    if (anims.fan0) {
      // A spray drawn in sixteen directions: the one nearest the aim, never turned.
      const p = this.piece(a, 0, Layer.Glow, cat.meta.sprites[body]?.blend === "add");
      const fresh = a.pulses === 0;
      if (fresh) a.pulses = 1;
      show(p, cat.atlas(body), cat.frame(body), `${body}/fan${dir16(a.angle)}`, fresh);
      p.s
        .setVisible(true)
        .setAlpha(fade)
        .setPosition(Math.round(x), Math.round(y - 8));
      return false;
    }
    if (cat.meta.sprites[body]?.frames.includes(`${body}/bond`)) {
      // A whip of atoms laid along the aim: carbon, bond, carbon …, the tip snapping at the end.
      const n = Math.min(MAX_PIECES, Math.max(2, Math.round(a.length / 7)));
      const grow = Math.min(1, (t - a.a + 1) / 2);
      const shown = Math.max(1, Math.round(n * grow));
      for (let i = 0; i < n; i++) {
        const p = this.piece(a, i);
        const last = i === shown - 1;
        const frame = last ? `${body}/tip0` : i % 2 === 0 ? `${body}/carbon` : `${body}/bond`;
        show(
          p,
          cat.atlas(body),
          cat.meta.sprites[body]?.frames.includes(frame) ? frame : `${body}/carbon`,
          null,
        );
        const d = 6 + i * 7;
        p.s.setVisible(i < shown).setAlpha(fade);
        p.s.setPosition(
          Math.round(x + Math.cos(a.angle) * d),
          Math.round(y - 8 + Math.sin(a.angle) * d),
        );
      }
      return false;
    }
    const p = this.piece(a, 0, Layer.Glow, body !== "fx-slash");
    const fresh = a.pulses === 0;
    if (fresh) a.pulses = 1;
    const anim = body === art?.body ? art.bodyAnim : "fx-slash/swing";
    const s = show(p, cat.atlas(body), cat.frame(body), anim, fresh);
    const w = cat.meta.sprites[body]?.size[0] ?? 24;
    s.setVisible(true).setAlpha(a.alpha * Math.min(1, (life - t) / 2));
    if (body === "fx-slash") {
      s.setOrigin(0.2, 0.5).setScale(Math.max(0.6, a.length / w), 1);
      if (art) s.setTint(art.color);
    } else
      s.setOrigin(2 / w, 0.5).setScale(
        Math.max(0.5, a.length / (w - 2)),
        Math.max(0.6, a.width * 1.6),
      );
    s.setRotation(a.angle);
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
    if (line && !enemy && cat.has("forecast-dot")) {
      // The player's 예보: an amber line traced dot by dot over the delay; when it lands the
      // dots flash, the fault opens along it and stones jump out.
      const gap = 6;
      const n = Math.min(MAX_PIECES - 8, Math.max(2, Math.floor(a.length / gap)));
      const cos = Math.cos(a.angle);
      const sin = Math.sin(a.angle);
      const lit = strikes > 0 ? n : Math.floor(progress * n);
      const struck = strikes > 0 && !charging;
      const fade = struck ? Math.max(0, Math.min(1, (FLASH - sinceStrike) / 3)) : 1;
      for (let i = 0; i < n; i++) {
        const p = this.piece(a, i, Layer.Ground);
        const frame = struck
          ? "forecast-dot/fire"
          : i < lit
            ? "forecast-dot/lit"
            : "forecast-dot/dim";
        show(p, COMBAT, frame, null);
        p.s.setOrigin(0.5, 0).setAlpha(a.alpha * fade * (i < lit || struck ? 1 : 0.6));
        const d = (i + 0.5) * gap;
        p.s.setPosition(Math.round(a.x + cos * d), Math.round(a.y + sin * d - 2)).setVisible(true);
      }
      this.hideFrom(a, n);
      if (struck && sinceStrike < 0.5 && a.pulses > (a.variant as number)) {
        a.variant = a.pulses;
        for (let k = 0; k < 6; k++) {
          const f = (k + 0.5) / 6;
          const x = a.x + cos * a.length * f;
          const y = a.y + sin * a.length * f;
          this.ctx.particles.burst(Bit.Debris, x, y, 2, this.ctx.cat.color("clay.mid"), 55, 2);
          if (k % 2 === 0)
            this.oneShot("fx-rock-hit", "fx-rock-hit/metamorphic", x, y - 4, a.alpha);
        }
      }
      return false;
    }
    if (line && enemy && cat.has("tell-dot")) {
      // A charge's path: dots every few pixels that never turn, lit from the monster outward
      // over the wind-up, all white for the strike.
      const gap = 6;
      const n = Math.min(MAX_PIECES, Math.max(2, Math.floor(a.length / gap)));
      const cos = Math.cos(a.angle);
      const sin = Math.sin(a.angle);
      const lit = strikes > 0 ? n : Math.floor(progress * n);
      const fade = strikes > 0 ? Math.max(0, Math.min(1, (FLASH - sinceStrike) / 3)) : 1;
      const blink = Math.floor(this.ctx.now / 90) % 2 === 0;
      for (let i = 0; i < n; i++) {
        const p = this.piece(a, i, Layer.Ground);
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
        p.s.setAlpha(a.alpha * fade * (i < lit || strikes > 0 ? 1 : 0.7));
        const d = (i + 1) * gap;
        p.s.setPosition(Math.round(a.x + cos * d), Math.round(a.y + sin * d - 2));
        p.s.setVisible(true);
      }
      this.hideFrom(a, n);
      return false;
    }
    if (line) {
      const art = enemy ? "tele-line" : cat.has("fx-forecast") ? "fx-forecast" : "tele-line";
      const segLen = (cat.meta.sprites[art]?.size[0] ?? 32) - 0;
      const n = Math.min(MAX_PIECES, Math.max(1, Math.ceil(a.length / segLen)));
      const cos = Math.cos(a.angle);
      const sin = Math.sin(a.angle);
      for (let i = 0; i < n; i++) {
        const p = this.piece(a, i, Layer.Ground);
        let frame: string;
        if (enemy) {
          const frames = cat.meta.sprites[art]?.anims.charge?.frames ?? [];
          frame =
            strikes > 0
              ? (cat.meta.sprites[art]?.anims.fire?.frames[Math.floor(sinceStrike * 2) % 3] ?? "")
              : (frames[Math.floor(this.ctx.now / 100 + i) % Math.max(1, frames.length)] ?? "");
        } else if (!charging) {
          frame = cat.meta.sprites[art]?.anims.break?.frames[Math.floor(sinceStrike) % 3] ?? "";
        } else {
          const frames = cat.meta.sprites[art]?.anims.warn?.frames ?? [];
          frame = frames[Math.min(frames.length - 1, Math.floor(progress * frames.length))] ?? "";
        }
        if (frame) show(p, COMBAT, frame, null);
        const seg = Math.min(segLen, a.length - i * segLen);
        p.s
          .setOrigin(0, 0.5)
          .setRotation(a.angle)
          .setScale(seg / segLen, Math.max(0.6, a.width / 13));
        p.s.setAlpha(
          a.alpha * (strikes > 0 && !charging ? Math.min(1, (FLASH - sinceStrike) / 3) : 1),
        );
        p.s.setPosition(Math.round(a.x + cos * i * segLen), Math.round(a.y + sin * i * segLen));
        p.s.setVisible(true);
      }
      this.hideFrom(a, n);
      // The fault itself opens along the line when the 예보 lands.
      if (!enemy && strikes > 0 && cat.has("fx-fault") && sinceStrike < FLASH) {
        const fn = Math.min(MAX_PIECES - n, Math.ceil(a.length / 48));
        for (let i = 0; i < fn; i++) {
          const p = this.piece(a, n + i, Layer.Ground);
          const frames = cat.meta.sprites["fx-fault"]?.anims.open?.frames ?? [];
          const frame = frames[Math.min(frames.length - 1, Math.floor(sinceStrike * 1.5))] ?? "";
          show(p, COMBAT, frame, null);
          const seg = Math.min(48, a.length - i * 48);
          p.s
            .setOrigin(0, 16 / 28)
            .setRotation(a.angle)
            .setScale(seg / 48, 1);
          p.s.setPosition(Math.round(a.x + cos * i * 48), Math.round(a.y + sin * i * 48));
          p.s.setVisible(true).setAlpha(Math.min(1, (FLASH - sinceStrike) / 2));
        }
      }
      return false;
    }
    if (!enemy && cat.has("fx-forecast-ring"))
      return this.forecastCircle(a, t, strikes, sinceStrike, charging, progress, delay);
    // A circle.
    const art = "tele-circle";
    const p = this.piece(a, 0, Layer.Ground);
    const fill = cat.meta.sprites[art]?.anims.fill?.frames ?? [];
    const fire = cat.meta.sprites[art]?.anims.fire?.frames ?? [];
    const frame =
      strikes > 0 && !charging
        ? (fire[Math.floor(sinceStrike * 2) % Math.max(1, fire.length)] ?? "")
        : (fill[Math.min(fill.length - 1, Math.floor(progress * fill.length))] ?? "");
    if (frame) show(p, COMBAT, frame, null);
    const r = Math.max(8, a.radius);
    const sx = r / 22;
    p.s.setOrigin(0.5, 0).setScale(sx, sx);
    p.s.setPosition(Math.round(a.x), Math.round(a.y - 13 * sx));
    p.s
      .setVisible(true)
      .setAlpha(a.alpha * (strikes > 0 && !charging ? Math.min(1, (FLASH - sinceStrike) / 3) : 1));
    // The player's own telegraph is amber, never hazard red.
    if (!enemy) p.s.setTint(this.ctx.cat.color("gold.light"));
    return false;
  }

  /**
   * The player's own circular 예보: the amber ring traced over the delay, then whatever the book
   * sends down: a meteor falling the last stretch of the delay, a vent rumbling up and erupting,
   * the crater or lava left where it lands.
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
    const r = Math.max(8, a.radius);
    const scale = Math.max(0.5, r / 32);
    const struck = strikes > 0 && !charging;
    const p = this.piece(a, 0, Layer.Ground);
    const warn = cat.frames("fx-forecast-ring", "warn");
    const brk = cat.frames("fx-forecast-ring", "break");
    const frame = struck
      ? (brk[Math.floor(sinceStrike * 2) % Math.max(1, brk.length)] ?? "")
      : (warn[Math.min(warn.length - 1, Math.floor(progress * warn.length))] ?? "");
    if (frame) show(p, COMBAT, frame, null);
    p.s
      .setOrigin(0.5, 0)
      .setScale(scale, scale)
      .setPosition(Math.round(a.x), Math.round(a.y - 20 * scale));
    p.s.setVisible(true).setAlpha(a.alpha * (struck ? Math.min(1, (FLASH - sinceStrike) / 3) : 1));
    const body = art?.body && cat.has(art.body) ? art.body : null;
    const sp = body ? cat.meta.sprites[body] : undefined;
    const left = strikes === 0 ? delay - t : -1;
    if (body && sp?.anims.fall) {
      // The meteor comes down over the last twelve ticks.
      const q = this.piece(a, 1, Layer.Glow, sp.blend === "add");
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
      const anim = struck ? "erupt" : progress > 0.5 ? "rumble" : "smoke";
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
      if (hit && cat.meta.sprites[hit]?.anims.land)
        this.oneShot(hit, `${hit}/land`, a.x, a.y, a.alpha, Layer.Ground, undefined, scale, true);
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
      // way out and, for a pull, the inward ring on the way back.
      const back = pull && since >= out + a.duration && ring.anims.back;
      const frames = (back ? ring.anims.back?.frames : ring.anims.out.frames) ?? [];
      let best = frames[0] ?? "";
      let bestD = Number.POSITIVE_INFINITY;
      for (const f of frames) {
        const m = /(\d+)$/.exec(f);
        if (!m) continue;
        const d = Math.abs(Number(m[1]) - r);
        if (d < bestD) {
          bestD = d;
          best = f;
        }
      }
      const p = this.piece(a, 0, Layer.Ground);
      show(p, cat.atlas(art.body), best, null);
      const h = ring.size[1];
      p.s.setOrigin(0.5, 0).setPosition(Math.round(cx), Math.round(cy - h / 2));
      p.s.setVisible(true).setAlpha(a.alpha * Math.min(1, (life - t) / 3));
      if (ring.blend === "add") p.s.setBlendMode(Phaser.BlendModes.ADD);
      this.hideFrom(a, 1);
      return false;
    }
    const n = Math.min(MAX_PIECES, Math.max(8, Math.round(r / 5)));
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + t * 0.05;
      const p = this.piece(a, i, Layer.Glow, true);
      show(p, COMBAT, cat.frame("fx-pickup"), null);
      p.s.setFrame(
        cat.meta.sprites["fx-pickup"]?.frames[(i + Math.floor(t)) % 4] ?? "",
        false,
        false,
      );
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

  /** Lingering ground: pools, zones and trails, drawn with their own art or a ring of light. */
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
    const r = a.radius + a.speed * t;
    const name = art?.area && cat.has(art.area) ? art.area : null;
    const fadeIn = Math.min(1, t / 2);
    const fadeOut = Math.min(1, (life - t) / 4);
    // What hangs over the area (a storm cloud, a falling weight) rides above it.
    const over =
      art?.body && art.body !== name && art.kind === "zone" && cat.has(art.body) ? art.body : null;
    if (over) {
      const p = this.piece(a, 1);
      const anims = cat.meta.sprites[over]?.anims ?? {};
      const loop = Object.keys(anims).find((k) => anims[k]?.loop) ?? Object.keys(anims)[0] ?? "";
      show(p, cat.atlas(over), cat.frame(over), loop ? `${over}/${loop}` : null, false);
      p.s.setVisible(true).setAlpha(a.alpha * fadeIn * fadeOut);
      p.s.setPosition(Math.round(cx), Math.round(cy - Math.max(18, r * 0.55)));
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
      const secs = (t * 50) / 1000;
      const leftSecs = ((life - t) * 50) / 1000;
      let frames = anims[loop]?.frames ?? [];
      let f = Math.floor(secs * (anims[loop]?.fps ?? 8));
      if (secs < lead && first !== loop) {
        frames = anims[first]?.frames ?? frames;
        f = Math.floor(secs * (anims[first]?.fps ?? 8));
      } else if (leftSecs < tail && last !== loop) {
        frames = anims[last]?.frames ?? frames;
        f = Math.floor((tail - leftSecs) * (anims[last]?.fps ?? 8));
      }
      const frame = frames[Math.min(frames.length - 1, f % Math.max(1, frames.length))] ?? "";
      if (frame) show(p, COMBAT, frame, null);
      const w = sp?.size[0] ?? 40;
      const h = sp?.size[1] ?? 20;
      const scale = Math.max(0.4, (r * 2) / (w - 4));
      p.s.setOrigin(0.5, 0).setScale(scale, scale);
      p.s.setPosition(Math.round(cx), Math.round(cy - (h / 2) * scale));
      p.s.setVisible(true).setAlpha(a.alpha);
      this.hideFrom(a, over ? 2 : 1);
      return false;
    }
    // No art yet: a slow ring of motes in the class colour, with a ground ring under it.
    const n = Math.min(MAX_PIECES, Math.max(6, Math.round(r / 4)));
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + t * (a.spin !== 0 ? a.spin : 0.03);
      const p = this.piece(a, i, Layer.Glow, true);
      show(
        p,
        COMBAT,
        cat.meta.sprites["fx-pickup"]?.frames[(i + Math.floor(t / 2)) % 4] ?? "",
        null,
      );
      p.s.setVisible(true).setAlpha(a.alpha * 0.8 * fadeIn * fadeOut);
      if (art) p.s.setTint(art.color);
      p.s.setPosition(
        Math.round(cx + Math.cos(ang) * r),
        Math.round(cy + Math.sin(ang) * r * 0.55),
      );
    }
    this.hideFrom(a, n);
    return false;
  }

  private dash(a: Active, t: number): boolean {
    const life = Math.max(FLASH, a.duration + 3);
    if (t >= life) return true;
    const cat = this.ctx.cat;
    const n = Math.min(6, Math.max(2, Math.round(Math.hypot(a.tx - a.x, a.ty - a.y) / 16)));
    const fade = Math.min(1, (life - t) / 3);
    const ang = Math.atan2(a.ty - a.y, a.tx - a.x);
    const body = a.art?.body && cat.has(a.art.body) ? a.art.body : null;
    if (body && cat.meta.sprites[body]?.anims.d0) {
      // The dash's own drawing, one of sixteen headings, along the path behind the player.
      const key = `${body}/d${dir16(ang)}`;
      for (let i = 0; i < n; i++) {
        const f = (i + 1) / (n + 1);
        const p = this.piece(a, i, Layer.Glow, cat.meta.sprites[body]?.blend === "add");
        show(p, cat.atlas(body), cat.frame(body), key, false);
        p.s.setVisible(true).setAlpha(a.alpha * fade * (0.35 + 0.65 * f));
        p.s.setPosition(Math.round(a.x + (a.tx - a.x) * f), Math.round(a.y - 8 + (a.ty - a.y) * f));
      }
      return false;
    }
    for (let i = 0; i < n; i++) {
      const f = (i + 1) / (n + 1);
      const p = this.piece(a, i, Layer.Glow, true);
      show(p, COMBAT, cat.frame("fx-dodge-streak"), "fx-dodge-streak/streak", false);
      p.s
        .setVisible(true)
        .setAlpha(a.alpha * fade * (0.4 + 0.6 * f))
        .setRotation(ang)
        .setFlipX(false);
      if (a.art) p.s.setTint(a.art.color);
      p.s.setPosition(Math.round(a.x + (a.tx - a.x) * f), Math.round(a.y - 6 + (a.ty - a.y) * f));
    }
    return false;
  }

  // Impacts --------------------------------------------------------------------------------

  /** Where an effect lands: its impact art, sparks, and the hook for shake and light. */
  private impact(a: Active, x: number, y: number, hit: boolean): void {
    const cat = this.ctx.cat;
    if (a.kind === FxKind.EnemyShot) {
      this.oneShot("proj-shadow", "proj-shadow/pop", x, y - 2, 1, Layer.Glow);
      return;
    }
    const art = a.art;
    if (!art) return;
    if (!hit && a.kind === FxKind.Shot) {
      // Out of range: a small puff, no impact.
      this.oneShot("fx-pop", "fx-pop/die", x, y - 4, a.alpha * 0.5, Layer.Glow, art.color, 0.5);
      return;
    }
    let name = art.hit && cat.has(art.hit) ? art.hit : null;
    let anim = name ? art.hitAnim : null;
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
        this.oneShot(art.area, `${art.area}/land`, x, y, a.alpha, Layer.Ground, undefined, 1, true);
      }
      this.oneShot(name, anim, x, y - 2, a.alpha, Layer.Glow);
    } else if (a.kind !== FxKind.Mark) {
      this.oneShot(name, anim, x, y - 4, a.alpha, Layer.Glow);
    }
    this.hooks.impact(a, x, y);
  }

  /** Plays one animation once at (x, y) and hands the piece back when it ends. */
  oneShot(
    sprite: string,
    anim: string | null,
    x: number,
    y: number,
    alpha = 1,
    layer: Layer = Layer.Glow,
    tint?: number,
    scale = 1,
    ground = false,
    rotation = 0,
  ): void {
    const cat = this.ctx.cat;
    if (!cat.has(sprite)) return;
    const additive = cat.meta.sprites[sprite]?.blend === "add";
    const p = this.pieces.take(layer, additive);
    const s = show(p, cat.atlas(sprite), cat.frame(sprite), null);
    s.setAlpha(alpha).setScale(scale).setRotation(rotation);
    if (tint !== undefined) s.setTint(tint);
    if (ground || layer === Layer.Ground) {
      const h = cat.meta.sprites[sprite]?.size[1] ?? 16;
      const oy = cat.meta.sprites[sprite]?.origin[1] ?? h / 2;
      s.setOrigin(0.5, 0).setPosition(Math.round(x), Math.round(y - oy * scale));
    } else s.setPosition(Math.round(x), Math.round(y));
    const key = anim ?? `${sprite}/${Object.keys(cat.meta.sprites[sprite]?.anims ?? {})[0] ?? ""}`;
    if (this.ctx.scene.anims.exists(key)) {
      s.play(key);
      s.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => this.pieces.give(p));
    } else {
      this.ctx.scene.time.delayedCall(200, () => this.pieces.give(p));
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
  }

  destroy(): void {
    this.clear();
    this.pieces.destroy();
  }

  /** Number of burst kinds, for the hooks' switch. */
  static readonly Burst = BurstKind;
}
