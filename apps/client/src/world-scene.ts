import type { Room } from "@colyseus/sdk";
import type { ArtMetadata } from "@guago/art";
import { LAWN } from "@guago/content";
import {
  type Collidable,
  encodeInput,
  type Facing,
  INPUT_MESSAGE,
  type MapState,
  PLAYER_SPEED,
  POS_SCALE,
  TILE_SIZE,
} from "@guago/shared";
import * as Phaser from "phaser";
import { MonsterActor, PlayerActor } from "./actors.ts";
import {
  artMeta,
  composeLook,
  createSpriteAnims,
  defaultLook,
  loadArt,
  lookTexture,
} from "./art.ts";
import { CameraRig } from "./camera.ts";
import { sampleMove } from "./controls/move.ts";
import { devMap, drawDevMap } from "./dev-map.ts";
import { composeDoll, dollLook, normalizeLook } from "./doll.ts";
import type { WorldEntry } from "./entry.ts";
import { drawGround } from "./ground.ts";
import { hud } from "./hud/store.ts";
import { KeyboardMove } from "./input.ts";
import { ServerClock, Track } from "./interp.ts";
import { stayConnected } from "./net.ts";
import { drawProps } from "./props.ts";
import { SelfMover } from "./self.ts";
import { enterSoundscape, soundscapeFor } from "./sound/audio.ts";
import { StepSounds } from "./sound/steps.ts";
import { builtView, lawnView } from "./world/map-view.ts";
import { WorldOverlays } from "./world/overlays.ts";
import { session } from "./world/session.ts";
import { worldView } from "./world/view.ts";

const PLAYER_RIG = "student";
/** The camera frames the body, not the feet. */
const CHEST_PX = 10;

interface Remote<A> {
  readonly track: Track;
  actor: A;
  /** The look the actor wears, for players. */
  look?: string;
}

/**
 * The walking world: ground and props, every entity in view, the player's own character
 * predicted under the keys, and the camera on it. Rendering, input, prediction and camera live
 * in their own modules; this scene only wires them to the room.
 */
export class WorldScene extends Phaser.Scene {
  private meta!: ArtMetadata;
  private look!: string;
  private camera!: CameraRig;
  private keys!: KeyboardMove;
  private readonly clock = new ServerClock();
  private readonly monsters = new Map<string, Remote<MonsterActor>>();
  private readonly players = new Map<string, Remote<PlayerActor>>();
  private self: SelfMover | undefined;
  private selfActor: PlayerActor | undefined;
  private selfId: string | undefined;
  private live = false;
  private lastTime: number | undefined;
  /** The walls the own player is predicted against: the lawn, or a built map in development. */
  private walls: Collidable = LAWN;
  /** Who is playing, handed over by the front end; absent when the scene runs on its own. */
  private entry: WorldEntry | undefined;
  /** The player's own look, composited from the character. */
  private selfLook: string | undefined;
  private overlays!: WorldOverlays;
  private steps!: StepSounds;

  constructor() {
    super("world");
  }

  init(data: Partial<WorldEntry>): void {
    this.entry = data.account && data.character ? (data as WorldEntry) : undefined;
  }

  preload(): void {
    loadArt(this);
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
    const dev = devMap();
    const view = dev ? builtView(dev) : lawnView(LAWN);
    worldView.enter(view);
    this.overlays = new WorldOverlays(this);
    worldView.overlays = this.overlays;
    this.steps = new StepSounds(view.surfaceAt);
    enterSoundscape(soundscapeFor(view.id, dev?.time));
    if (this.entry) session.start(this.entry);
    hud.set({ place: { map: view.id, name: view.name } });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => worldView.leave());
    if (dev) {
      this.walls = dev;
      void drawDevMap(this, this.meta, dev);
    } else {
      drawGround(this, this.meta, LAWN);
      drawProps(this, this.meta, LAWN);
    }
    const { w, h } = this.walls.collision;
    const spawn = dev ? (dev.spawns.main ?? LAWN.spawn) : LAWN.spawn;
    this.camera = new CameraRig(this.cameras.main, w * TILE_SIZE, h * TILE_SIZE);
    this.camera.jumpTo(spawn.x, spawn.y - CHEST_PX);
    this.keys = new KeyboardMove();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.keys.dispose());

    void stayConnected((room) => this.attach(room), undefined, dev ? { map: dev.id } : {});
  }

  private attach(room: Room<unknown, MapState>): () => void {
    this.selfId = room.sessionId;
    worldView.selfSid = room.sessionId;
    this.live = true;
    this.self = new SelfMover(this.walls, (input) => room.send(INPUT_MESSAGE, encodeInput(input)));
    room.onStateChange((state) => this.onPatch(state));
    room.onDrop(() => {
      this.live = false;
    });
    room.onReconnect(() => {
      this.live = true;
      this.self?.resync();
      this.clock.reset();
    });
    if (import.meta.env.DEV) exposeDevStats(this);
    return () => {
      for (const r of [...this.monsters.values(), ...this.players.values()]) r.actor.destroy();
      for (const sid of this.players.keys()) {
        this.overlays.remove(sid);
        worldView.others.delete(sid);
      }
      this.monsters.clear();
      this.players.clear();
      this.selfActor?.destroy();
      this.selfActor = undefined;
      this.self = undefined;
      this.clock.reset();
      this.selfId = undefined;
      this.live = false;
    };
  }

  private onPatch(state: MapState): void {
    this.clock.observe(state.tick, performance.now());
    for (const [id, m] of state.monsters) {
      let r = this.monsters.get(id);
      if (!r) {
        r = {
          track: new Track(),
          actor: new MonsterActor(this, this.meta, m.kind, this.lookKey()),
        };
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
        continue;
      }
      seated.add(p.sid);
      // Everyone wears their own look; a body whose look has not synced yet wears the default
      // until it arrives, then is dressed again.
      const look = p.look?.body
        ? normalizeLook(this.meta, { ...p.look, accessories: [...p.look.accessories] })
        : undefined;
      const lookId = look ? dollLook(look) : this.look;
      let r = this.players.get(p.sid);
      if (!r) {
        if (look) composeDoll(this, this.meta, look);
        r = { track: new Track(), actor: this.playerActor(lookId), look: lookId };
        this.players.set(p.sid, r);
        this.overlays.plate(p.sid, p.name, "player");
        worldView.others.set(p.sid, { kind: "player", x: 0, y: 0, name: p.name });
      } else if (r.look !== lookId) {
        if (look) composeDoll(this, this.meta, look);
        r.actor.destroy();
        r.actor = this.playerActor(lookId);
        r.look = lookId;
        this.overlays.plate(p.sid, p.name, "player");
      }
      r.track.push(state.tick, p.x / POS_SCALE, p.y / POS_SCALE, p.facing);
    }
    prune(this.monsters, state.monsters);
    for (const sid of this.players.keys()) {
      if (seated.has(sid)) continue;
      this.overlays.remove(sid);
      worldView.others.delete(sid);
    }
    prune(this.players, seated);
  }

  private playerActor(look = this.look, self = false): PlayerActor {
    const actor = new PlayerActor(this, this.meta, PLAYER_RIG, look, PLAYER_SPEED);
    actor.onStep = (x, y) => this.steps.step(x, y, worldView.self, self);
    return actor;
  }

  private lookKey(): string {
    return lookTexture(PLAYER_RIG, this.look);
  }

  override update(time: number): void {
    const dt = this.lastTime === undefined ? 0 : Math.min(250, time - this.lastTime);
    this.lastTime = time;

    const drawn = this.self?.frame(dt, () => sampleMove(this.keys), this.live);
    if (drawn) {
      if (!this.selfActor) {
        this.selfActor = this.playerActor(this.selfLook, true);
        this.camera.jumpTo(drawn.x, drawn.y - CHEST_PX);
        if (this.entry && this.selfId) {
          this.overlays.plate(this.selfId, this.entry.character.name, "self");
        }
      }
      this.selfActor.update(drawn.x, drawn.y, drawn.facing, dt);
      this.camera.follow(drawn.x, drawn.y - CHEST_PX, drawn.facing, dt);
      worldView.self = { x: drawn.x, y: drawn.y };
      if (this.selfId) this.overlays.move(this.selfId, drawn.x, drawn.y);
    }

    const t = this.clock.renderTime(time);
    for (const { track, actor } of this.monsters.values()) {
      const at = track.at(t);
      actor.update(at.x, at.y, at.facing as Facing, dt);
    }
    for (const [sid, { track, actor }] of this.players) {
      const at = track.at(t);
      if (!at.fresh) this.clock.starved++;
      actor.update(at.x, at.y, at.facing as Facing, dt);
      this.overlays.move(sid, at.x, at.y);
      const seen = worldView.others.get(sid);
      if (seen) {
        seen.x = at.x;
        seen.y = at.y;
      }
    }
  }

  /** Numbers for development checks; never drawn. */
  devStats() {
    return {
      corrections: this.self?.corrections ?? 0,
      worstError: this.self?.worstError ?? 0,
      starved: this.clock.starved,
      players: this.players.size,
      monsters: this.monsters.size,
      self: this.selfActor ? { x: this.selfActor.body.x, y: this.selfActor.body.y } : undefined,
      scroll: { x: this.cameras.main.scrollX, y: this.cameras.main.scrollY },
    };
  }
}

function prune<A extends { destroy(): void }>(
  views: Map<string, Remote<A>>,
  live: { has(id: string): boolean },
): void {
  for (const [id, r] of views) {
    if (live.has(id)) continue;
    r.actor.destroy();
    views.delete(id);
  }
}

function exposeDevStats(scene: WorldScene): void {
  (window as unknown as { __guago?: () => unknown }).__guago = () => scene.devStats();
  (window as unknown as { __guagoScene?: unknown }).__guagoScene = scene;
}
