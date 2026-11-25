/**
 * The fight on screen: one entry for the game scene.
 *
 * ```ts
 * preload() { FightView.preload(this); }
 * create()  { this.fight = FightView.attach(this, mapView, room, { self: () => drawn, mover }); }
 * update(time, delta) { ...move and place the camera...; this.fight.update(time, delta); }
 * // leaving: this.fight.detach();
 * ```
 *
 * It decodes the room's fight snapshots, draws every monster, other player, minion, effect,
 * tell and drop in the map view with the hit feel of PLAN §6, plays the fight's sound, takes
 * the fight's controls, and keeps `state` for the HUD with `actions` for its buttons.
 */
import type { Room } from "@colyseus/sdk";
import { BOOKS, FIELD_PACING, mapById } from "@guago/content";
import {
  AIM_MESSAGE,
  CONTROL_MODES,
  castFlag,
  DODGE,
  expToNext,
  InputFlag,
  KNOCKOUT,
  MAX_AIM,
  type MapState,
  MODE_AUTO,
  MODE_MESSAGE,
  type PlayerState,
  Priv,
  REVIVE_MESSAGE,
  SNAP_CELL_TILES,
  SNAPSHOT_MESSAGE,
  SnapshotReader,
  type SnapshotSink,
  TICK_MS,
  TILE_SIZE,
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
import { Bodies, type Body, Cat, PState } from "./bodies.ts";
import { Catalog, COMBAT } from "./catalog.ts";
import { TickClock } from "./clock.ts";
import { type FightContext, RESTRAINT } from "./context.ts";
import { type ControlSink, FightKeys, MouseAim, nextMode } from "./controls.ts";
import { Effects } from "./effects.ts";
import { Feedback, TRAUMA } from "./feedback.ts";
import { HudFeed } from "./hud-source.ts";
import { FightLights } from "./lights.ts";
import { DamageNumbers } from "./numbers.ts";
import { Overlays } from "./overlays.ts";
import { Bit, Particles } from "./particles.ts";
import { Pickups } from "./pickups.ts";
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
  /** Play the field's music and follow the waves with it. Default true. */
  readonly music?: boolean;
  /** Keyboard and mouse. Default true; the HUD's touch controls call `actions` instead. */
  readonly controls?: boolean;
  /** The bar under the player's feet. Default true; off when the HUD draws its own. */
  readonly selfBar?: boolean;
  /** The 쉬는 시간 banner. Default true. */
  readonly banners?: boolean;
}

/** Atlases the fight draws from, besides the map's. */
const ATLASES = ["core", "effects", "combat", "ui"];
const DEPTH_RETICLE = 30;
const DEPTH_SCREEN = 28;
/** Most new looks composed per frame, so a crowd arriving does not hitch. */
const LOOKS_PER_FRAME = 2;
const REVIVE_REACH = KNOCKOUT.reviveRange + 6;
const DOWN_DIM = 0.28;
/** An elite arriving this close shakes the screen; farther ones are heard and pointed at. */
const ELITE_NEAR = 260;

interface Look {
  sig: string;
  key: string;
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
  private readonly reader = new SnapshotReader();
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
  private readonly castAt: number[] = [];
  private readonly castSeconds: number[] = [];
  private readonly lastCast: number[] = [];
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
  private mapReady = false;
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

  static attach(
    scene: Phaser.Scene,
    view: MapView,
    room: Room<unknown, MapState>,
    options: FightOptions = {},
  ): FightView {
    return new FightView(scene, view, room, options);
  }

  private constructor(
    scene: Phaser.Scene,
    view: MapView,
    room: Room<unknown, MapState>,
    options: FightOptions,
  ) {
    this.scene = scene;
    this.view = view;
    this.room = room;
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
    });
    this.effects = new Effects(this.ctx, this.bodies, {
      body: (id) => this.bodies.get(id),
      impact: (a, x, y) => this.feedback.impact(a, x, y),
      burst: (kind, x, y, r, owner) => this.feedback.burst(kind, x, y, r, owner),
      fired: (a) => this.feedback.fired(a),
    });
    this.pickups = new Pickups(this.ctx, this.effects.pieces);
    this.overlays = new Overlays(this.ctx);
    this.feedback = new Feedback(this.ctx, this.bodies, this.effects, {
      bookOf: (slot) => this.ownBooks[slot] ?? -1,
      maxHp: () => this.own?.maxHp ?? 1,
      moment: (kind) => this.moment(kind),
      elite: (b, x, y) => this.eliteArrived(b, x, y),
    });
    this.own = undefined;

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
    this.aim = controls ? new MouseAim(scene) : null;
    this.reticle = controls
      ? scene.add.image(0, 0, "ui", "reticle/idle").setDepth(DEPTH_RETICLE).setVisible(false)
      : null;
    if (controls) scene.input.setDefaultCursor("none");

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

    this.offs.push(room.onMessage(SNAPSHOT_MESSAGE, (bytes: Uint8Array) => this.onSnapshot(bytes)));
    const onState = (s: MapState) => this.onState(s);
    room.onStateChange(onState);
    this.offs.push(() => room.onStateChange.remove(onState));
    if (room.state) this.onState(room.state);
    this.ctx.sound.start(options.music ?? true);
  }

  // Room ---------------------------------------------------------------------------------------

  private onState(state: MapState): void {
    if (!this.mapReady && state.map) {
      const map = mapById(state.map);
      if (map) {
        const cell = SNAP_CELL_TILES * TILE_SIZE;
        this.reader.cols = Math.ceil((map.collision.w * TILE_SIZE) / cell);
        this.reader.rows = Math.ceil((map.collision.h * TILE_SIZE) / cell);
        this.mapReady = true;
      }
    }
    let own = this.selfSlotKey ? state.players.get(this.selfSlotKey) : undefined;
    if (own?.sid !== this.room.sessionId) {
      own = undefined;
      for (const [slot, p] of state.players) {
        if (p.sid !== this.room.sessionId) continue;
        this.selfSlotKey = slot;
        own = p;
        this.ctx.selfSlot = Number(slot);
      }
    }
    this.own = own;
    if (own) {
      this.ctx.selfClass = own.major || "math";
      const books = [...own.books].map((id) => this.cat.rules.books.indexOf(id));
      if (books.join() !== this.ownBooks.join()) {
        this.ownBooks = books;
        for (let i = 0; i < books.length; i++) {
          const def = BOOKS.find((b) => b.id === own?.books[i]);
          const cd = (def?.attack as { cooldown?: number } | null)?.cooldown ?? 2;
          this.castSeconds[i] ??= cd;
        }
      }
    }
    // Looks of everyone seated, composed a few a frame.
    for (const [slot, p] of state.players) {
      if (!p.sid || !p.look) continue;
      const n = Number(slot);
      const look = p.look;
      const sig = `${look.body}|${look.hair}|${look.hairColor}|${look.face}|${look.uniform}|${[...look.accessories].join("+")}`;
      const had = this.looks.get(n);
      if (had?.sig === sig) continue;
      if (!had) this.looks.set(n, { sig: "", key: this.defaultLook });
      if (!this.lookQueue.includes(n)) this.lookQueue.push(n);
    }
  }

  private composeQueued(): void {
    const state = this.room.state;
    for (let i = 0; i < LOOKS_PER_FRAME && this.lookQueue.length > 0; i++) {
      const slot = this.lookQueue.shift() as number;
      const p = state?.players.get(String(slot));
      const look = p?.look;
      if (!look) continue;
      const sig = `${look.body}|${look.hair}|${look.hairColor}|${look.face}|${look.uniform}|${[...look.accessories].join("+")}`;
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
      this.looks.set(slot, { sig, key });
    }
  }

  private lookOf(slot: number): string {
    return this.looks.get(slot)?.key ?? this.defaultLook;
  }

  private onSnapshot(bytes: Uint8Array): void {
    if (!this.mapReady) return;
    this.counters.snapshots++;
    this.counters.bytes += bytes.byteLength;
    this.feedback.mineThisMessage.clear();
    this.reader.read(bytes, this.sink);
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
        if (!b || b.cat !== Cat.Monster) continue;
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
    if (this.ctx.selfId !== 0 && f.owner === this.ctx.selfId && f.kind !== 14) {
      const slot = this.ownBooks.indexOf(f.def);
      if (slot >= 0 && f.cast !== this.lastCast[slot]) {
        const now = this.ctx.now;
        const last = this.castAt[slot];
        this.lastCast[slot] = f.cast;
        // Auto casts fire the moment a book is ready: the gap between two is its cooldown.
        if (last !== undefined) {
          const gap = (now - last) / 1000;
          const was = this.castSeconds[slot] ?? gap;
          if (gap > 0.2 && gap < was * 1.25) this.castSeconds[slot] = was * 0.5 + gap * 0.5;
        }
        this.castAt[slot] = now;
      }
    }
  }

  private readonly hit = {
    target: 0,
    amount: 0,
    flags: 0,
    slot: 0,
    proof: 0,
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
    const at = this.castAt[slot];
    if (at === undefined) return true;
    return this.ctx.now - at >= (this.castSeconds[slot] ?? 1) * 1000 * 0.92;
  }

  private cast(slot: number): void {
    this.state.picked = slot;
    if (this.keys) this.keys.picked = slot;
    if (!this.own || this.own.down > 0 || slot >= this.ownBooks.length) return;
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

  private revive(): void {
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
    if (best) this.room.send(REVIVE_MESSAGE, [best.slot]);
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
        this.ctx.lights.flash(x, y - 10, cat.color("gold.light"), 70, 1.4, 600);
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
        this.ctx.lights.flash(x, y - 10, cat.color("gold.pale"), 60, 1.3, 500);
        this.effects.oneShot("fx-revive", "fx-revive/glow", x, y, 1);
        this.ctx.particles.burst(Bit.Mote, x, y - 10, 14, cat.color("gold.pale"), 50, 0);
        this.ctx.trauma.add(0.15);
        break;
      case Priv.Wake:
        this.ctx.sound.self("combat.revive");
        this.effects.oneShot("fx-revive", "fx-revive/glow", x, y, 1);
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
      this.ctx.lights.flash(x, y - 12, cat.color("plum.light"), 80, 1.5, 700);
    } else {
      this.ctx.sound.cue("sfx.monster.elite.spawn", x, y, false);
      this.ctx.trauma.add(TRAUMA.elite * 0.2);
    }
    this.effects.oneShot("tele-circle", "tele-circle/fire", x, y, 0.9, 1, undefined, 2.2, true);
    this.ctx.particles.burst(Bit.Debris, x, y, near ? 12 : 6, cat.color("clay.light"), 90, 2);
    if (b) {
      b.arriveAt = this.ctx.now;
      this.bodies.kick(b, -1.6);
      this.elites.push({ id: b.id, until: this.ctx.now + 6000 });
    }
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
    this.feedback.frame();
    this.controlsFrame(now);
    this.bodies.update(dt, rt);
    this.selfFrame(now);
    this.effects.update(dt);
    this.pickups.update();
    const own = this.own;
    const hpShare = own ? Math.max(0, this.selfHp) / Math.max(1, own.maxHp) : 1;
    this.overlays.update(this.bodies.byId.values(), dt, hpShare, this.options.selfBar ?? true);
    ctx.numbers.update(dt);
    ctx.particles.update(dt);
    ctx.lights.update(dt);
    ctx.sound.update(now);
    this.screenFrame(now, dt);
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
      const seconds = this.castSeconds[i] ?? 1;
      const at = this.castAt[i];
      const left = at === undefined ? 0 : Math.max(0, 1 - (now - at) / (seconds * 1000));
      let book = s.books[i];
      if (!book || book.id !== art.id) {
        const icon = BOOKS.find((b) => b.id === art.id)?.cues.icon ?? `book/${art.id}`;
        book = { id: art.id, icon, cls: art.cls, ready: true, cooldown: 0, seconds };
        s.books[i] = book;
      }
      book.ready = left <= 0.08;
      book.cooldown = left;
      book.seconds = seconds;
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
    return {
      id: best.id,
      monster: best.art.id,
      elite: best.elite,
      hp: best.hp < 255 ? best.hp / 255 : null,
      x: best.x,
      y: best.y,
    };
  }

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
   * One of the local player's books just evolved (its `evolve` operation succeeded): the moment
   * is marked on the player, a pillar of light and the 전직 fanfare, and its casts take the
   * evolved form from now on.
   */
  evolve(bookId: string): void {
    const i = this.cat.rules.books.indexOf(bookId);
    if (i >= 0 && !this.evolvedBooks.includes(i)) this.evolvedBooks.push(i);
    this.effects.setEvolved(this.evolvedBooks);
    const cat = this.cat;
    const x = this.ctx.selfX;
    const y = this.ctx.selfY;
    const color = cat.book(Math.max(0, i), true).color;
    this.ctx.sound.self("jingle.jeonjik");
    this.ctx.trauma.add(0.35);
    this.ctx.lights.flash(x, y - 12, color, 90, 1.6, 900);
    this.effects.oneShot("fx-levelup", "fx-levelup/burst", x, y, 1);
    this.effects.oneShot("fx-qed-big", "fx-qed-big/burst", x, y - 18, 0.8);
    this.ctx.particles.burst(Bit.Mote, x, y - 12, 28, color, 70, 0);
    this.ctx.particles.burst(Bit.Spark, x, y - 12, 16, cat.color("stone.bright"), 160, 0);
    const self = this.bodies.self;
    if (self) {
      self.flash = 4;
      self.flashMode = 0;
      this.bodies.kick(self, -1.6);
    }
  }

  /** Changes the quality tier: particle caps, other players' restraint, the lights kept. */
  setTier(tier: Tier): void {
    this.ctx.tier = tier;
    this.ctx.restraint = RESTRAINT[tier];
    this.ctx.particles.setCap(this.ctx.restraint.particles);
    this.ctx.lights.setTier(tier);
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
    this.bubble?.destroy();
    for (const a of this.arrows) a.destroy();
    this.dim.destroy();
    this.banner.destroy();
    this.reader.reset();
  }
}
