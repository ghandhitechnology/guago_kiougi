/**
 * A boss fight inside the fight step (PLAN §5 bosses, §10 raid). One pool of HP for every part of
 * the body, phases with their own bars, a shield that objectives strip, tells as Danger effects so
 * full auto dodges them, adds from the boss's own behaviour, and the fight's cues for the
 * narrative's lines. What each boss believes lives in its brain (`fight/bosses/`): where it
 * stands, what it throws, and the gate that lets damage through only when the players do what
 * corrects it.
 *
 * On a server the pool is shared by every channel of the arena: the room sets `external`, reads
 * `dealt`, `dealtBy` and `strips` after each tick, and hands the shared numbers back (`sync`,
 * `setPhase`, `free`). A 복습 or a test runs the whole fight inside the step.
 */

import { TICK_RATE_HZ } from "../constants.ts";
import { RAID, type RaidRank, raidDamage } from "../raid.ts";
import { monsterHit } from "./damage.ts";
import { spawnMonster } from "./monsters.ts";
import { Behavior } from "./rules.ts";
import {
  BossFlag,
  type BossHooks,
  type BossView,
  Dirty,
  type Effect,
  Ev,
  type FightWorld,
  FxKind,
  type Monster,
  MState,
  type Player,
} from "./world.ts";

/** The fight cues, in the narrative's order (`FIGHT_CUES`; a content test keeps them equal). */
export const BOSS_CUES = [
  "enter",
  "start",
  "phase",
  "hp-50",
  "hp-25",
  "knockout",
  "debate-hour",
  "grid-step",
  "diagonal",
  "weak-open",
  "dash",
  "ring-filled",
  "arrow",
  "tortoise",
  "fall",
  "element-zone",
  "push",
  "unpushed",
  "ice",
] as const;
export type BossCue = (typeof BOSS_CUES)[number];
const CUE = Object.fromEntries(BOSS_CUES.map((c, i) => [c, i])) as Record<BossCue, number>;

/** A boss tell's shape and story, in a Danger record's `def` byte as `BOSS_TELL + kind`. */
export const TellKind = {
  /** A whole row or column of the counting floor. */
  Lane: 0,
  /** A square of n×n cells. */
  Square: 1,
  Boulder: 2,
  Feather: 3,
  /** An arrow's path that hangs until the paradox breaks. */
  Arrow: 4,
  /** A slam or a lecture's shockwave around the body. */
  Slam: 5,
} as const;
export type TellKind = (typeof TellKind)[keyof typeof TellKind];
export const BOSS_TELL = 32;

/** Objective kinds, in `Ev.Objective`'s `d`. */
export const ObjectiveKind = {
  /** Break a device: a stele, a tablet. */
  Break: 0,
  /** Hold a zone, or fill a ring. */
  Hold: 1,
  /** Carry an object: the block across the ice. */
  Carry: 2,
} as const;
export type ObjectiveKind = (typeof ObjectiveKind)[keyof typeof ObjectiveKind];

/** A boss compiled from content (`simRules().bosses`). */
export interface BossRule {
  readonly id: string;
  readonly index: number;
  readonly rank: RaidRank;
  readonly phases: number;
  /** Monster kinds: the body, its other parts, its objective entities, its adds. */
  readonly core: number;
  readonly part: number;
  readonly objects: readonly number[];
  readonly add: number;
  /** Adds: one wave every `addEvery` ticks of `addCount`, at most `addCap` standing. */
  readonly addEvery: number;
  readonly addCount: number;
  readonly addCap: number;
  /** A tell's hit before the level factor (`monsterHit`). */
  readonly tellDamage: number;
  /** Share of a hit that gets through a closed gate. */
  readonly gateLeak: number;
  /** A phase's HP when the fight runs alone (복습, tests): this many level-scaled field bosses. */
  readonly soloPhaseRank: number;
}

/** What one boss believes, made playable. */
export interface BossBrain {
  /** The fight began: parts placed, objectives stood up. */
  start(b: Boss, w: FightWorld): void;
  /** A phase began (also the first). */
  phase(b: Boss, w: FightWorld): void;
  /** One tick: move, tell, watch the players. */
  step(b: Boss, w: FightWorld): void;
  /** Share of this player's hit that reaches the pool now: 1 when they did what corrects it. */
  gate(b: Boss, w: FightWorld, p: Player | null, part: Monster): number;
  /** Whether knockback moves this part. */
  pushable?(b: Boss, part: Monster): boolean;
  /** An objective entity died. */
  objective?(b: Boss, w: FightWorld, m: Monster, by: Player | null): void;
}

/** Players a boss keeps per-player numbers for (body slots stay under this). */
export const BOSS_PLAYERS = 256;

export class Boss implements BossHooks {
  readonly rule: BossRule;
  readonly brain: BossBrain;
  readonly level: number;
  core!: Monster;
  readonly parts: Monster[] = [];
  phase = 1;
  hp = 1;
  max = 1;
  /** Share of the shield left, 0 to 1 (era phases start full; mid bosses have none). */
  shield = 0;
  /** 토론 시간: +50% damage taken and the full mechanic set. Set by the room from the Page clock. */
  debate = false;
  /** Whether the boss's adds earn EXP and drops when put down (off in a 복습). */
  addsPay = true;
  /** The pool is shared outside this world: phases change only through `sync`. */
  external = false;
  /** The pool emptied; waiting for the next phase (external) or freed. */
  emptied = false;
  freed = false;
  /** The brain's state byte, sent in the boss record (rings filled, zone lit, block sliding…). */
  mode = 0;
  /** Per player: 1 while this player's hits get through the gate (sent as "open for you"). */
  readonly open = new Uint8Array(BOSS_PLAYERS);
  /** Pool damage since the room last read it, in total and by player index. */
  dealt = 0;
  readonly dealtBy = new Float64Array(BOSS_PLAYERS);
  /** Shield strips since the room last read them. */
  strips = 0;
  /** The player whose hit emptied the pool, or -1: the final hit when it was the last 논제. */
  emptiedBy = -1;
  /** Shield regrown a tick when the pool is this world's own (복습, tests); the raid's regrows on
   * the Page clock. */
  regrow = RAID.shieldRegrowPerHour / ((3_600_000 / 1000) * TICK_RATE_HZ);
  /** The brain's numbers. */
  readonly n = new Float64Array(64);
  /** Per-player numbers for the brain: four a player. */
  readonly pn = new Float64Array(BOSS_PLAYERS * 4);
  private readonly scratch: BossView = {
    entity: 0,
    boss: 0,
    phase: 0,
    flags: 0,
    mode: 0,
    hp: 0,
    max: 0,
    shield: 0,
  };
  private halfCued = false;
  private quarterCued = false;
  private lastDebate = false;
  /** Per player: 1 once greeted (`enter`), 2 while knocked out (`knockout` said once a fall). */
  private readonly seen = new Uint8Array(BOSS_PLAYERS);
  private nextKnockoutCue = 0;

  constructor(rule: BossRule, brain: BossBrain, level: number) {
    this.rule = rule;
    this.brain = brain;
    this.level = level;
  }

  /** Puts the boss into a world and starts phase 1 at `hp` (or its solo size). */
  start(w: FightWorld, x: number, y: number, hp?: number): void {
    const kind = w.rules.monsters[this.rule.core];
    if (!kind) throw new Error(`no core kind for ${this.rule.id}`);
    const core = spawnMonster(w, kind, this.level, false, x, y);
    if (!core) throw new Error("no room for the boss");
    core.part = true;
    core.state = MState.Idle;
    this.core = core;
    this.parts.push(core);
    w.boss = this;
    this.max = hp ?? this.soloHp();
    this.hp = this.max;
    this.shield = this.rule.rank === "era" ? 1 : 0;
    this.brain.start(this, w);
    this.beginPhase(w);
    this.cue(w, "start", -1, x, y);
  }

  /** A phase's HP when nothing outside sizes it: level-scaled, a few field bosses' worth. */
  soloHp(): number {
    return this.core
      ? this.core.maxHp * this.rule.soloPhaseRank
      : this.level * 1000 * this.rule.soloPhaseRank;
  }

  /** Adds another part to the body: its hits go to the same pool. */
  addPart(w: FightWorld, kind: number, x: number, y: number): Monster | null {
    const k = w.rules.monsters[kind];
    if (!k) return null;
    const m = spawnMonster(w, k, this.level, false, x, y);
    if (!m) return null;
    m.part = true;
    m.state = MState.Idle;
    this.parts.push(m);
    return m;
  }

  /** Stands up the boss's `which`th objective entity (a stele, the block). */
  addObject(w: FightWorld, which: number, x: number, y: number): Monster | null {
    const k = w.rules.monsters[this.rule.objects[which] ?? -1];
    if (!k) return null;
    const m = spawnMonster(w, k, this.level, false, x, y);
    return m;
  }

  /** Moves a part, marking it for the snapshot. */
  place(m: Monster, x: number, y: number): void {
    m.x = x;
    m.y = y;
  }

  setState(m: Monster, state: MState): void {
    if (m.state === state) return;
    m.state = state;
    m.dirty |= Dirty.State;
  }

  /** A tell on the ground that lands at `fireAt`; a line when `length` > 0. */
  tell(
    w: FightWorld,
    kind: TellKind,
    x: number,
    y: number,
    radius: number,
    length: number,
    angle: number,
    width: number,
    fireAt: number,
    share = 1,
    knock = 0,
  ): Effect | null {
    const e = w.freeEffect();
    if (!e) return null;
    e.kind = FxKind.Danger;
    e.source = this.core.index;
    e.owner = -1;
    e.x = x;
    e.y = y;
    e.radius = radius;
    e.length = length;
    e.angle = angle;
    e.width = width;
    e.fireAt = fireAt;
    e.until = fireAt;
    e.damage = monsterHit(this.core, this.rule.tellDamage) * share;
    e.knock = knock;
    e.count = BOSS_TELL + kind;
    e.slot = this.core.entity;
    return e;
  }

  /** A narrative fight cue, for the boss's lines and the presentation. */
  cue(w: FightWorld, cue: BossCue, player: number, x: number, y: number): void {
    const ev = w.event(Ev.Cue);
    ev.d = CUE[cue];
    ev.a = player;
    ev.x = x;
    ev.y = y;
  }

  /** An objective done: the shield loses a fixed share, the same whoever did it. */
  complete(w: FightWorld, kind: number, by: Player | null, entity = 0): void {
    this.credit(w, kind, by, entity);
    this.strips++;
    if (!this.external) this.shield = Math.max(0, this.shield - RAID.shieldPerObjective);
  }

  /**
   * A held objective done (a zone held, a circle filled): one completion, one strip, and a credit
   * to every player standing in it, so a crowd strips no more than one player would.
   */
  completeHeld(w: FightWorld, kind: number, inside: (p: Player) => boolean): void {
    let first = true;
    for (const p of w.players) {
      if (!p.joined || p.down || !inside(p)) continue;
      if (first) this.complete(w, kind, p);
      else this.credit(w, kind, p);
      first = false;
    }
    if (first) this.complete(w, kind, null);
  }

  /** A player took part in an objective already completed: the credit, no strip. */
  credit(w: FightWorld, kind: number, by: Player | null, entity = 0): void {
    const ev = w.event(Ev.Objective);
    ev.a = by ? by.index : -1;
    ev.c = entity;
    ev.d = kind;
  }

  // The step's hooks --------------------------------------------------------------------------

  step(w: FightWorld): void {
    if (this.freed) return;
    if (this.debate && !this.lastDebate) this.cue(w, "debate-hour", -1, this.core.x, this.core.y);
    this.lastDebate = this.debate;
    this.watchPlayers(w);
    // The bar's thresholds, read from the pool each tick: a shared pool moves between ticks too.
    if (!this.halfCued && this.hp <= this.max * 0.5) {
      this.halfCued = true;
      this.cue(w, "hp-50", -1, this.core.x, this.core.y);
    }
    if (!this.quarterCued && this.hp <= this.max * 0.25) {
      this.quarterCued = true;
      this.cue(w, "hp-25", -1, this.core.x, this.core.y);
    }
    if (!this.emptied) {
      if (!this.external && this.rule.rank === "era")
        this.shield = Math.min(1, this.shield + this.regrow);
      this.brain.step(this, w);
      this.summon(w);
    }
    // Parts never fall on their own: the pool does.
    for (const m of this.parts) {
      if (m.alive) m.hp = m.maxHp;
    }
  }

  /** Greets a player the first time the fight sees them, and mocks one who falls (rarely). */
  private watchPlayers(w: FightWorld): void {
    for (const p of w.players) {
      if (!p.joined || p.index >= BOSS_PLAYERS) continue;
      const was = this.seen[p.index] as number;
      if (was === 0) {
        this.seen[p.index] = 1;
        this.cue(w, "enter", p.index, p.x, p.y);
      }
      if (p.down && was !== 2) {
        this.seen[p.index] = 2;
        if (w.tick >= this.nextKnockoutCue) {
          this.nextKnockoutCue = w.tick + 200;
          this.cue(w, "knockout", p.index, p.x, p.y);
        }
      } else if (!p.down && was === 2) this.seen[p.index] = 1;
    }
  }

  /** A body left the world: nothing here names its index after this (`FightWorld.removePlayer`). */
  leave(index: number): void {
    if (index >= BOSS_PLAYERS) return;
    this.open[index] = 0;
    this.seen[index] = 0;
    this.dealtBy[index] = 0;
    this.pn.fill(0, index * 4, index * 4 + 4);
    if (this.emptiedBy === index) this.emptiedBy = -1;
  }

  take(w: FightWorld, p: Player | null, part: Monster, amount: number): number {
    if (this.freed || this.emptied) return 0;
    const gate = this.brain.gate(this, w, p, part);
    const through = gate >= 1 ? 1 : this.rule.gateLeak + (1 - this.rule.gateLeak) * gate;
    let dmg = raidDamage(amount * through, this.shield, this.debate);
    if (dmg > this.hp) dmg = this.hp;
    this.hp -= dmg;
    this.dealt += dmg;
    if (p && p.index < BOSS_PLAYERS)
      this.dealtBy[p.index] = (this.dealtBy[p.index] as number) + dmg;
    if (this.hp <= 1e-9) {
      this.hp = 0;
      this.emptied = true;
      this.emptiedBy = p ? p.index : -1;
      if (!this.external) this.next(w);
    }
    return dmg;
  }

  view(viewer: Player): BossView {
    const v = this.scratch;
    v.entity = this.core.entity;
    v.boss = this.rule.index;
    v.phase = this.phase;
    v.flags =
      (this.debate ? BossFlag.Debate : 0) |
      (this.emptied ? BossFlag.Emptied : 0) |
      (this.freed ? BossFlag.Freed : 0) |
      (viewer.index < BOSS_PLAYERS && this.open[viewer.index] ? BossFlag.Open : 0);
    v.mode = this.mode;
    v.hp = this.hp;
    v.max = this.max;
    v.shield = this.shield;
    return v;
  }

  /**
   * Whether killing `m` earns EXP and drops. Its adds (and 제논's tortoise) earn nothing when
   * `addsPay` is off: a 복습 alone pays its first clear, not a private add farm.
   */
  pays(m: Monster): boolean {
    return this.addsPay || m.owner !== this.core.index;
  }

  pushable(part: Monster): boolean {
    return this.brain.pushable?.(this, part) ?? false;
  }

  objective(w: FightWorld, m: Monster, by: Player | null): void {
    this.brain.objective?.(this, w, m, by);
  }

  // Phases ------------------------------------------------------------------------------------

  /** The local fight's next phase, or freed after the last. */
  private next(w: FightWorld): void {
    if (this.phase >= this.rule.phases) {
      this.free(w);
      return;
    }
    this.setPhase(w, this.phase + 1, this.soloHp(), this.rule.rank === "era" ? 1 : 0);
  }

  /** A new phase with its own bar (the room calls this when the shared pool moves on). */
  setPhase(w: FightWorld, phase: number, max: number, shield: number): void {
    this.phase = phase;
    this.max = max;
    this.hp = max;
    this.shield = shield;
    this.emptied = false;
    this.emptiedBy = -1;
    this.beginPhase(w);
  }

  private beginPhase(w: FightWorld): void {
    this.halfCued = false;
    this.quarterCued = false;
    const ev = w.event(Ev.BossPhase);
    ev.d = this.phase;
    this.brain.phase(this, w);
    if (this.rule.phases > 1) this.cue(w, "phase", -1, this.core.x, this.core.y);
  }

  /** Hands the shared numbers back after each tick: the pool as every channel left it. */
  sync(hp: number, max: number, shield: number, emptied: boolean): void {
    this.max = max;
    this.hp = Math.min(max, Math.max(0, hp));
    this.shield = shield;
    this.emptied = emptied;
  }

  /** The boss is freed: its body and adds leave the fight. */
  free(w: FightWorld): void {
    if (this.freed) return;
    this.freed = true;
    this.hp = 0;
    const ev = w.event(Ev.BossPhase);
    ev.d = 0;
    for (const m of w.monsters) {
      if (!m.alive || m.dying) continue;
      if (m.part || m.owner === this.core.index || m.kind.behavior === Behavior.Object)
        m.gone = true;
    }
    // Its tells go with it: an arrow left hanging would otherwise wait out its hour.
    for (const e of w.effects) {
      if (e.alive && e.kind === FxKind.Danger && e.source === this.core.index) w.endFx(e);
    }
  }

  /** Clears what the room has read. */
  drain(): void {
    this.dealt = 0;
    this.dealtBy.fill(0);
    this.strips = 0;
  }

  private summon(w: FightWorld): void {
    const r = this.rule;
    if (r.add < 0 || r.addEvery <= 0) return;
    const every = this.debate ? Math.max(1, Math.floor(r.addEvery / 2)) : r.addEvery;
    if (w.tick % every !== 0) return;
    const kind = w.rules.monsters[r.add];
    if (!kind) return;
    let mine = 0;
    for (const o of w.monsters) if (o.alive && o.owner === this.core.index) mine++;
    const count = Math.min(r.addCount, r.addCap - mine);
    for (let i = 0; i < count; i++) {
      const a = w.random.next() * Math.PI * 2;
      const d = this.core.radius + 24 + w.random.next() * 40;
      const x = this.core.x + Math.cos(a) * d;
      const y = this.core.y + Math.sin(a) * d;
      if (w.tileAt(x, y) !== 0) continue;
      const s = spawnMonster(w, kind, this.level, false, x, y);
      if (s) s.owner = this.core.index;
    }
  }

  // Helpers for brains ------------------------------------------------------------------------

  /** The player nearest (x, y), or null. */
  nearest(w: FightWorld, x: number, y: number): Player | null {
    let best: Player | null = null;
    let bd = Number.POSITIVE_INFINITY;
    for (const p of w.players) {
      if (!p.joined || p.down) continue;
      const d = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best;
  }

  /** A mark of the map, or a fallback. */
  mark(w: FightWorld, name: string, fx = 0, fy = 0): { x: number; y: number } {
    return w.map.marks?.[name] ?? { x: fx, y: fy };
  }
}
