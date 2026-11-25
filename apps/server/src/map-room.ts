import { type AuthContext, type Client, Room } from "@colyseus/core";
import { StateView } from "@colyseus/schema";
import {
  type Drop,
  fieldOf,
  fightMapOf,
  LAWN,
  mapById,
  monsterKindIndex,
  simRules,
} from "@guago/content";
import {
  AIM_MESSAGE,
  aimMessage,
  type Character,
  createFight,
  dressPlayer,
  type FightInput,
  type FightMap,
  FightNet,
  type FightWorld,
  INPUT_MESSAGE,
  InputQueue,
  inputMessage,
  MAP_SEATS,
  MAX_MAP_PX,
  MapState,
  MODE_MESSAGE,
  type Mode,
  modeMessage,
  type NetViewer,
  newViewer,
  OWNER_TAG,
  overlapsSolid,
  PLAYER_RADIUS,
  type Player,
  PlayerState,
  POS_SCALE,
  RECONNECT_SECONDS,
  REVIVE_MESSAGE,
  reviveMessage,
  SNAPSHOT_MESSAGE,
  spawnMonster,
  startRevive,
  stepFight,
  TICK_MS,
  TILE_SIZE,
} from "@guago/shared";
import { type GrantSink, MemoryGrants } from "./fight/grants.ts";
import { type Loadouts, starterLoadouts } from "./fight/loadout.ts";
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
/** EXP is handed to the grant sink this often, and the sink flushed every few of those. */
const EXP_EVERY_MS = 2_000;
const GRANT_FLUSH_MS = 10_000;
/** Aim, mode and revive requests a client may send per second, after a small burst. */
const RATES = { aim: [20, 10], mode: [2, 2], revive: [4, 4] } as const;

/** A token bucket for one kind of request from one client. */
class Bucket {
  private tokens: number;
  private last = performance.now();
  private readonly rate: number;
  private readonly burst: number;

  constructor(rate: number, burst: number) {
    this.rate = rate;
    this.burst = burst;
    this.tokens = burst;
  }

  take(): boolean {
    const now = performance.now();
    this.tokens = Math.min(this.burst, this.tokens + ((now - this.last) / 1000) * this.rate);
    this.last = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

/** A player's body in this room: what is synced, what its client sees, what it asked to do. */
interface Pawn {
  readonly slot: string;
  readonly state: InstanceType<typeof PlayerState>;
  readonly viewer: Viewer;
  readonly net: NetViewer;
  readonly queue: InputQueue;
  readonly player: Player;
  readonly character: Character;
  readonly buckets: { aim: Bucket; mode: Bucket; revive: Bucket };
}

const wire = (px: number) => Math.round(px * POS_SCALE);

let grants: GrantSink = new MemoryGrants();
let loadouts: Loadouts = starterLoadouts;

/** Called once at server start to wire the real grant executor and inventory. */
export function provideFightServices(s: { grants?: GrantSink; loadouts?: Loadouts }): void {
  if (s.grants) grants = s.grants;
  if (s.loadouts) loadouts = s.loadouts;
}

/** The map a room runs: `GUAGO_MAP` names it (the lawn by default). */
function mapToRun(): string {
  return process.env.GUAGO_MAP || LAWN.id;
}

/**
 * One map instance. The server decides everything: clients send `input` (movement, a dodge, a
 * manual cast), `aim`, `mode` and `revive`; the shared fight step runs at 20 Hz; each client
 * then gets its own snapshot of the cells around its screen, and the schema carries who is here
 * and the owner's own body for its prediction.
 */
export class MapRoom extends Room<{ state: MapState }> {
  override state = new MapState();
  override maxMessagesPerSecond = MAX_MESSAGES_PER_SECOND;
  override maxClients = MAP_SEATS;

  private mapId = LAWN.id;
  private map!: FightMap;
  private world!: FightWorld;
  private net!: FightNet;
  private grid!: InterestGrid;
  private metrics!: RoomMetrics;
  private readonly pawns = new Map<string, Pawn>();
  private readonly bySlot = new Map<number, Pawn>();
  /** Free body slots, longest free first, so a body is never handed on within one patch. */
  private readonly free: string[] = [];
  private seats!: RoomSeats;
  private acc = 0;
  private lastLoop = 0;

  /** Only a browser with a live session and a character gets a seat. */
  static override async onAuth(_token: string, _options: unknown, ctx: AuthContext) {
    return authenticateJoin(ctx);
  }

  override onCreate(): void {
    this.mapId = mapToRun();
    const def = mapById(this.mapId);
    if (!def) throw new Error(`no map ${this.mapId}`);
    this.map = fightMapOf(def);
    const { w, h } = this.map.collision;
    if (w * TILE_SIZE > MAX_MAP_PX || h * TILE_SIZE > MAX_MAP_PX) {
      throw new Error(`map ${this.mapId} is larger than positions can address (${MAX_MAP_PX} px)`);
    }
    const seed = (Math.random() * 2 ** 32) >>> 0;
    const field = fieldOf(this.mapId, process.env.GUAGO_FIELD);
    this.world = createFight(this.map, simRules(), field, seed);
    this.net = new FightNet(this.world);
    this.grid = new InterestGrid(this.world.width, this.world.height);
    this.metrics = new RoomMetrics(this.roomId, this.mapId);
    this.seats = new RoomSeats(this.mapId, (id) => this.placeOf(id));
    this.state.map = this.mapId;
    // Bodies before anything else, so their ref ids are the smallest the room will ever hand out.
    for (let i = 0; i < MAP_SEATS; i++) {
      const slot = String(i);
      this.state.players.set(slot, new PlayerState());
      this.free.push(slot);
    }

    this.onMessage(INPUT_MESSAGE, inputMessage, (client, input: FightInput) => {
      const pawn = this.pawns.get(client.sessionId);
      if (pawn && !pawn.queue.push(input)) this.metrics.inputsDropped++;
    });
    this.onMessage(AIM_MESSAGE, aimMessage, (client, aim) => {
      const pawn = this.pawns.get(client.sessionId);
      if (!pawn?.buckets.aim.take()) return;
      const p = pawn.player;
      p.aiming = aim !== null;
      p.aimX = aim?.dx ?? 0;
      p.aimY = aim?.dy ?? 0;
    });
    this.onMessage(MODE_MESSAGE, modeMessage, (client, mode) => {
      const pawn = this.pawns.get(client.sessionId);
      if (!pawn?.buckets.mode.take()) return;
      pawn.player.mode = mode as Mode;
      pawn.player.casts = 0;
    });
    this.onMessage(REVIVE_MESSAGE, reviveMessage, (client, slot) => {
      const pawn = this.pawns.get(client.sessionId);
      const target = this.bySlot.get(slot);
      if (!pawn?.buckets.revive.take() || !target) return;
      startRevive(this.world, pawn.player, target.player);
    });
    if (process.env.GUAGO_DEV_COMMANDS === "1") this.devCommands();

    // Patches and snapshots go out right after each step, so each is exactly one tick of the world.
    this.lastLoop = performance.now();
    this.setTimestep(() => this.loop(), POLL_MS);
    this.patchRate = 0;
    this.clock.setInterval(() => {
      if (this.clients.length > 0)
        console.log(JSON.stringify({ metrics: this.metrics.snapshot() }));
    }, LOG_EVERY_MS);
    this.clock.setInterval(() => void this.seats.saveAll(), SAVE_INTERVAL_MS);
    this.clock.setInterval(() => this.handOverExp(), EXP_EVERY_MS);
    this.clock.setInterval(() => void grants.flush(), GRANT_FLUSH_MS);
  }

  /**
   * Development only (`GUAGO_DEV_COMMANDS=1`): put a monster or the golem beside a player, to
   * meet each archetype on purpose. Never on in a deployment.
   */
  private devCommands(): void {
    this.onMessage("dev", (client, msg: unknown) => {
      const pawn = this.pawns.get(client.sessionId);
      if (!pawn || !Array.isArray(msg)) return;
      const [cmd, a, b] = msg as [unknown, unknown, unknown];
      const p = pawn.player;
      if (cmd === "spawn" && typeof a === "string") {
        const kind = this.world.rules.monsters[monsterKindIndex(a)];
        if (!kind) return;
        const n = typeof b === "number" ? Math.min(20, Math.max(1, b)) : 1;
        for (let i = 0; i < n; i++) {
          const ang = (i / n) * Math.PI * 2;
          spawnMonster(this.world, kind, p.level, false, p.x + Math.cos(ang) * 90, p.y + Math.sin(ang) * 60);
        }
      } else if (cmd === "clear") {
        for (const m of this.world.monsters) if (m.alive) m.gone = true;
      }
    });
  }

  /** Players seated in this room. */
  get playerCount(): number {
    return this.pawns.size;
  }

  /** Where a session's character stands, in whole pixels, for saving. */
  private placeOf(id: string): { x: number; y: number } | undefined {
    const p = this.world.playerById(id);
    return p && { x: Math.round(p.x), y: Math.round(p.y) };
  }

  /** The saved place when it is on this map and clear of walls, else the map's spawn. */
  private startOf(mapId: string, x: number, y: number): { x: number; y: number } {
    const fits =
      mapId === this.mapId &&
      x > 0 &&
      y > 0 &&
      x < this.world.width &&
      y < this.world.height &&
      !overlapsSolid(this.map, x, y, PLAYER_RADIUS) &&
      !this.world.inSafe(x, y);
    return fits ? { x, y } : this.map.spawn;
  }

  override async onJoin(client: Client): Promise<void> {
    const character = await this.seats.join(client);
    const id = client.sessionId;
    const start = this.startOf(character.mapId, character.x, character.y);
    const slot = this.free.shift();
    const state = slot === undefined ? undefined : this.state.players.get(slot);
    if (slot === undefined || !state)
      throw new Error("no free body; maxClients should have refused the join");
    const rules = this.world.rules;
    const level = Math.max(character.level, grants.progress(character.id)?.level ?? 0, 1);
    const build = (lv: number) => rules.kit(loadouts.buildFor(character, lv));
    const player = this.world.addPlayer(id, Number(slot), start.x, start.y, build(level), level);
    player.exp = grants.progress(character.id)?.exp ?? 0;
    player.rebuild = build;
    state.sid = id;
    state.seq = 0;
    dressPlayer(state, character);
    this.syncOwn(state, player);

    const view = new StateView();
    client.view = view;
    view.add(state, OWNER_TAG);
    const viewer: Viewer = { view, cell: undefined };
    const net = newViewer();
    net.player = player;
    this.net.viewers.add(net);
    const pawn: Pawn = {
      slot,
      state,
      viewer,
      net,
      queue: new InputQueue(),
      player,
      character,
      buckets: {
        aim: new Bucket(RATES.aim[0], RATES.aim[1]),
        mode: new Bucket(RATES.mode[0], RATES.mode[1]),
        revive: new Bucket(RATES.revive[0], RATES.revive[1]),
      },
    };
    this.pawns.set(id, pawn);
    this.bySlot.set(Number(slot), pawn);
    const cell = this.grid.place(state, player.x, player.y);
    this.grid.watch(viewer, cell ?? this.grid.cellOfEntity(state));
    this.countBytes(client);
    places.enter(character.id, {
      mapId: this.mapId,
      roomId: this.roomId,
      sessionId: id,
      at: () => this.placeOf(id),
    });
  }

  override onDrop(client: Client): void {
    const pawn = this.pawns.get(client.sessionId);
    // The character stays and plays itself meanwhile (PLAN §19 reconnect); queued inputs are stale.
    if (pawn) {
      pawn.queue.clear();
      pawn.player.away = true;
    }
    if (!this.seats.mayReconnect(client)) return;
    this.seats.hold(client, this.allowReconnection(client, RECONNECT_SECONDS));
  }

  override onReconnect(client: Client): void {
    this.seats.reconnected(client);
    const pawn = this.pawns.get(client.sessionId);
    if (pawn) {
      pawn.player.away = false;
      pawn.net.fresh = true;
      this.net.resendDrops(pawn.net);
    }
    this.countBytes(client);
  }

  override async onLeave(client: Client): Promise<void> {
    places.leave(client.sessionId);
    // Saves the place, so the body stays in the world until the write is done.
    await this.seats.leave(client);
    const id = client.sessionId;
    const pawn = this.pawns.get(id);
    if (pawn) {
      const p = pawn.player;
      if (p.expEarned > 0) grants.exp(pawn.character.id, p.expEarned);
      p.expEarned = 0;
      grants.setProgress(pawn.character.id, p.level, p.exp);
      void grants.flush(pawn.character.id);
      this.grid.watch(pawn.viewer, undefined);
      this.grid.remove(pawn.state);
      pawn.state.sid = "";
      this.pawns.delete(id);
      this.bySlot.delete(Number(pawn.slot));
      this.free.push(pawn.slot);
      this.net.viewers.delete(pawn.net);
    }
    this.world.removePlayer(id);
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

  /** EXP earned since the last hand-over goes to the grant sink. */
  private handOverExp(): void {
    for (const pawn of this.pawns.values()) {
      const p = pawn.player;
      if (p.expEarned <= 0) continue;
      grants.exp(pawn.character.id, p.expEarned);
      p.expEarned = 0;
      grants.setProgress(pawn.character.id, p.level, p.exp);
    }
  }

  private loop(): void {
    const now = performance.now();
    this.acc = Math.min(this.acc + now - this.lastLoop, TICK_MS * MAX_CATCH_UP);
    this.lastLoop = now;
    if (this.acc < TICK_MS) return;
    const start = now;
    const cpu = process.threadCpuUsage();
    let ticks = 0;
    let simMs = 0;
    let netMs = 0;
    while (this.acc >= TICK_MS) {
      this.acc -= TICK_MS;
      const inputs = new Map<string, FightInput[]>();
      for (const [id, pawn] of this.pawns) inputs.set(id, pawn.queue.take() as FightInput[]);
      const s0 = performance.now();
      stepFight(this.world, inputs);
      for (const g of this.world.grants) {
        const pawn = this.pawns.get(g.player.id);
        if (pawn) grants.drop(pawn.character.id, g.drop.payload as Drop);
      }
      const s1 = performance.now();
      this.net.update();
      for (const client of this.clients) {
        const pawn = this.pawns.get(client.sessionId);
        if (!pawn) continue;
        client.sendBytes(SNAPSHOT_MESSAGE, this.net.message(pawn.net));
      }
      const s2 = performance.now();
      simMs += s1 - s0;
      netMs += s2 - s1;
      this.metrics.countTick(this.world, this.net);
      ticks++;
    }
    if (ticks === 0) return;
    this.sync();
    const patchStart = performance.now();
    this.broadcastPatch();
    const end = performance.now();
    const used = process.threadCpuUsage(cpu);
    this.metrics.recordTick(end - start, (used.user + used.system) / 1000, end - patchStart);
    this.metrics.recordFight(simMs, netMs);
    this.metrics.players = this.pawns.size;
    this.metrics.clients = this.clients.length;
    this.metrics.monsters = this.world.director.alive;
    this.metrics.viewChanges = this.grid.changes;
  }

  private syncOwn(state: InstanceType<typeof PlayerState>, p: Player): void {
    state.x = wire(p.x);
    state.y = wire(p.y);
    state.facing = p.facing;
    state.seq = p.seq;
    state.speed = p.kit.speed;
    state.hp = p.hp;
    state.maxHp = p.kit.maxHp;
    state.shield = p.shield;
    state.exp = p.exp;
    state.level = p.level;
    state.mode = p.mode;
    state.down = p.downAt >= 0 ? p.downAt + 1 : 0;
    state.dodgeReady = p.dodgeReadyAt;
    const books = p.kit.weapons.map((wp) => this.world.rules.books[wp.book] ?? "");
    if (books.length !== state.books.length || books.some((b, i) => state.books[i] !== b)) {
      state.books.clear();
      state.books.push(...books);
    }
  }

  /** Mirrors each player into its synced body and moves bodies between identity views. */
  private sync(): void {
    for (const pawn of this.pawns.values()) {
      const p = pawn.player;
      this.syncOwn(pawn.state, p);
      const cell = this.grid.place(pawn.state, p.x, p.y);
      if (cell !== undefined) this.grid.watch(pawn.viewer, cell);
    }
  }
}
