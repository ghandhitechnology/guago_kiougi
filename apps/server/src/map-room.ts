import { type Client, Room } from "@colyseus/core";
import { LAWN, mapSize } from "@guago/content";
import {
  createWorld,
  MapState,
  MonsterState,
  PlayerState,
  RECONNECT_SECONDS,
  type SimWorld,
  step,
  TICK_RATE_HZ,
  TILE_SIZE,
} from "@guago/shared";

/** One map instance: runs the shared simulation at 20 Hz and mirrors it into the synced state. */
export class MapRoom extends Room<{ state: MapState }> {
  override state = new MapState();
  private world!: SimWorld;

  override onCreate(): void {
    const { w, h } = mapSize(LAWN);
    const seed = (Math.random() * 2 ** 32) >>> 0;
    this.world = createWorld(w * TILE_SIZE, h * TILE_SIZE, LAWN.monsters, seed);
    this.sync();
    this.setFixedTimestep(() => {
      this.world = step(this.world);
      this.sync();
    }, TICK_RATE_HZ);
  }

  override onJoin(client: Client): void {
    const player = new PlayerState();
    player.x = LAWN.spawn.x;
    player.y = LAWN.spawn.y;
    this.state.players.set(client.sessionId, player);
  }

  override onDrop(client: Client): void {
    this.allowReconnection(client, RECONNECT_SECONDS).catch(() => {});
  }

  override onLeave(client: Client): void {
    this.state.players.delete(client.sessionId);
  }

  private sync(): void {
    const { state, world } = this;
    state.tick = world.tick;
    for (const m of world.monsters) {
      const id = String(m.id);
      let synced = state.monsters.get(id);
      if (!synced) {
        synced = new MonsterState();
        synced.kind = m.kind;
        state.monsters.set(id, synced);
      }
      synced.x = Math.round(m.x);
      synced.y = Math.round(m.y);
      synced.facing = m.facing;
    }
  }
}
