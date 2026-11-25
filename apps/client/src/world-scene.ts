import type { Room } from "@colyseus/sdk";
import type { ArtMetadata } from "@guago/art";
import { LAWN, simRules } from "@guago/content";
import {
  type Collidable,
  encodeInput,
  Facing,
  INPUT_MESSAGE,
  type MapState,
  NULL_SINK,
  PLAYER_SPEED,
  Q,
  SNAP_CELL_TILES,
  SNAPSHOT_MESSAGE,
  SnapshotReader,
  TILE_SIZE,
  WireMinion,
  WirePlayer,
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
import { devMap, drawDevMap } from "./dev-map.ts";
import { composeDoll, dollLook, normalizeLook } from "./doll.ts";
import type { WorldEntry } from "./entry.ts";
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
  private readonly clock = new ServerClock();
  private readonly monsters = new Map<number, Remote<MonsterActor>>();
  private readonly players = new Map<number, Remote<PlayerActor>>();
  /** The fight snapshot as this client holds it (`fight/wire.ts`). */
  private reader = new SnapshotReader();
  private selfSlot = -1;
  private self: SelfMover | undefined;
  private selfActor: PlayerActor | undefined;
  private selfId: string | undefined;
  private live = false;
  private lastTime: number | undefined;
  /** The walls the own player is predicted against: the lawn, or a built map in development. */
  private walls: Collidable = LAWN;
  /** Who is playing, handed over by the front end; absent when the scene runs on its own. */
  private entry: WorldEntry | undefined;
  /** The player's own look, composited from the character; others wear the default for now. */
  private selfLook: string | undefined;

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
    this.live = true;
    this.self = new SelfMover(this.walls, (input) => room.send(INPUT_MESSAGE, encodeInput(input)));
    const cell = SNAP_CELL_TILES * TILE_SIZE;
    this.reader = new SnapshotReader();
    this.reader.cols = Math.ceil((this.walls.collision.w * TILE_SIZE) / cell);
    this.reader.rows = Math.ceil((this.walls.collision.h * TILE_SIZE) / cell);
    room.onStateChange((state) => this.onPatch(state));
    room.onMessage(SNAPSHOT_MESSAGE, (bytes: Uint8Array) => this.onSnapshot(bytes));
    room.onDrop(() => {
      this.live = false;
    });
    room.onReconnect(() => {
      this.live = true;
      this.self?.resync();
      this.clock.reset();
      this.reader.reset();
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

  /** Who this client is among the bodies; the bodies themselves come in the snapshot. */
  private onPatch(state: MapState): void {
    for (const [slot, p] of state.players) {
      if (p.sid === this.selfId) this.selfSlot = Number(slot);
    }
  }

  /**
   * One tick of the fight: the own body for prediction, then every other player and monster
   * the snapshot holds. Minions, effects and events are the presentation's to draw.
   */
  private onSnapshot(bytes: Uint8Array): void {
    const reader = this.reader;
    reader.read(bytes, {
      ...NULL_SINK,
      self: (me) => this.self?.onServer({ x: me.x, y: me.y, facing: me.facing, seq: me.seq }),
    });
    const tick = reader.tick;
    this.clock.observe(tick, performance.now());
    const rules = simRules();
    for (const m of reader.members.values()) {
      const x = m.qx / Q;
      const y = m.qy / Q;
      if (m.kind === WirePlayer) {
        if (m.slot === this.selfSlot) continue;
        let r = this.players.get(m.id);
        if (!r) {
          r = { track: new Track(), actor: this.playerActor() };
          this.players.set(m.id, r);
        }
        r.track.push(tick, x, y, m.state & 3);
      } else if (m.kind !== WireMinion) {
        let r = this.monsters.get(m.id);
        if (!r) {
          const kind = rules.monsters[m.kind];
          if (!kind) continue;
          const elite = `${kind.sprite}-elite`;
          const sprite = m.state & 32 && this.meta.sprites[elite] ? elite : kind.sprite;
          r = {
            track: new Track(),
            actor: new MonsterActor(this, this.meta, sprite, this.lookKey()),
          };
          this.monsters.set(m.id, r);
        }
        r.track.push(tick, x, y, m.state & 16 ? Facing.Right : Facing.Left);
      }
    }
    prune(this.monsters, reader.members);
    prune(this.players, reader.members);
  }

  private playerActor(look = this.look): PlayerActor {
    const actor = new PlayerActor(this, this.meta, PLAYER_RIG, look, PLAYER_SPEED);
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
        this.selfActor = this.playerActor(this.selfLook);
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
  views: Map<number, Remote<A>>,
  live: { has(id: number): boolean },
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
