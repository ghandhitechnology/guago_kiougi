import { type AuthContext, type Client, type Delayed, Room, ServerError } from "@colyseus/core";
import { StateView } from "@colyseus/schema";
import { type BuiltMap, type Interactable, type Patrol, patrolPose, sees } from "@guago/content";
import {
  addPlayer,
  type Caught,
  type Character,
  CLOSE_MAP_CHANGED,
  type Collidable,
  createWorld,
  type DoorRattle,
  type DoorRefusal,
  dressPlayer,
  type Facing,
  type Halt,
  INPUT_MESSAGE,
  InputQueue,
  type Interaction,
  inputMessage,
  interactMessage,
  MAP_MESSAGES,
  MAP_SEATS,
  MAX_MAP_PX,
  MapState,
  MonsterState,
  type MoveInput,
  type NpcLine,
  NpcState,
  nearestUsable,
  OWNER_TAG,
  PLAYER_RADIUS,
  PlayerState,
  POS_SCALE,
  RECONNECT_SECONDS,
  removePlayer,
  type SimWorld,
  shutDoorAhead,
  shutDoors,
  skipTicks,
  step,
  stepDoors,
  TICK_MS,
  TILE_SIZE,
  type Transfer,
  type Usable,
  wearClub,
  type ZoneUpdate,
  zonesAt,
} from "@guago/shared";
import { channels, type MapRoomOptions, type SeatOptions } from "./channels.ts";
import { clubTags } from "./club-tags.ts";
import { InterestGrid, type Viewer } from "./interest.ts";
import { live } from "./live/current.ts";
import { RoomMetrics } from "./metrics.ts";
import { places } from "./places.ts";
import { RoomSeats, SAVE_INTERVAL_MS } from "./seats.ts";
import { TickClock } from "./tick-clock.ts";
import {
  belongsOn,
  builtMap,
  describe,
  HOME_MAP,
  isDesk,
  MEAL_COUNTERS,
  type Npc,
  npcsOf,
  PLACE_THINGS,
  placesAt,
  roomCollision,
  START_MAP,
  spawnPlace,
  validPlace,
} from "./world-maps.ts";

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
/** A seat whose player went through a door is closed if its socket is still open after this. */
const MOVED_SOCKET_MS = 20_000;
/** Interact requests closer together than this are not answered. */
const INTERACT_COOLDOWN_MS = 250;
/** Pressing against a shut door rattles it at most this often per player. */
const RATTLE_COOLDOWN_MS = 1200;
/** People turn to a player this close to them, and turn back this long after they leave. */
const NOTICE_PX = 40;
const TURN_BACK_TICKS = 40;
/** People bark now and then while a player stands this close. */
const BARK_PX = 80;
/** Ticks before the first bark once someone comes near, and between barks after. */
const FIRST_BARK = [20, 60] as const;
const BARK_GAP = [300, 560] as const;
/** Ticks a person keeps quiet after being talked to. */
const AFTER_TALK = 200;
/** Interactable kinds that open a panel the UI attaches. */
const OPENS = new Set(["station", "shop", "board", "quests", "codex", "replay", "hall-of-fame"]);
/** How often doors ask the Page clock whether the maps behind them are open. */
const DOORS_EVERY_MS = 5000;
/** How often the 집 lets players whose 명령퇴사 has ended go back to school. */
const HOME_EVERY_MS = 2000;
/** Guards look every other tick; a player they caught is not seen again for this long. */
const PATROL_EVERY_TICKS = 2;
const CAUGHT_GRACE_TICKS = 80;

/** A player's body in this room: what is synced, what its client sees, what it asked to do. */
interface Pawn {
  readonly slot: string;
  readonly client: Client;
  readonly character: Character;
  readonly state: InstanceType<typeof PlayerState>;
  readonly viewer: Viewer;
  readonly queue: InputQueue;
  /** Walking out through a door: no more inputs, no more doors. */
  leaving: boolean;
  zones: readonly string[];
  /** The tile the zones were last worked out on, row major. */
  zoneTile: number;
  lastInteract: number;
  lastRattle: number;
  /** In reach of a 졸방대, as last told to the living world. */
  atDesk: boolean;
  /** Tick until which patrols look past this player, after they were caught. */
  unseenUntil: number;
}

/** A cast member standing here, with what the room remembers about them. */
interface Person {
  readonly npc: Npc;
  readonly state: InstanceType<typeof NpcState>;
  /** Tick from which the next bark may come; undefined while nobody is near. */
  nextBark: number | undefined;
  /** Tick until which they keep facing the player they turned to. */
  turnedUntil: number;
  lastLine: string | undefined;
}

type Thing = Usable & { readonly what: { npc: Person } | { thing: Interactable } };

const wire = (px: number) => Math.round(px * POS_SCALE);
const between = ([lo, hi]: readonly [number, number]) =>
  lo + Math.floor(Math.random() * (hi - lo + 1));

/** The way to face to look from (x, y) at (tx, ty). */
function facingToward(x: number, y: number, tx: number, ty: number): Facing {
  const dx = tx - x;
  const dy = ty - y;
  if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? 2 : 3;
  return dy < 0 ? 1 : 0;
}

/**
 * One channel of one map (PLAN §10, §19). The server decides everything: clients send `input`
 * and `interact` only, each input is queued per player and spent one tick at a time by the
 * shared simulation, and the state that comes back carries the last input applied so the owner
 * can reconcile its prediction. Doors, zones, the cast and what is in reach are worked out from
 * the server's own positions.
 */
export class MapRoom extends Room<{ state: MapState }> {
  override state = new MapState();
  override maxMessagesPerSecond = MAX_MESSAGES_PER_SECOND;
  override maxClients = MAP_SEATS;
  override autoDispose = false;

  private def!: BuiltMap;
  /** The walls players walk on here; closed doors swap its grid as the Page clock moves. */
  private map!: { collision: Collidable["collision"] };
  private world!: SimWorld;
  private grid!: InterestGrid;
  private metrics!: RoomMetrics;
  private readonly pawns = new Map<string, Pawn>();
  /** Free body slots, longest free first, so a body is never handed on within one patch. */
  private readonly free: string[] = [];
  private seats!: RoomSeats;
  private readonly monsters = new Map<number, InstanceType<typeof MonsterState>>();
  /** The portal each player stands in, for the doorway step. */
  private inside = new Map<string, number>();
  private people: Person[] = [];
  private usable: Thing[] = [];
  private retireTimer: Delayed | undefined;
  /** Portal ids whose map the Page clock has not opened: shut, as `MapState.closed` says. */
  private closed = new Set<string>();
  private patrols: readonly Patrol[] = [];
  private graceMs = 30_000;
  private ticks!: TickClock;
  private unlistenClubs: (() => void) | undefined;

  /**
   * Map rooms are never matchmade by a client: every seat is reserved by the server for a
   * character it has placed (`channels.seat`), which skips this check.
   */
  static override async onAuth(_token: string, _options: unknown, _ctx: AuthContext) {
    throw new ServerError(403, "forbidden");
  }

  override onCreate(options: MapRoomOptions): void {
    const def = builtMap(options.map);
    if (!def) throw new Error(`no built map ${options.map}`);
    this.def = def;
    // Its own copy: closed doors change it as the Page clock opens maps.
    this.map = { collision: roomCollision(def).collision };
    this.patrols = def.patrols;
    this.maxClients = Math.max(1, Math.min(MAP_SEATS, options.seats));
    this.graceMs = options.grace * 1000;
    const { w, h } = def.collision;
    if (w * TILE_SIZE > MAX_MAP_PX || h * TILE_SIZE > MAX_MAP_PX) {
      throw new Error(`map ${def.id} is larger than positions can address (${MAX_MAP_PX} px)`);
    }
    const seed = (Math.random() * 2 ** 32) >>> 0;
    // Monsters only for load tests; field monsters arrive with the combat simulation.
    const monsters = options.monsters ? [{ kind: "odap", count: options.monsters }] : [];
    this.world = createWorld(this.map, monsters, seed);
    this.grid = new InterestGrid(this.world.width, this.world.height);
    this.metrics = new RoomMetrics(this.roomId, def.id);
    this.seats = new RoomSeats(def.id, (id) => this.placeOf(id));
    this.state.map = def.id;
    this.state.channel = options.channel;
    void this.setMetadata({ map: def.id, channel: options.channel });
    // Bodies before anything else, so their ref ids are the smallest the room will ever hand out.
    for (let i = 0; i < MAP_SEATS; i++) {
      const slot = String(i);
      this.state.players.set(slot, new PlayerState());
      this.free.push(slot);
    }
    this.placeCast();
    this.refreshDoors();
    this.sync();

    this.onMessage(INPUT_MESSAGE, inputMessage, (client, input: MoveInput) => {
      const pawn = this.pawns.get(client.sessionId);
      if (pawn && !pawn.leaving) this.metrics.inputsDropped += pawn.queue.push(input);
    });
    this.onMessage(MAP_MESSAGES.interact, interactMessage, (client, n: number) => {
      this.interact(client, n);
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
    this.clock.setInterval(() => this.refreshDoors(), DOORS_EVERY_MS);
    if (def.id === HOME_MAP) this.clock.setInterval(() => this.letGoHome(), HOME_EVERY_MS);
    // A club joined, left or restyled shows under the name at once.
    this.unlistenClubs = clubTags.listen((characterId, tag) => {
      for (const pawn of this.pawns.values()) {
        if (pawn.character.id === characterId) wearClub(pawn.state, tag);
      }
    });
    // Made for a seat that may never be taken.
    this.emptied();
  }

  /** Players seated in this room. */
  get playerCount(): number {
    return this.pawns.size;
  }

  /** Which map and channel this room runs. */
  get mapId(): string {
    return this.def.id;
  }

  get channel(): number {
    return this.state.channel;
  }

  /** Ids of the characters standing here, for tests and tools. */
  get characterIds(): string[] {
    return [...this.pawns.values()].map((p) => p.character.id);
  }

  /**
   * An empty channel waits out the grace period, then closes unless someone came or a seat is
   * reserved for someone on the way (then it looks again after another period).
   */
  private emptied(): void {
    this.retireTimer?.clear();
    this.retireTimer = this.clock.setTimeout(() => void this.retire(), this.graceMs);
  }

  private async retire(): Promise<void> {
    this.retireTimer = undefined;
    if (this.clients.length > 0) return;
    if (await channels.retire(this.def.id, this.roomId)) await this.disconnect();
    else if (this.clients.length === 0) this.emptied();
  }

  /** Where a session's character stands, in whole pixels, for saving. */
  private placeOf(id: string): { x: number; y: number } | undefined {
    const p = this.world.players.find((q) => q.id === id);
    return p && { x: Math.round(p.x), y: Math.round(p.y) };
  }

  override async onJoin(client: Client, options: SeatOptions = {}): Promise<void> {
    this.retireTimer?.clear();
    this.retireTimer = undefined;
    const character = await this.seats.join(client);
    try {
      // A seat is good only for where the character belongs as it is taken: a ticket from before
      // a door, an expel or another page's move is refused, and the client enters again.
      if (!(await this.belongsHere(character))) throw new ServerError(409, "elsewhere");
      this.seat(client, character, options);
    } catch (error) {
      // Nothing of a half-made seat stays behind: not the body, not the slot, not the account.
      this.removeBody(client.sessionId);
      client.view?.dispose();
      await this.seats.leave(client);
      throw error;
    }
    // Sent home while the seat was being taken, the expel found no body to move: move it now.
    if (this.def.id !== HOME_MAP && (await live()?.homeUntil(character.id)) != null) {
      this.relocate(character.id, HOME_MAP, "main", "home");
    }
  }

  /**
   * Whether the character belongs on this map by its durable record (`belongsOn`): every seat,
   * whether from entering, a door, the school moving them or a reconnection, is checked by it.
   */
  private async belongsHere(saved: Pick<Character, "id" | "mapId" | "x" | "y">): Promise<boolean> {
    const sentHome = (await live()?.homeUntil(saved.id)) != null;
    return belongsOn(saved, sentHome) === this.def.id;
  }

  /** Puts a joined character's body into the world and the client's view around it. */
  private seat(client: Client, character: Character, options: SeatOptions): void {
    const id = client.sessionId;
    const start =
      character.mapId === this.def.id
        ? validPlace(this.def.id, character.x, character.y)
        : spawnPlace(this.def, "main");
    const facing =
      Number.isInteger(options.facing) && (options.facing as number) >= 0
        ? (((options.facing as number) % 4) as Facing)
        : start.facing;
    const view = new StateView();
    client.view = view;
    const slot = this.free.shift();
    const state = slot === undefined ? undefined : this.state.players.get(slot);
    if (slot === undefined || !state) {
      throw new Error("no free body; maxClients should have refused the join");
    }
    const viewer: Viewer = { view, cell: undefined };
    // Recorded at once, so removeBody finds and frees the slot whatever fails below.
    const pawn: Pawn = {
      slot,
      client,
      character,
      state,
      viewer,
      queue: new InputQueue(),
      leaving: false,
      zones: [],
      zoneTile: -1,
      lastInteract: 0,
      lastRattle: 0,
      atDesk: false,
      unseenUntil: 0,
    };
    this.pawns.set(id, pawn);
    this.world = addPlayer(this.world, id, start.x, start.y);
    this.world = {
      ...this.world,
      players: this.world.players.map((p) => (p.id === id ? { ...p, facing } : p)),
    };
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
    pawn.zones = zonesAt(this.def.zones, player.x, player.y);
    pawn.zoneTile = this.tileOf(player.x, player.y);
    const cell = this.grid.place(state, player.x, player.y);
    this.grid.watch(viewer, cell ?? this.grid.cellOfEntity(state));
    this.countBytes(client);
    client.send(MAP_MESSAGES.zones, { zones: pawn.zones } satisfies ZoneUpdate);
    places.enter(character.id, {
      mapId: this.def.id,
      channel: this.state.channel,
      roomId: this.roomId,
      sessionId: id,
      at: () => this.placeOf(id),
      zones: () => this.pawns.get(id)?.zones ?? [],
    });
    this.visit(character.id, placesAt(this.def, player.x, player.y));
  }

  /** Tells the living world the character is in these places (도감 school entries, notices). */
  private visit(characterId: string, ids: readonly string[]): void {
    const events = live()?.events;
    if (events) for (const id of ids) events.visit(characterId, id);
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
    if (this.clients.length === 0) this.emptied();
    // Saves the place, so the body stays in the world until the write is done.
    await this.seats.leave(client);
    this.removeBody(client.sessionId);
    client.view?.dispose();
  }

  override onDispose(): void {
    channels.forget(this.roomId);
    this.unlistenClubs?.();
    this.metrics.dispose();
  }

  /** Takes a player's body out of the world and frees its slot. Safe to call twice. */
  private removeBody(id: string): void {
    const pawn = this.pawns.get(id);
    if (pawn) {
      this.grid.watch(pawn.viewer, undefined);
      this.grid.remove(pawn.state);
      pawn.state.sid = "";
      this.pawns.delete(id);
      this.free.push(pawn.slot);
    }
    this.inside.delete(id);
    this.world = removePlayer(this.world, id);
    this.metrics.forget(id);
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
      const before = this.world;
      this.world = step(this.world, this.map, inputs);
      this.afterStep(before, inputs);
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

  // Doors, zones and people, once per tick ----------------------------------------------------

  private afterStep(before: SimWorld, inputs: ReadonlyMap<string, readonly MoveInput[]>): void {
    const walkers = this.world.players.filter((p) => !this.pawns.get(p.id)?.leaving);
    const doors = stepDoors(this.inside, walkers, this.def.portals);
    this.inside = new Map(doors.inside);
    for (const { id, portal } of doors.entered) {
      const pawn = this.pawns.get(id);
      const p = this.def.portals[portal];
      if (pawn && p?.built) void this.walkThrough(pawn, p.id, p.to, p.spawn);
    }
    const now = Date.now();
    const was = new Map(before.players.map((p) => [p.id, p]));
    for (const p of walkers) {
      const pawn = this.pawns.get(p.id);
      if (!pawn || pawn.leaving) continue;
      const tile = this.tileOf(p.x, p.y);
      if (tile !== pawn.zoneTile) {
        pawn.zoneTile = tile;
        const zones = zonesAt(this.def.zones, p.x, p.y);
        if (zones.join() !== pawn.zones.join()) {
          pawn.zones = zones;
          pawn.client.send(MAP_MESSAGES.zones, { zones } satisfies ZoneUpdate);
          // The living world counts each place once; walking back in costs nothing.
          this.visit(pawn.character.id, placesAt(this.def, p.x, p.y));
        }
        this.standAtDesk(pawn, p.x, p.y);
      }
      // Pushing against a shut door: had a move this tick and went nowhere.
      const prev = was.get(p.id);
      if (!prev || (inputs.get(p.id)?.length ?? 0) === 0) continue;
      if (Math.abs(p.x - prev.x) + Math.abs(p.y - prev.y) > 1) continue;
      const shut = shutDoorAhead(this.def.portals, p.x, p.y, p.facing, PLAYER_RADIUS, this.closed);
      const door = this.def.portals[shut];
      if (!door || now - pawn.lastRattle < RATTLE_COOLDOWN_MS) continue;
      pawn.lastRattle = now;
      this.rattle(door.id, "portal", p.id, door.built ? "door_closed" : "door_unbuilt");
    }
    if (this.world.tick % 4 === 0) this.tendCast();
    if (this.patrols.length > 0 && this.world.tick % PATROL_EVERY_TICKS === 0) this.watchPatrols();
  }

  /** A shut door or a locked hatch shaken, for everyone near to see and hear. */
  private rattle(id: string, of: DoorRattle["of"], sid: string, why: DoorRefusal): void {
    this.broadcast(MAP_MESSAGES.door, { id, of, sid, why } satisfies DoorRattle);
  }

  /** Standing in reach of a 졸방대 tells the living world, on arriving and on leaving. */
  private standAtDesk(pawn: Pawn, x: number, y: number): void {
    const at = this.def.interactables.some(
      (t) => isDesk(t.id) && nearestUsable([{ kind: "thing", id: t.id, rect: t.rect }], x, y),
    );
    if (at === pawn.atDesk) return;
    pawn.atDesk = at;
    live()?.events.atDesk(pawn.character.id, at);
  }

  /**
   * Asks the Page clock which maps behind this map's doors are open (PLAN §10 page lifecycle).
   * A door to a closed map is shut like an unbuilt one, on the server's walls and, through
   * `MapState.closed`, on every client's.
   */
  private refreshDoors(): void {
    const l = live();
    const closed = new Set(
      this.def.portals.filter((p) => p.built && l && !l.isOpen(p.to)).map((p) => p.id),
    );
    if ([...closed].join() === [...this.closed].join()) return;
    this.closed = closed;
    this.map.collision = shutDoors(this.def.collision, this.def.portals, closed);
    this.state.closed.splice(0, this.state.closed.length, ...closed);
  }

  private tileOf(x: number, y: number): number {
    return Math.floor(y / TILE_SIZE) * this.def.w + Math.floor(x / TILE_SIZE);
  }

  /**
   * Through a door (PLAN §10), or sent somewhere by the school: the body leaves this world at
   * once, the character is written on the other side, this room lets go of the account's seat,
   * and only then does the client get a reserved seat in the target map's room. See
   * `RoomSeats.moveOut` for why nothing can be lost or doubled in between.
   */
  private async walkThrough(pawn: Pawn, via: string, to: string, spawn: string): Promise<void> {
    const target = builtMap(to);
    if (!target) return;
    // The Page clock can close a map between the door check and the step.
    if (this.closed.has(via)) {
      this.rattle(via, "portal", pawn.client.sessionId, "door_closed");
      return;
    }
    const { client } = pawn;
    const id = client.sessionId;
    const at = this.placeOf(id);
    pawn.leaving = true;
    pawn.queue.clear();
    this.removeBody(id);
    const arrive = spawnPlace(target, spawn);
    let auth: Awaited<ReturnType<RoomSeats["moveOut"]>>;
    try {
      auth = await this.seats.moveOut(client, target.id, arrive.x, arrive.y);
    } catch {
      // Nothing was written, or another login took the account: stay, or let eviction end it.
      if (this.seats.mayReconnect(client) && at && this.clients.includes(client)) {
        this.restoreBody(pawn, at.x, at.y);
      }
      return;
    }
    let seating: Awaited<ReturnType<typeof channels.seat>> | undefined;
    try {
      seating = await channels.seat(target.id, auth, { facing: arrive.facing });
    } catch (error) {
      console.error(`seating ${id} in ${target.id} failed: ${String(error)}`);
    }
    if (!this.clients.includes(client)) return;
    if (!seating) {
      // Written on the other side already: the client enters again and lands there.
      client.leave(CLOSE_MAP_CHANGED);
      return;
    }
    client.send(MAP_MESSAGES.transfer, { ...seating, via } satisfies Transfer);
    this.clock.setTimeout(() => {
      if (this.clients.includes(client)) client.leave(CLOSE_MAP_CHANGED);
    }, MOVED_SOCKET_MS);
  }

  /**
   * Sends a character standing here to another map: 명령퇴사 to the 집 and back (PLAN §11).
   * Returns false when they are not here.
   */
  relocate(characterId: string, to: string, spawn: string, via: string): boolean {
    const pawn = [...this.pawns.values()].find((p) => p.character.id === characterId);
    if (!pawn || pawn.leaving) return false;
    void this.walkThrough(pawn, via, to, spawn);
    return true;
  }

  /** In the 집: whoever has served their time goes back to school. */
  private letGoHome(): void {
    const l = live();
    if (!l) return;
    for (const pawn of this.pawns.values()) {
      if (pawn.leaving) continue;
      void l.homeUntil(pawn.character.id).then((until) => {
        if (until === null) this.relocate(pawn.character.id, START_MAP, "main", "school");
      });
    }
  }

  /** Puts a body back where it stood after a door that could not be walked through. */
  private restoreBody(pawn: Pawn, x: number, y: number): void {
    const slot = this.free.shift();
    const state = slot === undefined ? undefined : this.state.players.get(slot);
    if (slot === undefined || !state) return;
    const id = pawn.client.sessionId;
    this.world = addPlayer(this.world, id, x, y);
    state.sid = id;
    state.x = wire(x);
    state.y = wire(y);
    dressPlayer(state, pawn.character);
    wearClub(state, clubTags.get(pawn.character.id));
    const back: Pawn = { ...pawn, slot, state, leaving: false, queue: new InputQueue() };
    pawn.client.view?.add(state, OWNER_TAG);
    this.pawns.set(id, back);
    const cell = this.grid.place(state, x, y);
    this.grid.watch(back.viewer, cell ?? this.grid.cellOfEntity(state));
  }

  // The cast -----------------------------------------------------------------------------------

  private placeCast(): void {
    for (const npc of npcsOf(this.def)) {
      const state = new NpcState();
      state.speaker = npc.speaker;
      state.x = wire(npc.x);
      state.y = wire(npc.y);
      state.facing = npc.facing;
      this.state.npcs.set(npc.key, state);
      this.people.push({ npc, state, nextBark: undefined, turnedUntil: 0, lastLine: undefined });
    }
    this.usable = [
      ...this.people
        .filter((p) => p.npc.lines.length > 0)
        .map(
          (p): Thing => ({ kind: "npc", id: p.npc.key, x: p.npc.x, y: p.npc.y, what: { npc: p } }),
        ),
      ...this.def.interactables.map(
        (t): Thing => ({ kind: "thing", id: t.id, rect: t.rect, what: { thing: t } }),
      ),
    ];
  }

  /** People turn to the nearest player close by, turn back after, and bark now and then. */
  private tendCast(): void {
    const tick = this.world.tick;
    for (const person of this.people) {
      const { npc, state } = person;
      let nearest: { x: number; y: number; d: number } | undefined;
      let near = false;
      for (const p of this.world.players) {
        if (this.pawns.get(p.id)?.leaving) continue;
        const d = Math.hypot(p.x - npc.x, p.y - npc.y);
        if (d <= BARK_PX) near = true;
        if (d <= NOTICE_PX && (!nearest || d < nearest.d)) nearest = { x: p.x, y: p.y, d };
      }
      if (nearest) {
        state.facing = facingToward(npc.x, npc.y, nearest.x, nearest.y);
        person.turnedUntil = tick + TURN_BACK_TICKS;
      } else if (tick >= person.turnedUntil && state.facing !== npc.facing) {
        state.facing = npc.facing;
      }
      if (!near || npc.lines.length === 0) {
        person.nextBark = undefined;
        continue;
      }
      person.nextBark ??= tick + between(FIRST_BARK);
      if (tick < person.nextBark) continue;
      this.say(person, "bark");
      person.nextBark = tick + between(BARK_GAP);
    }
  }

  /** A line from the person's barks, never the same one twice running, to the whole room. */
  private say(person: Person, kind: NpcLine["kind"]): string {
    const { lines } = person.npc;
    const pool = lines.length > 1 ? lines.filter((l) => l !== person.lastLine) : lines;
    const text = pool[Math.floor(Math.random() * pool.length)] as string;
    person.lastLine = text;
    this.broadcast(MAP_MESSAGES.npcLine, {
      npc: person.npc.key,
      text,
      kind,
    } satisfies NpcLine);
    return text;
  }

  // Interaction ------------------------------------------------------------------------------

  /** `interact`: the server picks what is in reach of where it has the player standing. */
  private interact(client: Client, n: number): void {
    const pawn = this.pawns.get(client.sessionId);
    if (!pawn || pawn.leaving) return;
    const now = Date.now();
    if (now - pawn.lastInteract < INTERACT_COOLDOWN_MS) return;
    pawn.lastInteract = now;
    const at = this.world.players.find((p) => p.id === client.sessionId);
    const target = at && nearestUsable(this.usable, at.x, at.y);
    void this.answer(pawn, target, n, at).then((answer) => {
      if (this.clients.includes(client)) client.send(MAP_MESSAGES.interaction, answer);
    });
  }

  private async answer(
    pawn: Pawn,
    target: Thing | undefined,
    n: number,
    at: { x: number; y: number } | undefined,
  ): Promise<Interaction> {
    if (!target) return { t: "none", n };
    const who = pawn.character.id;
    if ("npc" in target.what) {
      const person = target.what.npc;
      if (at) {
        person.state.facing = facingToward(person.npc.x, person.npc.y, at.x, at.y);
        person.turnedUntil = this.world.tick + TURN_BACK_TICKS * 2;
      }
      person.nextBark = this.world.tick + AFTER_TALK;
      live()?.events.met(who, person.npc.speaker);
      return { t: "say", n, npc: person.npc.key, text: this.say(person, "talk") };
    }
    const thing = target.what.thing;
    if (PLACE_THINGS.has(thing.id)) this.visit(who, [thing.id]);
    const l = live();
    if (MEAL_COUNTERS.has(thing.id) && l) {
      return { t: "ate", n, id: thing.id, result: await l.events.eat(who) };
    }
    if (thing.kind === "locked") {
      this.rattle(thing.id, "thing", "", "door_locked");
      return { t: "locked", n, id: thing.id };
    }
    if (OPENS.has(thing.kind)) return { t: "open", n, id: thing.id, kind: thing.kind };
    const text = describe(thing.id);
    if (text) return { t: "read", n, id: thing.id, name: text.name, desc: text.desc };
    if (thing.kind === "notice") return { t: "open", n, id: thing.id, kind: thing.kind };
    return { t: "none", n };
  }

  // Patrols -------------------------------------------------------------------------------------

  /**
   * Guards walk their routes on the room's own clock, so the server and every client put a
   * guard at the same pose for the same tick without sending it. A guard that sees a player
   * (inside its cone, nothing solid between) calls out; the player gets 벌점 and is put back at
   * the map's entrance (PLAN §11 위험 구역 patrols).
   */
  private watchPatrols(): void {
    const tick = this.world.tick;
    const t = (tick * TICK_MS) / 1000;
    for (const patrol of this.patrols) {
      const pose = patrolPose(patrol, t);
      for (const p of this.world.players) {
        const pawn = this.pawns.get(p.id);
        if (!pawn || pawn.leaving || tick < pawn.unseenUntil) continue;
        if (sees(this.map, patrol, pose, p.x, p.y)) this.catch(pawn, patrol);
      }
    }
  }

  private catch(pawn: Pawn, patrol: Patrol): void {
    const id = pawn.client.sessionId;
    pawn.unseenUntil = this.world.tick + CAUGHT_GRACE_TICKS;
    const back = spawnPlace(this.def, "main");
    pawn.queue.clear();
    this.world = {
      ...this.world,
      players: this.world.players.map((p) =>
        p.id === id ? { ...p, x: back.x, y: back.y, facing: back.facing } : p,
      ),
    };
    this.inside.delete(id);
    this.broadcast(MAP_MESSAGES.halt, { patrol: patrol.id } satisfies Halt);
    pawn.client.send(MAP_MESSAGES.caught, {
      patrol: patrol.id,
      x: back.x,
      y: back.y,
    } satisfies Caught);
    void live()?.events.patrolCaught(pawn.character.id);
  }
}
