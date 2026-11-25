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
  type ChangeNotice,
  type Character,
  CONTROL_MODES,
  createFight,
  dressPlayer,
  Ev,
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
  Mode,
  type Modifiers,
  modeMessage,
  type NetViewer,
  NO_MODIFIERS,
  newViewer,
  OWNER_TAG,
  overlapsSolid,
  PLAYER_RADIUS,
  type Player,
  type PlayerKit,
  PlayerState,
  RECONNECT_SECONDS,
  REVIVE_MESSAGE,
  reviveMessage,
  SNAPSHOT_MESSAGE,
  sameModifiers,
  spawnMonster,
  startRevive,
  stepFight,
  TILE_SIZE,
  wearClub,
  withModifiers,
} from "@guago/shared";
import { clubActivity } from "./club-activity.ts";
import { clubTags } from "./club-tags.ts";
import { grants } from "./economy/grants.ts";
import { buildOf, type Loadout, type Loadouts, starterLoadouts } from "./fight/loadout.ts";
import { live } from "./live/current.ts";
import { RoomMetrics } from "./metrics.ts";
import { parties } from "./parties.ts";
import { places } from "./places.ts";
import { mapOptionAllowed } from "./room-maps.ts";
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
/** Party frames hear about health and mode this often (only changes go on). */
const VITALS_EVERY_MS = 500;

/** The step's party key for a party id. */
function partyOf(id: number | undefined): string | null {
  return id === undefined ? null : String(id);
}

/**
 * The living world's modifiers and whether the map is open are read this often. Buffs end on the
 * game clock with no signal, so the room asks; a kit is rebuilt only when a value changed.
 */
const LIVE_EVERY_MS = 2_000;
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
  readonly view: StateView;
  readonly net: NetViewer;
  readonly queue: InputQueue;
  readonly player: Player;
  readonly character: Character;
  readonly buckets: { aim: Bucket; mode: Bucket; revive: Bucket };
  /** What it fights with; replaced when an operation changes it. */
  loadout: Loadout;
  /** The living world's multipliers its kit was built with. */
  mods: Modifiers;
  /** EXP below one, carried to the next grant: grants take whole numbers. */
  expCarry: number;
  /** Tick it was seated, for "present for the whole surge". */
  readonly since: number;
}

let loadouts: Loadouts = starterLoadouts;

/** Called once at server start to read loadouts from the inventory. */
export function provideFightServices(s: { loadouts?: Loadouts }): void {
  if (s.loadouts) loadouts = s.loadouts;
}

/** Characters fighting in this process, by id, for loadout changes. */
const fighting = new Map<string, { room: MapRoom; pawn: Pawn }>();

/**
 * An operation landed for a character (the executor's `onApplied`): when it touched what the
 * character fights with (an equip, 필기, a forge, a level or stats), its kit is rebuilt.
 */
export function fightLoadoutChanged(characterId: string, change: ChangeNotice): void {
  const at = fighting.get(characterId);
  if (!at) return;
  const touched =
    (change.items?.some((i) => i.slot !== null) ?? false) ||
    (change.removed?.length ?? 0) > 0 ||
    change.progression !== undefined;
  if (!touched) return;
  void at.room.reload(at.pawn);
}

/**
 * Seats per room: `MAP_SEATS`, or more for a load test (`GUAGO_SEATS`, up to 127 so every body
 * keeps a one-byte schema id).
 */
function seatsPerRoom(): number {
  const n = Number(process.env.GUAGO_SEATS);
  return Number.isInteger(n) && n > 0 ? Math.min(127, n) : MAP_SEATS;
}

/**
 * The map a room runs: `GUAGO_MAP` names it (the lawn by default); a load test or a developer may
 * name another in the create options where `ALLOW_MAP_OPTION=1`.
 */
function mapToRun(options?: { map?: unknown }): string {
  if (mapOptionAllowed() && typeof options?.map === "string" && mapById(options.map)) {
    return options.map;
  }
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
  override maxClients = seatsPerRoom();

  private mapId = LAWN.id;
  private map!: FightMap;
  private world!: FightWorld;
  private net!: FightNet;
  /** Bodies entering or leaving a client's view, for metrics: only on joins and leaves. */
  private viewChanges = 0;
  private metrics!: RoomMetrics;
  private readonly pawns = new Map<string, Pawn>();
  private readonly bySlot = new Map<number, Pawn>();
  /** Free body slots, longest free first, so a body is never handed on within one patch. */
  private readonly free: string[] = [];
  private seats!: RoomSeats;
  private ticks!: TickClock;
  /** Tick the current surge began. */
  private surgeFrom = 0;
  private unlistenClubs: (() => void) | undefined;
  private unlistenParties: (() => void) | undefined;

  /** Only a browser with a live session and a character gets a seat. */
  static override async onAuth(_token: string, _options: unknown, ctx: AuthContext) {
    return authenticateJoin(ctx);
  }

  override onCreate(options?: { map?: unknown }): void {
    this.mapId = mapToRun(options);
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
    this.metrics = new RoomMetrics(this.roomId, this.mapId);
    this.seats = new RoomSeats(this.mapId, (id) => this.placeOf(id));
    this.state.map = this.mapId;
    // Bodies before anything else, so their ref ids are the smallest the room will ever hand out.
    for (let i = 0; i < this.maxClients; i++) {
      const slot = String(i);
      this.state.players.set(slot, new PlayerState());
      this.free.push(slot);
    }

    this.onMessage(INPUT_MESSAGE, inputMessage, (client, input: FightInput) => {
      const pawn = this.pawns.get(client.sessionId);
      if (pawn) this.metrics.inputsDropped += pawn.queue.push(input);
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
      if (pawn.player.mode === mode) return;
      pawn.player.mode = mode as Mode;
      pawn.player.casts = 0;
      this.tellMode(pawn);
    });
    this.onMessage(REVIVE_MESSAGE, reviveMessage, (client, slot) => {
      const pawn = this.pawns.get(client.sessionId);
      const target = this.bySlot.get(slot);
      if (!pawn?.buckets.revive.take() || !target) return;
      startRevive(this.world, pawn.player, target.player);
    });
    if (process.env.GUAGO_DEV_COMMANDS === "1") this.devCommands();

    // Patches and snapshots go out right after each step, so each is exactly one tick of the world.
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
        if (pawn.character.id === characterId) wearClub(pawn.state, tag);
      }
    });
    // Party members on this map share kills within 20 tiles (PLAN §6); the step reads the party.
    this.unlistenParties = parties.listen((characterId, partyId) => {
      const pawn = fighting.get(characterId)?.pawn;
      if (pawn && this.pawns.get(pawn.player.id) === pawn) pawn.player.party = partyOf(partyId);
    });
    // Party frames: health and mode, which the party module passes on only when they change.
    this.clock.setInterval(() => {
      for (const pawn of this.pawns.values()) {
        const p = pawn.player;
        const mode = CONTROL_MODES[p.mode] ?? "semi";
        parties.report(pawn.character.id, { hp: p.hp, maxHp: p.kit.maxHp, mode });
      }
    }, VITALS_EVERY_MS);
    // The living world is read every couple of seconds from memory, never on the tick.
    this.readLive();
    this.clock.setInterval(() => this.readLive(), LIVE_EVERY_MS);
  }

  /** A closed map spawns nothing; a changed modifier rebuilds that player's kit. */
  private readLive(): void {
    const l = live();
    this.world.director.paused = !(l?.isOpen(this.mapId) ?? true);
    if (!l) return;
    for (const pawn of this.pawns.values()) {
      const mods = l.modifiers(pawn.character.id);
      if (sameModifiers(mods, pawn.mods)) continue;
      pawn.mods = mods;
      pawn.player.expMult = mods.exp;
      this.world.setKit(pawn.player, this.kitOf(pawn, pawn.player.level));
    }
  }

  /** A character's kit at a level: its loadout's books and stats, then the living world's modifiers. */
  private kitOf(pawn: Pawn, level: number): PlayerKit {
    const kit = this.world.rules.kit(buildOf(pawn.character, pawn.loadout, level));
    return withModifiers(kit, pawn.mods);
  }

  /** A mode chosen or a seat taken: full auto's unbroken time is what brings 졸음. */
  private tellMode(pawn: Pawn): void {
    live()?.events.autoHunting(pawn.character.id, pawn.player.mode === Mode.Auto);
  }

  /** The step's events the living world counts (notices, 상점 and 벌점); it buffers them all. */
  private tellLive(): void {
    const l = live();
    if (!l) return;
    const w = this.world;
    const place = w.field?.id ?? this.mapId;
    const of = (index: number) => {
      const p = w.players[index];
      return p?.joined ? this.pawns.get(p.id) : undefined;
    };
    for (let i = 0; i < w.eventCount; i++) {
      const e = w.events[i];
      if (!e) continue;
      switch (e.type) {
        case Ev.Credit: {
          const pawn = of(e.a);
          const kind = w.rules.monsters[e.d];
          if (pawn && kind) l.events.kill(pawn.character.id, kind.id, 1);
          break;
        }
        case Ev.Wake: {
          // Woke at the arrival point without being got up: the 기절 counts.
          const pawn = of(e.a);
          if (pawn) void l.events.knockout(pawn.character.id);
          break;
        }
        case Ev.Revive: {
          const target = of(e.a);
          const by = of(e.b);
          if (target && by) void l.events.revive(by.character.id, target.character.id);
          break;
        }
        case Ev.Phase:
          if (e.d === 1) this.surgeFrom = w.tick;
          else {
            // A wave is clean for whoever was here for all of it and took no hit.
            for (const pawn of this.pawns.values()) {
              if (pawn.since > this.surgeFrom || pawn.player.lastHurt >= this.surgeFrom) continue;
              l.events.cleanWave(pawn.character.id, place);
            }
          }
          break;
      }
    }
    for (const g of w.grants) {
      const pawn = this.pawns.get(g.player.id);
      const item = (g.drop.payload as Drop).item;
      if (!pawn) continue;
      if (item.kind === "page") l.events.collect(pawn.character.id, "sheet", item.qty);
      else if (item.kind === "ink" || item.kind === "binding")
        l.events.collect(pawn.character.id, item.kind, item.qty);
    }
  }

  /** Reads a fighting character's loadout again and rebuilds its kit at its level. */
  async reload(pawn: Pawn): Promise<void> {
    const loadout = await loadouts.read(pawn.character);
    if (this.pawns.get(pawn.player.id) !== pawn) return;
    pawn.loadout = loadout;
    const p = pawn.player;
    // The inventory's level is the record; the fight may run ahead of grants not yet landed.
    if (loadout.level > p.level) p.level = loadout.level;
    this.world.setKit(p, this.kitOf(pawn, p.level));
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
          spawnMonster(
            this.world,
            kind,
            p.level,
            false,
            p.x + Math.cos(ang) * 90,
            p.y + Math.sin(ang) * 60,
          );
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
    try {
      await this.seat(client, character);
    } catch (error) {
      // Nothing of a half-made seat stays behind: not the body, not the slot, not the account.
      this.unseat(client);
      await this.seats.leave(client);
      throw error;
    }
  }

  /** Puts a joined character's body into the fight and the client's views around it. */
  private async seat(client: Client, character: Character): Promise<void> {
    const id = client.sessionId;
    const start = this.startOf(character.mapId, character.x, character.y);
    const loadout = await loadouts.read(character);
    const slot = this.free.shift();
    const state = slot === undefined ? undefined : this.state.players.get(slot);
    if (slot === undefined || !state)
      throw new Error("no free body; maxClients should have refused the join");
    try {
      this.seatIn(client, character, loadout, slot, state, start);
    } catch (error) {
      this.free.unshift(slot);
      this.world.removePlayer(id);
      throw error;
    }
  }

  private seatIn(
    client: Client,
    character: Character,
    loadout: Loadout,
    slot: string,
    state: InstanceType<typeof PlayerState>,
    start: { x: number; y: number },
  ): void {
    const id = client.sessionId;
    const level = Math.max(1, loadout.level);
    const mods = live()?.modifiers(character.id) ?? NO_MODIFIERS;
    const kit = withModifiers(this.world.rules.kit(buildOf(character, loadout, level)), mods);
    const player = this.world.addPlayer(id, Number(slot), start.x, start.y, kit, level);
    player.exp = loadout.exp;
    player.expMult = mods.exp;
    player.rebuild = (lv) => this.kitOf(pawn, lv);
    player.party = partyOf(parties.of(character.id)?.id);
    state.sid = id;
    dressPlayer(state, character);
    wearClub(state, clubTags.get(character.id));
    this.syncOwn(state, player);

    const view = new StateView();
    client.view = view;
    view.add(state, OWNER_TAG);
    const net = newViewer();
    net.player = player;
    this.net.viewers.add(net);
    const pawn: Pawn = {
      slot,
      state,
      view,
      net,
      queue: new InputQueue(),
      player,
      character,
      loadout,
      mods,
      expCarry: 0,
      since: this.world.tick,
      buckets: {
        aim: new Bucket(RATES.aim[0], RATES.aim[1]),
        mode: new Bucket(RATES.mode[0], RATES.mode[1]),
        revive: new Bucket(RATES.revive[0], RATES.revive[1]),
      },
    };
    this.pawns.set(id, pawn);
    this.bySlot.set(Number(slot), pawn);
    fighting.set(character.id, { room: this, pawn });
    this.tellMode(pawn);
    // Who is here is small and rare, so every client holds every seated player's identity;
    // the bodies themselves move in the snapshot.
    for (const other of this.pawns.values()) {
      if (other === pawn) continue;
      view.add(other.state);
      if (!other.view.has(state)) other.view.add(state);
      this.viewChanges += 2;
    }
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
    this.unseat(client);
  }

  /** Takes a body out of the fight and every view, hands over its EXP, and frees its slot. */
  private unseat(client: Client): void {
    const id = client.sessionId;
    places.leave(id);
    const pawn = this.pawns.get(id);
    if (pawn) {
      this.handOverExp(pawn);
      if (fighting.get(pawn.character.id)?.pawn === pawn) fighting.delete(pawn.character.id);
      for (const other of this.pawns.values()) {
        if (other === pawn || !other.view.has(pawn.state)) continue;
        other.view.remove(pawn.state);
        this.viewChanges++;
      }
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
    this.unlistenClubs?.();
    this.unlistenParties?.();
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

  /** EXP earned since the last hand-over joins the character's pending grant, in whole points. */
  private handOverExp(pawn: Pawn): void {
    const p = pawn.player;
    if (p.expEarned <= 0) return;
    const total = pawn.expCarry + p.expEarned;
    const whole = Math.floor(total);
    p.expEarned = 0;
    pawn.expCarry = total - whole;
    if (whole >= 1 && Number.isSafeInteger(whole)) {
      grants()?.add(pawn.character.id, { exp: whole, drops: [] });
      clubActivity.add(pawn.character.id, whole);
    }
  }

  private loop(): void {
    const now = performance.now();
    const { run, skip } = this.ticks.advance(now);
    if (run === 0) return;
    const start = now;
    const cpu = process.threadCpuUsage();
    // Ticks lost to a stall keep their numbers, so the stamps on every message keep wall time.
    if (skip > 0) this.world.tick += skip;
    let simMs = 0;
    let netMs = 0;
    for (let i = 0; i < run; i++) {
      const inputs = new Map<string, FightInput[]>();
      for (const [id, pawn] of this.pawns) inputs.set(id, pawn.queue.take() as FightInput[]);
      const s0 = performance.now();
      stepFight(this.world, inputs);
      // What combat earned goes to each character's pending grant; nothing touches the database.
      const sink = grants();
      for (const g of this.world.grants) {
        const pawn = this.pawns.get(g.player.id);
        if (pawn) sink?.add(pawn.character.id, { exp: 0, drops: [g.drop.payload as Drop] });
      }
      for (const pawn of this.pawns.values()) this.handOverExp(pawn);
      this.tellLive();
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
    }
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
    this.metrics.viewChanges = this.viewChanges;
  }

  private syncOwn(state: InstanceType<typeof PlayerState>, p: Player): void {
    state.speed = p.kit.speed;
    state.maxHp = p.kit.maxHp;
    state.exp = Math.floor(p.exp);
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

  /** Mirrors each player into its own synced body. */
  private sync(): void {
    for (const pawn of this.pawns.values()) this.syncOwn(pawn.state, pawn.player);
  }
}
