/**
 * Duels on a 콜로세움 floor (PLAN §14): player versus player inside the one fight step.
 *
 * Every fighter gets a stand-in: a monster body past the pool that takes the fighter's place
 * while players' books, effects and minions act, then gives back what struck it. So every attack
 * kind, status, reaction, knockback and class signature works on a player exactly as on a monster,
 * with no second copy of the attack code. A stand-in is alive only inside that window, so monster
 * thinking, the director, drops and the wire never see one. Each acting player's queries hide its
 * own side's stand-ins (`FightWorld.actAs`), and a non-fighter sees none, so a spectator's book
 * can neither hit nor aim at a fighter. A world without a `DuelFloor` has no stand-ins at all:
 * there is no path by which one player's attack reaches another outside a duel.
 *
 * Normalised (PLAN §14): everyone fights at the duel level with the same grade, 필기, tool level
 * and no stat points, buffs or set bonuses; what carries over is the class and minor, which books
 * and tools are worn, and which books evolved. `duelBuild` and `duelKit` are that rule.
 *
 * Rounds are tick-driven and deterministic: countdown, fight, a short break, again until one side
 * has won enough rounds. The server seats the fighters, moves them, and reads `state` and `result`.
 */
import type { TileCollision } from "../collision.ts";
import { collisionDamage, elasticCollision } from "../combat.ts";
import { TICK_RATE_HZ, TILE_SIZE } from "../constants.ts";
import { Facing, slide, snap } from "../movement.ts";
import { NO_STATS } from "../stats.ts";
import { hurtPlayer, slowOf, tickStatuses } from "./damage.ts";
import type { MonsterKind, PlayerBuild, PlayerKit, SimRules } from "./rules.ts";
import {
  Ev,
  type FightEvent,
  type FightWorld,
  FxKind,
  HitFlag,
  MAX_WEAPONS,
  MONSTER_CAP,
  type Mode,
  Monster,
  MState,
  type Player,
  type PvpHook,
  type TileRect,
} from "./world.ts";

export const DUEL_MODES = ["1v1", "3v3"] as const;
export type DuelMode = (typeof DUEL_MODES)[number];
/** Fighters a side. */
export const TEAM_SIZE: Readonly<Record<DuelMode, number>> = { "1v1": 1, "3v3": 3 };
/** Most fighters one floor holds. */
export const MAX_FIGHTERS = 6;

/** The fixed values a duel flattens everyone to (content `duel.ts`). */
export interface DuelNorms {
  readonly level: number;
  /** Book grade index (0 교과서) and 필기 every book fights at. */
  readonly grade: number;
  readonly pilgi: number;
  /** Every worn tool's level. */
  readonly toolLevel: number;
  /** Books and tools carried in, from the first slot. */
  readonly books: number;
  readonly tools: number;
  /** Multiplies the normalised kit's health: a duel is a contest, not a one-shot. */
  readonly hp: number;
  /** Multiplies every hit a fighter lands. */
  readonly damage: number;
  /** And by the fighter's 전공: brings each class's single-target damage to the same level. */
  readonly classDamage: Readonly<Record<string, number>>;
  /** Multiplies knockback on a fighter, and a fighter's mass for it. */
  readonly knock: number;
  readonly mass: number;
}

/** Round timing in ticks, and how many rounds decide a match. */
export interface DuelTiming {
  readonly countdown: number;
  readonly round: number;
  readonly pause: number;
  /** Rounds a side must win. */
  readonly wins: number;
  /** Rounds played at most (drawn rounds count). */
  readonly maxRounds: number;
  /** A round in which nobody lands a hit for this long is decided on health at once. */
  readonly idle: number;
  /** Fighting time over the whole match; past it the round is decided on health, then the match. */
  readonly matchCap: number;
}

/** What a character has on: worn books and tools in slot order. Levels, grades and 필기 do not
 * matter here; they are flattened. */
export interface DuelGear {
  readonly books: readonly { readonly def: string; readonly evolved: boolean }[];
  readonly tools: readonly { readonly def: string }[];
}

/**
 * The build a character duels with (PLAN §14 normalised): its 전공 and 부전공, its first
 * `norms.books` books (and whether each evolved) and first `norms.tools` tools, every one at the
 * duel level, grade, 필기 and tool level, with no stat points.
 */
export function duelBuild(
  major: string,
  minor: string | null,
  gear: DuelGear,
  norms: DuelNorms,
): PlayerBuild {
  return {
    major,
    minor,
    level: norms.level,
    stats: NO_STATS,
    books: gear.books.slice(0, norms.books).map((b) => ({
      def: b.def,
      level: norms.level,
      grade: norms.grade,
      pilgi: norms.pilgi,
      evolved: b.evolved,
    })),
    tools: gear.tools.slice(0, norms.tools).map((t) => ({ def: t.def, level: norms.toolLevel })),
  };
}

/**
 * The kit a fighter duels with: the build's kit with the duel's health and damage, no living-world
 * modifiers, and the control mode's damage bonus taken back out, so playing by hand is a choice
 * of control, never of numbers. Nothing a fighter does in a duel drops anything.
 */
export function duelKit(
  rules: SimRules,
  build: PlayerBuild,
  norms: DuelNorms,
  mode: Mode,
): PlayerKit {
  const kit = rules.kit(build);
  return {
    ...kit,
    damage: (norms.damage * (norms.classDamage[build.major] ?? 1)) / (rules.modeBonus[mode] ?? 1),
    maxHp: kit.maxHp * norms.hp,
    dropMult: 0,
    coinMult: 0,
  };
}

/** Where a duel stands. */
export const DuelPhase = { Idle: 0, Countdown: 1, Fight: 2, Pause: 3, Over: 4 } as const;
export type DuelPhase = (typeof DuelPhase)[keyof typeof DuelPhase];

/** How a round was decided. */
export const RoundEnd = { Knockout: 0, Time: 1, Forfeit: 2 } as const;
export type RoundEnd = (typeof RoundEnd)[keyof typeof RoundEnd];

export interface RoundResult {
  /** 1 or 2; 0 for a drawn round. */
  readonly winner: number;
  readonly ticks: number;
  readonly end: RoundEnd;
}

/** One fighter in a match and what it did. */
export interface Fighter {
  readonly player: Player;
  /** Session id when it was enlisted: the player slot may be reused after it leaves. */
  readonly id: string;
  readonly team: number;
  readonly mark: { readonly x: number; readonly y: number };
  readonly standIn: Monster;
  /** Forfeited (left, dropped, conceded): out of every round that follows. */
  out: boolean;
  /** Damage it dealt to the other side, hits it landed, times it was knocked out. */
  damage: number;
  hits: number;
  downs: number;
  /** The last launch onto it, for 운동량 collisions. */
  launchHit: number;
  launchBy: number;
  launchShare: number;
  launchSpeed: number;
  chain: number;
  chainMax: number;
}

export interface DuelResult {
  /** 1 or 2; 0 for a draw. */
  readonly winner: number;
  readonly rounds: readonly RoundResult[];
  /** Fight ticks over every round. */
  readonly ticks: number;
  readonly fighters: readonly {
    readonly id: string;
    readonly team: number;
    readonly damage: number;
    readonly hits: number;
    readonly downs: number;
    readonly forfeited: boolean;
  }[];
}

/** A knocked fighter faster than this, px per tick, hits a teammate it runs into (30 px/s). */
const COLLIDE_SPEED = 30 / TICK_RATE_HZ;
/** Knockback on a fighter stops below this, px per tick (as a monster's). */
const KNOCK_STOP = 2 / TICK_RATE_HZ;
const SHOVE_DECAY = 0.85;
const STANDINS = 8;
/** A body's heading by facing (down, up, left, right). */
const HEADING = [Math.PI / 2, -Math.PI / 2, Math.PI, 0];

/** The stand-in's kind: a plain body the shape and aim code accept like any monster. */
function standInKind(rules: SimRules, norms: DuelNorms): MonsterKind {
  const base = rules.monsters[0] as MonsterKind;
  return {
    ...base,
    index: -1,
    id: "fighter",
    mass: norms.mass,
    armor: 0,
    innate: 0,
    immune: 0,
    autoAimRange: Number.POSITIVE_INFINITY,
    aimPriority: 1,
    promotable: false,
    packMin: 0,
    packMax: 0,
    splitInto: -1,
  };
}

/**
 * One duel floor on a world: its bounds, the match on it, and the stand-ins. Created once per
 * world that has a floor; a match is `start`ed on it, plays out, and is `clear`ed.
 */
export class DuelFloor implements PvpHook {
  readonly rect: TileRect;
  readonly norms: DuelNorms;
  readonly timing: DuelTiming;
  readonly fighters: Fighter[] = [];
  phase: DuelPhase = DuelPhase.Idle;
  /** Tick the current phase ends at (countdown, round clock, pause). */
  phaseEnds = 0;
  /** The round being played, from 1. */
  round = 0;
  /** Rounds won, by team (index 1 and 2). */
  readonly score = [0, 0, 0];
  readonly rounds: RoundResult[] = [];
  /** Set whenever phase, round, score or who fights changed; the server clears it. */
  changed = false;
  /** Set once the match is decided. */
  result: DuelResult | null = null;
  hit: FightEvent | null = null;
  private roundFrom = 0;
  private fightTicks = 0;
  /** Tick of the last damage either side dealt this round. */
  private lastDamage = 0;
  private readonly kind: MonsterKind;
  private readonly bodies: Monster[] = [];
  private readonly hideAll: Uint8Array;
  private readonly hideSide: Uint8Array[];
  private raised = false;
  private readonly x0: number;
  private readonly y0: number;
  private readonly x1: number;
  private readonly y1: number;

  constructor(w: FightWorld, rect: TileRect, norms: DuelNorms, timing: DuelTiming) {
    if (w.field) throw new Error("a duel floor needs a world without a hunting field");
    this.rect = rect;
    this.norms = norms;
    this.timing = timing;
    this.kind = standInKind(w.rules, norms);
    for (let i = 0; i < STANDINS; i++) {
      const m = new Monster(MONSTER_CAP + i, w.rules.statuses.length);
      w.monsters[MONSTER_CAP + i] = m;
      this.bodies.push(m);
    }
    const size = MONSTER_CAP + STANDINS;
    this.hideAll = new Uint8Array(size);
    for (const m of this.bodies) this.hideAll[m.index] = 1;
    this.hideSide = [new Uint8Array(size), new Uint8Array(size), new Uint8Array(size)];
    this.x0 = rect.x * TILE_SIZE;
    this.y0 = rect.y * TILE_SIZE;
    this.x1 = (rect.x + rect.w) * TILE_SIZE;
    this.y1 = (rect.y + rect.h) * TILE_SIZE;
    w.pvp = this;
  }

  /** Whether a point lies on the floor. */
  contains(x: number, y: number): boolean {
    return x >= this.x0 && x < this.x1 && y >= this.y0 && y < this.y1;
  }

  /** A match is set up or running. */
  get busy(): boolean {
    return this.phase !== DuelPhase.Idle;
  }

  fighterOf(p: Player): Fighter | undefined {
    return this.fighters.find((f) => f.player === p && f.id === p.id && !f.out);
  }

  /**
   * Starts a match: each player joins its side at its mark and the first countdown begins. The
   * caller has given each player its duel kit and level. A player's party becomes its side for the
   * match, so allies' zones and the party orbit reach teammates and nobody else.
   */
  start(
    w: FightWorld,
    entries: readonly { player: Player; team: number; mark: { x: number; y: number } }[],
  ): void {
    if (this.busy) throw new Error("the floor already holds a match");
    if (entries.length > STANDINS) throw new Error("too many fighters for one floor");
    this.fighters.length = 0;
    this.rounds.length = 0;
    this.score.fill(0);
    this.round = 0;
    this.fightTicks = 0;
    this.result = null;
    for (const side of this.hideSide) side.fill(0);
    entries.forEach((e, i) => {
      const body = this.bodies[i] as Monster;
      const p = e.player;
      p.team = e.team;
      p.party = `duel:${e.team}`;
      body.fighter = p.index;
      (this.hideSide[e.team] as Uint8Array)[body.index] = 1;
      this.fighters.push({
        player: p,
        id: p.id,
        team: e.team,
        mark: { x: e.mark.x, y: e.mark.y },
        standIn: body,
        out: false,
        damage: 0,
        hits: 0,
        downs: 0,
        launchHit: 0,
        launchBy: -1,
        launchShare: 0,
        launchSpeed: 0,
        chain: 0,
        chainMax: 0,
      });
    });
    this.beginRound(w);
  }

  /**
   * Takes a fighter out of the match for good (it left, dropped or conceded). It keeps its body
   * but stops being a fighter at once; the server moves it off the floor. A side with nobody left
   * loses the round and the match.
   */
  forfeit(w: FightWorld, id: string): boolean {
    const f = this.fighters.find((x) => x.id === id && !x.out);
    if (!f) return false;
    f.out = true;
    this.discharge(w, f);
    this.changed = true;
    if (this.phase === DuelPhase.Over || this.phase === DuelPhase.Idle) return true;
    const left = this.sideLeft(f.team);
    if (left === 0) {
      const other = f.team === 1 ? 2 : 1;
      this.decideRound(w, other, RoundEnd.Forfeit);
      this.finish(other);
    }
    return true;
  }

  /** Ends the match and frees the floor; every remaining fighter stops being one. */
  clear(w: FightWorld): void {
    for (const f of this.fighters) if (!f.out) this.discharge(w, f);
    this.fighters.length = 0;
    this.phase = DuelPhase.Idle;
    this.raised = false;
    this.changed = true;
  }

  // ── The step's hooks ───────────────────────────────────────────────────────

  before(w: FightWorld): void {
    for (const f of this.fighters) f.player.flash = false;
    if (this.phase !== DuelPhase.Fight) return;
    const hash = w.monsterHash;
    for (const f of this.fighters) {
      const m = f.standIn;
      const p = f.player;
      if (f.out || !p.joined || p.id !== f.id || p.down) {
        m.alive = false;
        continue;
      }
      m.alive = true;
      m.dying = false;
      m.x = p.x;
      m.y = p.y;
      m.kx = 0;
      m.ky = 0;
      m.facing = p.facing;
      m.heading = HEADING[p.facing] ?? 0;
      hash.insert(m.index, m.x, m.y);
    }
    this.raised = true;
  }

  after(w: FightWorld): void {
    if (this.raised) this.lower(w);
    this.raised = false;
    w.monsterHash.skip = null;
    if (this.phase === DuelPhase.Idle) return;
    // No monster lives on a floor's world while a match is on it.
    for (let i = 0; i < MONSTER_CAP; i++) {
      const m = w.monsters[i] as Monster;
      if (m.alive && !m.dying) m.gone = true;
    }
    for (const f of this.fighters) {
      if (!f.out && f.player.joined && f.player.id === f.id) this.keepInside(f.player);
    }
    this.rules(w);
  }

  hidden(actor: number): Uint8Array | null {
    if (this.phase !== DuelPhase.Fight) return this.hideAll;
    const p = this.fightingAt(actor);
    return p ? (this.hideSide[p.team] as Uint8Array) : this.hideAll;
  }

  land(
    w: FightWorld,
    by: Player | null,
    m: Monster,
    amount: number,
    fromX: number,
    fromY: number,
    knock: number,
    flags: number,
    cast: number,
    slot: number,
  ): number {
    this.hit = null;
    const f = this.fighters.find((x) => x.standIn === m);
    if (!f || f.out || this.phase !== DuelPhase.Fight) return 0;
    const from = by ? this.fighterOf(by) : undefined;
    // Only the other side's fighters reach a stand-in; the queries already hide the rest.
    if (by && (!from || from.team === f.team)) return 0;
    const dealt = this.strike(w, from ?? null, f, amount, flags, cast, slot);
    if (dealt > 0 && knock > 0) this.launch(f, from ?? null, fromX, fromY, knock, dealt);
    return dealt;
  }

  // ── Inside ─────────────────────────────────────────────────────────────────

  private fightingAt(index: number): Fighter | undefined {
    const p = this.fighters.find((f) => f.player.index === index && !f.out);
    return p && p.player.id === p.id ? p : undefined;
  }

  /** Damage onto a fighter through its i-frames, shield and knock-out, with the hit for the wire. */
  private strike(
    w: FightWorld,
    from: Fighter | null,
    f: Fighter,
    amount: number,
    flags: number,
    cast: number,
    slot: number,
  ): number {
    const q = f.player;
    if (!q.joined || q.down || w.tick < q.invulnerableUntil || amount <= 0) return 0;
    hurtPlayer(w, q, amount, from ? from.player.entity : 0, 0);
    q.flash = true;
    this.lastDamage = w.tick;
    if (q.down) f.downs++;
    if (!from) return amount;
    from.damage += amount;
    if (!(flags & HitFlag.Dot)) from.hits++;
    const ev = w.event(Ev.Hit);
    ev.a = from.player.index;
    ev.b = f.standIn.index;
    ev.c = q.entity;
    ev.d = amount;
    ev.e = flags | (q.down ? HitFlag.Kill : 0) | ((slot & 15) << 8);
    ev.f = cast;
    ev.x = f.standIn.kx;
    ev.y = f.standIn.ky;
    this.hit = ev;
    return amount;
  }

  /** Knockback onto a fighter, as a monster's (knock ÷ mass) scaled by the duel's knock. */
  private launch(
    f: Fighter,
    from: Fighter | null,
    fromX: number,
    fromY: number,
    knock: number,
    hit: number,
  ): void {
    const m = f.standIn;
    let dx = m.x - fromX;
    let dy = m.y - fromY;
    let d = Math.sqrt(dx * dx + dy * dy);
    if (d < 1e-6) {
      dx = m.facing === Facing.Right ? -1 : 1;
      dy = 0;
      d = 1;
    }
    const v = (knock * this.norms.knock) / this.norms.mass / TICK_RATE_HZ;
    m.kx += (dx / d) * v;
    m.ky += (dy / d) * v;
    if (!from) return;
    const share = from.player.kit.collisionShare;
    f.launchHit = hit;
    f.launchBy = from.player.index;
    f.launchShare = share;
    f.launchSpeed = Math.sqrt(m.kx * m.kx + m.ky * m.ky);
    f.chain = 0;
    f.chainMax = 3;
  }

  /** Statuses tick on the stand-ins, then what moved them moves the fighters. */
  private lower(w: FightWorld): void {
    for (const f of this.fighters) {
      const m = f.standIn;
      if (!m.alive) continue;
      tickStatuses(w, m);
      const p = f.player;
      p.statusMask = m.statusMask;
      p.slow = slowOf(w, m);
      // Carried (a dash) or pulled in place: the fighter follows, through walls as walking does.
      const dx = m.x - p.x;
      const dy = m.y - p.y;
      if ((dx !== 0 || dy !== 0) && !p.down) {
        const at = slide(w.map, p.x, p.y, dx, dy, p.r);
        p.x = snap(at.x);
        p.y = snap(at.y);
      }
      if ((m.kx !== 0 || m.ky !== 0) && !p.down) this.shove(p, m.kx, m.ky);
      m.alive = false;
    }
    this.collide(w);
  }

  /** Adds a velocity to a fighter's imposed movement, decaying as knockback does. */
  private shove(p: Player, vx: number, vy: number): void {
    p.forceX = (p.forceTicks > 0 && !p.forceKeep ? p.forceX : 0) + vx;
    p.forceY = (p.forceTicks > 0 && !p.forceKeep ? p.forceY : 0) + vy;
    p.forceKeep = false;
    p.rollLeft = 0;
    const speed = Math.sqrt(p.forceX * p.forceX + p.forceY * p.forceY);
    p.forceTicks =
      speed <= KNOCK_STOP ? 0 : Math.ceil(Math.log(KNOCK_STOP / speed) / Math.log(SHOVE_DECAY));
  }

  /**
   * 운동량 on a floor: a fighter knocked fast into a teammate passes the momentum on, and with
   * the launcher's 운동량 both take a share of the launching hit (PLAN §6 physics).
   */
  private collide(w: FightWorld): void {
    for (const a of this.fighters) {
      const p = a.player;
      if (a.out || p.down || p.forceTicks === 0 || a.launchBy < 0 || a.chain >= a.chainMax)
        continue;
      const speed = Math.sqrt(p.forceX * p.forceX + p.forceY * p.forceY);
      if (speed < COLLIDE_SPEED) continue;
      for (const b of this.fighters) {
        if (b === a || b.out || b.team !== a.team) continue;
        const q = b.player;
        if (q.down || !q.joined) continue;
        const dx = q.x - p.x;
        const dy = q.y - p.y;
        const rr = p.r + q.r + 2;
        const d2 = dx * dx + dy * dy;
        if (d2 > rr * rr || d2 < 1e-9) continue;
        const d = Math.sqrt(d2);
        const nx = dx / d;
        const ny = dy / d;
        const along = p.forceX * nx + p.forceY * ny;
        if (along <= COLLIDE_SPEED) continue;
        const { a: keep, b: pass } = elasticCollision(along, this.norms.mass, this.norms.mass);
        p.forceX += (keep - along) * nx;
        p.forceY += (keep - along) * ny;
        this.shove(q, pass * nx, pass * ny);
        b.launchHit = a.launchHit;
        b.launchBy = a.launchBy;
        b.launchShare = a.launchShare;
        b.launchSpeed = Math.max(b.launchSpeed, pass);
        b.chain = a.chain + 1;
        b.chainMax = a.chainMax;
        const by = this.fightingAt(a.launchBy) ?? null;
        if (by && a.launchShare > 0) {
          const dmg = collisionDamage(
            a.launchHit,
            along * TICK_RATE_HZ,
            a.launchSpeed * TICK_RATE_HZ,
            a.launchShare,
          );
          if (dmg > 0) {
            this.strike(w, by, b, dmg, HitFlag.Collision, 0, -1);
            this.strike(w, by, a, dmg, HitFlag.Collision, 0, -1);
          }
        }
        a.chain++;
        if (a.chain >= a.chainMax) break;
      }
    }
  }

  /** Nothing carries a fighter off the floor: the rail holds it, and this catches the rest. */
  private keepInside(p: Player): void {
    const r = p.r;
    const x = Math.min(this.x1 - r - 1, Math.max(this.x0 + r + 1, p.x));
    const y = Math.min(this.y1 - r - 1, Math.max(this.y0 + r + 1, p.y));
    if (x === p.x && y === p.y) return;
    p.x = snap(x);
    p.y = snap(y);
    p.forceTicks = 0;
    p.rollLeft = 0;
  }

  private sideLeft(team: number): number {
    let n = 0;
    for (const f of this.fighters) {
      if (f.team !== team || f.out) continue;
      const p = f.player;
      if (p.joined && p.id === f.id && !p.down) n++;
    }
    return n;
  }

  private sideHealth(team: number): number {
    let sum = 0;
    for (const f of this.fighters) {
      if (f.team !== team || f.out) continue;
      const p = f.player;
      if (p.joined && p.id === f.id && !p.down) sum += p.hp / p.kit.maxHp;
    }
    return sum;
  }

  /** The round clock: countdown, fight, pause, next round, until a side has won enough. */
  private rules(w: FightWorld): void {
    const tick = w.tick;
    switch (this.phase) {
      case DuelPhase.Countdown:
        if (tick < this.phaseEnds) return;
        // Both sides start the fight from the same clean state, and move from now on.
        this.clearCasts(w);
        for (const f of this.fighters) if (!f.out) this.freshen(f.player);
        this.freeze(false);
        this.phase = DuelPhase.Fight;
        this.phaseEnds = tick + this.timing.round;
        this.roundFrom = tick;
        this.lastDamage = tick;
        this.changed = true;
        return;
      case DuelPhase.Fight: {
        const a = this.sideLeft(1);
        const b = this.sideLeft(2);
        const capped = this.fightTicks + (tick - this.roundFrom) >= this.timing.matchCap;
        const idle = tick - this.lastDamage >= this.timing.idle;
        if (a > 0 && b > 0 && tick < this.phaseEnds && !capped && !idle) return;
        let winner = 0;
        let end: RoundEnd = RoundEnd.Knockout;
        if (a === 0 || b === 0) winner = a > 0 ? 1 : b > 0 ? 2 : 0;
        else {
          // At the clock, at the match's cap, or after a lull with no hit landed (decided now,
          // not a floor held for the whole clock): on health standing, a draw when it is equal.
          end = RoundEnd.Time;
          const ha = this.sideHealth(1);
          const hb = this.sideHealth(2);
          winner = ha > hb ? 1 : hb > ha ? 2 : 0;
        }
        this.decideRound(w, winner, end);
        const won = this.score[1] as number;
        const lost = this.score[2] as number;
        if (won >= this.timing.wins || lost >= this.timing.wins) {
          this.finish(won > lost ? 1 : 2);
        } else if (this.rounds.length >= this.timing.maxRounds || capped) {
          this.finish(won > lost ? 1 : lost > won ? 2 : 0);
        } else {
          this.phase = DuelPhase.Pause;
          this.phaseEnds = tick + this.timing.pause;
          this.freeze(true);
        }
        return;
      }
      case DuelPhase.Pause:
        if (tick >= this.phaseEnds) this.beginRound(w);
        return;
      default:
        return;
    }
  }

  private decideRound(w: FightWorld, winner: number, end: RoundEnd): void {
    if (this.phase !== DuelPhase.Fight && end !== RoundEnd.Forfeit) return;
    const ticks = this.phase === DuelPhase.Fight ? w.tick - this.roundFrom : 0;
    this.fightTicks += ticks;
    this.rounds.push({ winner, ticks, end });
    if (winner > 0) this.score[winner] = (this.score[winner] as number) + 1;
    this.changed = true;
  }

  private finish(winner: number): void {
    this.freeze(true);
    this.phase = DuelPhase.Over;
    this.phaseEnds = 0;
    this.changed = true;
    this.result = {
      winner,
      rounds: [...this.rounds],
      ticks: this.fightTicks,
      fighters: this.fighters.map((f) => ({
        id: f.id,
        team: f.team,
        damage: f.damage,
        hits: f.hits,
        downs: f.downs,
        forfeited: f.out,
      })),
    };
  }

  /** Every fighter back at its mark, whole, with nothing running and every clock reset. */
  private beginRound(w: FightWorld): void {
    this.round++;
    this.phase = DuelPhase.Countdown;
    this.phaseEnds = w.tick + this.timing.countdown;
    this.changed = true;
    this.clearCasts(w);
    this.freeze(true);
    const cx = (this.x0 + this.x1) / 2;
    for (const f of this.fighters) {
      if (f.out) continue;
      const p = f.player;
      p.x = snap(f.mark.x);
      p.y = snap(f.mark.y);
      p.facing = f.mark.x < cx ? Facing.Right : Facing.Left;
      p.downAt = -1;
      p.reviver = -1;
      p.hp = p.kit.maxHp;
      p.shield = 0;
      p.shieldUntil = 0;
      p.rollLeft = 0;
      p.forceX = 0;
      p.forceY = 0;
      p.forceTicks = 0;
      p.forceKeep = false;
      p.invulnerableUntil = 0;
      p.dodgeReadyAt = 0;
      p.contactSafeUntil = 0;
      p.casts = 0;
      p.attackSpeed = 0;
      p.cooldownBuff = 0;
      p.buffUntil = 0;
      p.statusMask = 0;
      p.slow = 0;
      p.burst.fill(0);
      p.burstHit.fill(0);
      p.statusTurn.fill(0);
      p.grow.fill(0);
      p.growUntil.fill(0);
      p.bestRoll.fill(0);
      for (let i = 0; i < MAX_WEAPONS; i++) p.ready[i] = i < p.kit.weapons.length ? 4 + i * 3 : 0;
      f.launchBy = -1;
      f.chain = 0;
      f.chainMax = 0;
      this.wipe(f);
    }
  }

  /** Fighters still in the match stand still with their books shut, or are let go. */
  private freeze(on: boolean): void {
    for (const f of this.fighters) {
      const p = f.player;
      if (!f.out && p.joined && p.id === f.id) p.frozen = on;
    }
  }

  /** Every clock a fight starts from: books staggered as on arrival, dodge ready, no buffs. */
  private freshen(p: Player): void {
    if (!p.joined) return;
    for (let i = 0; i < MAX_WEAPONS; i++) p.ready[i] = i < p.kit.weapons.length ? 4 + i * 3 : 0;
    p.dodgeReadyAt = 0;
    p.attackSpeed = 0;
    p.cooldownBuff = 0;
    p.buffUntil = 0;
    p.casts = 0;
  }

  /** A stand-in with no statuses, stacks or hit memory left from the round before. */
  private wipe(f: Fighter): void {
    const m = f.standIn;
    m.alive = false;
    m.dying = false;
    m.gone = false;
    m.kind = this.kind;
    // The fighter's own network id: hits, reactions and Q.E.D. on the stand-in show on the body.
    m.entity = f.player.entity;
    m.level = this.norms.level;
    m.rank = 1;
    m.elite = false;
    m.hp = 1;
    m.maxHp = 1;
    m.armor = 0;
    m.mass = this.norms.mass;
    m.radius = f.player.r;
    m.state = MState.Move;
    m.kx = 0;
    m.ky = 0;
    m.stacks.fill(0);
    m.statusUntil.fill(0);
    m.statusPower.fill(0);
    m.statusBy.fill(-1);
    m.statusMask = 0;
    m.proofBy.fill(-1);
    m.proofStacks.fill(0);
    m.proofLast.fill(0);
    m.stampId.fill(0);
    m.stampTick.fill(0);
    m.stampNext = 0;
    m.rollKey = -1;
    m.rollBest = 0;
  }

  /** Ends every effect and minion the fighters own. */
  private clearCasts(w: FightWorld): void {
    for (const e of w.effects) {
      if (!e.alive || e.owner < 0 || e.kind === FxKind.Danger) continue;
      if (this.fightingAt(e.owner)) w.endFx(e);
    }
    for (const n of w.minions) if (n.alive && this.fightingAt(n.owner)) w.killMinion(n);
  }

  /** A fighter stops being one: its side, statuses and stand-in go. */
  private discharge(w: FightWorld, f: Fighter): void {
    const p = f.player;
    f.standIn.alive = false;
    f.standIn.fighter = -1;
    (this.hideSide[f.team] as Uint8Array)[f.standIn.index] = 0;
    if (!p.joined || p.id !== f.id) return;
    for (const e of w.effects) if (e.alive && e.owner === p.index) w.endFx(e);
    for (const n of w.minions) if (n.alive && n.owner === p.index) w.killMinion(n);
    p.team = 0;
    p.party = null;
    p.frozen = false;
    p.statusMask = 0;
    p.slow = 0;
    p.flash = false;
    if (p.down) {
      p.downAt = -1;
      p.hp = p.kit.maxHp;
    }
    p.reviver = -1;
  }
}

/** The world's duel floor, if it has one. */
export function floorOf(w: FightWorld): DuelFloor | null {
  return w.pvp instanceof DuelFloor ? w.pvp : null;
}

/**
 * The walls while a match is on a floor: every open tile in the ring just outside it (the gaps in
 * the 콜로세움's rail) turns solid, so fighters cannot leave and nobody else can walk in. The
 * server puts it on the room's walls and names the floor in `MapState.fenced`; a client predicts
 * with the same walls.
 */
export function fenceFloor(collision: TileCollision, rect: TileRect): TileCollision {
  const rows = collision.rows.map((row, ty) => {
    if (ty < rect.y - 1 || ty > rect.y + rect.h) return row;
    const chars = row.split("");
    for (let tx = rect.x - 1; tx <= rect.x + rect.w; tx++) {
      if (tx < 0 || tx >= chars.length) continue;
      const ring =
        tx === rect.x - 1 || tx === rect.x + rect.w || ty === rect.y - 1 || ty === rect.y + rect.h;
      if (ring && chars[tx] !== "#") chars[tx] = "#";
    }
    return chars.join("");
  });
  return { w: collision.w, h: collision.h, rows };
}
