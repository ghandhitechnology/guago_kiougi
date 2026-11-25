import { type AuthContext, type Client, type Delayed, Room, ServerError } from "@colyseus/core";
import { StateView } from "@colyseus/schema";
import type { BuiltMap, Interactable, Portal } from "@guago/content";
import {
  addPlayer,
  type Character,
  CLOSE_MAP_CHANGED,
  type Collidable,
  createWorld,
  type DoorRattle,
  dressPlayer,
  type Facing,
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
  step,
  stepDoors,
  TICK_MS,
  TILE_SIZE,
  type Transfer,
  type Usable,
  type ZoneUpdate,
  zonesAt,
} from "@guago/shared";
import { channels, type MapRoomOptions, type SeatOptions } from "./channels.ts";
import { InterestGrid, type Viewer } from "./interest.ts";
import { RoomMetrics } from "./metrics.ts";
import { places } from "./places.ts";
import { RoomSeats, SAVE_INTERVAL_MS } from "./seats.ts";
import {
  builtMap,
  describe,
  type Npc,
  npcsOf,
  roomCollision,
  spawnPlace,
  validPlace,
} from "./world-maps.ts";

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
  private map!: Collidable;
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
  private graceMs = 30_000;
  private acc = 0;
  private lastLoop = 0;

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
    this.map = roomCollision(def);
    this.maxClients = Math.max(1, Math.min(MAP_SEATS, options.seats));
    this.graceMs = options.grace * 1000;
    const { w, h } = def.collision;
    if (w * TILE_SIZE > MAX_MAP_PX || h * TILE_SIZE > MAX_MAP_PX) {
      throw new Error(`map ${def.id} is larger than positions can address (${MAX_MAP_PX} px)`);
    }
    const seed = (Math.random() * 2 ** 32) >>> 0;
    this.world = createWorld(this.map, [], seed);
    this.grid = new InterestGrid(this.world.width, this.world.height);
    this.metrics = new RoomMetrics(this.roomId, `${def.id}#${options.channel}`);
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
    this.sync();

    this.onMessage(INPUT_MESSAGE, inputMessage, (client, input: MoveInput) => {
      const pawn = this.pawns.get(client.sessionId);
      if (pawn && !pawn.leaving && !pawn.queue.push(input)) this.metrics.inputsDropped++;
    });
    this.onMessage(MAP_MESSAGES.interact, interactMessage, (client, n: number) => {
      this.interact(client, n);
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
    const id = client.sessionId;
    const start =
      character.mapId === this.def.id
        ? validPlace(this.def.id, character.x, character.y)
        : spawnPlace(this.def, "main");
    const facing =
      Number.isInteger(options.facing) && (options.facing as number) >= 0
        ? (((options.facing as number) % 4) as Facing)
        : start.facing;
    const slot = this.free.shift();
    const state = slot === undefined ? undefined : this.state.players.get(slot);
    if (slot === undefined || !state)
      throw new Error("no free body; maxClients should have refused the join");
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

    const view = new StateView();
    client.view = view;
    view.add(state, OWNER_TAG);
    const viewer: Viewer = { view, cell: undefined };
    const zones = zonesAt(this.def.zones, player.x, player.y);
    const pawn: Pawn = {
      slot,
      client,
      character,
      state,
      viewer,
      queue: new InputQueue(),
      leaving: false,
      zones,
      zoneTile: this.tileOf(player.x, player.y),
      lastInteract: 0,
      lastRattle: 0,
    };
    this.pawns.set(id, pawn);
    const cell = this.grid.place(state, player.x, player.y);
    this.grid.watch(viewer, cell ?? this.grid.cellOfEntity(state));
    this.countBytes(client);
    client.send(MAP_MESSAGES.zones, { zones } satisfies ZoneUpdate);
    places.enter(character.id, {
      mapId: this.def.id,
      channel: this.state.channel,
      roomId: this.roomId,
      sessionId: id,
      at: () => this.placeOf(id),
      zones: () => this.pawns.get(id)?.zones ?? [],
    });
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
    this.metrics.forget(client.sessionId);
  }

  override onDispose(): void {
    channels.forget(this.roomId);
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
      const before = this.world;
      this.world = step(this.world, this.map, inputs);
      this.afterStep(before, inputs);
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

  // Doors, zones and people, once per tick ----------------------------------------------------

  private afterStep(before: SimWorld, inputs: ReadonlyMap<string, readonly MoveInput[]>): void {
    const walkers = this.world.players.filter((p) => !this.pawns.get(p.id)?.leaving);
    const doors = stepDoors(this.inside, walkers, this.def.portals);
    this.inside = new Map(doors.inside);
    for (const { id, portal } of doors.entered) {
      const pawn = this.pawns.get(id);
      const p = this.def.portals[portal];
      if (pawn && p?.built) void this.walkThrough(pawn, p);
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
        }
      }
      // Pushing against a shut door: had a move this tick and went nowhere.
      const prev = was.get(p.id);
      if (!prev || (inputs.get(p.id)?.length ?? 0) === 0) continue;
      if (Math.abs(p.x - prev.x) + Math.abs(p.y - prev.y) > 1) continue;
      const shut = shutDoorAhead(this.def.portals, p.x, p.y, p.facing, PLAYER_RADIUS);
      const door = this.def.portals[shut];
      if (!door || now - pawn.lastRattle < RATTLE_COOLDOWN_MS) continue;
      pawn.lastRattle = now;
      this.broadcast(MAP_MESSAGES.door, {
        id: door.id,
        of: "portal",
        sid: p.id,
      } satisfies DoorRattle);
    }
    if (this.world.tick % 4 === 0) this.tendCast();
  }

  private tileOf(x: number, y: number): number {
    return Math.floor(y / TILE_SIZE) * this.def.w + Math.floor(x / TILE_SIZE);
  }

  /**
   * Through a door (PLAN §10): the body leaves this world at once, the character is written on
   * the other side, this room lets go of the account's seat, and only then does the client get
   * a reserved seat in the target map's room. See `RoomSeats.moveOut` for why nothing can be
   * lost or doubled in between.
   */
  private async walkThrough(pawn: Pawn, portal: Portal): Promise<void> {
    const target = builtMap(portal.to);
    if (!target) return;
    const { client } = pawn;
    const id = client.sessionId;
    const at = this.placeOf(id);
    pawn.leaving = true;
    pawn.queue.clear();
    this.removeBody(id);
    const arrive = spawnPlace(target, portal.spawn);
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
    client.send(MAP_MESSAGES.transfer, { ...seating, via: portal.id } satisfies Transfer);
    this.clock.setTimeout(() => {
      if (this.clients.includes(client)) client.leave(CLOSE_MAP_CHANGED);
    }, MOVED_SOCKET_MS);
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
    const back: Pawn = { ...pawn, slot, state, leaving: false, queue: new InputQueue() };
    back.viewer.view.add(state, OWNER_TAG);
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
    client.send(MAP_MESSAGES.interaction, this.answer(target, n, at) satisfies Interaction);
  }

  private answer(
    target: Thing | undefined,
    n: number,
    at: { x: number; y: number } | undefined,
  ): Interaction {
    if (!target) return { t: "none", n };
    if ("npc" in target.what) {
      const person = target.what.npc;
      if (at) {
        person.state.facing = facingToward(person.npc.x, person.npc.y, at.x, at.y);
        person.turnedUntil = this.world.tick + TURN_BACK_TICKS * 2;
      }
      person.nextBark = this.world.tick + AFTER_TALK;
      return { t: "say", n, npc: person.npc.key, text: this.say(person, "talk") };
    }
    const thing = target.what.thing;
    if (thing.kind === "locked") {
      this.broadcast(MAP_MESSAGES.door, {
        id: thing.id,
        of: "thing",
        sid: "",
      } satisfies DoorRattle);
      return { t: "locked", n, id: thing.id };
    }
    if (OPENS.has(thing.kind)) return { t: "open", n, id: thing.id, kind: thing.kind };
    const text = describe(thing.id);
    if (text) return { t: "read", n, id: thing.id, name: text.name, desc: text.desc };
    if (thing.kind === "notice") return { t: "open", n, id: thing.id, kind: thing.kind };
    return { t: "none", n };
  }
}
