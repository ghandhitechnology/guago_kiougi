import { type AuthContext, type Client, type Delayed, Room, ServerError } from "@colyseus/core";
import { StateView } from "@colyseus/schema";
import {
  type BuiltMap,
  type Drop,
  DUEL_NORMS,
  fieldOf,
  fightMapOf,
  type Interactable,
  monsterKindIndex,
  type Patrol,
  patrolPose,
  sees,
  simRules,
} from "@guago/content";
import {
  AIM_MESSAGE,
  aimMessage,
  type Caught,
  type ChangeNotice,
  type Character,
  CLOSE_MAP_CHANGED,
  CONTROL_MODES,
  createFight,
  type DoorRattle,
  type DoorRefusal,
  dressPlayer,
  duelBuild,
  duelKit,
  Ev,
  type Facing,
  type FightInput,
  type FightMap,
  FightNet,
  type FightWorld,
  fenceFloor,
  gainExp,
  type Halt,
  hurtPlayer,
  INPUT_MESSAGE,
  InputQueue,
  type Interaction,
  inputMessage,
  interactMessage,
  MAP_MESSAGES,
  MAP_SEATS,
  MAX_FIGHTERS,
  MAX_MAP_PX,
  MapState,
  MODE_AUTO,
  MODE_MESSAGE,
  Mode,
  type Modifiers,
  modeMessage,
  type NetViewer,
  NO_MODIFIERS,
  type NpcLine,
  NpcState,
  nearestUsable,
  newViewer,
  OWNER_TAG,
  overlapsSolid,
  PLAYER_RADIUS,
  type Player,
  type PlayerKit,
  PlayerState,
  POS_SCALE,
  RECONNECT_SECONDS,
  REVIVE_MESSAGE,
  reviveMessage,
  SNAPSHOT_MESSAGE,
  sameModifiers,
  shutDoorAhead,
  shutDoors,
  snap,
  spawnMonster,
  startRevive,
  stepDoors,
  stepFight,
  TICK_MS,
  TILE_SIZE,
  type Transfer,
  type Usable,
  wearClub,
  withModifiers,
  type ZoneUpdate,
  zonesAt,
} from "@guago/shared";
import { channels, type MapRoomOptions, type SeatOptions } from "./channels.ts";
import { clubActivity } from "./club-activity.ts";
import { clubTags } from "./club-tags.ts";
import { FloorHost, type FloorRoom } from "./duel/floor.ts";
import { dueling } from "./duel/hub.ts";
import { grants } from "./economy/grants.ts";
import { buildOf, type Loadout, type Loadouts, starterLoadouts } from "./fight/loadout.ts";
import { live } from "./live/current.ts";
import { RoomMetrics } from "./metrics.ts";
import { parties } from "./parties.ts";
import { places } from "./places.ts";
import { RoomSeats, SAVE_INTERVAL_MS } from "./seats.ts";
import { TickClock } from "./tick-clock.ts";
import {
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
/** Party frames hear about health and mode this often (only changes go on). */
const VITALS_EVERY_MS = 500;
/**
 * The living world's modifiers and whether the map is open are read this often. Buffs end on the
 * game clock with no signal, so the room asks; a kit is rebuilt only when a value changed.
 */
const LIVE_EVERY_MS = 2_000;
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

/** The step's party key for a party id. */
function partyOf(id: number | undefined): string | null {
  return id === undefined ? null : String(id);
}

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
  readonly client: Client;
  readonly character: Character;
  readonly state: InstanceType<typeof PlayerState>;
  readonly net: NetViewer;
  readonly queue: InputQueue;
  readonly player: Player;
  readonly buckets: { aim: Bucket; mode: Bucket; revive: Bucket };
  /** What it fights with; replaced when an operation changes it. */
  loadout: Loadout;
  /** The living world's multipliers its kit was built with. */
  mods: Modifiers;
  /** EXP below one, carried to the next grant: grants take whole numbers. */
  expCarry: number;
  /** Tick it was seated, for "present for the whole surge". */
  readonly since: number;
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
  /** Where the body stood before this tick's step, to tell a push against a shut door. */
  fromX: number;
  fromY: number;
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

/** The fight map a room runs on: the built map's, with walls a closed door swaps. */
type RoomMap = { -readonly [K in keyof FightMap]: FightMap[K] };

/**
 * One channel of one map (PLAN §10, §19). The server decides everything: clients send `input`
 * (movement, a dodge, a manual cast), `aim`, `mode`, `revive` and `interact`; the shared fight
 * step runs at 20 Hz and owns every body, monster and effect; each client then gets its own
 * snapshot of the cells around its screen, and the schema carries who is here, the owner's own
 * numbers, the cast and the shut doors. Doors, zones, the cast and patrols are worked out from the
 * step's positions after each tick.
 */
export class MapRoom extends Room<{ state: MapState }> {
  override state = new MapState();
  override maxMessagesPerSecond = MAX_MESSAGES_PER_SECOND;
  override maxClients = MAP_SEATS;
  override autoDispose = false;

  private def!: BuiltMap;
  /** The walls players walk on here; closed doors swap its grid as the Page clock moves. */
  private map!: RoomMap;
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
  /** Tick the current surge began. */
  private surgeFrom = 0;
  private unlistenClubs: (() => void) | undefined;
  private unlistenParties: (() => void) | undefined;
  /** Development commands that act inside the next tick (`GUAGO_DEV_COMMANDS=1`). */
  private readonly devActions: (() => void)[] = [];
  /** The map's dueling floor and its match, on a map that has one (duel/floor.ts). */
  private duel: FloorHost | undefined;
  /** Seats newcomers may take; a floor's map keeps a few more for fighters on their way. */
  private openSeats = MAP_SEATS;

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
    // Its own walls: closed doors change them as the Page clock opens maps.
    this.map = { ...fightMapOf(def), collision: roomCollision(def).collision };
    this.patrols = def.patrols;
    this.maxClients = Math.max(1, Math.min(MAP_SEATS, options.seats));
    this.graceMs = options.grace * 1000;
    const { w, h } = def.collision;
    if (w * TILE_SIZE > MAX_MAP_PX || h * TILE_SIZE > MAX_MAP_PX) {
      throw new Error(`map ${def.id} is larger than positions can address (${MAX_MAP_PX} px)`);
    }
    const seed = (Math.random() * 2 ** 32) >>> 0;
    const field = fieldOf(def.id, process.env.GUAGO_FIELD);
    this.world = createFight(this.map, simRules(), field, seed);
    this.net = new FightNet(this.world);
    // A map with no field gets wandering 오답 only when a load test asks (`monsters`).
    if (!field && options.monsters) this.scatter(options.monsters);
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
    this.openFloor(options.seats);

    this.onMessage(INPUT_MESSAGE, inputMessage, (client, input: FightInput) => {
      const pawn = this.pawns.get(client.sessionId);
      if (pawn && !pawn.leaving) this.metrics.inputsDropped += pawn.queue.push(input);
    });
    this.onMessage(MAP_MESSAGES.interact, interactMessage, (client, n: number) => {
      this.interact(client, n);
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
      // A fighter's mode is set for the match (duel/floor.ts).
      if (pawn.player.mode === mode || pawn.player.team > 0) return;
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
    this.clock.setInterval(() => this.refreshDoors(), DOORS_EVERY_MS);
    if (def.id === HOME_MAP) this.clock.setInterval(() => this.letGoHome(), HOME_EVERY_MS);
    // A club joined, left or restyled shows under the name at once.
    this.unlistenClubs = clubTags.listen((characterId, tag) => {
      for (const pawn of this.pawns.values()) {
        if (pawn.character.id === characterId) wearClub(pawn.state, tag);
      }
    });
    // Party members on this map share kills within 20 tiles (PLAN §6); the step reads the party.
    this.unlistenParties = parties.listen((characterId, partyId) => {
      const pawn = fighting.get(characterId)?.pawn;
      // A fighter's party is its side until the match is over (duel/floor.ts).
      if (pawn && this.pawns.get(pawn.player.id) === pawn && pawn.player.team === 0)
        pawn.player.party = partyOf(partyId);
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
    // Made for a seat that may never be taken.
    this.emptied();
  }

  /** A closed map spawns nothing; a changed modifier rebuilds that player's kit. */
  private readLive(): void {
    const l = live();
    this.world.director.paused = !(l?.isOpen(this.mapId) ?? true);
    if (!l) return;
    for (const pawn of this.pawns.values()) {
      // A fighter's kit is the duel's; the living world's numbers come back with its own.
      if (pawn.player.team > 0) continue;
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
          // Getting a teammate up in a duel earns no 상점.
          if (target && by && target.player.team === 0)
            void l.events.revive(by.character.id, target.character.id);
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
    // A fighter keeps the duel's kit; the new loadout is worn once the match is over.
    if (p.team > 0) return;
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
      } else if (cmd === "exp" && typeof a === "number" && a > 0) {
        // Inside the next tick, so its level-up events reach the snapshot.
        this.devActions.push(() => gainExp(this.world, p, Math.min(1e7, a)));
      } else if (cmd === "down") {
        this.devActions.push(() => {
          p.invulnerableUntil = 0;
          hurtPlayer(this.world, p, p.hp + p.shield + 1, p.entity, 0);
        });
      }
    });
  }

  /** Load tests on a map with no field: `n` 오답 scattered over open ground. */
  private scatter(n: number): void {
    const kind = this.world.rules.monsters[monsterKindIndex("odap")];
    if (!kind) return;
    const { width, height } = this.world;
    for (let i = 0, tries = 0; i < n && tries < n * 50; tries++) {
      const x = 16 + Math.random() * (width - 32);
      const y = 16 + Math.random() * (height - 32);
      if (overlapsSolid(this.map, x, y, 12) || this.world.inSafe(x, y)) continue;
      spawnMonster(this.world, kind, 1, false, x, y);
      i++;
    }
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
    const p = this.world.playerById(id);
    return p && { x: Math.round(p.x), y: Math.round(p.y) };
  }

  override async onJoin(client: Client, options: SeatOptions = {}): Promise<void> {
    this.retireTimer?.clear();
    this.retireTimer = undefined;
    const character = await this.seats.join(client);
    try {
      await this.seat(client, character, options);
    } catch (error) {
      // Nothing of a half-made seat stays behind: not the body, not the slot, not the account.
      this.removeBody(client.sessionId);
      client.view?.dispose();
      await this.seats.leave(client);
      throw error;
    }
  }

  /** Puts a joined character's body into the fight and the client's views around it. */
  private async seat(client: Client, character: Character, options: SeatOptions): Promise<void> {
    const id = client.sessionId;
    const start =
      character.mapId === this.def.id
        ? validPlace(this.def.id, character.x, character.y)
        : spawnPlace(this.def, "main");
    const facing =
      Number.isInteger(options.facing) && (options.facing as number) >= 0
        ? (((options.facing as number) % 4) as Facing)
        : start.facing;
    const loadout = await loadouts.read(character);
    client.view = new StateView();
    const pawn = this.placeBody(client, character, loadout, start.x, start.y, facing);
    this.countBytes(client);
    const p = pawn.player;
    client.send(MAP_MESSAGES.zones, { zones: pawn.zones } satisfies ZoneUpdate);
    places.enter(character.id, {
      mapId: this.def.id,
      channel: this.state.channel,
      roomId: this.roomId,
      sessionId: id,
      at: () => this.placeOf(id),
      zones: () => this.pawns.get(id)?.zones ?? [],
    });
    this.visit(character.id, placesAt(this.def, p.x, p.y));
    this.duel?.seatedHere(character.id);
  }

  /**
   * A body in the fight with a free slot, its owner's view of itself and of everyone here, and
   * everyone's view of it. Recorded at once, so `removeBody` frees whatever was made if a later
   * step fails.
   */
  private placeBody(
    client: Client,
    character: Character,
    loadout: Loadout,
    x: number,
    y: number,
    facing: Facing,
  ): Pawn {
    const id = client.sessionId;
    const view = client.view;
    const slot = this.free.shift();
    const state = slot === undefined ? undefined : this.state.players.get(slot);
    if (slot === undefined || !state || !view) {
      if (slot !== undefined) this.free.unshift(slot);
      throw new Error("no free body; maxClients should have refused the join");
    }
    const level = Math.max(1, loadout.level);
    const mods = live()?.modifiers(character.id) ?? NO_MODIFIERS;
    const kit = withModifiers(this.world.rules.kit(buildOf(character, loadout, level)), mods);
    let player: Player;
    try {
      player = this.world.addPlayer(id, Number(slot), x, y, kit, level);
    } catch (error) {
      this.free.unshift(slot);
      throw error;
    }
    player.facing = facing;
    player.exp = loadout.exp;
    player.expMult = mods.exp;
    player.party = partyOf(parties.of(character.id)?.id);
    const net = newViewer();
    net.player = player;
    this.net.viewers.add(net);
    const pawn: Pawn = {
      slot,
      client,
      character,
      state,
      net,
      queue: new InputQueue(),
      player,
      loadout,
      mods,
      expCarry: 0,
      since: this.world.tick,
      buckets: {
        aim: new Bucket(RATES.aim[0], RATES.aim[1]),
        mode: new Bucket(RATES.mode[0], RATES.mode[1]),
        revive: new Bucket(RATES.revive[0], RATES.revive[1]),
      },
      leaving: false,
      zones: zonesAt(this.def.zones, player.x, player.y),
      zoneTile: this.tileOf(player.x, player.y),
      lastInteract: 0,
      lastRattle: 0,
      atDesk: false,
      unseenUntil: 0,
      fromX: player.x,
      fromY: player.y,
    };
    player.rebuild = (lv) => this.kitOf(pawn, lv);
    this.pawns.set(id, pawn);
    this.bySlot.set(Number(slot), pawn);
    fighting.set(character.id, { room: this, pawn });
    state.sid = id;
    dressPlayer(state, character);
    wearClub(state, clubTags.get(character.id));
    this.syncOwn(state, player);
    view.add(state, OWNER_TAG);
    // Who is here is small and rare, so every client holds every seated player's identity;
    // the bodies themselves move in the snapshot.
    for (const other of this.pawns.values()) {
      if (other === pawn) continue;
      const theirs = other.client.view;
      if (!view.has(other.state)) view.add(other.state);
      if (theirs && !theirs.has(state)) theirs.add(state);
      this.viewChanges += 2;
    }
    this.tellMode(pawn);
    return pawn;
  }

  /** Tells the living world the character is in these places (도감 school entries, notices). */
  private visit(characterId: string, ids: readonly string[]): void {
    // Carried to a dueling floor and back is not going anywhere: a duel advances no quest.
    if (this.duel?.fights(characterId)) return;
    const events = live()?.events;
    if (events) for (const id of ids) events.visit(characterId, id);
  }

  override onDrop(client: Client): void {
    const pawn = this.pawns.get(client.sessionId);
    // A fighter who drops is out of its match at once (duel/floor.ts `leaving`).
    if (pawn) this.duel?.leaving(pawn.character.id);
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
    if (this.clients.length === 0) this.emptied();
    // Saves the place, so the body stays in the world until the write is done.
    await this.seats.leave(client);
    this.removeBody(client.sessionId);
    client.view?.dispose();
  }

  override onDispose(): void {
    channels.forget(this.roomId);
    if (this.duel) dueling()?.removeFloor(this.roomId);
    this.unlistenClubs?.();
    this.unlistenParties?.();
    this.metrics.dispose();
  }

  /**
   * Takes a body out of the fight and every view, hands its EXP to the pending grant, and frees
   * its slot: the same on a disconnect, a door and 명령퇴사. Its minions, effects, pickups and
   * tags on monsters go with it (`FightWorld.removePlayer`). Safe to call twice.
   */
  private removeBody(id: string): void {
    const pawn = this.pawns.get(id);
    if (pawn) this.duel?.leaving(pawn.character.id);
    if (pawn) {
      this.handOverExp(pawn);
      if (fighting.get(pawn.character.id)?.pawn === pawn) fighting.delete(pawn.character.id);
      for (const other of this.pawns.values()) {
        const theirs = other.client.view;
        if (other === pawn || !theirs?.has(pawn.state)) continue;
        theirs.remove(pawn.state);
        this.viewChanges++;
      }
      pawn.state.sid = "";
      this.pawns.delete(id);
      this.bySlot.delete(Number(pawn.slot));
      this.free.push(pawn.slot);
      this.net.viewers.delete(pawn.net);
    }
    this.inside.delete(id);
    this.world.removePlayer(id);
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
      for (const [id, pawn] of this.pawns) {
        inputs.set(id, pawn.queue.take() as FightInput[]);
        pawn.fromX = pawn.player.x;
        pawn.fromY = pawn.player.y;
      }
      const s0 = performance.now();
      stepFight(this.world, inputs);
      if (this.devActions.length > 0) for (const act of this.devActions.splice(0)) act();
      this.duel?.tick();
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
        if (!pawn || pawn.leaving) continue;
        client.sendBytes(SNAPSHOT_MESSAGE, this.net.message(pawn.net));
      }
      const s2 = performance.now();
      simMs += s1 - s0;
      netMs += s2 - s1;
      this.metrics.countTick(this.world, this.net);
      this.afterStep(inputs);
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
    // Cooldowns: they move only on a cast, a kit change or an attack-speed aura.
    const tick = this.world.tick;
    const rate = (1 + p.attackSpeed) / Math.max(0.2, 1 - p.cooldownBuff);
    const n = p.kit.weapons.length;
    for (let s = 0; s < n; s++) {
      const left = p.ready[s] ?? 0;
      const ready = left > 0 ? tick + Math.ceil(left / rate - 1e-6) : 0;
      const cooldown = Math.min(65535, Math.round((p.kit.weapons[s]?.cooldown ?? 0) / rate));
      if (s >= state.ready.length) state.ready.push(ready);
      else if (state.ready[s] !== ready) state.ready[s] = ready;
      if (s >= state.cooldown.length) state.cooldown.push(cooldown);
      else if (state.cooldown[s] !== cooldown) state.cooldown[s] = cooldown;
    }
    if (state.ready.length > n) state.ready.splice(n);
    if (state.cooldown.length > n) state.cooldown.splice(n);
  }

  /** Mirrors each player's own numbers into its synced body. */
  private sync(): void {
    for (const pawn of this.pawns.values()) this.syncOwn(pawn.state, pawn.player);
  }

  // Doors, zones and people, once per tick ----------------------------------------------------

  /**
   * After the step: doors, zones, desks, shut doors pushed against, the cast and patrols. Only a
   * player's own steps take it through a door: a body the server walks (완전 자동, 스킬 수동,
   * a dropped client) or one knocked out never leaves the fight that way.
   */
  private afterStep(inputs: ReadonlyMap<string, readonly FightInput[]>): void {
    const walkers: Player[] = [];
    for (const p of this.world.players) {
      if (!p.joined || p.down || p.away || MODE_AUTO[p.mode].move) continue;
      if (this.pawns.get(p.id)?.leaving === false) walkers.push(p);
    }
    const doors = stepDoors(this.inside, walkers, this.def.portals);
    this.inside = new Map(doors.inside);
    for (const { id, portal } of doors.entered) {
      const pawn = this.pawns.get(id);
      const p = this.def.portals[portal];
      if (pawn && p?.built) void this.walkThrough(pawn, p.id, p.to, p.spawn);
    }
    const now = Date.now();
    for (const pawn of this.pawns.values()) {
      if (pawn.leaving) continue;
      const p = pawn.player;
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
      if ((inputs.get(p.id)?.length ?? 0) === 0) continue;
      if (Math.abs(p.x - pawn.fromX) + Math.abs(p.y - pawn.fromY) > 1) continue;
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
    this.applyWalls();
    this.state.closed.splice(0, this.state.closed.length, ...closed);
  }

  private tileOf(x: number, y: number): number {
    return Math.floor(y / TILE_SIZE) * this.def.w + Math.floor(x / TILE_SIZE);
  }

  /**
   * Through a door (PLAN §10), or sent somewhere by the school: the body leaves this fight at
   * once (as on a disconnect: EXP handed over, minions, effects, pickups and tags gone), the
   * character is written on the other side, this room lets go of the account's seat, and only
   * then does the client get a reserved seat in the target map's room. See `RoomSeats.moveOut`
   * for why nothing can be lost or doubled in between.
   */
  private async walkThrough(pawn: Pawn, via: string, to: string, spawn: string): Promise<void> {
    const target = builtMap(to);
    if (!target) return;
    // The Page clock can close a map between the door check and the step.
    if (this.closed.has(via)) {
      this.rattle(via, "portal", pawn.client.sessionId, "door_closed");
      return;
    }
    await this.carry(pawn, via, target.id, spawnPlace(target, spawn));
  }

  /**
   * The body leaves for `mapId` at `arrive`: the save-first handoff of `walkThrough`, into the
   * channel `roomId` when one is named (a dueling floor and back, duel/hub.ts) and it has room.
   */
  private async carry(
    pawn: Pawn,
    via: string,
    mapId: string,
    arrive: { x: number; y: number; facing: Facing },
    roomId?: string,
  ): Promise<void> {
    const { client } = pawn;
    const id = client.sessionId;
    const at = this.placeOf(id);
    pawn.leaving = true;
    pawn.queue.clear();
    this.removeBody(id);
    let auth: Awaited<ReturnType<RoomSeats["moveOut"]>>;
    try {
      auth = await this.seats.moveOut(client, mapId, arrive.x, arrive.y);
    } catch {
      // Nothing was written, or another login took the account: stay, or let eviction end it.
      if (this.seats.mayReconnect(client) && at && this.clients.includes(client)) {
        this.restoreBody(pawn, at.x, at.y);
      }
      return;
    }
    let seating: Awaited<ReturnType<typeof channels.seat>> | undefined;
    try {
      seating = roomId
        ? await channels.seatIn(mapId, roomId, auth, { facing: arrive.facing })
        : await channels.seat(mapId, auth, { facing: arrive.facing });
    } catch (error) {
      console.error(`seating ${id} in ${mapId} failed: ${String(error)}`);
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
      if (pawn.leaving || l.homeUntil(pawn.character.id) !== null) continue;
      this.relocate(pawn.character.id, START_MAP, "main", "school");
    }
  }

  /** Puts a body back where it stood after a door that could not be walked through. */
  private restoreBody(pawn: Pawn, x: number, y: number): void {
    try {
      const back = this.placeBody(
        pawn.client,
        pawn.character,
        pawn.loadout,
        x,
        y,
        pawn.player.facing,
      );
      back.net.fresh = true;
    } catch {
      // No free body: the client is told to enter again by its seat's eviction.
    }
  }

  // Duels ----------------------------------------------------------------------------------

  /** A floor on a map with one: the room lends it its world, bodies, walls and messages. */
  private openFloor(seats: number): void {
    this.openSeats = this.maxClients;
    const arena = this.def.arenas.find((a) => a.modes.length > 0);
    const hub = dueling();
    if (!arena || !hub) return;
    // Fighters on their way are seated past what newcomers may take (`crowded`).
    this.maxClients = Math.max(1, Math.min(MAP_SEATS, seats + MAX_FIGHTERS));
    const gallery = spawnPlace(this.def, "colosseum");
    const room: FloorRoom = {
      roomId: this.roomId,
      mapId: this.def.id,
      channel: this.state.channel,
      world: this.world,
      bodyOf: (id) => {
        const pawn = this.pawnOf(id);
        return pawn && !pawn.leaving
          ? { player: pawn.player, sid: pawn.client.sessionId }
          : undefined;
      },
      seated: () =>
        [...this.pawns.values()]
          .filter((p) => !p.leaving)
          .map((p) => ({ characterId: p.character.id, player: p.player })),
      broadcast: (type, body) => this.broadcast(type, body),
      send: (sid, type, body) => this.pawns.get(sid)?.client.send(type, body),
      fence: (id, on) => {
        const list = this.state.fenced;
        const at = list.indexOf(id);
        if (on && at < 0) list.push(id);
        else if (!on && at >= 0) list.splice(at, 1);
        this.applyWalls();
      },
      duelKit: (id, mode) => {
        const pawn = this.pawnOf(id);
        if (!pawn) return undefined;
        const l = pawn.loadout;
        const build = duelBuild(pawn.character.major, l.minor, l, DUEL_NORMS);
        return duelKit(this.world.rules, build, DUEL_NORMS, mode);
      },
      unarm: (id) => {
        const pawn = this.pawnOf(id);
        if (!pawn) return;
        const p = pawn.player;
        p.party = partyOf(parties.of(id)?.id);
        // A grant that landed during the match raised the recorded level.
        if (pawn.loadout.level > p.level) p.level = pawn.loadout.level;
        pawn.mods = live()?.modifiers(id) ?? pawn.mods;
        p.expMult = pawn.mods.exp;
        this.world.setKit(p, this.kitOf(pawn, p.level));
        this.tellMode(pawn);
      },
      modeChanged: (id) => {
        const pawn = this.pawnOf(id);
        if (pawn) this.tellMode(pawn);
      },
      gallery: { x: gallery.x, y: gallery.y },
    };
    this.duel = hub.addFloor(this.roomId, (events) => new FloorHost(room, arena, events));
  }

  /** The room's walls: the map's, with shut doors, and the floor's ring while a match is on it. */
  private applyWalls(): void {
    const base = shutDoors(this.def.collision, this.def.portals, this.closed);
    const fenced = this.duel && this.state.fenced.length > 0;
    this.map.collision = fenced && this.duel ? fenceFloor(base, this.duel.arena.rect) : base;
  }

  private pawnOf(characterId: string): Pawn | undefined {
    const at = fighting.get(characterId);
    return at?.room === this && this.pawns.get(at.pawn.player.id) === at.pawn ? at.pawn : undefined;
  }

  /** Whether a character here may be pulled into a duel now: seated, staying, on its feet. */
  duelReady(characterId: string): boolean {
    const pawn = this.pawnOf(characterId);
    const p = pawn?.player;
    return !!pawn && !!p && !pawn.leaving && !p.down && !p.away && p.team === 0;
  }

  /** Seats newcomers may take here; a floor's map holds a few more for fighters. */
  get seatCap(): number {
    return this.openSeats;
  }

  /** Whether `n` fighters on their way still fit. */
  seatsFor(n: number): boolean {
    return this.clients.length + n <= this.maxClients;
  }

  /** Sends a character here to a spot on a map, in a given channel when it has room. */
  sendTo(
    characterId: string,
    to: { map: string; x: number; y: number; roomId?: string; via: string },
  ): boolean {
    const pawn = this.pawnOf(characterId);
    if (!pawn || pawn.leaving) return false;
    const place = validPlace(to.map, to.x, to.y);
    void this.carry(pawn, to.via, place.map.id, place, to.roomId);
    return true;
  }

  /** Puts a character standing here somewhere else in this room at once. */
  teleport(characterId: string, x: number, y: number): boolean {
    const pawn = this.pawnOf(characterId);
    if (!pawn || pawn.leaving) return false;
    const place = validPlace(this.def.id, x, y);
    const p = pawn.player;
    p.x = snap(place.x);
    p.y = snap(place.y);
    p.rollLeft = 0;
    p.forceTicks = 0;
    pawn.queue.clear();
    this.inside.delete(pawn.client.sessionId);
    return true;
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
        if (!p.joined || this.pawns.get(p.id)?.leaving) continue;
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
    const at = this.world.playerById(client.sessionId);
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
        if (!p.joined) continue;
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
    const p = pawn.player;
    p.x = snap(back.x);
    p.y = snap(back.y);
    p.facing = back.facing;
    p.rollLeft = 0;
    p.forceTicks = 0;
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
