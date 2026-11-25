import type { Room } from "@colyseus/sdk";
import type { ArtMetadata } from "@guago/art";
import { collisionOf, LAWN, mapSize } from "@guago/content";
import {
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
import { Footsteps } from "./footsteps.ts";
import { drawGround } from "./ground.ts";
import { KeyboardMove } from "./input.ts";
import { ServerClock, Track } from "./interp.ts";
import { stayConnected } from "./net.ts";
import { drawProps } from "./props.ts";
import { SelfMover } from "./self.ts";

const PLAYER_RIG = "student";
/** The camera frames the body, not the feet. */
const CHEST_PX = 10;

interface Remote<A> {
  readonly track: Track;
  readonly actor: A;
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
  private footsteps!: Footsteps;
  private readonly clock = new ServerClock();
  private readonly monsters = new Map<string, Remote<MonsterActor>>();
  private readonly players = new Map<string, Remote<PlayerActor>>();
  private self: SelfMover | undefined;
  private selfActor: PlayerActor | undefined;
  private selfId: string | undefined;
  private live = false;
  private lastTime: number | undefined;

  constructor() {
    super("world");
  }

  preload(): void {
    loadArt(this);
  }

  create(): void {
    this.meta = artMeta(this);
    createSpriteAnims(this, this.meta);
    this.look = composeLook(this, this.meta, PLAYER_RIG, defaultLook(this.meta, PLAYER_RIG)).look;
    drawGround(this, this.meta, LAWN);
    drawProps(this, this.meta, LAWN);
    this.footsteps = new Footsteps(this, this.meta, LAWN);

    const { w, h } = mapSize(LAWN);
    this.camera = new CameraRig(this.cameras.main, w * TILE_SIZE, h * TILE_SIZE);
    this.camera.jumpTo(LAWN.spawn.x, LAWN.spawn.y - CHEST_PX);
    this.keys = new KeyboardMove();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.keys.dispose());

    void stayConnected((room) => this.attach(room));
  }

  private attach(room: Room<unknown, MapState>): () => void {
    this.selfId = room.sessionId;
    this.live = true;
    this.self = new SelfMover(collisionOf(LAWN), (input) =>
      room.send(INPUT_MESSAGE, encodeInput(input)),
    );
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
    for (const [id, p] of state.players) {
      if (id === this.selfId) {
        this.self?.onServer(p);
        continue;
      }
      let r = this.players.get(id);
      if (!r) {
        r = { track: new Track(), actor: this.playerActor() };
        this.players.set(id, r);
      }
      r.track.push(state.tick, p.x / POS_SCALE, p.y / POS_SCALE, p.facing);
    }
    prune(this.monsters, state.monsters);
    prune(this.players, state.players);
  }

  private playerActor(): PlayerActor {
    const actor = new PlayerActor(this, this.meta, PLAYER_RIG, this.look, PLAYER_SPEED);
    actor.onStep = (x, y) => this.footsteps.step(x, y);
    return actor;
  }

  private lookKey(): string {
    return lookTexture(PLAYER_RIG, this.look);
  }

  override update(time: number): void {
    const dt = this.lastTime === undefined ? 0 : Math.min(250, time - this.lastTime);
    this.lastTime = time;

    const drawn = this.self?.frame(dt, () => this.keys.sample(), this.live);
    if (drawn) {
      if (!this.selfActor) {
        this.selfActor = this.playerActor();
        this.camera.jumpTo(drawn.x, drawn.y - CHEST_PX);
      }
      this.selfActor.update(drawn.x, drawn.y, drawn.facing, dt);
      this.camera.follow(drawn.x, drawn.y - CHEST_PX, drawn.facing, dt);
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
