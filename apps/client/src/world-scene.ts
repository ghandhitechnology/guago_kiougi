import type { Room } from "@colyseus/sdk";
import type { ArtMetadata } from "@guago/art";
import { type BuiltMap, narrative } from "@guago/content";
import {
  type DoorRattle,
  distanceToArea,
  encodeInput,
  type Facing,
  INPUT_MESSAGE,
  type Interaction,
  MAP_MESSAGES,
  type MapState,
  type NpcLine,
  nearestUsable,
  PLAYER_RADIUS,
  PLAYER_SPEED,
  type PlayerState,
  POS_SCALE,
  portalAt,
  shutDoorAhead,
  TILE_SIZE,
  type Transfer,
  type Usable,
  type ZoneUpdate,
} from "@guago/shared";
import * as Phaser from "phaser";
import { MonsterActor, PlayerActor } from "./actors.ts";
import { artMeta, composeLook, createSpriteAnims, defaultLook, loadArt } from "./art.ts";
import { Bubbles } from "./bubbles.ts";
import { CameraRig } from "./camera.ts";
import { MARK_DEPTH } from "./depths.ts";
import { composeDoll, dollLook, normalizeLook } from "./doll.ts";
import type { WorldEntry } from "./entry.ts";
import { Curtain } from "./fade.ts";
import { KeyboardMove } from "./input.ts";
import { ServerClock, Track } from "./interp.ts";
import { ensureMap, enteredMap, mapReady, roomCollision } from "./map-data.ts";
import { type MapSeat, stayConnected } from "./net.ts";
import { NpcActor, npcArt } from "./npc.ts";
import { PlaceCard } from "./place-card.ts";
import { Prompt } from "./prompt.ts";
import { MapView, onQualityTier } from "./render/index.ts";
import { SelfMover } from "./self.ts";
import { emitWorld, onWorld } from "./world-events.ts";
import { playWorld } from "./world-sound.ts";

const PLAYER_RIG = "student";
/** The camera frames the body, not the feet. */
const CHEST_PX = 10;
/**
 * A door the prediction walked into is given up when the server's body has caught up with the
 * drawn one and stood this long without being sent through, or after `DOOR_GIVE_UP_MS` at most.
 */
const DOOR_PATIENCE_MS = 400;
const DOOR_GIVE_UP_MS = 5000;
/** Pressing against a shut door this long rattles it. */
const PUSH_MS = 90;
const RATTLE_COOLDOWN_MS = 1200;
/** Remote rattles are heard within this many pixels. */
const HEAR_PX = 220;
/** A door this close starts loading the map behind it. */
const NEAR_DOOR_PX = 56;
/** Development only: `?cold` turns that off, to time a door whose map loads behind the curtain. */
const PREFETCH = !(import.meta.env.DEV && new URLSearchParams(location.search).has("cold"));
const KO = narrative.NARRATIVE.ko;

/** One map change as the player saw it: from the step into the door to the fade lifting. */
interface Transition {
  readonly from: string;
  readonly to: string;
  readonly ms: number;
  /** Timed from the predicted step into the door, or from the server's word when it came first. */
  readonly how: "step" | "server";
  /** Whether the map behind the door was already loaded. */
  readonly warm: boolean;
  /** Milliseconds to each stage: transfer, seat, map, dark, body, view (the map view built). */
  readonly marks: Record<string, number>;
}

interface Remote<A> {
  readonly track: Track;
  readonly actor: A;
}

/** The map the player stands on, and everything drawn for it. */
interface Here {
  readonly room: Room<unknown, MapState>;
  readonly map: BuiltMap;
  readonly channel: number;
  readonly view: MapView;
  readonly npcs: Map<string, NpcActor>;
  readonly untier: () => void;
  /** What the prompt can point at: the server's own list, by the same rule. */
  readonly usable: (Usable & { readonly top: number; readonly cx: number })[];
}

/**
 * The walking world: the map the server seated the player in, every entity in view, the
 * player's own character predicted under the keys, the camera on it, and the doors between
 * maps. Rendering, input, prediction, camera, bubbles and the curtain live in their own
 * modules; this scene wires them to the room.
 */
export class WorldScene extends Phaser.Scene {
  private meta!: ArtMetadata;
  private look!: string;
  private camera: CameraRig | undefined;
  private keys!: KeyboardMove;
  private readonly clock = new ServerClock();
  private readonly monsters = new Map<string, Remote<MonsterActor>>();
  private readonly players = new Map<string, Remote<PlayerActor>>();
  private self: SelfMover | undefined;
  private selfActor: PlayerActor | undefined;
  private selfId: string | undefined;
  private live = false;
  private lastTime: number | undefined;
  /** Who is playing, handed over by the front end; absent when the scene runs on its own. */
  private entry: WorldEntry | undefined;
  /** The player's own look, composited from the character; others wear their own. */
  private selfLook: string | undefined;

  private curtain!: Curtain;
  private card!: PlaceCard;
  private bubbles!: Bubbles;
  private prompt!: Prompt;
  /** The room patches are read from; a room superseded by a door is ignored. */
  private room: Room<unknown, MapState> | undefined;
  private here: Here | undefined;
  /** Input held: the player walked into a door, or the next map is not up yet. */
  private holding = true;
  /** The predicted body stepped into a built door at this time and waits for the server. */
  private doorAt: number | undefined;
  private selfInside = -1;
  /** Where the server last put the player's own body, in pixels. */
  private serverSelf: { x: number; y: number } | undefined;
  private pushFor = 0;
  /** The move the keys gave the last simulation tick. */
  private lastMove: [number, number] = [0, 0];
  private lastRattle = 0;
  private interactN = 0;
  /** A thing just shaken keeps its prompt down until then, so the lock over it reads. */
  private quiet = { key: "", until: 0 };
  private roomZone: string | undefined;
  /** The zones the server last said the player stands in. */
  private zones: readonly string[] = [];
  private stop: (() => void) | undefined;
  /** Transition timings for development checks: door to fade lifting, in ms. */
  readonly transitions: Transition[] = [];
  private transitionStart:
    | { at: number; how: "step" | "server"; warm: boolean; marks: Record<string, number> }
    | undefined;

  constructor() {
    super("world");
  }

  init(data: Partial<WorldEntry>): void {
    this.entry = data.account && data.character ? (data as WorldEntry) : undefined;
  }

  /** The art every map shares; each map's own art loads when the server seats us there. */
  preload(): void {
    loadArt(this, { atlases: ["core", "effects"] });
  }

  create(): void {
    this.meta = artMeta(this);
    createSpriteAnims(this, this.meta);
    this.look = composeLook(this, this.meta, PLAYER_RIG, defaultLook(this.meta, PLAYER_RIG)).look;
    if (this.entry) {
      const look = normalizeLook(this.meta, this.entry.character.look);
      composeDoll(this, this.meta, look);
      this.selfLook = dollLook(look);
    }
    this.curtain = new Curtain(this, true);
    this.card = new PlaceCard(this);
    this.bubbles = new Bubbles(this);
    this.prompt = new Prompt(this, () => this.interact());
    this.keys = new KeyboardMove();
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "KeyE" || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      this.interact();
    };
    window.addEventListener("keydown", onKey);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.keys.dispose();
      window.removeEventListener("keydown", onKey);
      this.stop?.();
    });

    this.stop = stayConnected({
      arrive: (seat) => this.arrive(seat),
      depart: (t) => this.depart(t),
      ended: () => {
        this.live = false;
        this.holding = true;
      },
    });
    if (import.meta.env.DEV) exposeDevStats(this);
  }

  // Arriving and leaving ------------------------------------------------------------------

  /** A room is joined. Callbacks go on at once; the map is shown once it and the body are in. */
  private arrive(seat: MapSeat): () => void {
    const { room } = seat;
    this.room = room;
    this.live = true;
    room.onStateChange((state) => {
      if (this.room === room) this.onPatch(state);
    });
    room.onMessage(MAP_MESSAGES.zones, (m: ZoneUpdate) => {
      if (this.room === room) this.onZones(m.zones);
    });
    room.onMessage(MAP_MESSAGES.npcLine, (m: NpcLine) => {
      if (this.room === room) this.onNpcLine(m);
    });
    room.onMessage(MAP_MESSAGES.interaction, (m: Interaction) => {
      if (this.room === room) this.onInteraction(m);
    });
    room.onMessage(MAP_MESSAGES.door, (m: DoorRattle) => {
      if (this.room === room && m.sid !== room.sessionId) this.rattle(m.id, m.of, false);
    });
    room.onDrop(() => {
      if (this.room === room) this.live = false;
    });
    room.onReconnect(() => {
      if (this.room !== room) return;
      this.live = true;
      this.self?.resync();
      this.clock.reset();
    });
    void this.enterMap(seat);
    return () => {
      if (this.room === room) {
        this.room = undefined;
        this.live = false;
      }
    };
  }

  private async enterMap(seat: MapSeat): Promise<void> {
    const { room, seating } = seat;
    this.holding = true;
    this.mark("seat");
    const [map] = await Promise.all([
      ensureMap(this, seating.map).then((m) => {
        this.mark("map");
        return m;
      }),
      this.curtain.close().then(() => this.mark("dark")),
    ]);
    const me = await this.ownBody(room);
    if (this.room !== room || !me) return;
    this.mark("body");

    const before = this.here?.map.id;
    this.clearMap();
    const view = MapView.create(this, map.id);
    this.mark("view");
    const untier = onQualityTier((t) => view.setTier(t));
    enteredMap(this, map.id);
    const npcs = new Map<string, NpcActor>();
    for (const [key, n] of room.state.npcs) {
      const art = npcArt(this.meta, n.speaker);
      if (!art) continue;
      const npc = new NpcActor(
        this,
        this.meta,
        art,
        n.speaker,
        n.x / POS_SCALE,
        n.y / POS_SCALE,
        n.facing,
      );
      view.addEntity(npc.body);
      npcs.set(key, npc);
    }
    const T = TILE_SIZE;
    const usable: Here["usable"] = [
      ...[...room.state.npcs]
        .filter(([key]) => npcs.has(key) && this.talks(room, key))
        .map(([key, n]) => ({
          kind: "npc" as const,
          id: key,
          x: n.x / POS_SCALE,
          y: n.y / POS_SCALE,
          cx: n.x / POS_SCALE,
          top: npcs.get(key)?.headY ?? n.y / POS_SCALE - 28,
        })),
      ...map.interactables.map((t) => ({
        kind: "thing" as const,
        id: t.id,
        rect: t.rect,
        cx: (t.rect.x + t.rect.w / 2) * T,
        top: t.rect.y * T - 2,
      })),
    ];
    this.here = { room, map, channel: seating.channel, view, npcs, usable, untier };
    this.selfId = room.sessionId;
    this.camera = new CameraRig(this.cameras.main, map.w * T, map.h * T);
    const x = me.x / POS_SCALE;
    const y = me.y / POS_SCALE;
    this.camera.jumpTo(x, y - CHEST_PX);
    this.self = new SelfMover(roomCollision(map), (input) => {
      if (this.room === room) room.send(INPUT_MESSAGE, encodeInput(input));
    });
    this.self.onServer(me);
    this.selfInside = portalAt(map.portals, x, y);
    this.doorAt = undefined;
    this.roomZone = map.zones.find((z) => z.kind === "room" && this.zones.includes(z.id))?.id;
    this.clock.reset();
    this.onPatch(room.state);

    if (map.id !== before) {
      this.card.show(map.name, seating.channel);
      emitWorld({ t: "place", map: map.id, name: map.name, channel: seating.channel });
    }
    if (seat.via) playWorld("door.close", { volume: 0.5 });
    this.holding = false;
    await this.curtain.open();
    const started = this.transitionStart;
    if (started && before) {
      this.transitions.push({
        from: before,
        to: map.id,
        ms: Math.round(performance.now() - started.at),
        how: started.how,
        warm: started.warm,
        marks: started.marks,
      });
    }
    this.transitionStart = undefined;
  }

  /** Whether the server lists `key` as someone who talks: it only answers for those. */
  private talks(room: Room<unknown, MapState>, key: string): boolean {
    const speaker = room.state.npcs.get(key)?.speaker;
    return narrative.NARRATIVE.barks.some((b) => b.speaker === speaker);
  }

  /** Resolves with the player's own synced body once a patch carries it. */
  private ownBody(room: Room<unknown, MapState>): Promise<PlayerState | undefined> {
    const find = () => {
      for (const p of room.state.players.values()) if (p.sid === room.sessionId) return p;
      return undefined;
    };
    const now = find();
    if (now) return Promise.resolve(now);
    return new Promise((resolve) => {
      const done = (value: PlayerState | undefined) => {
        clearTimeout(timer);
        room.onStateChange.remove(check);
        resolve(value);
      };
      const check = () => {
        const p = find();
        if (p) done(p);
      };
      const timer = setTimeout(() => done(undefined), 8000);
      room.onStateChange(check);
    });
  }

  /** Takes down everything drawn for the map being left. */
  private clearMap(): void {
    const here = this.here;
    this.here = undefined;
    for (const n of here?.npcs.values() ?? []) n.destroy();
    for (const r of [...this.monsters.values(), ...this.players.values()]) r.actor.destroy();
    this.monsters.clear();
    this.players.clear();
    this.selfActor?.destroy();
    this.selfActor = undefined;
    this.self = undefined;
    this.bubbles.clearAll();
    this.prompt.show(undefined);
    here?.untier();
    here?.view.destroy();
  }

  /** The server is sending the player through a door. */
  private depart(transfer: Transfer): void {
    this.holding = true;
    if (this.doorAt === undefined) {
      this.transitionStart = {
        at: performance.now(),
        how: "server",
        warm: mapReady(this, transfer.map),
        marks: {},
      };
      playWorld("door.open", { volume: 0.6 });
    }
    this.mark("transfer");
    this.doorAt = undefined;
    void this.curtain.close();
    void ensureMap(this, transfer.map).catch(() => {});
  }

  /** The predicted body walked into a door: start the curtain now, the server follows. */
  private predictDoor(): void {
    const map = this.here?.map;
    if (!map) return;
    this.holding = true;
    this.doorAt = performance.now();
    const target = map.portals[this.selfInside];
    this.transitionStart = {
      at: this.doorAt,
      how: "step",
      warm: target ? mapReady(this, target.to) : false,
      marks: {},
    };
    if (target) void ensureMap(this, target.to).catch(() => {});
    playWorld("door.open", { volume: 0.6 });
    void this.curtain.close();
    const at = this.doorAt;
    const drawn = this.selfActor?.body;
    const check = () => {
      if (this.doorAt !== at) return;
      // The drawn body may lead the server's after a stall: wait while the server's catches up.
      const s = this.serverSelf;
      const behind = s && drawn ? Math.hypot(s.x - drawn.x, s.y - drawn.y) > 2 : false;
      if (behind && performance.now() - at < DOOR_GIVE_UP_MS) {
        this.time.delayedCall(DOOR_PATIENCE_MS, check);
        return;
      }
      // The server did not agree: the door stays here.
      this.doorAt = undefined;
      this.transitionStart = undefined;
      this.holding = false;
      void this.curtain.open();
    };
    this.time.delayedCall(DOOR_PATIENCE_MS, check);
  }

  // Patches and messages ------------------------------------------------------------------

  private onPatch(state: MapState): void {
    if (!this.here) return;
    this.clock.observe(state.tick, performance.now());
    for (const [id, m] of state.monsters) {
      let r = this.monsters.get(id);
      if (!r) {
        r = { track: new Track(), actor: new MonsterActor(this, this.meta, m.kind) };
        this.here.view.addEntity(r.actor.body);
        this.monsters.set(id, r);
      }
      r.track.push(state.tick, m.x / POS_SCALE, m.y / POS_SCALE, m.facing);
    }
    // Bodies are pooled by slot; who is in one is its session id.
    const seated = new Set<string>();
    for (const p of state.players.values()) {
      if (!p.sid) continue;
      if (p.sid === this.selfId) {
        this.self?.onServer(p);
        this.serverSelf = { x: p.x / POS_SCALE, y: p.y / POS_SCALE };
        continue;
      }
      seated.add(p.sid);
      let r = this.players.get(p.sid);
      if (!r) {
        r = { track: new Track(), actor: this.playerActor() };
        this.here.view.addEntity(r.actor.body);
        this.players.set(p.sid, r);
      }
      r.track.push(state.tick, p.x / POS_SCALE, p.y / POS_SCALE, p.facing);
    }
    this.prune(this.monsters, state.monsters);
    this.prune(this.players, seated);
    for (const [key, n] of state.npcs) this.here.npcs.get(key)?.face(n.facing);
  }

  private prune<A extends { readonly body: Phaser.GameObjects.Sprite; destroy(): void }>(
    views: Map<string, Remote<A>>,
    live: { has(id: string): boolean },
  ): void {
    for (const [id, r] of views) {
      if (live.has(id)) continue;
      this.here?.view.removeEntity(r.actor.body);
      r.actor.destroy();
      views.delete(id);
    }
  }

  private onZones(zones: readonly string[]): void {
    this.zones = zones;
    emitWorld({ t: "zones", zones });
    const map = this.here?.map;
    if (!map) return;
    const room = map.zones.find((z) => z.kind === "room" && zones.includes(z.id));
    if (room?.id === this.roomZone) return;
    this.roomZone = room?.id;
    // Arriving shows the map's name; walking into a room inside it shows the room's.
    if (room && room.kind === "room" && room.name !== map.name) this.card.show(room.name);
  }

  private onNpcLine(m: NpcLine): void {
    const npc = this.here?.npcs.get(m.npc);
    const text = KO[m.text];
    if (!npc || !text) return;
    this.bubbles.say(`npc:${m.npc}`, npc.x, npc.headY, text);
  }

  private onInteraction(m: Interaction): void {
    const here = this.here;
    if (!here) return;
    if (m.t === "say") {
      const speaker = here.room.state.npcs.get(m.npc)?.speaker ?? "";
      emitWorld({ t: "talk", speaker, text: m.text });
    } else if (m.t === "read") {
      const thing = here.usable.find((u) => u.kind === "thing" && u.id === m.id);
      const text = KO[m.desc];
      if (thing && text) {
        this.bubbles.say(`thing:${m.id}`, thing.cx, thing.top, text, {
          title: KO[m.name] ?? "",
          stayNear: true,
        });
      }
      emitWorld({ t: "read", id: m.id, name: m.name, desc: m.desc });
    } else if (m.t === "open") {
      emitWorld({ t: "open", id: m.id, kind: m.kind });
    } else if (m.t === "locked") {
      this.rattle(m.id, "thing", true);
    }
  }

  /** The interact action (PLAN §6): the server picks the target from where it has us. */
  private interact(): void {
    const room = this.room;
    if (!room || !this.here || this.holding || !this.live) return;
    this.prompt.press();
    room.send(MAP_MESSAGES.interact, [++this.interactN]);
  }

  /** A shut door or a locked hatch shaken: a lock over it, a jolt, a thud. */
  private rattle(id: string, of: DoorRattle["of"], mine: boolean): void {
    const map = this.here?.map;
    if (!map) return;
    const rect =
      of === "portal"
        ? map.portals.find((p) => p.id === id)?.rect
        : map.interactables.find((t) => t.id === id)?.rect;
    if (!rect) return;
    const T = TILE_SIZE;
    const cx = Math.round((rect.x + rect.w / 2) * T);
    const top = rect.y * T;
    const me = this.selfActor?.body;
    const near = !me || Math.hypot(me.x - cx, me.y - top) < HEAR_PX;
    if (!mine && !near) return;
    this.quiet = { key: `thing:${id}`, until: performance.now() + 700 };
    const lock = this.add
      .image(cx, top - 4, "ui", "lock/idle")
      .setOrigin(0.5, 1)
      .setDepth(MARK_DEPTH);
    this.tweens.chain({
      targets: lock,
      tweens: [
        { x: cx + 2, duration: 30 },
        { x: cx - 2, duration: 40 },
        { x: cx + 1, duration: 40 },
        { x: cx, duration: 40 },
        { alpha: 0, y: top - 7, delay: 300, duration: 180, onComplete: () => lock.destroy() },
      ],
    });
    playWorld("door.close", { pitch: 7, volume: mine ? 0.45 : 0.25 });
  }

  // Frames --------------------------------------------------------------------------------

  private playerActor(look = this.look): PlayerActor {
    return new PlayerActor(this, this.meta, PLAYER_RIG, look, PLAYER_SPEED);
  }

  override update(time: number): void {
    const dt = this.lastTime === undefined ? 0 : Math.min(250, time - this.lastTime);
    this.lastTime = time;
    const here = this.here;

    const move = (): [number, number] => {
      this.lastMove = this.holding ? [0, 0] : this.keys.sample();
      return this.lastMove;
    };
    // Held keys go quiet at a door, but the inputs that bring the server's body up to the drawn
    // one still go out: the server has to see the step into the door too.
    const drawn = this.self?.frame(dt, move, this.live);
    if (drawn && here && this.camera) {
      if (!this.selfActor) {
        this.selfActor = this.playerActor(this.selfLook);
        here.view.addEntity(this.selfActor.body, { focus: true });
        this.camera.jumpTo(drawn.x, drawn.y - CHEST_PX);
      }
      const moved = Math.hypot(drawn.x - this.selfActor.body.x, drawn.y - this.selfActor.body.y);
      this.selfActor.update(drawn.x, drawn.y, drawn.facing, dt);
      this.camera.follow(drawn.x, drawn.y - CHEST_PX, drawn.facing, dt);
      this.watchDoors(here.map, drawn.x, drawn.y, drawn.facing, moved, dt);
      this.aimPrompt(here, drawn.x, drawn.y);
    }

    const t = this.clock.renderTime(time);
    for (const { track, actor } of this.monsters.values()) {
      const at = track.at(t);
      actor.update(at.x, at.y, at.facing as Facing, dt);
    }
    for (const { track, actor } of this.players.values()) {
      const at = track.at(t);
      if (!at.fresh) this.clock.starved++;
      actor.update(at.x, at.y, at.facing as Facing, dt);
    }
    for (const npc of here?.npcs.values() ?? []) npc.update(dt);
    this.bubbles.update(
      this.selfActor ? { x: this.selfActor.body.x, y: this.selfActor.body.y } : undefined,
    );
    this.prompt.update(time);
  }

  /** Doors as the prediction meets them: the curtain starts on the step in. */
  private watchDoors(
    map: BuiltMap,
    x: number,
    y: number,
    facing: Facing,
    moved: number,
    dt: number,
  ) {
    // Loading starts a few steps before the door, so the far side is in by the time of the fade.
    for (const p of PREFETCH ? map.portals : []) {
      if (!p.built || mapReady(this, p.to)) continue;
      if (distanceToArea(p.rect, x, y) < NEAR_DOOR_PX) void ensureMap(this, p.to).catch(() => {});
    }
    const at = portalAt(map.portals, x, y);
    const was = this.selfInside;
    this.selfInside = at;
    if (!this.holding && at >= 0 && at !== was && map.portals[at]?.built) {
      this.predictDoor();
      return;
    }
    if (this.holding) return;
    const [mx, my] = this.lastMove;
    const pushing = (mx !== 0 || my !== 0) && moved < 0.05;
    this.pushFor = pushing ? this.pushFor + dt : 0;
    if (this.pushFor < PUSH_MS) return;
    const shut = shutDoorAhead(map.portals, x, y, facing, PLAYER_RADIUS);
    const door = map.portals[shut];
    const now = performance.now();
    if (!door || now - this.lastRattle < RATTLE_COOLDOWN_MS) return;
    this.lastRattle = now;
    this.rattle(door.id, "portal", true);
  }

  /** Puts the prompt over what the server would pick from where the player stands. */
  private aimPrompt(here: Here, x: number, y: number): void {
    if (this.holding) {
      this.prompt.show(undefined);
      return;
    }
    const target = nearestUsable(here.usable, x, y);
    // A bubble over the thing says enough while it is up.
    const key = target && `${target.kind}:${target.id}`;
    const hushed = key === this.quiet.key && performance.now() < this.quiet.until;
    if (!target || !key || hushed || this.bubbles.has(key)) {
      this.prompt.show(undefined);
      return;
    }
    this.prompt.show(key, target.cx, target.top);
  }

  /** Notes how long into a map change a stage was reached, for the development numbers. */
  private mark(stage: string): void {
    const t = this.transitionStart;
    if (t && t.marks[stage] === undefined) t.marks[stage] = Math.round(performance.now() - t.at);
  }

  /** Numbers for development checks; never drawn. */
  devStats() {
    return {
      corrections: this.self?.corrections ?? 0,
      worstError: this.self?.worstError ?? 0,
      starved: this.clock.starved,
      players: this.players.size,
      monsters: this.monsters.size,
      map: this.here?.map.id,
      channel: this.here?.channel,
      npcs: this.here?.npcs.size ?? 0,
      holding: this.holding,
      transitions: this.transitions,
      self: this.selfActor ? { x: this.selfActor.body.x, y: this.selfActor.body.y } : undefined,
      scroll: { x: this.cameras.main.scrollX, y: this.cameras.main.scrollY },
    };
  }
}

function exposeDevStats(scene: WorldScene): void {
  const events: unknown[] = [];
  onWorld((e) => events.push(e));
  (window as unknown as { __guago?: () => unknown }).__guago = () => ({
    ...scene.devStats(),
    events: events.slice(-8),
  });
  (window as unknown as { __guagoScene?: unknown }).__guagoScene = scene;
}
