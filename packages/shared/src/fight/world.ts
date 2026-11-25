import type { Collidable } from "../collision.ts";
import { TILE_SIZE } from "../constants.ts";
import { Facing, PLAYER_RADIUS, snap } from "../movement.ts";
import { Random } from "../random.ts";
import { FlowField } from "./flow.ts";
import { SpatialHash } from "./hash.ts";
import type { FieldRule, MonsterKind, PlayerKit, SimDrop, SimRules, Weapon } from "./rules.ts";

/** A rectangle in tiles. */
export interface TileRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/**
 * The map as the fight sees it: collision, where players arrive, where monsters may not go, and
 * where they spawn. Built by the server from any map with a collision grid.
 */
export interface FightMap extends Collidable {
  readonly id: string;
  /** Where players arrive and wake, in world pixels; also the shallow end of the field's regions. */
  readonly spawn: { readonly x: number; readonly y: number };
  /** Monsters never enter these and players inside are not hunted. */
  readonly safe: readonly TileRect[];
  /** Where monsters spawn; `monster` names a kind the zone prefers. Empty: anywhere walkable. */
  readonly spawnZones: readonly {
    readonly rect: TileRect;
    readonly monster: string | null;
    readonly weight: number;
  }[];
  /** Where elites appear; empty: near the busiest players. */
  readonly eliteZones: readonly TileRect[];
}

/** Control modes in `CONTROL_MODES` order. */
export const Mode = { Auto: 0, Semi: 1, Skill: 2, Manual: 3 } as const;
export type Mode = (typeof Mode)[keyof typeof Mode];

/** Whether the server moves the character, casts its books, and dodges for it. */
export const MODE_AUTO = [
  { move: true, books: true, dodge: true },
  { move: false, books: true, dodge: true },
  { move: true, books: true, dodge: false },
  { move: false, books: false, dodge: false },
] as const;

/** What a monster is doing, for its animation and its next decision. */
export const MState = {
  Idle: 0,
  Move: 1,
  Windup: 2,
  Charge: 3,
  Recover: 4,
  Fire: 5,
  Fuse: 6,
  Cast: 7,
  Guard: 8,
  Block: 9,
  Rush: 10,
  Slam: 11,
  /** Rising out of the ground in view: harmless and still until it has arrived. */
  Arrive: 12,
} as const;
export type MState = (typeof MState)[keyof typeof MState];

/** Most books a character can equip (연구생, PLAN §7). */
export const MAX_WEAPONS = 6;
const PROOF_SLOTS = 4;
const CONTRIB_SLOTS = 8;
const STAMP_SLOTS = 12;

export class Player {
  readonly index: number;
  /** Session id. */
  id = "";
  /** Body slot in the synced state; the wire names other players by it. */
  slot = 0;
  /** Network entity id. */
  entity = 0;
  joined = false;
  x = 0;
  y = 0;
  facing: Facing = Facing.Down;
  /** Sequence number of the last input applied. */
  seq = 0;
  readonly r = PLAYER_RADIUS;
  /** How far the body moved last tick, px: 운동량's speed bonus and the AI read it. */
  movedX = 0;
  movedY = 0;
  /** Dodge roll: inputs left, and the step per input. */
  rollLeft = 0;
  rollDx = 0;
  rollDy = 0;
  invulnerableUntil = 0;
  dodgeReadyAt = 0;
  /** Movement the server imposes (knockback, dashes, auto rolls), px per tick. */
  forceX = 0;
  forceY = 0;
  forceTicks = 0;
  /** A server roll keeps its speed; a shove decays. */
  forceKeep = false;
  mode: Mode = Mode.Semi;
  kit!: PlayerKit;
  level = 1;
  exp = 0;
  hp = 1;
  shield = 0;
  shieldUntil = 0;
  /** Tick the player was knocked out, or -1. */
  downAt = -1;
  /** A reviver channelling on this player, and since when. */
  reviver = -1;
  reviveFrom = 0;
  contactSafeUntil = 0;
  /** Aim offset from the feet, px, while `aiming`. */
  aimX = 0;
  aimY = 0;
  aiming = false;
  /** Ticks until each weapon is ready; spent at 1 + attack speed per tick. */
  readonly ready = new Float64Array(MAX_WEAPONS);
  readonly burst = new Int32Array(MAX_WEAPONS);
  readonly burstHit = new Uint8Array(MAX_WEAPONS);
  readonly statusTurn = new Int32Array(MAX_WEAPONS);
  readonly grow = new Float64Array(MAX_WEAPONS);
  readonly growUntil = new Int32Array(MAX_WEAPONS);
  /** Best die rolled per weapon this fight (기댓값 정리). */
  readonly bestRoll = new Float64Array(MAX_WEAPONS);
  /** Manual casts asked for this tick, a bit per weapon. */
  casts = 0;
  /** From ally zones, until `buffUntil`. */
  attackSpeed = 0;
  cooldownBuff = 0;
  buffUntil = 0;
  party: string | null = null;
  minions = 0;
  /** EXP earned since the server last collected it. */
  expEarned = 0;
  /** Full-auto steering, kept between ticks so it turns smoothly. */
  aiX = 0;
  aiY = 0;
  aiHold = 0;
  aiKeep = 64;
  aiGoalX = 0;
  aiGoalY = 0;
  aiGoalUntil = 0;
  /** Damage the player took in the last ticks, for the AI's caution. */
  lastHurt = -1000;
  /** Connection dropped: the server plays it until it comes back. */
  away = false;
  /** Multiplies every EXP this player earns: the server's modifiers (숙면, 졸음, 급식 …). */
  expMult = 1;
  /** The kit at a new level; set by whoever seated the player. */
  rebuild: ((level: number) => PlayerKit) | null = null;

  constructor(index: number) {
    this.index = index;
  }

  get down(): boolean {
    return this.downAt >= 0;
  }
}

export class Monster {
  readonly index: number;
  alive = false;
  entity = 0;
  kind!: MonsterKind;
  level = 1;
  rank = 1;
  elite = false;
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  /** Knockback velocity, px per tick, and what launched it. */
  kx = 0;
  ky = 0;
  launchSpeed = 0;
  launchHit = 0;
  launchBy = -1;
  launchShare = 0;
  chain = 0;
  chainMax = 0;
  facing: Facing = Facing.Left;
  heading = 0;
  hp = 1;
  maxHp = 1;
  armor = 0;
  mass = 1;
  speed = 1;
  radius = 6;
  contact = 1;
  state: MState = MState.Move;
  stateUntil = 0;
  readyAt = 0;
  /** A charge or a shot's aim, px. */
  aimX = 0;
  aimY = 0;
  travelled = 0;
  target = -1;
  contactReadyAt = 0;
  born = 0;
  farSince = -1;
  /** Bombs and the golem's summons remember who they belong to. */
  owner = -1;
  readonly stacks: Uint8Array;
  readonly statusUntil: Int32Array;
  readonly statusPower: Float64Array;
  readonly statusBy: Int16Array;
  statusMask = 0;
  readonly proofBy = new Int16Array(PROOF_SLOTS).fill(-1);
  readonly proofStacks = new Uint8Array(PROOF_SLOTS);
  readonly proofLast = new Int32Array(PROOF_SLOTS);
  readonly contribBy = new Int16Array(CONTRIB_SLOTS).fill(-1);
  readonly contribDamage = new Float64Array(CONTRIB_SLOTS);
  /** Recent hits by effect stamp, for "once per cast" and per-body intervals. */
  readonly stampId = new Int32Array(STAMP_SLOTS);
  readonly stampTick = new Int32Array(STAMP_SLOTS);
  stampNext = 0;
  /** Set when anything hit it this tick; the client flashes it. */
  flash = false;
  /** Wire fields changed this tick. */
  dirty = 0;
  /** Best die rolled against it per player weapon (기댓값 정리), keyed player*8+slot. */
  rollKey = -1;
  rollBest = 0;
  dying = false;
  /** The weapon that landed the killing hit, for its on-kill hooks. */
  killedWith: Weapon | null = null;
  /** Set when it should leave without a death (despawned, escaped). */
  gone = false;

  constructor(index: number, statuses: number) {
    this.index = index;
    this.stacks = new Uint8Array(statuses);
    this.statusUntil = new Int32Array(statuses);
    this.statusPower = new Float64Array(statuses);
    this.statusBy = new Int16Array(statuses).fill(-1);
  }
}

/** Fields of a monster the wire carries beyond its position. */
export const Dirty = { State: 1, Hp: 2, Status: 4 } as const;

/** Effect kinds as the client draws them. */
export const FxKind = {
  Shot: 0,
  Lob: 1,
  EnemyShot: 2,
  Orbit: 3,
  Beam: 4,
  Chain: 5,
  Cone: 6,
  Mark: 7,
  Wave: 8,
  Zone: 9,
  Pool: 10,
  Trail: 11,
  Dash: 12,
  /** A monster's tell: charge line, fuse, slam. */
  Danger: 13,
  Burst: 14,
} as const;
export type FxKind = (typeof FxKind)[keyof typeof FxKind];

/** Anything drawn that is not an entity: shots, areas, orbits, beams, telegraphs. */
export class Effect {
  readonly index: number;
  alive = false;
  fx = 0;
  kind: FxKind = FxKind.Shot;
  born = 0;
  until = 0;
  /** Player index, or -1 for a monster's. */
  owner = -1;
  /** Monster pool index for a monster's effect. */
  source = -1;
  weapon: Weapon | null = null;
  slot = 0;
  cast = 0;
  /** Stamp for "once per cast" hit memory. */
  stamp = 0;
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  /** Fake height for lobbed shots. */
  z = 0;
  vz = 0;
  gravity = 0;
  tx = 0;
  ty = 0;
  angle = 0;
  radius = 0;
  length = 0;
  width = 0;
  speed = 0;
  range = 0;
  pierce = 0;
  bounce = 0;
  /** Damage multiplier on the weapon's hit, or an absolute amount for monsters' effects. */
  damage = 0;
  knock = 0;
  status = -1;
  statusStacks = 0;
  statusChance = 0;
  interval = 0;
  nextAt = 0;
  fireAt = 0;
  repeats = 0;
  pull = 0;
  spin = 0;
  growth = 0;
  follow = false;
  count = 0;
  phase = 0;
  /** Points of a beam's path, flat x,y pairs, and how many. */
  path: Float64Array = new Float64Array(0);
  points = 0;
  hitSomething = false;
  ricochets = 0;
  /** Chain: targets struck in order and the parent of each. */
  chain: Int32Array = new Int32Array(0);
  chainParent: Int32Array = new Int32Array(0);
  chainCount = 0;
  ended = 0;

  constructor(index: number) {
    this.index = index;
  }
}

/** A 생명 minion: walks, bites, divides. */
export class Minion {
  readonly index: number;
  alive = false;
  entity = 0;
  owner = -1;
  weapon: Weapon | null = null;
  slot = 0;
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  until = 0;
  divideAt = 0;
  /** 0 plain, 1 killer, 2 bursting, 3 healer (줄기세포). */
  role = 0;
  stamp = 0;
  born = 0;
  dirty = 0;

  constructor(index: number) {
    this.index = index;
  }
}

export class Pickup {
  readonly index: number;
  alive = false;
  id = 0;
  owner = -1;
  x = 0;
  y = 0;
  /** Where it flew from. */
  fromX = 0;
  fromY = 0;
  drop: SimDrop | null = null;
  born = 0;
  until = 0;

  constructor(index: number) {
    this.index = index;
  }
}

/** Things that happened this tick, for the network and the tests. */
export const Ev = {
  /** a attacker player, b monster pool index, c entity, d amount, e flags, f cast, x/y knock px/tick. */
  Hit: 1,
  /** a player, c source entity, d amount, e flags. */
  Hurt: 2,
  /** a killer player or -1, c entity, x, y. */
  Kill: 3,
  /** a player, d reaction index, x, y. */
  Reaction: 4,
  /** a player, d new level. */
  LevelUp: 5,
  /** a player. */
  Down: 6,
  /** a player, b reviver. */
  Revive: 7,
  /** a player: woke at the spawn after nobody came. */
  Wake: 8,
  /** a player, b pickup id. */
  Collect: 9,
  /** c healer entity, x, y, d radius. */
  Heal: 10,
  /** a player, c target entity, x, y. */
  Qed: 11,
  /** d 1 surge, 0 lull. */
  Phase: 12,
  /** c entity. */
  Elite: 13,
  /** a reviver. */
  Merit: 14,
  /** a player whose roll started; x, y direction. */
  Roll: 15,
  /** a player, b weapon slot, f cast id. */
  Cast: 16,
  /** a credited player, c monster entity, d kind index, e level, f 1 elite / 2 boss / 0. */
  Credit: 17,
} as const;

/** Bits of a Hit event's flags. */
export const HitFlag = {
  Crit: 1,
  Kill: 2,
  Qed: 4,
  Collision: 8,
  Dot: 16,
  Reaction: 32,
  Blocked: 64,
  Heavy: 128,
} as const;

/** Bits of a Hurt event's flags. */
export const HurtFlag = {
  Contact: 1,
  Shot: 2,
  Blast: 4,
  Slam: 8,
  Charge: 16,
  Shielded: 32,
  Down: 64,
} as const;

export class FightEvent {
  type = 0;
  a = -1;
  b = -1;
  c = 0;
  d = 0;
  e = 0;
  f = 0;
  x = 0;
  y = 0;
}

/** An effect that ended this tick, for the wire. */
export interface Ended {
  fx: number;
  x: number;
  y: number;
}

/** Why an entity left the world this tick. */
export const Gone = { Died: 0, Left: 1 } as const;

/** An entity that left the world this tick, for the wire. */
export interface Removed {
  entity: number;
  reason: number;
  x: number;
  y: number;
}

/** A drop its owner walked over this tick, for the grant. */
export interface Grant {
  player: Player;
  drop: SimDrop;
}

const MONSTER_CAP = 512;
const EFFECT_CAP = 1024;
const MINION_CAP = 256;
const PICKUP_CAP = 1024;

/**
 * The fight on one map: every player, monster, effect, minion and pickup, the field's pacing and
 * one seeded generator. Mutated in place by `step`; pools are allocated once, so a tick allocates
 * nothing on its hot paths. Iteration is always in pool order, which makes a run reproducible
 * from its seed and inputs.
 */
export class FightWorld {
  tick = 0;
  readonly random: Random;
  readonly rules: SimRules;
  readonly map: FightMap;
  readonly field: FieldRule | null;
  readonly width: number;
  readonly height: number;
  readonly cols: number;
  readonly rows: number;
  /** 0 open, 1 solid for walkers, 2 water (stops walkers, not shots), 3 closed to monsters only. */
  readonly tiles: Uint8Array;
  /** Map for monster movement: walls plus safe zones. */
  readonly monsterMap: Collidable;
  readonly players: Player[] = [];
  readonly monsters: Monster[] = [];
  readonly effects: Effect[] = [];
  readonly minions: Minion[] = [];
  readonly pickups: Pickup[] = [];
  readonly monsterHash: SpatialHash;
  readonly events: FightEvent[] = [];
  eventCount = 0;
  readonly ended: Ended[] = [];
  endedCount = 0;
  readonly removed: Removed[] = [];
  removedCount = 0;
  readonly grants: Grant[] = [];
  readonly flow: FlowField;
  /** Monsters spawned since the world began, for metrics. */
  spawned = 0;
  /** Monsters killed this tick, handled after every hit has landed. */
  readonly dead: Monster[] = [];
  /** What bodies removed between ticks left behind, ended at the next tick (`endDeparted`). */
  readonly departed: { effects: Effect[]; minions: Minion[] } = { effects: [], minions: [] };
  private nextEntity = 1;
  private readonly live = new Uint8Array(65536);
  private nextFx = 1;
  private nextPickup = 1;
  nextStamp = 1;
  nextCast = 1;
  /** Field director state. */
  readonly director = {
    startTick: 0,
    surge: true,
    kills: 0,
    eliteAt: 0,
    /** Respawn ticks queued by kills. */
    queue: [] as number[],
    tokens: 0,
    alive: 0,
    region: new Uint8Array(0),
    regionCount: 1,
    openingDone: false,
    /** A closed map (its Page not open yet) spawns nothing. */
    paused: false,
  };
  /** Effects that can hurt a player (tells, enemy shots), listed once a tick for the AI. */
  readonly dangers: Effect[] = [];
  /** Live pickups, listed once a tick. */
  readonly drops: Pickup[] = [];
  /** Live monsters of each kind, for roster caps. */
  readonly kindAlive: Int32Array;
  private pickupCursor = 0;
  /** Crowd pushes per monster, summed before they slide. */
  readonly pushX = new Float64Array(MONSTER_CAP);
  readonly pushY = new Float64Array(MONSTER_CAP);
  readonly scratch = new Int32Array(1024);
  readonly scratch2 = new Int32Array(1024);
  readonly scratch3 = new Int32Array(256);

  constructor(map: FightMap, rules: SimRules, field: FieldRule | null, seed: number) {
    this.map = map;
    this.rules = rules;
    this.field = field;
    this.random = new Random(seed);
    this.cols = map.collision.w;
    this.rows = map.collision.h;
    this.width = this.cols * TILE_SIZE;
    this.height = this.rows * TILE_SIZE;
    this.tiles = new Uint8Array(this.cols * this.rows);
    const monsterRows: string[] = [];
    for (let ty = 0; ty < this.rows; ty++) {
      const row = map.collision.rows[ty] ?? "";
      let out = "";
      for (let tx = 0; tx < this.cols; tx++) {
        const ch = row.charCodeAt(tx);
        const v = ch === 46 ? 0 : ch === 126 ? 2 : 1;
        this.tiles[ty * this.cols + tx] = v;
        out += v === 0 ? "." : "#";
      }
      monsterRows.push(out);
    }
    for (const r of map.safe) {
      for (let ty = r.y; ty < r.y + r.h; ty++) {
        const row = monsterRows[ty];
        if (row === undefined) continue;
        const chars = row.split("");
        for (let tx = r.x; tx < r.x + r.w; tx++) {
          if (tx < 0 || tx >= this.cols) continue;
          chars[tx] = "#";
          const i = ty * this.cols + tx;
          if (this.tiles[i] === 0) this.tiles[i] = 3;
        }
        monsterRows[ty] = chars.join("");
      }
    }
    this.monsterMap = { collision: { w: this.cols, h: this.rows, rows: monsterRows } };
    for (let i = 0; i < MONSTER_CAP; i++) this.monsters.push(new Monster(i, rules.statuses.length));
    for (let i = 0; i < EFFECT_CAP; i++) this.effects.push(new Effect(i));
    for (let i = 0; i < MINION_CAP; i++) this.minions.push(new Minion(i));
    for (let i = 0; i < PICKUP_CAP; i++) this.pickups.push(new Pickup(i));
    this.monsterHash = new SpatialHash(this.width, this.height, MONSTER_CAP);
    this.flow = new FlowField(this.cols, this.rows);
    this.kindAlive = new Int32Array(rules.monsters.length);
  }

  /** Records an entity leaving, for the wire. */
  leave(entity: number, reason: number, x: number, y: number): void {
    if (this.removedCount === this.removed.length)
      this.removed.push({ entity: 0, reason: 0, x: 0, y: 0 });
    const r = this.removed[this.removedCount++] as Removed;
    r.entity = entity;
    r.reason = reason;
    r.x = x;
    r.y = y;
  }

  // ── Tiles ────────────────────────────────────────────────────────────────

  /** 0 open, 1 wall, 2 water, 3 safe ground; outside the map is wall. */
  tileAt(x: number, y: number): number {
    const tx = Math.floor(x / TILE_SIZE);
    const ty = Math.floor(y / TILE_SIZE);
    if (tx < 0 || ty < 0 || tx >= this.cols || ty >= this.rows) return 1;
    return this.tiles[ty * this.cols + tx] as number;
  }

  /** Whether a flying shot stops here: walls do, water and safe ground do not. */
  wallAt(x: number, y: number): boolean {
    return this.tileAt(x, y) === 1;
  }

  inSafe(x: number, y: number): boolean {
    return this.tileAt(x, y) === 3;
  }

  // ── Ids ──────────────────────────────────────────────────────────────────

  /** A network id no live entity holds. */
  allocEntity(): number {
    for (;;) {
      const id = this.nextEntity;
      this.nextEntity = id >= 65535 ? 1 : id + 1;
      if (!this.live[id]) {
        this.live[id] = 1;
        return id;
      }
    }
  }

  freeEntity(id: number): void {
    this.live[id] = 0;
  }

  allocFx(): number {
    const id = this.nextFx;
    this.nextFx = id >= 65535 ? 1 : id + 1;
    return id;
  }

  allocPickup(): number {
    const id = this.nextPickup;
    this.nextPickup = id >= 65535 ? 1 : id + 1;
    return id;
  }

  // ── Events ───────────────────────────────────────────────────────────────

  event(type: number): FightEvent {
    if (this.eventCount === this.events.length) this.events.push(new FightEvent());
    const e = this.events[this.eventCount++] as FightEvent;
    e.type = type;
    e.a = -1;
    e.b = -1;
    e.c = 0;
    e.d = 0;
    e.e = 0;
    e.f = 0;
    e.x = 0;
    e.y = 0;
    return e;
  }

  /**
   * An effect changed course in a way the client cannot foresee (a ricochet, a bounce, a merged
   * pool): the wire ends the old record and sends it again from here under a new id.
   */
  reissueFx(e: Effect): void {
    if (this.endedCount === this.ended.length) this.ended.push({ fx: 0, x: 0, y: 0 });
    const rec = this.ended[this.endedCount++] as Ended;
    rec.fx = e.fx;
    rec.x = e.x;
    rec.y = e.y;
    e.fx = this.allocFx();
    e.born = this.tick;
  }

  endFx(e: Effect): void {
    if (!e.alive) return;
    e.alive = false;
    e.ended = this.tick;
    if (this.endedCount === this.ended.length) this.ended.push({ fx: 0, x: 0, y: 0 });
    const rec = this.ended[this.endedCount++] as Ended;
    rec.fx = e.fx;
    rec.x = e.x;
    rec.y = e.y;
  }

  // ── Pools ────────────────────────────────────────────────────────────────

  private monsterCursor = 0;
  private effectCursor = 0;

  freeMonster(): Monster | null {
    const n = this.monsters.length;
    for (let k = 0; k < n; k++) {
      const i = (this.monsterCursor + k) % n;
      const m = this.monsters[i] as Monster;
      if (m.alive) continue;
      this.monsterCursor = (i + 1) % n;
      return m;
    }
    return null;
  }

  freeEffect(): Effect | null {
    const n = this.effects.length;
    for (let k = 0; k < n; k++) {
      const i = (this.effectCursor + k) % n;
      const e = this.effects[i] as Effect;
      if (!e.alive) {
        this.effectCursor = (i + 1) % n;
        e.alive = true;
        e.fx = this.allocFx();
        e.born = this.tick;
        e.owner = -1;
        e.source = -1;
        e.weapon = null;
        e.stamp = this.nextStamp++;
        e.hitSomething = false;
        e.points = 0;
        e.chainCount = 0;
        e.status = -1;
        e.statusStacks = 0;
        e.statusChance = 0;
        e.z = 0;
        e.vz = 0;
        e.gravity = 0;
        e.pull = 0;
        e.spin = 0;
        e.growth = 0;
        e.follow = false;
        e.repeats = 0;
        e.ricochets = 0;
        e.knock = 0;
        e.count = 0;
        e.phase = 0;
        e.interval = 0;
        e.nextAt = 0;
        e.fireAt = 0;
        e.cast = 0;
        e.slot = 0;
        e.pierce = 0;
        e.bounce = 0;
        return e;
      }
    }
    return null;
  }

  freeMinion(): Minion | null {
    for (const m of this.minions) if (!m.alive) return m;
    return null;
  }

  freePickup(): Pickup | null {
    const n = this.pickups.length;
    for (let k = 0; k < n; k++) {
      const i = (this.pickupCursor + k) % n;
      const p = this.pickups[i] as Pickup;
      if (p.alive) continue;
      this.pickupCursor = (i + 1) % n;
      return p;
    }
    return null;
  }

  /** Lists this tick's dangers and drops for everyone who reads them. */
  listShared(): void {
    this.dangers.length = 0;
    for (const e of this.effects) {
      if (e.alive && (e.kind === FxKind.Danger || e.kind === FxKind.EnemyShot))
        this.dangers.push(e);
    }
    this.drops.length = 0;
    for (const k of this.pickups) if (k.alive) this.drops.push(k);
  }

  // ── Players ──────────────────────────────────────────────────────────────

  /** Seats a player at (x, y) with its kit. Indices are reused, longest free first. */
  addPlayer(id: string, slot: number, x: number, y: number, kit: PlayerKit, level: number): Player {
    let p = this.players.find((q) => !q.joined);
    if (!p) {
      p = new Player(this.players.length);
      this.players.push(p);
    }
    resetPlayer(p);
    p.id = id;
    p.slot = slot;
    p.entity = this.allocEntity();
    p.joined = true;
    p.x = snap(x);
    p.y = snap(y);
    p.level = level;
    p.aiKeep = 52 + this.random.int(25);
    this.setKit(p, kit);
    p.hp = kit.maxHp;
    // Books open staggered so a new arrival does not fire everything at once.
    for (let i = 0; i < kit.weapons.length; i++) p.ready[i] = 4 + i * 3;
    return p;
  }

  setKit(p: Player, kit: PlayerKit): void {
    const share = p.kit ? p.hp / p.kit.maxHp : 1;
    p.kit = kit;
    p.hp = Math.min(kit.maxHp, Math.max(p.down ? 0 : 1, share * kit.maxHp));
  }

  /**
   * Takes a body out of the fight, between ticks: nothing in the world names its index after this
   * (tags, damage over time, launches, proof stacks, targets, revives), and its effects, minions
   * and drops end at the start of the next tick, where the wire hears about them.
   */
  removePlayer(id: string): void {
    const p = this.players.find((q) => q.joined && q.id === id);
    if (!p) return;
    p.joined = false;
    this.freeEntity(p.entity);
    const i = p.index;
    for (const n of this.minions) if (n.alive && n.owner === i) this.departed.minions.push(n);
    for (const e of this.effects) if (e.alive && e.owner === i) this.departed.effects.push(e);
    for (const k of this.pickups) if (k.alive && k.owner === i) k.alive = false;
    for (const q of this.players) if (q.reviver === i) q.reviver = -1;
    for (const m of this.monsters) {
      if (!m.alive) continue;
      for (let s = 0; s < m.contribBy.length; s++) {
        if (m.contribBy[s] !== i) continue;
        m.contribBy[s] = -1;
        m.contribDamage[s] = 0;
      }
      for (let s = 0; s < m.statusBy.length; s++) if (m.statusBy[s] === i) m.statusBy[s] = -1;
      for (let s = 0; s < m.proofBy.length; s++) {
        if (m.proofBy[s] !== i) continue;
        m.proofBy[s] = -1;
        m.proofStacks[s] = 0;
      }
      if (m.launchBy === i) m.launchBy = -1;
      if (m.target === i) m.target = -1;
    }
    resetPlayer(p);
  }

  /** Ends what departed bodies left behind; the step calls it first, after the counters reset. */
  endDeparted(): void {
    const d = this.departed;
    for (const e of d.effects) if (e.alive) this.endFx(e);
    for (const n of d.minions) if (n.alive) this.killMinion(n);
    d.effects.length = 0;
    d.minions.length = 0;
  }

  playerById(id: string): Player | undefined {
    return this.players.find((q) => q.joined && q.id === id);
  }

  killMinion(m: Minion): void {
    if (!m.alive) return;
    m.alive = false;
    this.leave(m.entity, Gone.Left, m.x, m.y);
    this.freeEntity(m.entity);
    const owner = this.players[m.owner];
    if (owner) owner.minions = Math.max(0, owner.minions - 1);
  }
}

/**
 * Every per-body field of a pooled player back to how a new body starts, so nothing of the last
 * occupant (its mode, buffs, cooldowns, aim, party, revive, EXP) carries over to the next.
 */
export function resetPlayer(p: Player): void {
  p.id = "";
  p.slot = 0;
  p.entity = 0;
  p.x = 0;
  p.y = 0;
  p.facing = Facing.Down;
  p.seq = 0;
  p.movedX = 0;
  p.movedY = 0;
  p.rollLeft = 0;
  p.rollDx = 0;
  p.rollDy = 0;
  p.invulnerableUntil = 0;
  p.dodgeReadyAt = 0;
  p.forceX = 0;
  p.forceY = 0;
  p.forceTicks = 0;
  p.forceKeep = false;
  p.mode = Mode.Semi;
  p.level = 1;
  p.exp = 0;
  p.hp = 1;
  p.shield = 0;
  p.shieldUntil = 0;
  p.downAt = -1;
  p.reviver = -1;
  p.reviveFrom = 0;
  p.contactSafeUntil = 0;
  p.aimX = 0;
  p.aimY = 0;
  p.aiming = false;
  p.ready.fill(0);
  p.burst.fill(0);
  p.burstHit.fill(0);
  p.statusTurn.fill(0);
  p.grow.fill(0);
  p.growUntil.fill(0);
  p.bestRoll.fill(0);
  p.casts = 0;
  p.attackSpeed = 0;
  p.cooldownBuff = 0;
  p.buffUntil = 0;
  p.party = null;
  p.minions = 0;
  p.expEarned = 0;
  p.aiX = 0;
  p.aiY = 0;
  p.aiHold = 0;
  p.aiKeep = 64;
  p.aiGoalX = 0;
  p.aiGoalY = 0;
  p.aiGoalUntil = 0;
  p.lastHurt = -1000;
  p.away = false;
  p.expMult = 1;
  p.rebuild = null;
}
