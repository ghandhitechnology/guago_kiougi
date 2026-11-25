import type { Room } from "@colyseus/sdk";
import type { ArtMetadata } from "@guago/art";
import { type BuiltMap, narrative, snapshotReaderForMap } from "@guago/content";
import {
  type Caught,
  type DoorRattle,
  type DoorRefusal,
  distanceToArea,
  encodeInput,
  type Facing,
  type Halt,
  INPUT_MESSAGE,
  type Interaction,
  MAP_MESSAGES,
  type MapState,
  type NpcLine,
  NULL_SINK,
  nearestUsable,
  PLAYER_RADIUS,
  POS_SCALE,
  portalAt,
  SNAPSHOT_MESSAGE,
  type SnapshotReader,
  type SnapshotSink,
  STORY_MESSAGES,
  shutDoorAhead,
  TILE_SIZE,
  type Transfer,
  type Usable,
  type WireSelf,
  type ZoneUpdate,
} from "@guago/shared";
import * as Phaser from "phaser";
import { artMeta, createSpriteAnims } from "./art.ts";
import { CameraRig } from "./camera.ts";
import { sampleMove } from "./controls/move.ts";
import { MARK_DEPTH } from "./depths.ts";
import { playEmote } from "./emotes.ts";
import type { WorldEntry } from "./entry.ts";
import { Curtain } from "./fade.ts";
import { FightView } from "./fight/index.ts";
import { bindFight } from "./hud/fight.ts";
import { hud } from "./hud/store.ts";
import { t, tMaybe } from "./i18n/index.ts";
import { KeyboardMove } from "./input.ts";
import { ServerClock } from "./interp.ts";
import { ensureMap, enteredMap, mapReady, wallsOf } from "./map-data.ts";
import { type MapSeat, stayConnected } from "./net.ts";
import { NpcActor, npcArt, speakerName } from "./npc.ts";
import { Patrols } from "./patrols.ts";
import { MapView, onQualityTier } from "./render/index.ts";
import { SelfMover } from "./self.ts";
import { enterSoundscape, preloadFor, soundscapeFor } from "./sound/audio.ts";
import { StepSounds } from "./sound/steps.ts";
import type { Dir } from "./story/actors.ts";
import { StoryLink } from "./story/link.ts";
import type { StageHost } from "./story/stage.ts";
import { toast } from "./ui/overlay.ts";
import { worldUi } from "./ui/world-ui.ts";
import { builtView } from "./world/map-view.ts";
import { WorldOverlays } from "./world/overlays.ts";
import { session } from "./world/session.ts";
import { worldView } from "./world/view.ts";
import { emitWorld, onWorld } from "./world-events.ts";
import type { WorldLink } from "./world-link.ts";
import { playWorld } from "./world-sound.ts";

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
/**
 * In a field only this many students nearest the player wear name plates, chosen this often, and
 * none standing so close that their plates would cover the player.
 */
const NAMED_IN_FIELD = 4;
const NAMED_CLEAR_PX = 32;
const NAMED_EVERY_MS = 500;
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

/** The map the player stands on, and everything drawn for it. */
interface Here {
  readonly room: Room<unknown, MapState>;
  readonly map: BuiltMap;
  readonly channel: number;
  readonly view: MapView;
  readonly npcs: Map<string, NpcActor>;
  readonly untier: () => void;
  /** The walls the prediction walks on; their grid changes when a door closes or opens. */
  readonly walls: { collision: BuiltMap["collision"] };
  /** Doors the Page clock keeps shut, as the server last said. */
  closed: ReadonlySet<string>;
  /** Every body of the room's fight, drawn from its snapshots, the player's own included. */
  readonly fight: FightView;
  readonly unbindHud: () => void;
  readonly patrols: Patrols | undefined;
  /** What the prompt can point at: the server's own list, by the same rule. */
  readonly usable: (Usable & {
    readonly top: number;
    readonly cx: number;
    /** A notice or a lore object: the prompt shows reading, not using. */
    readonly reads: boolean;
  })[];
}

/**
 * The walking world: the map the server seated the player in, every entity in view, the
 * player's own character predicted under the keys, the camera on it, and the doors between
 * maps. Rendering, input, prediction, camera, bubbles and the curtain live in their own
 * modules, and every body with the fight around it is the fight view's (`fight/`); this scene
 * wires them to the room.
 */
export class WorldScene extends Phaser.Scene {
  private meta!: ArtMetadata;
  private camera: CameraRig | undefined;
  private keys!: KeyboardMove;
  private readonly clock = new ServerClock();
  /** The fight snapshot as this client holds it (`fight/wire.ts`), one per room joined. */
  private reader: SnapshotReader | undefined;
  /** Reads snapshots until the fight view is up: only the own body matters then. */
  private readonly early: SnapshotSink = { ...NULL_SINK, self: (me) => this.onSelf(me) };
  /** Waiting for the first Self record of a room just joined. */
  private selfWaiters: ((me: WireSelf) => void)[] = [];
  private mode = 1;
  /** The story's scenes on the map shown (`story/`): they hold the keys and the camera. */
  private readonly story = new StoryLink(() => this.entry?.character.name ?? "");
  private storyCamera = false;
  private storyDriven = false;
  private modeDriven = false;
  private storyFacing: Facing | undefined;
  private self: SelfMover | undefined;
  /** Where the predicted body is drawn this frame. */
  private drawn: { x: number; y: number; facing: Facing } | undefined;
  private selfId: string | undefined;
  /** Session ids with a name plate up, so a student who leaves takes theirs along. */
  private readonly plates = new Set<string>();
  private live = false;
  private lastTime: number | undefined;
  /** Who is playing, handed over by the front end; absent when the scene runs on its own. */
  private entry: WorldEntry | undefined;

  private curtain!: Curtain;
  private overlays!: WorldOverlays;
  private steps: StepSounds | undefined;
  /** An interact went out and its answer has not come back: a line it draws needs no bubble. */
  private asking = false;
  /** The room patches are read from; a room superseded by a door is ignored. */
  private room: Room<unknown, MapState> | undefined;
  private here: Here | undefined;
  /** Input held: the player walked into a door, or the next map is not up yet. */
  private holding = true;
  /** The predicted body stepped into a built door at this time and waits for the server. */
  private doorAt: number | undefined;
  private selfInside = -1;
  /** Where a patrol's catch put the player; the curtain lifts once the server's body is there. */
  private caughtAt: { x: number; y: number } | undefined;
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

  /** The art every map and every fight shares; each map's own art loads when the server seats us there. */
  preload(): void {
    FightView.preload(this);
  }

  create(): void {
    this.meta = artMeta(this);
    createSpriteAnims(this, this.meta);
    this.curtain = new Curtain(this, true);
    this.overlays = new WorldOverlays(this);
    worldView.overlays = this.overlays;
    // The E key and the phone's context button, through the UI layer while nothing else has focus.
    worldView.interact = () => this.interact();
    if (this.entry) session.start(this.entry);
    const unwatch = session.watch((s) => this.listenSocial(s.link));
    this.keys = new KeyboardMove();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.keys.dispose();
      unwatch();
      this.unsocial?.();
      worldView.leave();
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
    if (import.meta.env.DEV) {
      exposeDevStats(this);
      // Development: F9 tells the server the fight a scene waits on is over (until combat does).
      this.input.keyboard?.on("keydown-F9", () => {
        const until = this.story.waitingOn;
        if (until) this.story.signal(until);
      });
      (window as unknown as { __guagoStory?: unknown }).__guagoStory = {
        waitingOn: () => this.story.waitingOn,
        signal: (until?: string) => {
          const u = until ?? this.story.waitingOn;
          if (u) this.story.signal(u);
        },
        replay: (scene: string) => this.story.replay(scene),
      };
      // The test shortcut's hooks for recordings and measurements (`fight/dev.ts`).
      if (new URLSearchParams(location.search).has("fight")) {
        void import("./fight/dev.ts").then((d) =>
          d.installFightDev({
            scene: this,
            current: () => this.here && { fight: this.here.fight, room: this.here.room },
          }),
        );
      }
    }
  }

  // Arriving and leaving ------------------------------------------------------------------

  /** A room is joined. Callbacks go on at once; the map is shown once it and the body are in. */
  private arrive(seat: MapSeat): () => void {
    const { room, seating } = seat;
    this.room = room;
    this.live = true;
    // A door is a new room: a new reader, sized for its map, which reads every snapshot from the
    // first, in order.
    this.reader = snapshotReaderForMap(seating.map);
    room.onStateChange((state) => {
      if (this.room === room) this.onPatch(state);
    });
    room.onMessage(SNAPSHOT_MESSAGE, (bytes: Uint8Array) => {
      if (this.room === room) this.onSnapshot(room, bytes);
    });
    const unstory = this.story.attach(room);
    if (import.meta.env.DEV) {
      // Development only: the server's dev commands (spawn beside me, clear), for recordings.
      (window as unknown as { __guagoDev?: (c: unknown[]) => void }).__guagoDev = (c) =>
        room.send("dev", c);
    }
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
      // Our own push rattled and spoke already, from the walls the prediction walks on.
      if (this.room === room && m.sid !== room.sessionId) this.rattle(m.id, m.of, false);
    });
    room.onMessage(MAP_MESSAGES.caught, (m: Caught) => {
      if (this.room === room) this.onCaught(m);
    });
    room.onMessage(MAP_MESSAGES.halt, (m: Halt) => {
      if (this.room === room) this.here?.patrols?.halt(m.patrol);
    });
    room.onDrop(() => {
      if (this.room === room) this.live = false;
    });
    room.onReconnect(() => {
      if (this.room !== room) return;
      this.live = true;
      this.self?.resync();
      this.clock.reset();
      this.reader?.reset();
    });
    void this.enterMap(seat);
    return () => {
      unstory();
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
    // The HUD's minimap, footsteps and soundscape follow the map; `enter` clears who is on it.
    const shown = builtView(map);
    worldView.enter(shown);
    worldView.selfSid = room.sessionId;
    this.steps = new StepSounds(shown.surfaceAt);
    preloadFor(map.id);
    enterSoundscape(soundscapeFor(map.id, map.time));
    const untier = onQualityTier((t) => {
      view.setTier(t);
      this.here?.fight.setTier(t);
    });
    enteredMap(this, map.id);
    // The cast's atlases load with the map: their animations are made now, before anyone stands.
    createSpriteAnims(this, this.meta);
    const npcs = new Map<string, NpcActor>();
    for (const [key, n] of room.state.npcs) {
      const art = npcArt(this.meta, n.speaker);
      if (!art) continue;
      const npc = new NpcActor(
        this,
        this.meta,
        art,

        n.x / POS_SCALE,
        n.y / POS_SCALE,
        n.facing,
      );
      view.addEntity(npc.body);
      npcs.set(key, npc);
      worldUi.npc(n.speaker, speakerName(n.speaker), npc.x, npc.y);
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
          reads: false,
        })),
      ...map.interactables.map((t) => ({
        kind: "thing" as const,
        id: t.id,
        rect: t.rect,
        cx: (t.rect.x + t.rect.w / 2) * T,
        top: t.rect.y * T - 2,
        reads: t.kind === "notice" || t.kind === "lore",
      })),
    ];
    const closed = new Set(room.state.closed);
    const walls = wallsOf(map, closed);
    // Guards on their beats and townspeople on their walks (`patrols.ts`).
    const rounds = [...map.patrols, ...map.walks];
    const patrols = rounds.length > 0 ? new Patrols(this, this.meta, view, rounds) : undefined;
    this.selfId = room.sessionId;
    this.camera = new CameraRig(this.cameras.main, map.w * T, map.h * T);
    const x = me.x / POS_SCALE;
    const y = me.y / POS_SCALE;
    this.camera.jumpTo(x, y - CHEST_PX);
    const self = new SelfMover(walls, (input) => {
      if (this.room === room) room.send(INPUT_MESSAGE, encodeInput(input));
    });
    self.onServer(me);
    this.self = self;
    this.drawn = undefined;
    // Every body in the room comes from its fight snapshots; the HUD's bars and books follow it.
    const reader = this.reader;
    if (!reader) return;
    const fight = FightView.attach(this, view, room, reader, {
      self: () => this.drawn,
      mover: self,
      onSelf: (s) => this.onSelf(s),
      tier: view.qualityTier,
      field: map.zones.some((z) => z.kind === "monsters"),
      onStep: (fx, fy, mine) => this.steps?.step(fx, fy, worldView.self, mine),
    });
    const unbindHud = bindFight(fight.hud);
    this.here = {
      room,
      map,
      channel: seating.channel,
      view,
      npcs,
      usable,
      untier,
      walls,
      closed,
      patrols,
      fight,
      unbindHud,
    };
    this.selfInside = portalAt(map.portals, x, y);
    this.doorAt = undefined;
    this.roomZone = map.zones.find((z) => z.kind === "room" && this.zones.includes(z.id))?.id;
    this.clock.reset();
    this.onPatch(room.state);

    if (map.id !== before) {
      emitWorld({ t: "place", map: map.id, name: map.name, channel: seating.channel });
    }
    // The HUD drops the place's name in as a banner and keeps it under the minimap.
    this.showPlace();
    // A scene owed on this map plays on it once it is up.
    this.story.onMap(this.stageHost(this.here));
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

  /** Resolves with the player's own body once the fight snapshot carries it (its Self record). */
  private ownBody(_room: Room<unknown, MapState>): Promise<WireSelf | undefined> {
    if (this.reader?.hasSelf) return Promise.resolve({ ...this.reader.me });
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.selfWaiters = this.selfWaiters.filter((w) => w !== done);
        resolve(undefined);
      }, 8000);
      const done = (me: WireSelf) => {
        clearTimeout(timer);
        resolve({ ...me });
      };
      this.selfWaiters.push(done);
    });
  }

  /** Takes down everything drawn for the map being left. */
  private clearMap(): void {
    this.story.leaveMap();
    this.storyCamera = false;
    this.storyDriven = false;
    this.storyFacing = undefined;
    const here = this.here;
    this.here = undefined;
    for (const [key, n] of here?.npcs ?? []) {
      n.destroy();
      const speaker = here?.room.state.npcs.get(key)?.speaker;
      if (speaker) worldUi.npcGone(speaker);
    }
    for (const sid of this.plates) {
      this.overlays.remove(sid);
      worldView.others.delete(sid);
    }
    this.plates.clear();
    // A door taking the player out mid-fight: the fight goes with the map, behind the curtain.
    here?.unbindHud();
    here?.fight.detach();
    this.self = undefined;
    this.drawn = undefined;
    this.aim(undefined);
    here?.patrols?.destroy();
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
    const check = () => {
      const drawn = this.drawn;
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
    for (const p of state.players.values()) {
      if (p.sid !== this.selfId) continue;
      this.mode = p.mode;
      // In 완전 자동 and 스킬 수동 the server walks the body; knocked out, nothing moves it.
      this.modeDriven = p.mode === 0 || p.mode === 2 || p.down > 0;
      if (this.self) this.self.serverDriven = this.modeDriven || this.storyDriven;
    }
    if (!this.here) return;
    for (const [key, n] of state.npcs) this.here.npcs.get(key)?.face(n.facing);
    if ([...state.closed].join() !== [...this.here.closed].join()) {
      const closed = new Set(state.closed);
      this.here.closed = closed;
      this.here.walls.collision = wallsOf(this.here.map, closed).collision;
    }
  }

  /**
   * One tick of the fight. Every message is read in order from the join on, even before the map
   * is shown: the own body for prediction until the fight view is up, then everything through it.
   */
  private onSnapshot(room: Room<unknown, MapState>, bytes: Uint8Array): void {
    // Through a door the old map stays drawn until the new one is up: its fight reads nothing more.
    const here = this.here;
    const reader = this.reader;
    if (!reader) return;
    if (here?.room === room) here.fight.read(bytes);
    else reader.read(bytes, this.early);
    this.clock.observe(reader.tick, performance.now());
  }

  /** The server's word on the own body: prediction reconciles, and a patrol's catch lands. */
  private onSelf(me: WireSelf): void {
    if (this.selfWaiters.length > 0) for (const w of this.selfWaiters.splice(0)) w(me);
    // The mover walks the map on screen; the room behind a door has its own body.
    if (this.here?.room !== this.room) return;
    this.self?.onServer(me);
    this.serverSelf = { x: me.x / POS_SCALE, y: me.y / POS_SCALE };
    if (
      this.caughtAt &&
      Math.hypot(this.serverSelf.x - this.caughtAt.x, this.serverSelf.y - this.caughtAt.y) < 1
    ) {
      this.caughtAt = undefined;
      this.self?.resync();
      this.camera?.jumpTo(this.serverSelf.x, this.serverSelf.y - CHEST_PX);
      this.holding = false;
      void this.curtain.open(160);
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
    // Walking into a named room inside the map shows the room's name.
    this.showPlace();
  }

  /** Where the HUD says the player is: the map with its channel past the first, and the room. */
  private showPlace(): void {
    const here = this.here;
    if (!here) return;
    const { map } = here;
    const room = map.zones.find((z) => z.kind === "room" && z.id === this.roomZone);
    const inRoom = room?.kind === "room" && room.name !== map.name ? room.name : undefined;
    const channel = here.channel > 1 ? ` ${t("world.channel", { n: here.channel })}` : "";
    hud.set({
      place: { map: map.id, name: `${map.name}${channel}`, ...(inRoom ? { room: inRoom } : {}) },
    });
  }

  /** A cast member speaks: a bubble for everyone near, unless it answers our own interact. */
  private onNpcLine(m: NpcLine): void {
    // A townsperson on a walk speaks by its walk (`walk:<id>`); everyone else by their spot.
    const walk = m.npc.startsWith("walk:")
      ? this.here?.map.walks.find((w) => `walk:${w.id}` === m.npc)
      : undefined;
    const speaker = walk?.walker ?? this.here?.room.state.npcs.get(m.npc)?.speaker;
    const text = KO[m.text];
    if (!speaker || !text) return;
    if (m.kind === "talk" && this.asking) return;
    worldUi.bark(speaker, text);
  }

  private onInteraction(m: Interaction): void {
    const here = this.here;
    if (!here) return;
    this.asking = false;
    if (m.t === "say") {
      const speaker = here.room.state.npcs.get(m.npc)?.speaker ?? "";
      const text = KO[m.text];
      if (text) void worldUi.say([{ speaker, text }]);
      emitWorld({ t: "talk", speaker, text: m.text });
    } else if (m.t === "read") {
      // A thing has no voice: its name goes on the tab, and no portrait.
      const text = KO[m.desc];
      if (text) void worldUi.say([{ speaker: KO[m.name] ?? "", text }]);
      emitWorld({ t: "read", id: m.id, name: m.name, desc: m.desc });
    } else if (m.t === "open") {
      emitWorld({ t: "open", id: m.id, kind: m.kind });
    } else if (m.t === "locked") {
      this.rattle(m.id, "thing", true);
      refuse("door_locked");
    } else if (m.t === "ate") {
      emitWorld({ t: "ate", id: m.id, result: m.result });
    }
  }

  private unsocial: (() => void) | undefined;

  /** Emotes come over the world link: the body that made one plays it with a word over its head. */
  private listenSocial(link: WorldLink | undefined): void {
    this.unsocial?.();
    this.unsocial = link?.on((e) => {
      if (e.type === "social" && e.event.t === "emote") this.emote(e.event.sid, e.event.e);
    });
  }

  /** Plays an emote on the body of the player in session `sid` of this map room. */
  private emote(sid: string, id: string): void {
    const here = this.here;
    if (!here) return;
    let body: Phaser.GameObjects.Sprite | undefined;
    for (const [slot, p] of here.room.state.players) {
      if (p.sid === sid) body = here.fight.studentSprite(Number(slot));
    }
    if (!body) return;
    const word = tMaybe(`emote.${id}`);
    if (word) this.overlays.say(sid, word);
    playEmote(body, id);
  }

  /** A guard saw the player: a quick dip to ink, and back at the entrance when it lifts. */
  private onCaught(m: Caught): void {
    this.holding = true;
    this.caughtAt = { x: m.x, y: m.y };
    void this.curtain.close(120);
    emitWorld({ t: "caught", patrol: m.patrol });
  }

  /** The interact action (PLAN §6): the server picks the target from where it has us. */
  private interact(): void {
    const room = this.room;
    if (!room || !this.here || this.holding || !this.live) return;
    // A scene's offered talk in reach is the scene's; while a scene holds the keys, nothing else.
    if (this.story.interact() || this.story.holding) return;
    this.asking = true;
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
    const me = this.drawn;
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

  override update(time: number, delta: number): void {
    const dt = this.lastTime === undefined ? 0 : Math.min(250, time - this.lastTime);
    this.lastTime = time;
    const here = this.here;

    const move = (): [number, number] => {
      this.lastMove = this.holding || this.story.holding ? [0, 0] : sampleMove(this.keys);
      return this.lastMove;
    };
    // Held keys go quiet at a door, but the inputs that bring the server's body up to the drawn
    // one still go out: the server has to see the step into the door too.
    const drawn = this.self?.frame(dt, move, this.live);
    if (drawn && here && this.camera) {
      const was = this.drawn;
      if (!was) this.camera.jumpTo(drawn.x, drawn.y - CHEST_PX);
      const moved = was ? Math.hypot(drawn.x - was.x, drawn.y - was.y) : 0;
      // A scene may turn the player and hold the camera.
      this.drawn = { x: drawn.x, y: drawn.y, facing: this.storyFacing ?? drawn.facing };
      if (!this.storyCamera) this.camera.follow(drawn.x, drawn.y - CHEST_PX, drawn.facing, dt);
      worldView.self = { x: drawn.x, y: drawn.y };
      this.watchDoors(here.map, drawn.x, drawn.y, drawn.facing, moved, dt);
      this.aimPrompt(here, drawn.x, drawn.y);
    }
    this.story.update();

    // Guards stand where the server had them at the time everyone else is drawn at.
    here?.patrols?.update(this.clock.renderTime(time));
    for (const npc of here?.npcs.values() ?? []) npc.update(dt);
    if (!here) return;
    // The fight draws every body after the camera has moved, then plates and the minimap follow.
    here.fight.update(time, delta);
    this.platesFrame(here);
  }

  /** Name plates over every student and their dots on the minimap, from the fight's bodies. */
  private platesFrame(here: Here): void {
    const players = here.room.state.players;
    const seen = this.seenPlates;
    seen.clear();
    // In a field the player's own plate would lie under their feet where the hits land; the ring
    // there marks them instead. A crowd's plates would bury the fight, so only the students
    // nearest the player wear theirs, chosen again twice a second so plates do not flicker.
    const field = here.map.zones.some((z) => z.kind === "monsters");
    const now = performance.now();
    if (field && now - this.namedAt > NAMED_EVERY_MS) {
      this.namedAt = now;
      this.pickNamed(here);
    }
    here.fight.forEachStudent((slot, x, y, self) => {
      const p = players.get(String(slot));
      if (!p?.sid) return;
      seen.add(p.sid);
      if (!self) {
        const dot = worldView.others.get(p.sid);
        if (dot) {
          dot.x = x;
          dot.y = y;
        } else worldView.others.set(p.sid, { kind: "player", x, y, name: p.name });
      }
      const named = self ? !field : !field || this.named.has(p.sid);
      if (!named) {
        if (this.plates.delete(p.sid)) this.overlays.remove(p.sid);
        return;
      }
      if (!this.plates.has(p.sid)) {
        this.plates.add(p.sid);
        const name = self ? (this.entry?.character.name ?? p.name) : p.name;
        this.overlays.plate(p.sid, name, self ? "self" : "player");
      }
      this.overlays.move(p.sid, x, y);
    });
    for (const sid of this.plates) {
      if (seen.has(sid)) continue;
      this.plates.delete(sid);
      this.overlays.remove(sid);
    }
    for (const sid of worldView.others.keys()) {
      if (!seen.has(sid) && worldView.others.get(sid)?.kind === "player")
        worldView.others.delete(sid);
    }
  }

  /** The students nearest the player in a field, who keep their name plates. */
  private pickNamed(here: Here): void {
    const me = this.drawn;
    const near = this.nearScratch;
    near.length = 0;
    const players = here.room.state.players;
    here.fight.forEachStudent((slot, x, y, self) => {
      const sid = players.get(String(slot))?.sid;
      if (self || !sid || !me) return;
      const d = Math.hypot(x - me.x, y - me.y);
      if (d > NAMED_CLEAR_PX) near.push({ sid, d });
    });
    near.sort((a, b) => a.d - b.d);
    this.named.clear();
    for (let i = 0; i < Math.min(NAMED_IN_FIELD, near.length); i++) {
      this.named.add((near[i] as { sid: string }).sid);
    }
  }

  private readonly named = new Set<string>();
  private namedAt = 0;
  private readonly nearScratch: { sid: string; d: number }[] = [];
  private readonly seenPlates = new Set<string>();

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
    const closed = this.here?.closed ?? new Set<string>();
    const entered = map.portals[at];
    if (!this.holding && at >= 0 && at !== was && entered?.built && !closed.has(entered.id)) {
      this.predictDoor();
      return;
    }
    if (this.holding) return;
    const [mx, my] = this.lastMove;
    const pushing = (mx !== 0 || my !== 0) && moved < 0.05;
    this.pushFor = pushing ? this.pushFor + dt : 0;
    if (this.pushFor < PUSH_MS) return;
    const shut = shutDoorAhead(map.portals, x, y, facing, PLAYER_RADIUS, closed);
    const door = map.portals[shut];
    const now = performance.now();
    if (!door || now - this.lastRattle < RATTLE_COOLDOWN_MS) return;
    this.lastRattle = now;
    this.rattle(door.id, "portal", true);
    // Why it stays shut, for the line said with it; the walls already told the prediction.
    const why = door.built ? "door_closed" : "door_unbuilt";
    emitWorld({ t: "door", id: door.id, why });
    refuse(why);
  }

  /**
   * Puts the prompt over what the server would pick from where the player stands, and lights the
   * HUD's E key and the phone's context button with its kind.
   */
  private aimPrompt(here: Here, x: number, y: number): void {
    const target =
      this.holding || this.story.holding ? undefined : nearestUsable(here.usable, x, y);
    const key = target && `${target.kind}:${target.id}`;
    const hushed = key === this.quiet.key && performance.now() < this.quiet.until;
    this.aim(target && !hushed ? target : undefined);
  }

  private aimed: string | undefined;

  private aim(target: Here["usable"][number] | undefined): void {
    const kind = !target
      ? undefined
      : target.kind === "npc"
        ? "talk"
        : target.reads
          ? "read"
          : "use";
    const key = target && `${target.kind}:${target.id}:${kind}`;
    if (key === this.aimed) return;
    this.aimed = key;
    worldUi.prompt(target && kind ? { x: target.cx, y: target.top, kind } : undefined);
    hud.set({ interact: kind ? { kind } : undefined });
  }

  // The story's stage ------------------------------------------------------------------------

  /** What a scene may do to this map: its view, the player's body, the camera, the keys. */
  private stageHost(here: Here): StageHost {
    const facings: Record<Dir, Facing> = { down: 0, up: 1, left: 2, right: 3 };
    return {
      scene: this,
      ui: this.scene.get("ui"),
      meta: this.meta,
      map: here.map,
      view: here.view,
      curtain: this.curtain,
      playerBody: () => this.here?.fight.selfSprite(),
      posePlayer: (anim) => this.here?.fight.poseSelf(anim) ?? false,
      facePlayer: (dir) => {
        this.storyFacing = dir === undefined ? undefined : facings[dir];
      },
      takeCamera: (on) => {
        if (this.storyCamera === on) return;
        this.storyCamera = on;
        const me = this.drawn;
        if (!on && me) this.camera?.handBack(me.x, me.y - CHEST_PX);
      },
      panTo: (x, y, ms) => {
        const cam = this.cameras.main;
        const to = this.camera?.clampCenter(x, y) ?? { x, y };
        if (ms <= 0) {
          cam.centerOn(to.x, to.y);
          return Promise.resolve();
        }
        return new Promise((resolve) =>
          cam.pan(to.x, to.y, ms, "Sine.easeInOut", true, (_c, k) => {
            if (k >= 1) resolve();
          }),
        );
      },
      followServer: (on) => {
        this.storyDriven = on;
        if (this.self) this.self.serverDriven = this.modeDriven || on;
      },
      hideNpc: (speaker, hidden) => {
        for (const [key, n] of here.npcs) {
          if (here.room.state.npcs.get(key)?.speaker !== speaker) continue;
          n.body.setVisible(!hidden);
          if (hidden) worldUi.npcGone(speaker);
          else worldUi.npc(speaker, speakerName(speaker), n.x, n.y);
        }
      },
      send: (req) => {
        if (this.room === here.room) here.room.send(STORY_MESSAGES.story, req);
      },
    };
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
      fight: this.here?.fight.stats(),
      map: this.here?.map.id,
      channel: this.here?.channel,
      npcs: this.here?.npcs.size ?? 0,
      holding: this.holding,
      transitions: this.transitions,
      story: {
        scene: this.story.sceneId,
        waiting: this.story.waitingOn,
        holding: this.story.holding,
      },
      self: this.drawn,
      scroll: { x: this.cameras.main.scrollX, y: this.cameras.main.scrollY },
    };
  }
}

/** A door that stays shut says why, in the voice and channel its refusal is written for. */
function refuse(why: DoorRefusal): void {
  const line = narrative.NARRATIVE.system.find((m) => m.id === `refusal.door.${why}`);
  const text = line && KO[line.text];
  if (text) toast(text);
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
