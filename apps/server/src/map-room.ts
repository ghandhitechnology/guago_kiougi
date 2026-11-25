import { type AuthContext, type Client, Room } from "@colyseus/core";
import { StateView } from "@colyseus/schema";
import { LAWN } from "@guago/content";
import {
  addPlayer,
  type Character,
  type Collidable,
  createWorld,
  dressPlayer,
  INPUT_MESSAGE,
  InputQueue,
  inputMessage,
  MAP_SEATS,
  MAX_MAP_PX,
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
  skipTicks,
  step,
  TILE_SIZE,
  wearClub,
} from "@guago/shared";
import { clubTags } from "./club-tags.ts";
import { InterestGrid, type Viewer } from "./interest.ts";
import { RoomMetrics } from "./metrics.ts";
import { places } from "./places.ts";
import { type RoomMap, roomMapFor } from "./room-maps.ts";
import { authenticateJoin, RoomSeats, SAVE_INTERVAL_MS } from "./seats.ts";
import { TickClock } from "./tick-clock.ts";

/**
 * Messages a second past which a client is dropped. Inputs come 20 a second, but a link that
 * stalls delivers all it held at once, and the server drops a link silent for more than about
 * nine seconds anyway: 400 lets every stall the connection survives through, and the input queue
 * already bounds what a burst can buy.
 */
const MAX_MESSAGES_PER_SECOND = 400;
/** How often each room logs its numbers. */
const LOG_EVERY_MS = 30_000;
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
  readonly characterId: string;
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

  private def: RoomMap = LAWN;
  private map!: Collidable;
  private world!: SimWorld;
  private grid!: InterestGrid;
  private metrics!: RoomMetrics;
  private readonly pawns = new Map<string, Pawn>();
  /** Free body slots, longest free first, so a body is never handed on within one patch. */
  private readonly free: string[] = [];
  private seats!: RoomSeats;
  private readonly monsters = new Map<number, InstanceType<typeof MonsterState>>();
  private ticks!: TickClock;
  private unlistenClubs: (() => void) | undefined;

  /** Only a browser with a live session and a character gets a seat. */
  static override async onAuth(_token: string, _options: unknown, ctx: AuthContext) {
    return authenticateJoin(ctx);
  }

  override onCreate(options?: { map?: unknown; monsters?: unknown }): void {
    this.def = roomMapFor(options);
    this.map = this.def;
    const { w, h } = this.def.collision;
    if (w * TILE_SIZE > MAX_MAP_PX || h * TILE_SIZE > MAX_MAP_PX) {
      throw new Error(`map ${this.def.id} is larger than positions can address (${MAX_MAP_PX} px)`);
    }
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
      if (pawn) this.metrics.inputsDropped += pawn.queue.push(input);
    });

    // Patches go out right after each step, so every patch is exactly one tick of the world.
    this.ticks = new TickClock(performance.now());
    this.setTimestep(() => this.loop(), POLL_MS);
    this.patchRate = 0;
    this.clock.setInterval(() => {
      if (this.clients.length > 0)
        console.log(JSON.stringify({ metrics: this.metrics.snapshot() }));
    }, LOG_EVERY_MS);
    this.clock.setInterval(() => void this.seats.saveAll(), SAVE_INTERVAL_MS);
    // A club joined, left or restyled shows under the name at once.
    this.unlistenClubs = clubTags.listen((characterId, tag) => {
      for (const pawn of this.pawns.values()) {
        if (pawn.characterId === characterId) wearClub(pawn.state, tag);
      }
    });
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
    try {
      this.seat(client, character);
    } catch (error) {
      // Nothing of a half-made seat stays behind: not the body, not the slot, not the account.
      this.unseat(client);
      await this.seats.leave(client);
      throw error;
    }
  }

  /** Puts a joined character's body into the world and the client's view around it. */
  private seat(client: Client, character: Character): void {
    const id = client.sessionId;
    const start = this.startOf(character.mapId, character.x, character.y);
    const view = new StateView();
    client.view = view;
    const slot = this.free.shift();
    const state = slot === undefined ? undefined : this.state.players.get(slot);
    if (slot === undefined || !state) {
      throw new Error("no free body; maxClients should have refused the join");
    }
    // Recorded at once, so unseat finds and frees the slot whatever fails below.
    const viewer: Viewer = { view, cell: undefined };
    this.pawns.set(id, {
      slot,
      characterId: character.id,
      state,
      viewer,
      queue: new InputQueue(),
    });
    this.world = addPlayer(this.world, id, start.x, start.y);
    const player = this.world.players.at(-1);
    if (!player) throw new Error("player was not added");
    state.sid = id;
    state.x = wire(player.x);
    state.y = wire(player.y);
    state.facing = player.facing;
    state.seq = 0;
    dressPlayer(state, character);
    wearClub(state, clubTags.get(character.id));
    view.add(state, OWNER_TAG);
    const cell = this.grid.place(state, player.x, player.y);
    this.grid.watch(viewer, cell ?? this.grid.cellOfEntity(state));
    this.countBytes(client);
    places.enter(character.id, {
      mapId: this.def.id,
      roomId: this.roomId,
      sessionId: id,
      at: () => this.placeOf(id),
    });
  }

  /** Takes a body out of the world and every view, and frees its slot. */
  private unseat(client: Client): void {
    const id = client.sessionId;
    places.leave(id);
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
    this.unseat(client);
  }

  override onDispose(): void {
    this.unlistenClubs?.();
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
    const { run, skip } = this.ticks.advance(now);
    if (run === 0) return;
    const start = now;
    const cpu = process.threadCpuUsage();
    // Ticks lost to a stall keep their numbers, so the stamps on patches keep wall time.
    if (skip > 0) this.world = skipTicks(this.world, skip);
    for (let i = 0; i < run; i++) {
      const inputs = new Map<string, MoveInput[]>();
      for (const [id, pawn] of this.pawns) inputs.set(id, pawn.queue.take());
      this.world = step(this.world, this.map, inputs);
    }
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
