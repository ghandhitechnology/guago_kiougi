import type { Room } from "@colyseus/sdk";
import type { ArtMetadata } from "@guago/art";
import { LAWN, simRules } from "@guago/content";
import {
  AIM_MESSAGE,
  type Collidable,
  castFlag,
  encodeInput,
  Facing,
  INPUT_MESSAGE,
  InputFlag,
  MAX_AIM,
  type MapState,
  MODE_MESSAGE,
  NULL_SINK,
  PLAYER_SPEED,
  type PlayerState,
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
import { sampleMove } from "./controls/move.ts";
import { devMap, drawDevMap } from "./dev-map.ts";
import { composeDoll, dollLook, normalizeLook } from "./doll.ts";
import type { WorldEntry } from "./entry.ts";
import { FightKeys } from "./fight-keys.ts";
import { FightSketch } from "./fight-sketch.ts";
import { drawGround } from "./ground.ts";
import { hud } from "./hud/store.ts";
import { KeyboardMove } from "./input.ts";
import { ServerClock, Track } from "./interp.ts";
import { stayConnected } from "./net.ts";
import { drawProps } from "./props.ts";
import { SelfMover } from "./self.ts";
import { enterSoundscape, preloadFor, soundscapeFor } from "./sound/audio.ts";
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
  private readonly monsters = new Map<number, Remote<MonsterActor>>();
  /** Other players by session id; their bodies come in the snapshot, who they are in the schema. */
  private readonly players = new Map<string, Remote<PlayerActor>>();
  private mapState: MapState | undefined;
  /** The fight snapshot as this client holds it (`fight/wire.ts`). */
  private reader = new SnapshotReader();
  private selfSlot = -1;
  private mode = 1;
  private sketch: FightSketch | undefined;
  private fightKeys: FightKeys | undefined;
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
    preloadFor(view.id);
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
    const cell = SNAP_CELL_TILES * TILE_SIZE;
    this.reader = new SnapshotReader();
    this.reader.cols = Math.ceil((this.walls.collision.w * TILE_SIZE) / cell);
    this.reader.rows = Math.ceil((this.walls.collision.h * TILE_SIZE) / cell);
    room.onStateChange((state) => this.onPatch(state));
    room.onMessage(SNAPSHOT_MESSAGE, (bytes: Uint8Array) => this.onSnapshot(bytes));
    if (import.meta.env.DEV) this.sketch = new FightSketch(this, this.walls, 9000);
    this.fightKeys = new FightKeys(
      {
        dodge: () => this.self?.queue(InputFlag.Dodge),
        cast: (slot) => {
          if (this.mode === 3) this.self?.queue(castFlag(slot));
        },
        cycleMode: () => room.send(MODE_MESSAGE, [(this.mode + 1) % 4]),
        aim: (at) => {
          const me = this.selfActor?.body;
          if (!at || !me) return room.send(AIM_MESSAGE, []);
          const clamp = (v: number) => Math.max(-MAX_AIM, Math.min(MAX_AIM, Math.round(v)));
          room.send(AIM_MESSAGE, [clamp(at.x - me.x), clamp(at.y - me.y)]);
        },
      },
      (cx, cy) => {
        const canvas = this.game.canvas.getBoundingClientRect();
        if (cx < canvas.left || cy < canvas.top || cx > canvas.right || cy > canvas.bottom)
          return null;
        const cam = this.cameras.main;
        const x = ((cx - canvas.left) / canvas.width) * cam.width + cam.scrollX;
        const y = ((cy - canvas.top) / canvas.height) * cam.height + cam.scrollY;
        return { x, y };
      },
    );
    room.onDrop(() => {
      this.live = false;
    });
    room.onReconnect(() => {
      this.live = true;
      this.self?.resync();
      this.clock.reset();
      this.reader.reset();
    });
    if (import.meta.env.DEV) {
      exposeDevStats(this);
      // Development only: the server's dev commands (spawn beside me, clear), for recordings.
      (window as unknown as { __guagoDev?: (c: unknown[]) => void }).__guagoDev = (c) =>
        room.send("dev", c);
    }
    return () => {
      this.fightKeys?.dispose();
      this.sketch?.clear();
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

  /** Who this client is among the bodies; the bodies themselves come in the snapshot. */
  private onPatch(state: MapState): void {
    this.mapState = state;
    for (const [slot, p] of state.players) {
      if (p.sid !== this.selfId) continue;
      this.selfSlot = Number(slot);
      this.mode = p.mode;
      // In 완전 자동 and 스킬 수동 the server walks the body; knocked out, nothing moves it.
      if (this.self) this.self.serverDriven = p.mode === 0 || p.mode === 2 || p.down > 0;
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
      self: (me) =>
        this.self?.onServer({ x: me.x, y: me.y, facing: me.facing, seq: me.seq, roll: me.roll }),
      fx: (f) => this.sketch?.spawn(f, reader.tick),
      fxEnd: (fx) => this.sketch?.end(fx),
    });
    const tick = reader.tick;
    this.clock.observe(tick, performance.now());
    const rules = simRules();
    const seated = new Set<string>();
    for (const m of reader.members.values()) {
      const x = m.qx / Q;
      const y = m.qy / Q;
      if (m.kind === WirePlayer) {
        const p = this.mapState?.players.get(String(m.slot));
        if (m.slot === this.selfSlot || !p?.sid || p.sid === this.selfId) continue;
        seated.add(p.sid);
        const r = this.dressed(p);
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
    for (const sid of this.players.keys()) {
      if (seated.has(sid)) continue;
      this.overlays.remove(sid);
      worldView.others.delete(sid);
    }
    prune(this.players, seated);
  }

  /**
   * Another player's view, made or dressed again: everyone wears their own look, and a body whose
   * look has not synced yet wears the default until it arrives.
   */
  private dressed(p: InstanceType<typeof PlayerState>): Remote<PlayerActor> {
    // Schema fields are accessors, so a spread would drop them: read each one.
    const l = p.look;
    const look = l?.body
      ? normalizeLook(this.meta, {
          body: l.body,
          hair: l.hair,
          hairColor: l.hairColor,
          face: l.face,
          uniform: l.uniform,
          accessories: [...l.accessories],
        })
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
    return r;
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
    this.sketch?.draw(t);
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

function prune<K, A extends { destroy(): void }>(
  views: Map<K, Remote<A>>,
  live: { has(id: K): boolean },
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
