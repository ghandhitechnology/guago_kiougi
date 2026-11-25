/**
 * The fight on screen: one entry for the game scene.
 *
 * ```ts
 * preload() { FightView.preload(this); }
 * // on joining a room: a reader of its own, which reads every snapshot from the first
 * this.reader = new SnapshotReader();
 * // once the map view is built (behind the curtain):
 * this.fight = FightView.attach(this, mapView, room, this.reader, { self: () => drawn, mover });
 * // every snapshot, in order, attached or not:
 * this.fight ? this.fight.read(bytes) : this.reader.read(bytes, sink);
 * update(time, delta) { ...move and place the camera...; this.fight.update(time, delta); }
 * // leaving through a door: this.fight.detach();
 * ```
 *
 * It draws every monster, other player, minion, effect, tell and drop the room's snapshots
 * carry in the map view with the hit feel of PLAN §6, plays the fight's sound, takes the fight's
 * controls, and keeps `state` for the HUD with `actions` for its buttons.
 */
import type { Room } from "@colyseus/sdk";
import type { HitClass } from "@guago/audio";
import { BOOKS, FIELD_PACING, narrative } from "@guago/content";
import {
  AIM_MESSAGE,
  CONTROL_MODES,
  castFlag,
  DODGE,
  expToNext,
  type FloorView,
  InputFlag,
  KNOCKOUT,
  MAX_AIM,
  type MapState,
  MODE_AUTO,
  MODE_MESSAGE,
  type PlayerState,
  Priv,
  REVIVE_MESSAGE,
  type SnapshotReader,
  type SnapshotSink,
  TICK_MS,
  type WireDrop,
  type WireFx,
  type WireHit,
  type WireHurt,
  type WireSelf,
} from "@guago/shared";
import * as Phaser from "phaser";
import { createSpriteAnims, loadArt } from "../art.ts";
import { composeDoll, normalizeLook } from "../doll.ts";
import type { MapView, Tier } from "../render/index.ts";
import { TEX } from "../render/textures.ts";
import { Bodies, type Body, Cat, PState, Rank } from "./bodies.ts";
import { Catalog, CLASS_RAMP, COMBAT } from "./catalog.ts";
import { TickClock } from "./clock.ts";
import { type FightContext, RESTRAINT } from "./context.ts";
import { type ControlSink, FightKeys, MouseAim, nextMode } from "./controls.ts";
import { Effects } from "./effects.ts";
import { EvolutionMoment } from "./evolution.ts";
import { Feedback, TRAUMA } from "./feedback.ts";
import { HudFeed } from "./hud-source.ts";
import { FightLights } from "./lights.ts";
import { DamageNumbers } from "./numbers.ts";
import { Overlays } from "./overlays.ts";
import { Bit, Particles } from "./particles.ts";
import { Pickups } from "./pickups.ts";
import { Layer } from "./pieces.ts";
import { FightSound } from "./sound.ts";
import { emptyState, type FightActions, type FightState } from "./state.ts";
import { Trauma } from "./trauma.ts";

export interface FightOptions {
  /** Where the movement code draws the local player this frame; the fight draws its body there. */
  readonly self?: () =>
    | { readonly x: number; readonly y: number; readonly facing?: number }
    | undefined;
  /** The movement code's mover: dodges and casts ride on its inputs (`SelfMover.queue`). */
  readonly mover?: { queue(flags: number): void };
  /** The own body from each snapshot's Self record, for the mover to reconcile against. */
  readonly onSelf?: (me: WireSelf) => void;
  readonly tier?: Tier;
  /**
   * A field with monsters (default true): the reticle and the mouse's aim are on and the music
   * follows the waves. A town keeps the default cursor and leaves the music alone.
   */
  readonly field?: boolean;
  /** A student's foot landed, at their feet. */
  readonly onStep?: (x: number, y: number, self: boolean) => void;
  /** Keyboard and mouse. Default true; the HUD's touch controls call `actions` instead. */
  readonly controls?: boolean;
  /** The bar under the player's feet. Default true; off when the HUD draws its own. */
  readonly selfBar?: boolean;
  /** The 쉬는 시간 banner. Default true. */
  readonly banners?: boolean;
  /**
   * How far the thing the interact key would use is, px. E revives a knocked-out ally only when
   * the ally is at least as near; otherwise the key is the world's.
   */
  readonly useDistance?: () => number;
  /** The map has a floor for duels or boss fights: the crowd steps back there too. */
  readonly floors?: boolean;
}

/** Atlases the fight draws from, besides the map's. */
const ATLASES = ["core", "effects", "combat", "combat-evolved", "ui"];
const DEPTH_RETICLE = 30;
const DEPTH_SCREEN = 28;
/** Most new looks composed per frame, so a crowd arriving does not hitch. */
const LOOKS_PER_FRAME = 2;
const REVIVE_REACH = KNOCKOUT.reviveRange + 6;
const DOWN_DIM = 0.28;
/** An elite arriving this close shakes the screen; farther ones are heard and pointed at. */
const ELITE_NEAR = 260;

/** A seat's look as last composed: its parts, and the texture they made. */
interface Look {
  body: string;
  hair: string;
  hairColor: string;
  face: string;
  uniform: string;
  accessories: string[];
  key: string;
}

type LookState = NonNullable<PlayerState["look"]>;

const BLANK_LOOK = { body: "", hair: "", hairColor: "", face: "", uniform: "" } as const;

/** Whether a seat's look is the one already composed, compared part by part with no strings made. */
function sameLook(a: Look, b: LookState): boolean {
  if (
    a.body !== b.body ||
    a.hair !== b.hair ||
    a.hairColor !== b.hairColor ||
    a.face !== b.face ||
    a.uniform !== b.uniform ||
    a.accessories.length !== b.accessories.length
  )
    return false;
  for (let i = 0; i < a.accessories.length; i++) {
    if (a.accessories[i] !== b.accessories[i]) return false;
  }
  return true;
}

export class FightView {
  readonly state: FightState = emptyState();
  readonly actions: FightActions;
  /** What the HUD binds: `bindFight(fight.hud)` (`hud/fight.ts`). */
  readonly hud: HudFeed;

  private readonly scene: Phaser.Scene;
  private readonly view: MapView;
  private readonly room: Room<unknown, MapState>;
  private readonly options: FightOptions;
  private readonly ctx: FightContext;
  private readonly cat: Catalog;
  private readonly bodies: Bodies;
  private readonly effects: Effects;
  private readonly pickups: Pickups;
  private readonly overlays: Overlays;
  private readonly feedback: Feedback;
  private readonly reader: SnapshotReader;
  private readonly clock = new TickClock();
  /** The own body's health and shield, from the Self record. */
  private selfHp = 0;
  private selfShield = 0;
  private readonly keys: FightKeys | null;
  private readonly aim: MouseAim | null;
  private readonly reticle: Phaser.GameObjects.Image | null;
  private readonly offs: (() => void)[] = [];
  private readonly sink: SnapshotSink;
  private own: PlayerState | undefined;
  private readonly at = { x: 0, y: 0 };
  private readonly aimSink: ControlSink;
  private selfSlotKey = "";
  private readonly looks = new Map<number, Look>();
  private readonly lookQueue: number[] = [];
  private defaultLook = "";
  /** The local player's books by slot, as indices into the rules' book list. */
  private ownBooks: number[] = [];
  private rollAt = -1e9;
  private readonly ghosts: Phaser.GameObjects.Sprite[] = [];
  /** The local player's evolved books, by rules index. */
  private readonly evolvedBooks: number[] = [];
  /** 중화's shield around the player while it holds. */
  private bubble: Phaser.GameObjects.Sprite | null = null;
  private readonly trail: { x: number; y: number }[] = [];
  private readonly dim: Phaser.GameObjects.Image;
  private dimLevel = 0;
  private readonly banner: Phaser.GameObjects.BitmapText;
  private bannerAt = -1e9;
  private readonly arrows: Phaser.GameObjects.Image[] = [];
  private readonly elites: { id: number; until: number }[] = [];
  private lastTime = 0;
  private wasDown = false;
  private modeSentAt = -1e9;
  private sentMode = -1;
  private otherSoundAt = 0;
  /** Development numbers. */
  readonly counters = {
    snapshots: 0,
    bytes: 0,
    frames: 0,
    phases: 0,
    elites: 0,
    levelUps: 0,
    downs: 0,
    revives: 0,
  };

  /** Queues what the fight draws from on the scene's loader. */
  static preload(scene: Phaser.Scene): void {
    loadArt(scene, { atlases: ATLASES, fonts: true });
  }

  /**
   * Starts drawing the fight of `room` in `view`. `reader` is the room's own, which has read
   * every snapshot since the join; whoever it already holds comes into view at once.
   */
  static attach(
    scene: Phaser.Scene,
    view: MapView,
    room: Room<unknown, MapState>,
    reader: SnapshotReader,
    options: FightOptions = {},
  ): FightView {
    return new FightView(scene, view, room, reader, options);
  }

  private constructor(
    scene: Phaser.Scene,
    view: MapView,
    room: Room<unknown, MapState>,
    reader: SnapshotReader,
    options: FightOptions,
  ) {
    this.scene = scene;
    this.view = view;
    this.room = room;
    this.reader = reader;
    this.options = options;
    const meta = view.meta;
    createSpriteAnims(scene, meta);
    this.cat = new Catalog(meta);
    const tier = options.tier ?? view.qualityTier;
    const restraint = RESTRAINT[tier];
    this.ctx = {
      scene,
      view,
      cat: this.cat,
      particles: new Particles(scene, view, restraint.particles),
      numbers: new DamageNumbers(scene),
      sound: new FightSound(),
      lights: new FightLights(view, tier),
      trauma: new Trauma(),
      tier,
      restraint,
      now: 0,
      tick: 0,
      ownTick: 0,
      selfId: 0,
      selfSlot: -1,
      selfClass: "math",
      selfX: 0,
      selfY: 0,
      selfFacing: 0,
    };
    this.defaultLook = composeDoll(scene, meta, normalizeLook(meta, {}));
    this.bodies = new Bodies(this.ctx, {
      look: (slot) => this.lookOf(slot),
      died: (b) => this.feedback.died(b),
      gone: () => {},
      step: (b) => options.onStep?.(b.x, b.y, b.self),
    });
    this.effects = new Effects(this.ctx, this.bodies, {
      body: (id) => this.bodies.get(id),
      impact: (a, x, y) => this.feedback.impact(a, x, y),
      burst: (kind, x, y, r, owner, chain) => this.feedback.burst(kind, x, y, r, owner, chain),
      fired: (a) => this.feedback.fired(a),
      fighter: (id) => this.isFighter(id),
    });
    this.pickups = new Pickups(this.ctx, this.effects.pieces);
    this.overlays = new Overlays(this.ctx);
    this.feedback = new Feedback(this.ctx, this.bodies, this.effects, {
      bookOf: (slot) => this.ownBooks[slot] ?? -1,
      maxHp: () => this.own?.maxHp ?? 1,
      moment: (kind) => this.moment(kind),
      elite: (b, x, y) => this.eliteArrived(b, x, y),
      wears: (bookId) => this.ownBooks.includes(this.cat.rules.books.indexOf(bookId)),
      streak: (mark) => this.streakMark(mark),
      classOf: (slot) => this.room.state?.players.get(String(slot))?.major || "math",
    });
    this.own = undefined;
    this.bodies.crowd = (options.field ?? true) || (options.floors ?? false);

    this.sink = {
      enter: (m) => this.bodies.enter(m, this.reader.tick),
      leave: (m, reason) => this.bodies.leave(m, reason, this.reader.tick),
      fx: (f) => this.onFx(f),
      fxEnd: (fx, x, y) => this.effects.end(fx, x, y, this.reader.tick),
      hit: (h) => this.onHit(h),
      hurt: (h) => this.onHurt(h),
      drop: (d) => this.onDrop(d),
      collect: (id) => this.pickups.collect(id),
      cast: () => {},
      self: (me) => {
        this.selfHp = me.hp;
        this.selfShield = me.shield;
        this.options.onSelf?.(me);
      },
      note: (type, a) => this.onNote(type, a),
    };

    // Screen pieces: the dim while knocked out, the 쉬는 시간 banner, elite arrows.
    const cam = scene.cameras.main;
    this.dim = scene.add
      .image(0, 0, TEX.px)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDisplaySize(cam.width, cam.height)
      .setTint(this.cat.color("ink.deep"))
      .setAlpha(0)
      .setDepth(DEPTH_SCREEN)
      .setVisible(false);
    this.banner = scene.add
      .bitmapText(cam.width / 2, -20, "galmuri11-bold", "쉬는 시간")
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(DEPTH_SCREEN + 1)
      .setTint(this.cat.color("gold.pale"))
      .setDropShadow(1, 1, this.cat.color("ink.deep"), 1)
      .setVisible(false);

    const field = options.field ?? true;
    const controls = options.controls ?? true;
    const sinkControls: ControlSink = {
      aim: (dx, dy, on) => this.room.send(AIM_MESSAGE, on ? [dx, dy] : []),
      mode: () => this.actions.cycleMode(),
      cast: (slot) => this.actions.cast(slot),
      dodge: () => this.actions.dodge(),
      revive: () => this.actions.revive(),
    };
    this.aimSink = sinkControls;
    this.keys = controls ? new FightKeys(sinkControls) : null;
    // The mouse aims wherever a fight can happen: a field, or a floor for duels.
    this.aim = controls && (field || (options.floors ?? false)) ? new MouseAim(scene) : null;
    this.reticle = this.aim
      ? scene.add.image(0, 0, "ui", "reticle/idle").setDepth(DEPTH_RETICLE).setVisible(false)
      : null;
    if (this.aim) scene.input.setDefaultCursor("none");

    this.actions = {
      cast: (slot) => this.cast(slot),
      dodge: () => this.dodge(),
      cycleMode: () => this.setMode(nextMode(this.state.mode)),
      setMode: (m) => this.setMode(m),
      aimAt: (x, y) => {
        const dx = Math.max(-MAX_AIM, Math.min(MAX_AIM, Math.round(x - this.ctx.selfX)));
        const dy = Math.max(-MAX_AIM, Math.min(MAX_AIM, Math.round(y - this.ctx.selfY)));
        this.room.send(AIM_MESSAGE, [dx, dy]);
      },
      clearAim: () => this.room.send(AIM_MESSAGE, []),
      revive: () => this.revive(),
    };
    this.hud = new HudFeed(this.state, this.actions, () => ({
      x: this.ctx.selfX,
      y: this.ctx.selfY,
    }));

    const onState = (s: MapState) => this.onState(s);
    room.onStateChange(onState);
    this.offs.push(() => room.onStateChange.remove(onState));
    if (room.state) this.onState(room.state);
    // Whoever the reader already holds came in before the view was up: they enter now, and the
    // own health is the last Self record's (the next one comes only when it changes).
    for (const m of reader.members.values()) this.bodies.enter(m, reader.tick);
    if (reader.hasSelf) {
      this.selfHp = reader.me.hp;
      this.selfShield = reader.me.shield;
    }
    this.ctx.sound.start(field);
  }

  // Room ---------------------------------------------------------------------------------------

  private onState(state: MapState): void {
    let own = this.selfSlotKey ? state.players.get(this.selfSlotKey) : undefined;
    if (own?.sid !== this.room.sessionId) {
      own = undefined;
      for (const [slot, p] of state.players) {
        if (p.sid !== this.room.sessionId) continue;
        this.selfSlotKey = slot;
        own = p;
        this.ctx.selfSlot = Number(slot);
        this.bodies.markSelf(this.ctx.selfSlot);
      }
    }
    this.own = own;
    if (own) {
      this.ctx.selfClass = own.major || "math";
      // Patches come twenty times a second for everyone; the books are compared in place.
      let changed = own.books.length !== this.ownBooks.length;
      for (let i = 0; !changed && i < own.books.length; i++) {
        changed = this.cat.rules.books.indexOf(own.books[i] ?? "") !== this.ownBooks[i];
      }
      if (changed) this.ownBooks = [...own.books].map((id) => this.cat.rules.books.indexOf(id));
    }
    // Looks of everyone seated, composed a few a frame.
    for (const [slot, p] of state.players) {
      if (!p.sid || !p.look) continue;
      const n = Number(slot);
      const had = this.looks.get(n);
      if (had && sameLook(had, p.look)) continue;
      if (this.lookQueue.includes(n)) continue;
      // The default look stands in until the seat's own is composed.
      if (!had) this.looks.set(n, { ...BLANK_LOOK, accessories: [], key: this.defaultLook });
      this.lookQueue.push(n);
    }
  }

  private composeQueued(): void {
    const state = this.room.state;
    for (let i = 0; i < LOOKS_PER_FRAME && this.lookQueue.length > 0; i++) {
      const slot = this.lookQueue.shift() as number;
      const p = state?.players.get(String(slot));
      const look = p?.look;
      if (!look) continue;
      const key = composeDoll(
        this.scene,
        this.view.meta,
        normalizeLook(this.view.meta, {
          body: look.body,
          hair: look.hair,
          hairColor: look.hairColor,
          face: look.face,
          uniform: look.uniform,
          accessories: [...look.accessories],
        }),
      );
      this.looks.set(slot, {
        body: look.body,
        hair: look.hair,
        hairColor: look.hairColor,
        face: look.face,
        uniform: look.uniform,
        accessories: [...look.accessories],
        key,
      });
    }
  }

  private lookOf(slot: number): string {
    return this.looks.get(slot)?.key ?? this.defaultLook;
  }

  /** One snapshot message of the room, read in order: every one from the attach on comes here. */
  read(bytes: Uint8Array): void {
    this.counters.snapshots++;
    this.counters.bytes += bytes.byteLength;
    this.feedback.mineThisMessage.clear();
    this.reader.read(bytes, this.sink);
    this.feedback.flush();
    const tick = this.reader.tick;
    this.clock.observe(tick, performance.now());
    this.bodies.sync(tick, this.reader.members);
    // The self body, once seen: its entity names the local player's effects and hits.
    const self = this.bodies.self;
    this.ctx.selfId = self ? self.id : 0;
    // Others' hits on monsters: a quiet sound, a few a second.
    const now = this.ctx.now;
    if (now - this.otherSoundAt > 140) {
      for (const m of this.reader.members.values()) {
        if (!m.flash || this.feedback.mineThisMessage.has(m.id)) continue;
        const b = this.bodies.get(m.id);
        if (!b || (b.cat !== Cat.Monster && !(this.duelOn && b.cat === Cat.Player && !b.self)))
          continue;
        if (Math.abs(b.x - this.ctx.selfX) > 300 || Math.abs(b.y - this.ctx.selfY) > 200) continue;
        this.feedback.otherHit(b, this.nearestClass(b.x, b.y));
        this.otherSoundAt = now;
        break;
      }
    }
  }

  /** The class of the other student nearest a point, for the sound of their hit. */
  private nearestClass(x: number, y: number): string {
    let best = Number.POSITIVE_INFINITY;
    let slot = -1;
    for (const b of this.bodies.byId.values()) {
      if (b.cat !== Cat.Player || b.self) continue;
      const d = Math.abs(b.x - x) + Math.abs(b.y - y);
      if (d < best) {
        best = d;
        slot = b.slot;
      }
    }
    const major = slot >= 0 ? this.room.state?.players.get(String(slot))?.major : undefined;
    return major || "math";
  }

  private onFx(f: WireFx): void {
    this.effects.spawn(f, this.reader.tick);
  }

  /** Share of a book slot's cooldown left now, from the owner's `ready` and `cooldown` ticks. */
  private cooldownLeft(slot: number): number {
    const own = this.own;
    const ready = own?.ready[slot] ?? 0;
    const span = Math.max(1, own?.cooldown[slot] ?? 1);
    return Math.max(0, Math.min(1, (ready - this.ctx.ownTick) / span));
  }

  private readonly hit = {
    target: 0,
    amount: 0,
    flags: 0,
    slot: 0,
    proof: 0,
    hp: 255,
    kx: 0,
    ky: 0,
    count: 1,
  };

  private onHit(h: WireHit): void {
    const x = this.hit;
    x.target = h.target;
    x.amount = h.amount;
    x.flags = h.flags;
    x.slot = h.slot;
    x.proof = h.proof;
    x.hp = h.hp;
    x.kx = h.kx;
    x.ky = h.ky;
    x.count = h.count;
    this.feedback.hit(x);
  }

  private onHurt(h: WireHurt): void {
    this.feedback.hurt(h.source, h.amount, h.flags);
  }

  private onDrop(d: WireDrop): void {
    this.pickups.drop(d);
  }

  private onNote(type: number, a: number): void {
    switch (type) {
      case Priv.Phase:
        this.phase(a === 1);
        break;
      case Priv.LevelUp:
        this.ctx.sound.self("jingle.level-up");
        break;
      case Priv.Merit:
        this.ctx.sound.self("ui.stamp");
        break;
      case Priv.Roll:
        if (this.ctx.now - this.rollAt > 300) this.startRoll();
        break;
      case Priv.Down:
        this.moment(Priv.Down);
        break;
      case Priv.Revive:
        this.moment(Priv.Revive);
        break;
      case Priv.Wake:
        this.moment(Priv.Wake);
        break;
    }
  }

  // Actions ------------------------------------------------------------------------------------

  private setMode(mode: number): void {
    const m = ((mode % CONTROL_MODES.length) + CONTROL_MODES.length) % CONTROL_MODES.length;
    this.room.send(MODE_MESSAGE, [m]);
    this.sentMode = m;
    this.modeSentAt = this.ctx.now;
    this.state.mode = m;
    this.ctx.sound.self("ui.tab");
  }

  private serverTick(): number {
    return this.clock.newest;
  }

  private canRoll(): boolean {
    const own = this.own;
    if (!own || own.down > 0) return false;
    if (this.ctx.now - this.rollAt < DODGE.invulnerableSeconds * 1000) return false;
    return this.serverTick() + 1 >= own.dodgeReady;
  }

  private dodge(): void {
    if (this.held) return;
    if (MODE_AUTO[this.state.mode as 0]?.dodge) return;
    if (!this.canRoll()) return;
    this.options.mover?.queue(InputFlag.Dodge);
    this.startRoll();
  }

  /** The roll's after-images, dust and sound; its 0.25 s of invulnerability shows as white ghosts. */
  private startRoll(): void {
    this.rollAt = this.ctx.now;
    this.trail.length = 0;
    this.effects.oneShot("fx-dodge-dust", "fx-dodge-dust/kick", this.ctx.selfX, this.ctx.selfY, 1);
    this.ctx.sound.self("combat.dodge");
    const self = this.bodies.self;
    if (self) this.bodies.kick(self, -0.8);
  }

  private bookReady(slot: number): boolean {
    return (this.own?.ready[slot] ?? 0) <= this.ctx.ownTick + 0.5;
  }

  private cast(slot: number): void {
    this.state.picked = slot;
    if (this.keys) this.keys.picked = slot;
    if (!this.own || this.own.down > 0 || slot >= this.ownBooks.length || this.held) return;
    if (MODE_AUTO[this.state.mode as 0]?.books) return;
    if (!this.bookReady(slot)) {
      this.ctx.sound.self("ui.error");
      return;
    }
    this.options.mover?.queue(castFlag(slot));
    const book = this.ownBooks[slot] as number;
    const art = this.cat.book(book);
    let angle: number;
    if (this.aim?.active)
      angle = Math.atan2(this.aim.y - (this.ctx.selfY - 8), this.aim.x - this.ctx.selfX);
    else {
      const f = this.bodies.self?.facing ?? 0;
      angle = [Math.PI / 2, -Math.PI / 2, Math.PI, 0][f] ?? 0;
    }
    // The swing plays now; the server's record takes it over, or it fades without landing.
    this.effects.predict(book, this.ctx.selfX, this.ctx.selfY, angle);
    const self = this.bodies.self;
    if (self) {
      this.bodies.attack(self);
      this.bodies.kick(self, -0.5);
    }
    this.ctx.sound.self(art.cast);
  }

  /** The knocked-out ally nearest the player within reach, or null. */
  private downedAlly(): Body | null {
    let best: Body | null = null;
    let bestD = REVIVE_REACH;
    for (const b of this.bodies.byId.values()) {
      if (b.cat !== Cat.Player || b.self || !b.down) continue;
      const d = Math.hypot(b.x - this.ctx.selfX, b.y - this.ctx.selfY);
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    return best;
  }

  /** How far the knocked-out ally E would revive is, px; infinite when nobody is in reach. */
  reviveDistance(): number {
    const b = this.downedAlly();
    return b ? Math.hypot(b.x - this.ctx.selfX, b.y - this.ctx.selfY) : Number.POSITIVE_INFINITY;
  }

  private revive(): void {
    const best = this.downedAlly();
    if (!best) return;
    // The thing the key would use is nearer: the key is the world's.
    const use = this.options.useDistance?.() ?? Number.POSITIVE_INFINITY;
    if (this.reviveDistance() > use) return;
    this.room.send(REVIVE_MESSAGE, [best.slot]);
  }

  // Moments ------------------------------------------------------------------------------------

  private phase(surge: boolean): void {
    this.counters.phases++;
    const was = this.state.wave.phase;
    this.state.wave.phase = surge ? "surge" : "lull";
    this.state.wave.since = this.ctx.now;
    if ((was === "surge") === surge) return;
    this.ctx.sound.phase(surge);
    if (surge) {
      this.ctx.sound.self("sfx.field.surge");
      this.ctx.trauma.add(0.15);
    } else {
      this.ctx.sound.self("sfx.field.bell");
      if (this.options.banners ?? true) this.bannerAt = this.ctx.now;
    }
  }

  private moment(kind: number): void {
    const cat = this.cat;
    const x = this.ctx.selfX;
    const y = this.ctx.selfY;
    const self = this.bodies.self;
    switch (kind) {
      case Priv.LevelUp:
        this.counters.levelUps++;
        this.ctx.trauma.add(TRAUMA.levelUp);
        this.ctx.lights.strike(x, y - 10, cat.color("gold.light"), 32, 0.9, 500);
        if (self) {
          self.flash = 3;
          self.flashMode = 0;
          this.bodies.kick(self, -1.4);
        }
        break;
      case Priv.Down:
        this.counters.downs++;
        this.ctx.trauma.add(TRAUMA.down);
        this.ctx.sound.self("combat.knockout");
        this.ctx.particles.burst(Bit.Debris, x, y, 6, cat.color("stone.light"), 50, 1);
        this.effects.oneShot("fx-dodge-dust", "fx-dodge-dust/kick", x, y, 1);
        break;
      case Priv.Revive:
        this.counters.revives++;
        this.ctx.sound.self("combat.revive");
        this.ctx.lights.strike(x, y - 10, cat.color("gold.pale"), 32, 0.9, 450);
        this.effects.oneShot("fx-revive", "fx-revive/glow", x, y, 1, Layer.Glow, 1, 1000);
        this.ctx.particles.burst(Bit.Mote, x, y - 10, 14, cat.color("gold.pale"), 50, 0);
        this.ctx.trauma.add(0.15);
        break;
      case Priv.Wake:
        this.ctx.sound.self("combat.revive");
        this.effects.oneShot("fx-revive", "fx-revive/glow", x, y, 1, Layer.Glow, 1, 1000);
        break;
    }
  }

  /** An elite arrives: the brass and gong, a red shock ring, the ground jumps, an arrow if it is off screen. */
  private eliteArrived(b: Body | undefined, x: number, y: number): void {
    this.counters.elites++;
    const cat = this.cat;
    // One near the player takes the whole screen; a far one is a horn in the distance and an
    // arrow at the edge, so a busy field does not shake every few seconds.
    const d = Math.hypot(x - this.ctx.selfX, y - this.ctx.selfY);
    const near = d < ELITE_NEAR;
    if (near) {
      this.ctx.sound.self("sfx.monster.elite.spawn");
      this.ctx.trauma.add(TRAUMA.elite);
      this.ctx.lights.strike(
        this.ctx.selfX,
        this.ctx.selfY - 12,
        cat.color("plum.light"),
        32,
        0.9,
        500,
      );
    } else {
      this.ctx.sound.cue("sfx.monster.elite.spawn", x, y, false);
      this.ctx.trauma.add(TRAUMA.elite * 0.2);
    }
    // The ring an elite lands in, drawn at the arrival's size: never the small ring doubled.
    this.effects.oneShot("tele-circle", "tele-circle/fire48", x, y, 0.9, Layer.Ground);
    this.ctx.particles.burst(Bit.Debris, x, y, near ? 12 : 6, cat.color("clay.light"), 90, 2);
    if (b) {
      b.arriveAt = this.ctx.now;
      this.bodies.kick(b, -1.6);
      this.elites.push({ id: b.id, until: this.ctx.now + 6000 });
    }
  }

  /**
   * The kill streak passed 10, 25, 50, 100 (then every hundred): a burst on the player that
   * grows with the mark, a note that climbs, and the field shaken.
   */
  private streakMark(mark: number): void {
    const cat = this.cat;
    const x = this.ctx.selfX;
    const y = this.ctx.selfY;
    const step = mark >= 100 ? 3 : mark >= 50 ? 2 : mark >= 25 ? 1 : 0;
    const gold = cat.color(step >= 2 ? "gold.pale" : "gold.light");
    this.effects.oneShot(
      "fx-hit-crit",
      "fx-hit-crit/hit",
      x,
      y - 12,
      1,
      Layer.Glow,
      step >= 1 ? 2 : 1,
    );
    this.effects.oneShot("fx-pop", "fx-pop/die", x, y - 12, 1, Layer.Glow, step >= 2 ? 2 : 1);
    this.ctx.particles.burst(Bit.Spark, x, y - 10, 16 + step * 8, gold, 180 + step * 30, 0);
    this.ctx.particles.burst(Bit.Mote, x, y - 6, 10 + step * 4, gold, 60, 0);
    this.bodies.shove(x, y, 48 + step * 16, 3 + step);
    this.ctx.lights.strike(x, y - 10, gold, 32, 0.9, 400);
    this.ctx.sound.streakMark(this.ctx.selfClass, step);
    this.ctx.trauma.add(0.2 + step * 0.06);
    const self = this.bodies.self;
    if (self) {
      self.flash = 2;
      self.flashMode = 0;
      this.bodies.kick(self, -1.4);
    }
  }

  /** Book slots whose ready tick has had its wind-up. */
  private readonly wound: number[] = [];

  /**
   * Where books cast themselves, each book's next cast winds up at the player's hands a beat
   * before it is ready, when there is something near to cast at.
   */
  private windups(): void {
    const own = this.own;
    if (!own || own.down > 0 || !this.bodies.self) return;
    if (!MODE_AUTO[this.state.mode as 0]?.books) return;
    let near = false;
    for (let i = 0; i < this.ownBooks.length; i++) {
      const ready = own.ready[i] ?? 0;
      if (this.wound[i] === ready) continue;
      const left = ready - this.ctx.ownTick;
      if (left > 2.6 || left < -1) continue;
      this.wound[i] = ready;
      if (!near) near = this.monsterWithin(170);
      if (!near) return;
      this.effects.windup(this.ownBooks[i] as number, this.ctx.selfX, this.ctx.selfY);
      this.bodies.kick(this.bodies.self, 0.35);
    }
  }

  private monsterWithin(r: number): boolean {
    const r2 = r * r;
    for (const b of this.bodies.byId.values()) {
      if (b.cat !== Cat.Monster || b.dying) continue;
      const dx = b.x - this.ctx.selfX;
      const dy = b.y - this.ctx.selfY;
      if (dx * dx + dy * dy < r2) return true;
    }
    return false;
  }

  // Frame --------------------------------------------------------------------------------------

  /** Draws the fight for this frame. Call at the end of the scene's update, after the camera is placed. */
  update(time: number, delta: number): void {
    const now = time;
    const dt = Math.min(100, this.lastTime === 0 ? delta : now - this.lastTime || delta);
    this.lastTime = now;
    const ctx = this.ctx;
    ctx.now = now;
    this.counters.frames++;
    const rt = this.clock.at(performance.now());
    ctx.tick = rt;
    // Own effects run on the newest snapshot, so a shot lands on the frame its hit arrives; never
    // more than a quarter tick past what the server has said, so nothing overshoots its end.
    ctx.ownTick = Math.min(rt + this.clock.delay, this.clock.newest + 0.25);
    const at = this.options.self?.();
    const selfBody = this.bodies.self;
    if (at) {
      ctx.selfX = at.x;
      ctx.selfY = at.y;
      if (at.facing !== undefined) ctx.selfFacing = at.facing;
    } else if (selfBody) {
      selfBody.track.sample(ctx.ownTick, this.at);
      ctx.selfX = this.at.x;
      ctx.selfY = this.at.y;
    }
    ctx.sound.lx = ctx.selfX;
    ctx.sound.ly = ctx.selfY;
    this.composeQueued();
    if (this.counters.frames % 10 === 0) this.rankStudents();
    this.feedback.frame();
    this.controlsFrame(now);
    this.windups();
    this.bodies.update(dt, rt);
    this.selfFrame(now);
    this.effects.update(dt);
    this.pickups.update();
    const own = this.own;
    const hpShare = own ? Math.max(0, this.selfHp) / Math.max(1, own.maxHp) : 1;
    this.overlays.update(this.bodies.byId.values(), dt, hpShare, this.options.selfBar ?? true);
    ctx.numbers.update(dt, ctx.selfX, ctx.selfY);
    ctx.particles.update(dt);
    ctx.lights.update(dt);
    ctx.sound.update(now);
    this.screenFrame(now, dt);
    if (this.evo && !this.evo.update(now)) this.evo = null;
    ctx.trauma.apply(this.scene.cameras.main, dt);
    this.refreshState(now);
    this.hud.update(now);
  }

  private controlsFrame(now: number): void {
    const mode = this.state.mode;
    const manual = !MODE_AUTO[mode as 0]?.books;
    if (this.aim) {
      this.aim.update(now, this.ctx.selfX, this.ctx.selfY - 8, manual, this.aimSink);
      if (this.aim.takeClick()) this.cast(this.state.picked);
      if (this.reticle) {
        const ready = manual && this.bookReady(this.state.picked);
        this.reticle
          .setPosition(Math.round(this.aim.x), Math.round(this.aim.y))
          .setFrame(ready ? "reticle/ready" : "reticle/idle")
          .setVisible(this.aim.active)
          .setAlpha(manual ? 1 : 0.7);
      }
    }
    this.keys?.update(now);
  }

  /** The local player's roll ghosts and invulnerable shimmer, and the shield's bubble. */
  private selfFrame(now: number): void {
    const shielded = this.selfShield > 0 && this.bodies.self !== null;
    if (shielded && !this.bubble && this.cat.has("fx-shield-bubble")) {
      const b = new Phaser.GameObjects.Sprite(
        this.scene,
        0,
        0,
        COMBAT,
        this.cat.frame("fx-shield-bubble"),
      );
      this.view.addEffect(b);
      b.play("fx-shield-bubble/hold");
      this.bubble = b;
      this.ctx.sound.self("sfx.reaction.neutralize");
    } else if (!shielded && this.bubble) {
      const b = this.bubble;
      this.bubble = null;
      b.play("fx-shield-bubble/pop");
      b.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => b.destroy());
    }
    if (this.bubble)
      this.bubble.setPosition(Math.round(this.ctx.selfX), Math.round(this.ctx.selfY + 2));
    const self = this.bodies.self;
    const since = now - this.rollAt;
    const rolling = since < DODGE.invulnerableSeconds * 1000 + 60;
    if (self) {
      this.trail.unshift({ x: self.sprite.x, y: self.sprite.y });
      if (this.trail.length > 8) this.trail.length = 8;
    }
    for (let i = 0; i < 2; i++) {
      let g = this.ghosts[i];
      if (!g) {
        g = new Phaser.GameObjects.Sprite(this.scene, 0, 0, COMBAT);
        this.view.addEffect(g, false);
        this.ghosts.push(g);
      }
      const p = this.trail[(i + 1) * 3];
      if (!self || !rolling || !p) {
        g.setVisible(false);
        continue;
      }
      g.setTexture(self.sprite.texture.key, self.sprite.frame.name);
      g.setFlipX(self.sprite.flipX).setScale(self.sprite.scaleX, self.sprite.scaleY);
      g.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
      g.setAlpha(i === 0 ? 0.5 : 0.25)
        .setPosition(p.x, p.y)
        .setVisible(true);
      g.setOrigin(self.sprite.originX, self.sprite.originY);
    }
    this.xrayFrame(self);
    if (self && rolling && since < DODGE.invulnerableSeconds * 1000) {
      // Untouchable: a white rim flicker every other frame.
      if (this.counters.frames % 4 < 2 && self.flash <= 0) {
        self.sprite.setTint(0xffffff).setTintMode(Phaser.TintModes.ADD);
      } else if (self.flash <= 0) self.sprite.clearTint();
      if (this.counters.frames % 3 === 0) {
        this.effects.oneShot("fx-dodge-streak", "fx-dodge-streak/streak", self.x, self.y, 0.8);
      }
    } else if (self && since < DODGE.invulnerableSeconds * 1000 + 40 && self.flash <= 0) {
      self.sprite.clearTint();
    }
  }

  /** The local player's cut-out, drawn over whatever stands in front of them. */
  private xray: Phaser.GameObjects.Sprite | null = null;

  /**
   * When a body stands in front of the local player and covers them, their outline in the class
   * colour is drawn through it, so the player is never lost in a crowd.
   */
  private xrayFrame(self: Body | null): void {
    let covered = false;
    if (self && !self.down) {
      for (const b of this.bodies.byId.values()) {
        if (b === self || b.cat === Cat.Minion || b.dying) continue;
        const dy = b.y - self.y;
        if (dy <= 1 || dy > 18 || Math.abs(b.x - self.x) > 12) continue;
        covered = true;
        break;
      }
    }
    if (!covered || !self) {
      this.xray?.setVisible(false);
      return;
    }
    let x = this.xray;
    if (!x) {
      x = new Phaser.GameObjects.Sprite(this.scene, 0, 0, COMBAT);
      this.view.addEffect(x, false);
      this.xray = x;
    }
    const s = self.sprite;
    const ramp = CLASS_RAMP[this.ctx.selfClass as HitClass] ?? CLASS_RAMP.math;
    x.setTexture(s.texture.key, s.frame.name)
      .setOrigin(s.originX, s.originY)
      .setFlipX(s.flipX)
      .setScale(s.scaleX, s.scaleY)
      .setPosition(s.x, s.y)
      .setTint(this.cat.color(ramp[0]))
      .setTintMode(Phaser.TintModes.FILL)
      .setAlpha(0.4)
      .setVisible(true);
  }

  private screenFrame(now: number, dt: number): void {
    const cam = this.scene.cameras.main;
    // Knocked out: the field dims and the band drops to the lyre until someone comes.
    const down = (this.own?.down ?? 0) > 0;
    if (down !== this.wasDown) {
      this.wasDown = down;
      if (down) this.ctx.sound.phase(false);
      else this.ctx.sound.phase(this.state.wave.phase === "surge");
    }
    const want = down ? DOWN_DIM : 0;
    this.dimLevel += (want - this.dimLevel) * Math.min(1, dt / (down ? 500 : 160));
    this.dim.setAlpha(this.dimLevel).setVisible(this.dimLevel > 0.01);
    // The 쉬는 시간 banner: drops in, holds, lifts away.
    const b = now - this.bannerAt;
    if (b < 2600) {
      const inF = Math.min(1, b / 260);
      const outF = Math.max(0, (b - 2200) / 400);
      const y = -18 + 40 * (1 - (1 - inF) ** 3) - 40 * outF * outF;
      this.banner.setVisible(true).setPosition(Math.round(cam.width / 2), Math.round(y));
    } else this.banner.setVisible(false);
    // Arrows at the screen's edge toward elites that just arrived off screen.
    let used = 0;
    for (let i = this.elites.length - 1; i >= 0; i--) {
      const e = this.elites[i] as { id: number; until: number };
      const body = this.bodies.get(e.id);
      if (!body || now > e.until || body.dying) {
        this.elites.splice(i, 1);
        continue;
      }
      const sx = body.x - cam.scrollX;
      const sy = body.y - cam.scrollY;
      if (sx >= 0 && sx < cam.width && sy >= 0 && sy < cam.height) continue;
      let arrow = this.arrows[used];
      if (!arrow) {
        arrow = this.scene.add
          .image(0, 0, "ui", "arrow/left")
          .setScrollFactor(0)
          .setDepth(DEPTH_SCREEN);
        this.arrows.push(arrow);
      }
      used++;
      const left = sx < cam.width / 2;
      const bob = Math.round(Math.sin(now * 0.012) * 2);
      arrow
        .setFrame(left ? "arrow/left" : "arrow/right")
        .setTint(this.cat.color("red.light"))
        .setPosition(
          left ? 6 + bob : cam.width - 6 - bob,
          Math.max(12, Math.min(cam.height - 12, Math.round(sy))),
        )
        .setVisible(true);
    }
    for (let i = used; i < this.arrows.length; i++) this.arrows[i]?.setVisible(false);
  }

  private refreshState(now: number): void {
    const s = this.state;
    const own = this.own;
    s.ready = own !== undefined && this.bodies.self !== null;
    if (!own) return;
    s.hp = this.selfHp;
    s.maxHp = own.maxHp;
    s.shield = this.selfShield;
    s.exp = own.exp;
    s.level = own.level;
    s.expToNext = expToNext(own.level);
    if (now - this.modeSentAt > 600 || own.mode === this.sentMode) s.mode = own.mode;
    s.manualBooks = !MODE_AUTO[s.mode as 0]?.books;
    s.manualDodge = !MODE_AUTO[s.mode as 0]?.dodge;
    while (s.books.length > this.ownBooks.length) s.books.pop();
    for (let i = 0; i < this.ownBooks.length; i++) {
      const art = this.cat.book(this.ownBooks[i] as number);
      const seconds = ((own.cooldown[i] ?? 0) * TICK_MS) / 1000;
      const left = this.cooldownLeft(i);
      let book = s.books[i];
      if (!book || book.id !== art.id) {
        const icon = BOOKS.find((b) => b.id === art.id)?.cues.icon ?? `book/${art.id}`;
        book = { id: art.id, icon, cls: art.cls, ready: true, cooldown: 0, seconds, readyAt: 0 };
        s.books[i] = book;
      }
      book.ready = left <= 0;
      book.cooldown = left;
      book.seconds = seconds;
      // The HUD sweeps exactly from the server's ready tick, on this page's clock.
      book.readyAt =
        left <= 0 ? 0 : performance.now() + ((own.ready[i] ?? 0) - this.ctx.ownTick) * TICK_MS;
    }
    const ticksLeft = Math.max(0, own.dodgeReady - this.serverTick());
    const cd = DODGE.cooldownSeconds / (TICK_MS / 1000);
    s.dodge.ready = this.canRoll();
    s.dodge.cooldown = Math.min(1, ticksLeft / cd);
    s.dodge.rolling = now - this.rollAt < DODGE.invulnerableSeconds * 1000;
    const down = own.down > 0;
    if (down && !s.down.on) s.down.since = now;
    s.down.on = down;
    s.down.reviving = down && ((this.bodies.self?.state ?? 0) & PState.Reviving) !== 0;
    s.down.wakeIn = down
      ? Math.max(
          0,
          KNOCKOUT.reviveWindowSeconds - (this.serverTick() - (own.down - 1)) * (TICK_MS / 1000),
        )
      : 0;
    let canRevive = false;
    for (const b of this.bodies.byId.values()) {
      if (b.cat !== Cat.Player || b.self || !b.down) continue;
      if (Math.hypot(b.x - this.ctx.selfX, b.y - this.ctx.selfY) < REVIVE_REACH) canRevive = true;
    }
    s.canRevive = canRevive;
    s.statuses.length = 0;
    if (this.selfShield > 0) s.statuses.push({ id: "shield", left: 0 });
    const wave = s.wave;
    const span =
      (wave.phase === "surge" ? FIELD_PACING.surgeSeconds : FIELD_PACING.lullSeconds) * 1000;
    wave.left = wave.since > 0 ? Math.max(0, (span - (now - wave.since)) / 1000) : 0;
    s.streak = this.ctx.sound.killStreak;
    s.target = this.targetState(now);
  }

  private targetState(now: number): FightState["target"] {
    let best: Body | null = null;
    let bestAt = 0;
    for (const b of this.bodies.byId.values()) {
      if (b.cat !== Cat.Monster || b.dying || b.mineUntil < now) continue;
      if (b.mineUntil > bestAt) {
        bestAt = b.mineUntil;
        best = b;
      }
    }
    if (!best?.art) return null;
    // One record, rewritten each frame: the HUD reads it, and a frame makes no garbage.
    const t = this.targetOut;
    t.id = best.id;
    t.monster = best.art.id;
    t.elite = best.elite;
    t.hp = best.hp < 255 ? best.hp / 255 : null;
    t.x = best.x;
    t.y = best.y;
    return t;
  }

  private readonly targetOut = {
    id: 0,
    monster: "",
    elite: false,
    hp: null as number | null,
    x: 0,
    y: 0,
  };

  /**
   * The books the local player wears in their evolved form (book ids), from its inventory: its
   * own casts are drawn evolved until the effect records carry the flag themselves.
   */
  setEvolved(bookIds: readonly string[]): void {
    this.evolvedBooks.length = 0;
    for (const id of bookIds) {
      const i = this.cat.rules.books.indexOf(id);
      if (i >= 0) this.evolvedBooks.push(i);
    }
    this.effects.setEvolved(this.evolvedBooks);
  }

  /**
   * One of the local player's books just evolved (its `evolve` operation succeeded). This is the
   * fight's chest moment, and it happens on the player while the field fights on around them: the
   * book rises out of the student, shivers, and its cover turns into the evolved cover with a
   * flash that lights the ground; a ring runs out and pushes the monsters near back; the evolved
   * attack fires once at full size as a salute; the new name hangs over the head for two seconds.
   * From then on the book's casts take the evolved form.
   */
  evolve(bookId: string): void {
    const i = this.cat.rules.books.indexOf(bookId);
    if (i >= 0 && !this.evolvedBooks.includes(i)) this.evolvedBooks.push(i);
    if (i < 0) return;
    const def = BOOKS.find((b) => b.id === bookId);
    this.evo?.done();
    this.evo = new EvolutionMoment(this.scene, this.ctx, this.bodies, this.effects, {
      book: i,
      from: def?.cues.icon ?? `book/${bookId}`,
      to: def?.evolution.cues.icon ?? `book/${def?.evolution.id ?? bookId}`,
      name: def ? (narrative.NARRATIVE.ko[def.evolution.name] ?? "") : "",
      evolved: () => this.effects.setEvolved(this.evolvedBooks),
    });
  }

  private evo: EvolutionMoment | null = null;

  /** Changes the quality tier: particle caps, other players' restraint, the lights kept. */
  setTier(tier: Tier): void {
    this.ctx.tier = tier;
    this.ctx.restraint = RESTRAINT[tier];
    this.ctx.particles.setCap(this.ctx.restraint.particles);
    this.ctx.lights.setTier(tier);
  }

  /** Names of the local player's party, who are not dimmed with the crowd. */
  private allies: ReadonlySet<string> = new Set();
  /** Session ids of everyone fighting on the duel floor this player is on. */
  private fighters: ReadonlySet<string> = new Set();

  /** The local player's party by name; they stand out of the crowd. */
  setAllies(names: ReadonlySet<string>): void {
    this.allies = names;
  }

  /**
   * The duel floor's state from the map room (`FloorView`): its fighters stand out of the crowd
   * and their effects are drawn at full strength; on a floor, hits on players land with the
   * whole hit feel.
   */
  setFloor(v: FloorView | null): void {
    const sids = new Set<string>();
    if (v && v.match !== 0) for (const f of v.fighters) if (f.sid) sids.add(f.sid);
    this.fighters = sids;
    this.duelOn = sids.size > 0;
    this.bodies.duel = this.duelOn;
    this.rankStudents();
  }

  /** A match on this map's floor holds the fighters still (countdown, pause, result). */
  setHeld(held: boolean): void {
    this.held = held;
  }

  private duelOn = false;
  private held = false;

  /** The local player's slot, or -1 before it is known. */
  get selfSlot(): number {
    return this.ctx.selfSlot;
  }

  /** The share of walking speed the local player's statuses take away (a duel's slows), 0 to 1. */
  selfSlow(): number {
    const self = this.bodies.self;
    if (!self || self.status === 0) return 0;
    let slow = 0;
    const st = this.cat.rules.statuses;
    for (let i = 0; i < st.length; i++) {
      if ((self.status & (1 << i)) === 0) continue;
      const v = (st[i] as { slow: number }).slow;
      if (v > slow) slow = v;
    }
    return Math.max(0, Math.min(1, slow));
  }

  /** Whether the entity is a fighter on this map's duel floor. */
  private isFighter(entity: number): boolean {
    if (!this.duelOn) return false;
    const b = this.bodies.get(entity);
    return b !== undefined && b.cat === Cat.Player && (b.rank === Rank.Fighter || b.self);
  }

  /** Who each student is to the local player: self, party, the other side of a duel, or crowd. */
  private rankStudents(): void {
    const players = this.room.state?.players;
    if (!players) return;
    for (const b of this.bodies.byId.values()) {
      if (b.cat !== Cat.Player) continue;
      if (b.self) {
        b.rank = Rank.Self;
        continue;
      }
      const p = players.get(String(b.slot));
      b.rank = !p
        ? Rank.Other
        : this.fighters.has(p.sid)
          ? Rank.Fighter
          : this.allies.has(p.name)
            ? Rank.Ally
            : Rank.Other;
    }
  }

  /** Every student drawn this frame, the local player included: for name plates and the minimap. */
  forEachStudent(fn: (slot: number, x: number, y: number, self: boolean) => void): void {
    for (const b of this.bodies.byId.values()) {
      if (b.cat === Cat.Player) fn(b.slot, b.sprite.x, b.sprite.y, b.self);
    }
  }

  /** The sprite of the student in `slot`, for an emote. */
  studentSprite(slot: number): Phaser.GameObjects.Sprite | undefined {
    for (const b of this.bodies.byId.values()) {
      if (b.cat === Cat.Player && b.slot === slot) return b.sprite;
    }
    return undefined;
  }

  /** Numbers for development checks; never drawn. */
  stats() {
    return {
      monsters: this.bodies.monsters,
      players: this.bodies.players,
      bodies: this.bodies.byId.size,
      effects: this.effects.count,
      pieces: this.effects.pieces.out,
      particles: this.ctx.particles.alive,
      numbers: this.ctx.numbers.visible,
      pickups: this.pickups.count,
      tick: this.reader.tick,
      delay: this.clock.delay,
      selfId: this.ctx.selfId,
      ...this.feedback.counts,
      ...this.counters,
    };
  }

  /** Leaves: everything the fight made goes; the map view stays. */
  detach(): void {
    for (const off of this.offs.splice(0)) off();
    this.hud.close();
    this.keys?.dispose();
    this.aim?.dispose();
    this.reticle?.destroy();
    this.scene.input.setDefaultCursor("default");
    this.bodies.destroy();
    this.effects.destroy();
    this.pickups.clear();
    this.overlays.destroy();
    this.ctx.particles.destroy();
    this.ctx.numbers.destroy();
    this.ctx.lights.destroy();
    this.ctx.sound.stop();
    for (const g of this.ghosts) g.destroy();
    this.xray?.destroy();
    this.evo?.done();
    this.bubble?.destroy();
    for (const a of this.arrows) a.destroy();
    this.dim.destroy();
    this.banner.destroy();
  }
}
