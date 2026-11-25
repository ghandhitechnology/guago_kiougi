import { type AuthContext, type Client, Room } from "@colyseus/core";
import { StateView } from "@colyseus/schema";
import { collisionOf, LAWN, type MapDef } from "@guago/content";
import {
  addPlayer,
  type CollisionMap,
  createWorld,
  dressPlayer,
  INPUT_MESSAGE,
  InputQueue,
  inputMessage,
  MAP_SEATS,
  MapState,
  MonsterState,
  type MoveInput,
  OWNER_TAG,
  overlapsSolid,
  PLAYER_RADIUS,
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
import { places } from "./places.ts";
import { authenticateJoin, RoomSeats, SAVE_INTERVAL_MS } from "./seats.ts";

/** Messages a second past which a client is dropped; inputs are 20 a second. */
const MAX_MESSAGES_PER_SECOND = 120;
/** How often each room logs its numbers. */
const LOG_EVERY_MS = 30_000;
/** Ticks the loop will run back to back to catch up after a stall before it lets time go. */
const MAX_CATCH_UP = 3;
/**
 * The loop wakes this often and steps whenever a tick is due. A 50 ms interval timer drifts late
 * by a millisecond or so each time and then has to double-step, so patches would leave up to a
 * whole tick behind their stamp and clients drawing 100 ms in the past would run dry. Polling
 * keeps every tick within a few milliseconds of its time.
 */
const POLL_MS = 5;

/** A player's body in this room: what is synced, what its client sees, what it asked to do. */
interface Pawn {
  readonly slot: string;
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
  override maxClients = MAP_SEATS;

  private def: MapDef = LAWN;
  private map!: CollisionMap;
  private world!: SimWorld;
  private grid!: InterestGrid;
  private metrics!: RoomMetrics;
  private readonly pawns = new Map<string, Pawn>();
  /** Free body slots, longest free first, so a body is never handed on within one patch. */
  private readonly free: string[] = [];
  private seats!: RoomSeats;
  private readonly monsters = new Map<number, InstanceType<typeof MonsterState>>();
  private acc = 0;
  private lastLoop = 0;

  /** Only a browser with a live session and a character gets a seat. */
  static override async onAuth(_token: string, _options: unknown, ctx: AuthContext) {
    return authenticateJoin(ctx);
  }

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
    this.seats = new RoomSeats(this.def.id, (id) => this.placeOf(id));
    // Bodies before anything else, so their ref ids are the smallest the room will ever hand out.
    for (let i = 0; i < MAP_SEATS; i++) {
      const slot = String(i);
      this.state.players.set(slot, new PlayerState());
      this.free.push(slot);
    }
    this.sync();

    this.onMessage(INPUT_MESSAGE, inputMessage, (client, input: MoveInput) => {
      const pawn = this.pawns.get(client.sessionId);
      if (pawn && !pawn.queue.push(input)) this.metrics.inputsDropped++;
    });

    // Patches go out right after each step, so every patch is exactly one tick of the world.
    this.lastLoop = performance.now();
    this.setTimestep(() => this.loop(), POLL_MS);
    this.patchRate = 0;
    this.clock.setInterval(() => {
      if (this.clients.length > 0)
        console.log(JSON.stringify({ metrics: this.metrics.snapshot() }));
    }, LOG_EVERY_MS);
    this.clock.setInterval(() => void this.seats.saveAll(), SAVE_INTERVAL_MS);
  }

  /** Players seated in this room. */
  get playerCount(): number {
    return this.pawns.size;
  }

  /** Where a session's character stands, in whole pixels, for saving. */
  private placeOf(id: string): { x: number; y: number } | undefined {
    const p = this.world.players.find((q) => q.id === id);
    return p && { x: Math.round(p.x), y: Math.round(p.y) };
  }

  /** The saved place when it is on this map and clear of walls, else the map's spawn. */
  private startOf(mapId: string, x: number, y: number): { x: number; y: number } {
    const fits =
      mapId === this.def.id &&
      x > 0 &&
      y > 0 &&
      x < this.world.width &&
      y < this.world.height &&
      !overlapsSolid(this.map, x, y, PLAYER_RADIUS);
    return fits ? { x, y } : this.def.spawn;
  }

  override async onJoin(client: Client): Promise<void> {
    const character = await this.seats.join(client);
    const id = client.sessionId;
    const start = this.startOf(character.mapId, character.x, character.y);
    const slot = this.free.shift();
    const state = slot === undefined ? undefined : this.state.players.get(slot);
    if (slot === undefined || !state)
      throw new Error("no free body; maxClients should have refused the join");
    this.world = addPlayer(this.world, id, start.x, start.y);
    const player = this.world.players.at(-1);
    if (!player) throw new Error("player was not added");
    state.sid = id;
    state.x = wire(player.x);
    state.y = wire(player.y);
    state.facing = player.facing;
    state.seq = 0;
    dressPlayer(state, character);

    const view = new StateView();
    client.view = view;
    view.add(state, OWNER_TAG);
    const viewer: Viewer = { view, cell: undefined };
    this.pawns.set(id, { slot, state, viewer, queue: new InputQueue() });
    const cell = this.grid.place(state, player.x, player.y);
    this.grid.watch(viewer, cell ?? this.grid.cellOfEntity(state));
    this.countBytes(client);
    const at = () => this.placeOf(id);
    places.enter(character.id, { mapId: this.def.id, roomId: this.roomId, sessionId: id, at });
  }

  override onDrop(client: Client): void {
    // The character stays where it stood; queued inputs from before the drop are stale.
    this.pawns.get(client.sessionId)?.queue.clear();
    if (!this.seats.mayReconnect(client)) return;
    this.seats.hold(client, this.allowReconnection(client, RECONNECT_SECONDS));
  }

  override onReconnect(client: Client): void {
    this.seats.reconnected(client);
    this.countBytes(client);
  }

  override async onLeave(client: Client): Promise<void> {
    places.leave(client.sessionId);
    // Saves the place, so the body stays in the world until the write is done.
    await this.seats.leave(client);
    const id = client.sessionId;
    const pawn = this.pawns.get(id);
    if (pawn) {
      this.grid.watch(pawn.viewer, undefined);
      this.grid.remove(pawn.state);
      pawn.state.sid = "";
      this.pawns.delete(id);
      this.free.push(pawn.slot);
    }
    this.world = removePlayer(this.world, id);
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

  private loop(): void {
    const now = performance.now();
    this.acc = Math.min(this.acc + now - this.lastLoop, TICK_MS * MAX_CATCH_UP);
    this.lastLoop = now;
    if (this.acc < TICK_MS) return;
    const start = now;
    const cpu = process.threadCpuUsage();
    let ticks = 0;
    while (this.acc >= TICK_MS) {
      this.acc -= TICK_MS;
      const inputs = new Map<string, MoveInput[]>();
      for (const [id, pawn] of this.pawns) inputs.set(id, pawn.queue.take());
      this.world = step(this.world, this.map, inputs);
      ticks++;
    }
    if (ticks === 0) return;
    this.sync();
    const patchStart = performance.now();
    this.broadcastPatch();
    const end = performance.now();
    const used = process.threadCpuUsage(cpu);
    this.metrics.recordTick(end - start, (used.user + used.system) / 1000, end - patchStart);
    this.metrics.players = this.pawns.size;
    this.metrics.clients = this.clients.length;
    this.metrics.monsters = this.world.monsters.length;
    this.metrics.viewChanges = this.grid.changes;
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
      const pawn = this.pawns.get(p.id);
      if (!pawn) continue;
      pawn.state.x = wire(p.x);
      pawn.state.y = wire(p.y);
      pawn.state.facing = p.facing;
      pawn.state.seq = p.seq;
      const cell = grid.place(pawn.state, p.x, p.y);
      if (cell !== undefined) grid.watch(pawn.viewer, cell);
    }
  }
}
