import {
  type AuthContext,
  type Client,
  ClientState,
  type Delayed,
  Room,
  ServerError,
} from "@colyseus/core";
import { StateView } from "@colyseus/schema";
import {
  type BuiltMap,
  type Drop,
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
  applyBetween,
  type Between,
  type Caught,
  type ChangeNotice,
  type Character,
  CLOSE_MAP_CHANGED,
  CONTROL_MODES,
  createFight,
  type DoorRattle,
  type DoorRefusal,
  dressPlayer,
  Ev,
  type Facing,
  type FightInput,
  type FightMap,
  FightNet,
  type FightWorld,
  GOAL_HELD,
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
  STORY_MESSAGES,
  sameModifiers,
  shutDoorAhead,
  shutDoors,
  snap,
  spawnMonster,
  stepDoors,
  stepFight,
  storyMessage,
  TICK_MS,
  TILE_SIZE,
  type Transfer,
  type Usable,
  wearClub,
  withModifiers,
  type ZoneUpdate,
  zonesAt,
} from "@guago/shared";
import { background } from "./background.ts";
import { type ChannelRoom, channels, type MapRoomOptions, type SeatOptions } from "./channels.ts";
import { clubActivity } from "./club-activity.ts";
import { clubTags } from "./club-tags.ts";
import { grants } from "./economy/grants.ts";
import { carryIn, carryOut, DEFAULT_MODE, type ModeStore, memoryModes } from "./fight/carry.ts";
import { buildOf, type Loadout, type Loadouts, starterLoadouts } from "./fight/loadout.ts";
import { invariants } from "./invariants.ts";
import { live } from "./live/current.ts";
import { RoomMetrics } from "./metrics.ts";
import { parties } from "./parties.ts";
import { places } from "./places.ts";
import { characterAfterMoves, type RoomAuth, RoomSeats, SAVE_INTERVAL_MS } from "./seats.ts";
import { type Destination, registerSharedRoom, type StoryRoom, story } from "./story/director.ts";
import { TickClock } from "./tick-clock.ts";
import {
  builtMap,
  clearSpot,
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
/** Ticks out of full auto before the living world hears that full auto stopped (5 minutes). */
const AUTO_OFF_TICKS = 6000;
/**
 * A socket whose player went through a door is closed if still open after this: the client takes
 * its new seat at once, and an old connection kept open counts for nothing anyway.
 */
const MOVED_SOCKET_MS = 3000;
/** A character goes through at most one door this often; a door walked into sooner waits. */
const DOOR_EVERY_MS = 1000;
/** When each character last went through a door, across the process's rooms. */
const lastDoor = new Map<string, number>();
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
/** Development and tests: how often each room checks that bodies and clients pair up. */
const BODY_CHECK_MS = 2000;

/** Every map room of this process, for the development checks across rooms. */
const ROOMS = new Set<MapRoom>();

/** Runs every room's body check now (tests call it at the moments that matter). */
export function checkMapRooms(): void {
  for (const room of ROOMS) room.checkBodies();
}

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
  /** Counts loadout reads, so an older read that lands late is dropped. */
  loadGen: number;
  /** Tick from which leaving full auto is reported, or -1. */
  autoOffAt: number;
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
  /** A meal at the 급식 counter is being served: one at a time. */
  eating: boolean;
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
let modes: ModeStore = memoryModes;

export function provideFightServices(s: { loadouts?: Loadouts; modes?: ModeStore }): void {
  if (s.loadouts) loadouts = s.loadouts;
  if (s.modes) modes = s.modes;
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
  // Any item change may be an equip or an unequip (an unequip can report only the item it took
  // off), so any of them rebuilds the kit.
  const touched =
    (change.items?.length ?? 0) > 0 ||
    (change.removed?.length ?? 0) > 0 ||
    change.progression !== undefined;
  if (!touched) return;
  background("fight reload", at.room.reload(at.pawn));
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
export class MapRoom extends Room<{ state: MapState }> implements ChannelRoom, StoryRoom {
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
  /** Sessions whose body walked out through a door; their socket stays open a little while. */
  private readonly moved = new Set<string>();
  /** The character a private copy of the map was made for (the opening, the 집, a replay). */
  owner: string | undefined;
  /** Bodies a scene is walking, by session: from, to, and ticks gone of ticks. */
  private readonly scripted = new Map<
    string,
    { fx: number; fy: number; tx: number; ty: number; ticks: number; t: number }
  >();
  private unlistenShared: (() => void) | undefined;
  private unlistenParties: (() => void) | undefined;
  /**
   * What clients asked of the world since the last tick (aim, mode, revive), applied in arrival
   * order at the next tick's start, so the world only ever changes at tick boundaries.
   */
  private readonly between: Between[] = [];
  /** Development commands that act inside the next tick (`GUAGO_DEV_COMMANDS=1`). */
  private readonly devActions: (() => void)[] = [];

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
    this.graceMs = options.grace * 1000;
    const { w, h } = def.collision;
    if (w * TILE_SIZE > MAX_MAP_PX || h * TILE_SIZE > MAX_MAP_PX) {
      throw new Error(`map ${def.id} is larger than positions can address (${MAX_MAP_PX} px)`);
    }
    const seed = (Math.random() * 2 ** 32) >>> 0;
    this.owner = options.owner;
    // A private copy for a scene is calm: its fights are the scene's to bring.
    const field = options.calm ? null : fieldOf(def.id, process.env.GUAGO_FIELD);
    this.world = createFight(this.map, simRules(), field, seed);
    this.net = new FightNet(this.world);
    // A map with no field gets wandering 오답 only when a load test asks (`monsters`).
    if (!field && options.monsters) this.scatter(options.monsters);
    this.metrics = new RoomMetrics(this.roomId, def.id);
    // A private copy is nobody's saved place: its bodies are never written down.
    this.seats = new RoomSeats(def.id, (id) => (this.owner ? undefined : this.placeOf(id)));
    this.state.map = def.id;
    this.state.channel = options.channel;
    background("room metadata", this.setMetadata({ map: def.id, channel: options.channel }));
    // Bodies before anything else, so their ref ids are the smallest the room will ever hand out.
    for (let i = 0; i < MAP_SEATS; i++) {
      const slot = String(i);
      this.state.players.set(slot, new PlayerState());
      this.free.push(slot);
    }
    this.placeCast();
    this.refreshDoors();

    this.onMessage(INPUT_MESSAGE, inputMessage, (client, input: FightInput) => {
      const pawn = this.pawns.get(client.sessionId);
      if (pawn && !pawn.leaving) this.metrics.inputsDropped += pawn.queue.push(input);
    });
    this.onMessage(MAP_MESSAGES.interact, interactMessage, (client, n: number) => {
      this.interact(client, n);
    });
    this.onMessage(STORY_MESSAGES.story, storyMessage, (client, req) => {
      const pawn = this.pawns.get(client.sessionId);
      if (pawn) story.request(this, client.sessionId, pawn.character.id, req);
    });
    if (!this.owner) {
      this.unlistenShared = registerSharedRoom(def.id, {
        playShared: (scene) => this.playShared(scene),
      });
    }
    this.onMessage(AIM_MESSAGE, aimMessage, (client, aim) => {
      const pawn = this.pawns.get(client.sessionId);
      if (!pawn?.buckets.aim.take()) return;
      this.between.push({ t: "aim", player: pawn.player.id, aim });
    });
    this.onMessage(MODE_MESSAGE, modeMessage, (client, mode) => {
      const pawn = this.pawns.get(client.sessionId);
      if (!pawn?.buckets.mode.take()) return;
      this.between.push({ t: "mode", player: pawn.player.id, mode: mode as Mode });
    });
    this.onMessage(REVIVE_MESSAGE, reviveMessage, (client, slot) => {
      const pawn = this.pawns.get(client.sessionId);
      const target = this.bySlot.get(slot);
      if (!pawn?.buckets.revive.take() || !target) return;
      this.between.push({ t: "revive", player: pawn.player.id, target: target.player.id });
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
    this.clock.setInterval(() => background("place save", this.seats.saveAll()), SAVE_INTERVAL_MS);
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
    if (invariants.on) {
      ROOMS.add(this);
      this.clock.setInterval(() => this.checkBodies(), BODY_CHECK_MS);
    }
    // Made for a seat that may never be taken.
    this.emptied();
  }

  /** A closed map spawns nothing; a changed modifier rebuilds that player's kit. */
  private readLive(): void {
    this.settleAutoOff();
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

  /** Applies the queued client records; a mode that changed is told and stored. */
  private applyQueued(): void {
    if (this.between.length === 0) return;
    for (const e of this.between) {
      const pawn = this.pawns.get(e.player);
      if (!pawn || pawn.leaving) continue;
      const before = pawn.player.mode;
      applyBetween(this.world, e);
      if (e.t === "mode" && pawn.player.mode !== before) {
        this.tellMode(pawn);
        background("mode save", modes.write(pawn.character.id, pawn.player.mode));
        story.modeChanged(pawn.client.sessionId);
      }
    }
    this.between.length = 0;
  }

  /**
   * A mode chosen or a seat taken: full auto's unbroken time is what brings 졸음. Leaving full
   * auto counts only once the body has stayed out of it for `AUTO_OFF_TICKS` (checked with the
   * living world, `readLive`), so a toggle and back does not restart the clock.
   */
  private tellMode(pawn: Pawn): void {
    if (pawn.player.mode === Mode.Auto) {
      pawn.autoOffAt = -1;
      live()?.events.autoHunting(pawn.character.id, true);
    } else if (pawn.autoOffAt < 0) {
      pawn.autoOffAt = this.world.tick + AUTO_OFF_TICKS;
    }
  }

  /** Bodies out of full auto long enough: now the living world hears it. */
  private settleAutoOff(): void {
    const l = live();
    for (const pawn of this.pawns.values()) {
      if (pawn.autoOffAt < 0 || this.world.tick < pawn.autoOffAt) continue;
      pawn.autoOffAt = -1;
      if (pawn.player.mode !== Mode.Auto) l?.events.autoHunting(pawn.character.id, false);
    }
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
    const gen = ++pawn.loadGen;
    const loadout = await loadouts.read(pawn.character);
    // A newer read started meanwhile, or the body left: this one is stale.
    if (gen !== pawn.loadGen || this.pawns.get(pawn.player.id) !== pawn) return;
    pawn.loadout = loadout;
    const p = pawn.player;
    // The inventory's level is the record. When it moved the level, its EXP is the record too:
    // the fight's own count would count the granted EXP a second time toward the next level.
    if (loadout.level > p.level) {
      p.level = loadout.level;
      p.exp = loadout.exp;
    }
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

  /** Accounts with a body standing here: what fills a channel (`channels.occupancy`). */
  accountsHere(): ReadonlySet<string> {
    const out = new Set<string>();
    for (const pawn of this.pawns.values()) {
      if (!pawn.leaving) out.add((pawn.client.auth as RoomAuth).accountId);
    }
    return out;
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
    this.retireTimer = this.clock.setTimeout(
      () => background("channel retire", this.retire()),
      this.graceMs,
    );
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
    if (!p) return undefined;
    // Knocked out, the character is where it will wake.
    const at = p.down ? this.map.spawn : p;
    return { x: Math.round(at.x), y: Math.round(at.y) };
  }

  override async onJoin(client: Client, options: SeatOptions = {}): Promise<void> {
    this.retireTimer?.clear();
    this.retireTimer = undefined;
    const character = await this.seats.join(client);
    try {
      // A seat is good only for where the character belongs as it is taken: a ticket from before
      // a door, an expel or another page's move is refused, and the client enters again.
      if (!(await story.mayJoin(this, character))) throw new ServerError(409, "elsewhere");
      // In a private copy the scene says where the player stands.
      const at = this.owner ? await story.startPlace(this, character.id) : undefined;
      await this.seat(client, character, at ? { ...options, at } : options);
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
      return;
    }
    const pawn = this.pawns.get(client.sessionId);
    if (pawn)
      background("story arrival", story.arrived(this, client.sessionId, character.id, pawn.zones));
  }

  /** Puts a joined character's body into the fight and the client's views around it. */
  private async seat(client: Client, character: Character, options: SeatOptions): Promise<void> {
    const id = client.sessionId;
    if (invariants.on) oneBody(character.id, this);
    const place = options.at
      ? { ...options.at, facing: spawnPlace(this.def, "main").facing }
      : character.mapId === this.def.id
        ? validPlace(this.def.id, character.x, character.y)
        : spawnPlace(this.def, "main");
    // Clear of the walls as they stand now, doors the Page clock shut included.
    const start = { ...place, ...clearSpot(this.def, place.x, place.y, this.map) };
    const facing =
      Number.isInteger(options.facing) && (options.facing as number) >= 0
        ? (((options.facing as number) % 4) as Facing)
        : start.facing;
    // EXP still in the grant buffer lands first, so the loadout read is the whole record.
    await grants()?.flush(character.id);
    const [loadout, mode] = await Promise.all([
      loadouts.read(character),
      modes.read(character.id).catch(() => undefined),
    ]);
    client.view = new StateView();
    const pawn = this.placeBody(client, character, loadout, start.x, start.y, facing, mode);
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
    mode: Mode = DEFAULT_MODE,
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
    player.mode = mode;
    player.exp = loadout.exp;
    // Back within a quarter of an hour: as hurt and as busy as it left (fight/carry.ts).
    carryIn(character.id, player, this.world.tick);
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
      loadGen: 0,
      autoOffAt: -1,
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
      eating: false,
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
    const events = live()?.events;
    if (events) for (const id of ids) events.visit(characterId, id);
  }

  override onDrop(client: Client): void {
    const pawn = this.pawns.get(client.sessionId);
    // The character stays and plays itself meanwhile (PLAN §19 reconnect); queued inputs are stale.
    if (pawn) {
      pawn.queue.clear();
      pawn.player.away = true;
    }
    if (!this.seats.mayReconnect(client)) {
      if (pawn) pawn.leaving = true;
      return;
    }
    this.seats.hold(client, this.allowReconnection(client, RECONNECT_SECONDS));
  }

  override async onReconnect(client: Client): Promise<void> {
    this.seats.reconnected(client);
    this.countBytes(client);
    // Moved by the server while the socket was down (sent home, let back, walked out): there is
    // no body here to come back to. The client enters again and lands where it belongs.
    const pawn = this.pawns.get(client.sessionId);
    if (!pawn || pawn.leaving || !(await story.mayJoin(this, pawn.character))) {
      if (client.state !== ClientState.LEAVING) client.leave(CLOSE_MAP_CHANGED);
      return;
    }
    pawn.player.away = false;
    pawn.net.fresh = true;
    this.net.resendDrops(pawn.net);
  }

  override async onLeave(client: Client): Promise<void> {
    places.leave(client.sessionId);
    const pawn = this.pawns.get(client.sessionId);
    // Through a door the story goes on in the next room; otherwise the character left.
    story.left(client.sessionId, this.moved.has(client.sessionId) ? undefined : pawn?.character.id);
    this.scripted.delete(client.sessionId);
    this.moved.delete(client.sessionId);
    if (pawn) pawn.leaving = true;
    if (this.clients.length === 0) this.emptied();
    // Saves the place, so the body stays in the world until the write is done.
    await this.seats.leave(client);
    this.removeBody(client.sessionId);
    client.view?.dispose();
  }

  override onDispose(): void {
    ROOMS.delete(this);
    this.unlistenShared?.();
    channels.forget(this.roomId);
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
    if (pawn) {
      this.handOverExp(pawn);
      const p = pawn.player;
      if (p.joined && p.id === id) {
        // Leaving knocked out is waking at the 보건실: the 기절 counts.
        if (p.down) background("knockout", live()?.events.knockout(pawn.character.id));
        carryOut(pawn.character.id, p, this.world.tick);
      }
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
      this.applyQueued();
      stepFight(this.world, inputs);
      if (this.devActions.length > 0) for (const act of this.devActions.splice(0)) act();
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
        // A client that has not acknowledged its join (or is leaving) is sent nothing: Colyseus
        // would queue the frames for it without limit. Its first real message is a keyframe.
        if (client.state !== ClientState.JOINED && client.state !== ClientState.RECONNECTED)
          continue;
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
    this.walkScripted();
    // A private copy's doors stay shut: its scene says when the player moves on.
    const doors = stepDoors(this.inside, this.owner ? [] : walkers, this.def.portals);
    this.inside = new Map(doors.inside);
    const now = Date.now();
    for (const { id, portal } of doors.entered) {
      const pawn = this.pawns.get(id);
      const p = this.def.portals[portal];
      if (!pawn || !p?.built) continue;
      // Too soon after the last door: it counts as walked into again next tick, until it may open.
      if (now - (lastDoor.get(pawn.character.id) ?? 0) < DOOR_EVERY_MS) {
        this.inside.set(id, -1);
        continue;
      }
      background("door", this.walkThrough(pawn, p.id, p.to, p.spawn));
    }
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
          story.zonesChanged(this, pawn.client.sessionId, pawn.character.id, zones);
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
    if (this.world.tick % 2 === 0) story.tick(this);
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
      this.def.portals
        .filter((p) => this.owner !== undefined || (p.built && l && !l.isOpen(p.to)))
        .map((p) => p.id),
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
    if (this.closed.has(via) || live()?.isOpen(target.id) === false) {
      this.rattle(via, "portal", pawn.client.sessionId, "door_closed");
      return;
    }
    noteDoor(pawn.character.id);
    const arrive = spawnPlace(target, spawn);
    await this.moveOn(pawn, {
      map: target.id,
      x: arrive.x,
      y: arrive.y,
      facing: arrive.facing,
      instance: false,
      write: true,
      via,
    });
  }

  /**
   * Takes the body out and seats the character at `to`: a door, the school, or the story. A move
   * out of a shared room writes down where it goes (or, into a private copy, where it stood); a
   * move out of a private copy writes nothing unless `to.write`.
   */
  private async moveOn(pawn: Pawn, to: Destination): Promise<void> {
    const { client } = pawn;
    const id = client.sessionId;
    const at = this.placeOf(id);
    pawn.leaving = true;
    pawn.queue.clear();
    this.scripted.delete(id);
    this.removeBody(id);
    this.moved.add(id);
    const record = to.write
      ? { mapId: to.map, x: to.x, y: to.y }
      : !this.owner && at
        ? { mapId: this.def.id, x: at.x, y: at.y }
        : null;
    let auth: Awaited<ReturnType<RoomSeats["moveOut"]>>;
    try {
      auth = await this.seats.moveOut(client, record);
    } catch {
      // Nothing was written, or another login took the account: stay, or let eviction end it.
      if (this.seats.mayReconnect(client) && at && this.clients.includes(client)) {
        this.restoreBody(pawn, at.x, at.y);
      }
      return;
    }
    // Dropped meanwhile: the far side is written, and entering again lands there.
    if (!this.clients.includes(client)) return;
    let seating: Awaited<ReturnType<typeof channels.seat>> | undefined;
    const options = { facing: to.facing, ...(to.instance ? { at: { x: to.x, y: to.y } } : {}) };
    try {
      seating = to.instance
        ? await channels.instance(to.map, auth, options)
        : await channels.seat(to.map, auth, options);
    } catch (error) {
      console.error(`seating ${id} in ${to.map} failed: ${String(error)}`);
    }
    if (!this.clients.includes(client)) return;
    if (!seating) {
      // Written on the other side already: the client enters again and lands there.
      client.leave(CLOSE_MAP_CHANGED);
      return;
    }
    client.send(MAP_MESSAGES.transfer, { ...seating, via: to.via } satisfies Transfer);
    this.clock.setTimeout(() => {
      if (this.clients.includes(client)) client.leave(CLOSE_MAP_CHANGED);
    }, MOVED_SOCKET_MS);
  }

  /**
   * Sends a character standing here to another map: 명령퇴사 to the 집 (a private copy) and
   * back (PLAN §11). Returns false when they are not here.
   */
  relocate(characterId: string, to: string, spawn: string, via: string): boolean {
    const pawn = [...this.pawns.values()].find((p) => p.character.id === characterId);
    const target = builtMap(to);
    if (!pawn || pawn.leaving || !target) return false;
    const arrive = spawnPlace(target, spawn);
    background(
      "relocate",
      this.moveOn(pawn, {
        map: target.id,
        x: arrive.x,
        y: arrive.y,
        facing: arrive.facing,
        instance: target.id === HOME_MAP,
        write: true,
        via,
      }),
    );
    return true;
  }

  /** In the 집: whoever has served their time, and seen the scene to its end, goes to school. */
  private letGoHome(): void {
    const l = live();
    if (!l) return;
    for (const pawn of this.pawns.values()) {
      if (pawn.leaving || story.busy(pawn.client.sessionId)) continue;
      background(
        "home check",
        l.homeUntil(pawn.character.id).then((until) => {
          if (until === null) this.relocate(pawn.character.id, START_MAP, "main", "school");
        }),
      );
    }
  }

  // The story's calls (`StoryRoom`) ----------------------------------------------------------

  get mapDef(): BuiltMap {
    return this.def;
  }

  tell(sessionId: string, type: string, body: unknown): void {
    this.clients.find((c) => c.sessionId === sessionId)?.send(type, body);
  }

  bodyOf(sessionId: string): { x: number; y: number } | undefined {
    const p = this.pawns.get(sessionId)?.player;
    return p && { x: p.x, y: p.y };
  }

  autoWalks(sessionId: string): boolean {
    const p = this.pawns.get(sessionId)?.player;
    return !!p && MODE_AUTO[p.mode].move;
  }

  holdGoal(sessionId: string, at: { x: number; y: number } | undefined): void {
    const p = this.pawns.get(sessionId)?.player;
    if (!p) return;
    if (!at) {
      if (p.aiGoalUntil === GOAL_HELD) p.aiGoalUntil = 0;
      return;
    }
    p.aiGoalX = at.x;
    p.aiGoalY = at.y;
    p.aiGoalUntil = GOAL_HELD;
  }

  /** A scene walks a body to a spot: straight there over `ms`, its own inputs set aside. */
  walkBody(sessionId: string, x: number, y: number, ms: number): void {
    const p = this.pawns.get(sessionId)?.player;
    if (!p) return;
    const ticks = Math.max(1, Math.round(ms / TICK_MS));
    this.scripted.set(sessionId, { fx: p.x, fy: p.y, tx: x, ty: y, ticks, t: 0 });
  }

  /** Each tick after the step: bodies a scene walks go one step further along their line. */
  private walkScripted(): void {
    for (const [id, w] of this.scripted) {
      const pawn = this.pawns.get(id);
      if (!pawn) {
        this.scripted.delete(id);
        continue;
      }
      w.t = Math.min(w.ticks, w.t + 1);
      const k = w.t / w.ticks;
      const p = pawn.player;
      pawn.queue.clear();
      p.x = snap(w.fx + (w.tx - w.fx) * k);
      p.y = snap(w.fy + (w.ty - w.fy) * k);
      if (w.t < w.ticks) p.facing = facingToward(w.fx, w.fy, w.tx, w.ty);
      if (w.t >= w.ticks) this.scripted.delete(id);
    }
  }

  sendOn(sessionId: string, to: Destination): void {
    const pawn = this.pawns.get(sessionId);
    if (pawn && !pawn.leaving) background("story move", this.moveOn(pawn, to));
  }

  /** After a replay: back to where the character's saved record says it belongs. */
  sendBack(sessionId: string): void {
    const pawn = this.pawns.get(sessionId);
    if (!pawn || pawn.leaving) return;
    const auth = pawn.client.auth as RoomAuth;
    background(
      "story send back",
      characterAfterMoves(auth.accountId, auth.characterId).then(async (c) => {
        if (!c) return;
        const where = await story.whereBelongs(c);
        const place = validPlace(where.map, c.x, c.y);
        const here = c.mapId === where.map ? place : spawnPlace(place.map, "main");
        this.sendOn(sessionId, {
          map: place.map.id,
          x: here.x,
          y: here.y,
          facing: here.facing,
          instance: where.instance,
          write: false,
          via: "replay",
        });
      }),
    );
  }

  /** Plays a scene for everyone here, and whoever comes while it runs; resolves when it ended. */
  playShared(sceneId: string): Promise<void> {
    const present = [...this.pawns.values()]
      .filter((p) => !p.leaving)
      .map((p) => [p.client.sessionId, p.character.id] as [string, string]);
    return story.playShared(this, sceneId, present);
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
      this.moved.delete(pawn.client.sessionId);
    } catch {
      // No free body: the client is told to enter again by its seat's eviction.
    }
  }

  /**
   * Development and tests: every joined client has a body here, unless it just walked out through
   * a door, and every body has its client or a reconnection held for it.
   */
  checkBodies(): void {
    const where = `${this.def.id}#${this.state.channel}`;
    for (const client of this.clients) {
      const id = client.sessionId;
      if (client.state !== ClientState.JOINED || this.pawns.has(id) || this.moved.has(id)) continue;
      invariants.report(`client ${id} in ${where} has no body`);
    }
    for (const [id, pawn] of this.pawns) {
      if (pawn.leaving || this.seats.holding(id)) continue;
      if (!this.clients.some((c) => c.sessionId === id)) {
        invariants.report(`body ${id} in ${where} has no client`);
      }
    }
  }

  /** Bodies of a character standing in this room, for the check across rooms. */
  bodiesOf(characterId: string): number {
    let n = 0;
    for (const pawn of this.pawns.values()) {
      if (pawn.character.id === characterId && !pawn.leaving) n++;
    }
    return n;
  }

  // The cast -----------------------------------------------------------------------------------

  private placeCast(): void {
    // A private copy's people are its scene's, drawn by the client.
    for (const npc of this.owner ? [] : npcsOf(this.def)) {
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
    // A scene waiting on this use answers it instead.
    const thing = target && "thing" in target.what ? target.what.thing.id : undefined;
    const scripted = story.interacted(this, client.sessionId, thing, n);
    if (scripted) {
      client.send(MAP_MESSAGES.interaction, scripted);
      return;
    }
    background(
      "interaction",
      this.answer(pawn, target, n, at).then((answer) => {
        if (this.clients.includes(client)) client.send(MAP_MESSAGES.interaction, answer);
      }),
    );
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
      if (pawn.eating) return { t: "none", n };
      pawn.eating = true;
      try {
        return { t: "ate", n, id: thing.id, result: await l.events.eat(who) };
      } finally {
        pawn.eating = false;
      }
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

/** Development and tests: a character about to be seated has no body anywhere else. */
function oneBody(characterId: string, here: MapRoom): void {
  for (const room of ROOMS) {
    if (room.bodiesOf(characterId) > 0) {
      invariants.report(
        `character ${characterId} has a body in ${room.mapId}#${room.channel} while seated in ${here.mapId}#${here.channel}`,
      );
    }
  }
}

/** Remembers a character's door; old entries go once there are many. */
function noteDoor(characterId: string): void {
  const now = Date.now();
  lastDoor.set(characterId, now);
  if (lastDoor.size > 10_000) {
    for (const [id, at] of lastDoor) if (now - at > DOOR_EVERY_MS) lastDoor.delete(id);
  }
}
