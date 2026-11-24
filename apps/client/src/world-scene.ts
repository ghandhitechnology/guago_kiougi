import type { Room } from "@colyseus/sdk";
import type { ArtMetadata } from "@guago/art";
import { LAWN, mapSize } from "@guago/content";
import { Facing, type MapState, TILE_SIZE } from "@guago/shared";
import * as Phaser from "phaser";
import {
  artMeta,
  composeLook,
  createSpriteAnims,
  defaultLook,
  loadArt,
  lookAnim,
  lookTexture,
  SHADOW_FRAME,
  spriteAnim,
} from "./art.ts";
import { drawGround } from "./ground.ts";
import { ServerClock, Track } from "./interp.ts";
import { stayConnected } from "./net.ts";

const SHADOW_DEPTH = 5;
const ENTITY_DEPTH = 10;
const SHADOW_ALPHA = 0.35;
/** A monster that stopped this long ago settles back into its idle loop. */
const SETTLE_MS = 150;
const PLAYER_RIG = "student";

interface View {
  readonly track: Track;
  readonly body: Phaser.GameObjects.Sprite;
  readonly shadow: Phaser.GameObjects.Image | undefined;
  /** Sprite name for monsters; undefined for players. */
  readonly sprite: string | undefined;
  movedAt: number;
}

export class WorldScene extends Phaser.Scene {
  private meta!: ArtMetadata;
  private look!: string;
  private readonly clock = new ServerClock();
  private readonly monsters = new Map<string, View>();
  private readonly players = new Map<string, View>();
  private selfId: string | undefined;

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

    const { w, h } = mapSize(LAWN);
    const cam = this.cameras.main;
    cam.setBounds(0, 0, w * TILE_SIZE, h * TILE_SIZE);
    cam.centerOn(LAWN.spawn.x, LAWN.spawn.y);
    cam.setRoundPixels(true);

    void stayConnected((room) => this.attach(room));
  }

  private attach(room: Room<unknown, MapState>): () => void {
    this.selfId = room.sessionId;
    room.onStateChange((state) => this.onPatch(state));
    return () => {
      for (const v of [...this.monsters.values(), ...this.players.values()]) this.destroyView(v);
      this.monsters.clear();
      this.players.clear();
      this.clock.reset();
      this.selfId = undefined;
    };
  }

  private onPatch(state: MapState): void {
    const now = performance.now();
    this.clock.observe(state.tick, now);

    for (const [id, m] of state.monsters) {
      let view = this.monsters.get(id);
      if (!view) {
        view = this.monsterView(m.kind);
        this.monsters.set(id, view);
      }
      view.track.push(state.tick, m.x, m.y, m.facing);
    }
    for (const [id, p] of state.players) {
      let view = this.players.get(id);
      if (!view) {
        view = this.playerView();
        this.players.set(id, view);
        if (id === this.selfId) this.cameras.main.startFollow(view.body, true);
      }
      view.track.push(state.tick, p.x, p.y);
    }
    this.prune(this.monsters, state.monsters);
    this.prune(this.players, state.players);
  }

  private prune(views: Map<string, View>, live: { has(id: string): boolean }): void {
    for (const [id, view] of views) {
      if (live.has(id)) continue;
      this.destroyView(view);
      views.delete(id);
    }
  }

  private monsterView(kind: string): View {
    const sprite = this.meta.sprites[kind];
    if (!sprite) throw new Error(`art has no sprite ${kind}`);
    const body = this.add.sprite(-100, -100, sprite.atlas).play(spriteAnim(kind, "idle"));
    // Start each loop at a different point so a crowd does not bob in step.
    body.anims.setProgress(Math.random());
    const own = `${kind}/${SHADOW_FRAME}`;
    const shadow = sprite.frames.includes(own)
      ? this.add.image(0, 0, sprite.atlas, own)
      : this.add.image(0, 0, this.lookKey(), SHADOW_FRAME);
    shadow.setAlpha(SHADOW_ALPHA).setDepth(SHADOW_DEPTH);
    return { track: new Track(), body, shadow, sprite: kind, movedAt: 0 };
  }

  private playerView(): View {
    const rig = this.meta.rigs[PLAYER_RIG];
    const dir = rig?.directions[0] ?? "down";
    const body = this.add
      .sprite(-100, -100, this.lookKey())
      .play(lookAnim(PLAYER_RIG, this.look, dir, "idle"));
    const shadow = this.add.image(0, 0, this.lookKey(), SHADOW_FRAME);
    shadow.setAlpha(SHADOW_ALPHA).setDepth(SHADOW_DEPTH);
    return { track: new Track(), body, shadow, sprite: undefined, movedAt: 0 };
  }

  private lookKey(): string {
    return lookTexture(PLAYER_RIG, this.look);
  }

  private destroyView(view: View): void {
    view.body.destroy();
    view.shadow?.destroy();
  }

  override update(time: number): void {
    const t = this.clock.renderTime(performance.now());
    for (const view of this.monsters.values()) {
      const at = this.place(view, t);
      if (at.moving) view.movedAt = time;
      view.body.setFlipX(at.facing === Facing.Left);
      const kind = view.sprite as string;
      const anim = time - view.movedAt < SETTLE_MS ? "hop" : "idle";
      view.body.play(spriteAnim(kind, anim), true);
    }
    for (const view of this.players.values()) this.place(view, t);
  }

  /** Moves a view to its interpolated position, snapped to whole pixels, and Y-sorts it. */
  private place(view: View, t: number) {
    const at = view.track.at(t);
    const x = Math.round(at.x);
    const y = Math.round(at.y);
    view.body.setPosition(x, y).setDepth(ENTITY_DEPTH + y);
    view.shadow?.setPosition(x, y);
    return at;
  }
}
