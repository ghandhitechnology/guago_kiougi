import { type Client, Room } from "@colyseus/core";
import { StateView } from "@colyseus/schema";
import { collisionOf, LAWN, type MapDef } from "@guago/content";
import {
  addPlayer,
  type CollisionMap,
  createWorld,
  INPUT_MESSAGE,
  InputQueue,
  inputMessage,
  MapState,
  MonsterState,
  type MoveInput,
  OWNER_TAG,
  PlayerState,
  POS_SCALE,
  RECONNECT_SECONDS,
  removePlayer,
  type SimWorld,
  step,
  TICK_MS,
} from "@guago/shared";
import { InterestGrid, type Viewer } from "./interest.ts";
import { RoomMetrics } from "./metrics.ts";

/** Messages a second past which a client is dropped; inputs are 20 a second. */
const MAX_MESSAGES_PER_SECOND = 120;
/** How often each room logs its numbers. */
const LOG_EVERY_MS = 30_000;
/** Ticks the loop will run back to back to catch up after a stall before it lets time go. */
const MAX_CATCH_UP = 3;

interface Seat {
  readonly state: InstanceType<typeof PlayerState>;
  readonly viewer: Viewer;
  readonly queue: InputQueue;
}

const wire = (px: number) => Math.round(px * POS_SCALE);

/**
 * One map instance. The server decides everything: clients send `input` only, each input is
 * queued per player and spent one tick at a time by the shared simulation, and the state that
 * comes back carries the last input applied so the owner can reconcile its prediction.
 */
export class MapRoom extends Room<{ state: MapState }> {
  override state = new MapState();
  override maxMessagesPerSecond = MAX_MESSAGES_PER_SECOND;

  private def: MapDef = LAWN;
  private map!: CollisionMap;
  private world!: SimWorld;
  private grid!: InterestGrid;
  private metrics!: RoomMetrics;
  private readonly seats = new Map<string, Seat>();
  private readonly monsters = new Map<number, InstanceType<typeof MonsterState>>();
  private acc = 0;

  /** The map this room runs. */
  protected mapDef(): MapDef {
    return LAWN;
  }

  override onCreate(): void {
    this.def = this.mapDef();
    this.map = collisionOf(this.def);
    const seed = (Math.random() * 2 ** 32) >>> 0;
    this.world = createWorld(this.map, this.def.monsters, seed);
    this.grid = new InterestGrid(this.world.width, this.world.height);
    this.metrics = new RoomMetrics(this.roomId, this.def.id);
    this.sync();

    this.onMessage(INPUT_MESSAGE, inputMessage, (client, input: MoveInput) => {
      const seat = this.seats.get(client.sessionId);
      if (seat && !seat.queue.push(input)) this.metrics.inputsDropped++;
    });

    // Patches go out right after each step, so every patch is exactly one tick of the world.
    this.setTimestep((dt) => this.loop(dt), TICK_MS);
    this.patchRate = 0;
    this.clock.setInterval(() => {
      if (this.clients.length > 0)
        console.log(JSON.stringify({ metrics: this.metrics.snapshot() }));
    }, LOG_EVERY_MS);
  }

  override onJoin(client: Client): void {
    const id = client.sessionId;
    this.world = addPlayer(this.world, id, this.def.spawn.x, this.def.spawn.y);
    const state = new PlayerState();
    const player = this.world.players.at(-1);
    if (!player) throw new Error("player was not added");
    state.x = wire(player.x);
    state.y = wire(player.y);
    state.facing = player.facing;
    state.seq = 0;
    this.state.players.set(id, state);

    const view = new StateView();
    client.view = view;
    view.add(state, OWNER_TAG);
    const viewer: Viewer = { view, cell: undefined };
    this.seats.set(id, { state, viewer, queue: new InputQueue() });
    const cell = this.grid.place(state, player.x, player.y);
    this.grid.watch(viewer, cell ?? this.grid.cellOfEntity(state));
    this.countBytes(client);
  }

  override onDrop(client: Client): void {
    // The character stays where it stood; queued inputs from before the drop are stale.
    this.seats.get(client.sessionId)?.queue.clear();
    this.allowReconnection(client, RECONNECT_SECONDS).catch(() => {});
  }

  override onReconnect(client: Client): void {
    this.countBytes(client);
  }

  override onLeave(client: Client): void {
    const id = client.sessionId;
    const seat = this.seats.get(id);
    if (seat) {
      this.grid.watch(seat.viewer, undefined);
      this.grid.remove(seat.state);
      this.seats.delete(id);
    }
    this.world = removePlayer(this.world, id);
    this.state.players.delete(id);
    client.view?.dispose();
    this.metrics.forget(id);
  }

  override onDispose(): void {
    this.metrics.dispose();
  }

  /** Counts every frame sent to this client toward the room's bytes-per-client figure. */
  private countBytes(client: Client): void {
    const raw = client.raw.bind(client);
    const metrics = this.metrics;
    const id = client.sessionId;
    client.raw = (data, options, cb) => {
      metrics.sent(id, data.byteLength);
      raw(data, options, cb);
    };
  }

  private loop(dt: number): void {
    const start = performance.now();
    this.acc = Math.min(this.acc + dt, TICK_MS * MAX_CATCH_UP);
    let ticks = 0;
    while (this.acc >= TICK_MS) {
      this.acc -= TICK_MS;
      const inputs = new Map<string, MoveInput[]>();
      for (const [id, seat] of this.seats) inputs.set(id, seat.queue.take());
      this.world = step(this.world, this.map, inputs);
      ticks++;
    }
    if (ticks === 0) return;
    this.sync();
    const patchStart = performance.now();
    this.broadcastPatch();
    const end = performance.now();
    this.metrics.recordTick(end - start, end - patchStart);
    this.metrics.players = this.seats.size;
    this.metrics.clients = this.clients.length;
    this.metrics.monsters = this.world.monsters.length;
  }

  /** Mirrors the simulation into the synced state and moves entities between interest cells. */
  private sync(): void {
    const { state, world, grid } = this;
    state.tick = world.tick;
    for (const m of world.monsters) {
      let synced = this.monsters.get(m.id);
      if (!synced) {
        synced = new MonsterState();
        synced.kind = m.kind;
        state.monsters.set(String(m.id), synced);
        this.monsters.set(m.id, synced);
      }
      synced.x = wire(m.x);
      synced.y = wire(m.y);
      synced.facing = m.facing;
      grid.place(synced, m.x, m.y);
    }
    for (const p of world.players) {
      const seat = this.seats.get(p.id);
      if (!seat) continue;
      seat.state.x = wire(p.x);
      seat.state.y = wire(p.y);
      seat.state.facing = p.facing;
      seat.state.seq = p.seq;
      const cell = grid.place(seat.state, p.x, p.y);
      if (cell !== undefined) grid.watch(seat.viewer, cell);
    }
  }
}
