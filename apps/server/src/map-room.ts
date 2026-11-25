import { type AuthContext, type Client, Room } from "@colyseus/core";
import { LAWN, mapSize } from "@guago/content";
import {
  createWorld,
  dressPlayer,
  MapState,
  MonsterState,
  PlayerState,
  RECONNECT_SECONDS,
  type SimWorld,
  step,
  TICK_RATE_HZ,
  TILE_SIZE,
} from "@guago/shared";
import { places } from "./places.ts";
import { authenticateJoin, RoomSeats, SAVE_INTERVAL_MS } from "./seats.ts";

/** One map instance: runs the shared simulation at 20 Hz and mirrors it into the synced state. */
export class MapRoom extends Room<{ state: MapState }> {
  override state = new MapState();
  private world!: SimWorld;
  private seats = new RoomSeats(LAWN.id, (id) => this.state.players.get(id));

  /** Only a browser with a live session and a character gets a seat. */
  static override async onAuth(_token: string, _options: unknown, ctx: AuthContext) {
    return authenticateJoin(ctx);
  }

  override onCreate(): void {
    const { w, h } = mapSize(LAWN);
    const seed = (Math.random() * 2 ** 32) >>> 0;
    this.world = createWorld(w * TILE_SIZE, h * TILE_SIZE, LAWN.monsters, seed);
    this.sync();
    this.setFixedTimestep(() => {
      this.world = step(this.world);
      this.sync();
    }, TICK_RATE_HZ);
    this.clock.setInterval(() => void this.seats.saveAll(), SAVE_INTERVAL_MS);
  }

  override async onJoin(client: Client): Promise<void> {
    const character = await this.seats.join(client);
    const here = character.mapId === LAWN.id;
    const player = new PlayerState();
    player.x = here ? character.x : LAWN.spawn.x;
    player.y = here ? character.y : LAWN.spawn.y;
    dressPlayer(player, character);
    this.state.players.set(client.sessionId, player);
    const { sessionId } = client;
    const at = () => this.state.players.get(sessionId);
    places.enter(character.id, { mapId: LAWN.id, roomId: this.roomId, sessionId, at });
  }

  override onDrop(client: Client): void {
    if (!this.seats.mayReconnect(client)) return;
    this.seats.hold(client, this.allowReconnection(client, RECONNECT_SECONDS));
  }

  override onReconnect(client: Client): void {
    this.seats.reconnected(client);
  }

  override async onLeave(client: Client): Promise<void> {
    places.leave(client.sessionId);
    await this.seats.leave(client);
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
