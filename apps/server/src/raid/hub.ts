/**
 * The raid (PLAN §10 era boss raid rules, mid bosses, shared progress; §19 persistence). One
 * process holds every boss's one HP pool, phase and shield; each channel of an arena runs its own
 * body, tells, adds and objectives in its own fight and reports to the pool after every tick
 * (`Arena`), so the arena "holds the whole server" however many rooms its players fill.
 *
 * Nothing here touches the database on a tick. The pool is written every 10 seconds and at each
 * phase change; participation is batched the same way. A phase ends in one transaction that
 * writes the last of its participation, sets every participant's tier and moves the boss on,
 * so a crash loses at most the seconds since the last write, never a phase or a reward. Rewards
 * go out after that transaction through the executor (`raid.reward`), each paid once by its
 * participant row, and a restart pays whatever it finds unpaid. Freeing the boss tells the
 * Page clock once (`bossFreed` is idempotent by its notebook row) and grants the boards' titles.
 *
 * Every time is the Page clock's, so a compressed test server calibrates and finishes in minutes.
 */
import { lifecycleOf, type RaidBossDef, raidBoss } from "@guago/content";
import {
  type ChangeNotice,
  calibrateHp,
  DAY_MS,
  type DamageWindow,
  HOUR_MS,
  isDebateHour,
  RAID,
  RAID_BOARDS,
  RAID_TIER_NAMES,
  RaidTier,
  regrowShield,
  stripShield,
  tierOf,
} from "@guago/shared";
import { sql } from "drizzle-orm";
import { type Db, describeError } from "../db/index.ts";
import { type Executor, isTransient, type Queryable } from "../economy/executor.ts";
import { timeFromDb } from "../economy/rows.ts";
import type { LiveClock } from "../live/clock.ts";
import type { FreedRecord, PageClock } from "../live/page.ts";

/** The pool and participation are written this often (PLAN §19: every 10 seconds in a raid). */
export const RAID_SAVE_MS = 10_000;
/** The Page clock and the shield are looked at this often. */
const POLL_MS = 1000;

/** What the raid needs from the living world. */
export interface RaidLive {
  bossFreed(bossId: string, record: FreedRecord): Promise<"freed" | "not_open" | "already">;
  bossCleared(characterId: string, bossId: string): void;
  raidTitle(characterId: string, awardId: string): Promise<boolean>;
}

export interface RaidHubOptions {
  db: Db;
  clock: LiveClock;
  page: PageClock;
  executor: Pick<Executor, "execute">;
  live: () => RaidLive | undefined;
  /** A reward landed: the change notice for the player's client. */
  notify?(characterId: string, change: ChangeNotice): void;
  log?(line: string): void;
}

interface Tally {
  name: string;
  damage: number;
  activeMs: number;
  objectives: number;
  support: number;
}

const tally = (name: string): Tally => ({
  name,
  damage: 0,
  activeMs: 0,
  objectives: 0,
  support: 0,
});

/** One boss standing on the live Page: what every channel of its arena shares. */
export class Raid {
  readonly id: string;
  readonly def: RaidBossDef;
  readonly page: number;
  phase: number;
  hp: number;
  max: number;
  shield: number;
  /** The pool is empty and the phase is being closed; the bodies wait. */
  emptied = false;
  freed = false;
  phaseStartedAt: number;
  /** Who landed the hit that emptied the last 논제. */
  finalHit: { id: string; name: string } | null = null;
  /** Participation of the current phase not yet written, by character. */
  pending = new Map<string, Tally>();
  /** Damage into the pool since the last write. */
  dirty = false;
  /** The phase-end transaction runs, or ran and failed: the poll retries it. */
  ending = false;
  /** Writes to this raid's rows, one after another. */
  writes: Promise<unknown> = Promise.resolve();
  private readonly clock: LiveClock;
  private readonly meter: (boss: number) => void;
  private readonly empty: (r: Raid) => void;

  constructor(
    row: {
      id: string;
      def: RaidBossDef;
      page: number;
      phase: number;
      hp: number;
      max: number;
      shield: number;
      phaseStartedAt: number;
    },
    clock: LiveClock,
    meter: (boss: number) => void,
    empty: (r: Raid) => void,
  ) {
    this.id = row.id;
    this.def = row.def;
    this.page = row.page;
    this.phase = row.phase;
    this.hp = row.hp;
    this.max = row.max;
    this.shield = row.shield;
    this.phaseStartedAt = row.phaseStartedAt;
    this.clock = clock;
    this.meter = meter;
    this.empty = empty;
    this.emptied = row.hp <= 0;
  }

  /** 토론 시간, for the era boss (PLAN §10): +50% damage taken and the full mechanic set. */
  get debate(): boolean {
    return this.def.rank === "era" && isDebateHour(this.clock.now());
  }

  /** The Page clock's rate: active fighting time counts in Page time. */
  get rate(): number {
    return this.clock.rate;
  }

  /**
   * One channel's tick: pool damage and shield strips. The hit that empties the pool starts the
   * phase change; everything after it until the next phase is ignored.
   */
  hit(dealt: number, strips: number, by: { id: string; name: string } | null): void {
    if (this.freed || this.emptied) return;
    if (dealt > 0) {
      this.hp = Math.max(0, this.hp - dealt);
      this.dirty = true;
      this.meter(dealt);
    }
    if (strips > 0 && this.def.rank === "era") {
      this.shield = stripShield(this.shield, strips);
      this.dirty = true;
    }
    if (this.hp <= 0) {
      this.emptied = true;
      if (this.phase >= this.def.phases) this.finalHit = by;
      this.empty(this);
    }
  }

  /** What one character did in one channel's tick. */
  credit(
    characterId: string,
    name: string,
    damage: number,
    activeMs: number,
    objectives: number,
    support: number,
  ): void {
    if (this.freed) return;
    let t = this.pending.get(characterId);
    if (!t) {
      t = tally(name);
      this.pending.set(characterId, t);
    }
    t.damage += damage;
    t.activeMs += activeMs;
    t.objectives += objectives;
    t.support += support;
  }

  /** Takes the participation not yet written; `restore` puts it back if the write failed. */
  take(): Map<string, Tally> {
    const out = this.pending;
    this.pending = new Map();
    return out;
  }

  restore(taken: Map<string, Tally>): void {
    for (const [id, t] of taken) {
      const now = this.pending.get(id);
      if (!now) this.pending.set(id, t);
      else {
        now.damage += t.damage;
        now.activeMs += t.activeMs;
        now.objectives += t.objectives;
        now.support += t.support;
      }
    }
  }
}

/** A phase as it ended, for logs and evidence. */
export interface PhaseEnded {
  raid: string;
  boss: string;
  phase: number;
  maxHp: number;
  startedAt: number;
  endedAt: number;
  tiers: Record<string, number>;
  next: { phase: number; maxHp: number; window: DamageWindow } | null;
}

interface Bucket {
  total: number;
  boss: number;
  standingMs: number;
}

export class RaidHub {
  private readonly o: RaidHubOptions;
  private readonly raids = new Map<string, Raid>();
  /** Bosses whose raid row is being read or made. */
  private readonly loading = new Set<string>();
  /** Freed raids whose Page clock call or titles have not gone through yet. */
  private readonly unannounced = new Set<string>();
  /** Of those, the ones being announced now. */
  private readonly announcing = new Set<string>();
  /** Damage by Page hour not yet written. */
  private buckets = new Map<number, Bucket>();
  private lastPoll = 0;
  private timers: ReturnType<typeof setInterval>[] = [];
  /** Listeners for ended phases (evidence runs, tests). */
  readonly ended: ((e: PhaseEnded) => void)[] = [];
  private stopped = false;

  constructor(o: RaidHubOptions) {
    this.o = o;
  }

  private log(line: string): void {
    (this.o.log ?? console.error)(line);
  }

  /** Reads the raids standing on the live Page, pays what a crash left unpaid, starts the timers. */
  async start(): Promise<void> {
    await this.load();
    this.lastPoll = this.o.clock.now();
    await this.poll();
    this.timers.push(setInterval(() => this.safely("raid poll", () => this.poll()), POLL_MS));
    this.timers.push(setInterval(() => this.safely("raid save", () => this.save()), RAID_SAVE_MS));
    for (const t of this.timers) t.unref();
  }

  /** Writes what is pending and stops the timers (shutdown). */
  async stop(): Promise<void> {
    this.stopped = true;
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
    await this.save();
  }

  /** A timer's work: nothing it throws, now or later, may reach the process. */
  private safely(what: string, work: () => Promise<unknown>): void {
    try {
      work().catch((error: unknown) => this.log(`${what} failed: ${describeError(error)}`));
    } catch (error) {
      this.log(`${what} failed: ${describeError(error)}`);
    }
  }

  /** The raid of `bossId` now standing, once it is ready to fight. */
  raidFor(bossId: string): Raid | undefined {
    for (const r of this.raids.values()) if (r.def.id === bossId && !r.freed) return r;
    return undefined;
  }

  /** Everything the server's players dealt this tick, to anything (the calibration's measure). */
  dealt(amount: number): void {
    if (!(amount > 0)) return;
    this.bucket(this.o.clock.now()).total += amount;
  }

  private bucket(gameMs: number): Bucket {
    const hour = Math.floor(gameMs / HOUR_MS);
    let b = this.buckets.get(hour);
    if (!b) {
      b = { total: 0, boss: 0, standingMs: 0 };
      this.buckets.set(hour, b);
    }
    return b;
  }

  // The Page clock ------------------------------------------------------------------------------

  /**
   * The timer's pass, once a second: bosses appear when the Page clock opens them, shields
   * regrow, an ended phase that failed to close is retried, a freed boss not yet announced is.
   */
  async poll(): Promise<void> {
    if (this.stopped) return;
    const now = this.o.clock.now();
    const elapsed = Math.max(0, now - this.lastPoll);
    this.lastPoll = now;
    const page = this.o.page;
    const progress = page.progress(now);
    const life = lifecycleOf(progress.page);
    const run = runOf(progress.page, page.view().openedAt);
    let standing = false;
    for (const [id, r] of this.raids) {
      // A test server started its Page over: the last run's bosses are gone with it.
      if (!id.startsWith(run)) {
        this.raids.delete(id);
        this.unannounced.delete(id);
        continue;
      }
      if (r.freed) continue;
      // Freed by someone else (an admin, a test): it leaves the arena with no rewards to settle.
      if (progress.bosses[r.def.id] === "freed" && !r.emptied) {
        await this.markFreed(r, now);
        continue;
      }
      standing = true;
      if (!r.emptied && r.def.rank === "era" && r.shield < 1) {
        r.shield = regrowShield(r.shield, elapsed);
        r.dirty = true;
      }
      if (r.emptied && !r.ending) this.empty(r);
    }
    if (standing) this.bucket(now).standingMs += elapsed;
    for (const boss of life?.bosses ?? []) {
      if (progress.bosses[boss] !== "open" || this.raidFor(boss) || this.loading.has(boss))
        continue;
      const def = raidBoss(boss);
      if (!def) continue;
      this.loading.add(boss);
      try {
        await this.open(def, progress.page, page.view().openedAt);
      } finally {
        this.loading.delete(boss);
      }
    }
    for (const id of this.unannounced) {
      const r = this.raids.get(id);
      if (r && !this.announcing.has(id)) this.track("raid freed", this.announce(r));
    }
  }

  /** The boss's raid row for this run of the Page, made with its first phase calibrated. */
  private async open(def: RaidBossDef, page: number, openedAt: number): Promise<void> {
    const id = `${runOf(page, openedAt)}${def.id}`;
    if (this.raids.has(id)) return;
    const now = this.o.clock.now();
    let row = await this.readRaid(id);
    if (!row) {
      const window = await this.window(now);
      const max = calibrateHp(def.rank, def.level, window, this.o.clock.rate);
      const shield = def.rank === "era" ? 1 : 0;
      const at = new Date(now).toISOString();
      await this.o.db.transaction(async (tx) => {
        const made = await tx.execute(sql`
          insert into raids (id, page, boss_id, phase, hp, max_hp, shield, started_at, phase_started_at)
          values (${id}, ${page}, ${def.id}, 1, ${max}, ${max}, ${shield}, ${at}::timestamptz,
            ${at}::timestamptz)
          on conflict (id) do nothing`);
        if (!made.rowCount) return;
        await tx.execute(sql`
          insert into raid_phases (raid_id, phase, max_hp, calibration, started_at)
          values (${id}, 1, ${max}, ${JSON.stringify(window)}::jsonb, ${at}::timestamptz)`);
      });
      this.log(
        JSON.stringify({ raid: { opened: id, boss: def.id, phase: 1, maxHp: max, window } }),
      );
      row = await this.readRaid(id);
    }
    if (!row) return;
    const r = this.make(row.def, row);
    this.raids.set(id, r);
    if (row.freedAt !== null) {
      r.freed = true;
      if (this.o.page.freedBosses()[def.id] === undefined) this.unannounced.add(id);
    }
  }

  private make(def: RaidBossDef, row: Omit<ConstructorParameters<typeof Raid>[0], "def">): Raid {
    return new Raid(
      { ...row, def },
      this.o.clock,
      (dealt) => {
        this.bucket(this.o.clock.now()).boss += dealt;
      },
      (r) => this.empty(r),
    );
  }

  private async readRaid(id: string) {
    const { rows } = await this.o.db.execute(sql`
      select id, page, boss_id, phase, hp, max_hp, shield, phase_started_at, freed_at
      from raids where id = ${id}`);
    const r = rows[0];
    const def = r && raidBoss(r.boss_id as string);
    if (!r || !def) return undefined;
    return {
      id,
      def,
      page: Number(r.page),
      phase: Number(r.phase),
      hp: Number(r.hp),
      max: Number(r.max_hp),
      shield: Number(r.shield),
      phaseStartedAt: (timeFromDb(r.phase_started_at) as Date).getTime(),
      freedAt: timeFromDb(r.freed_at)?.getTime() ?? null,
    };
  }

  /** At start: the live Page's raids, then whatever a crash left unpaid or unannounced. */
  private async load(): Promise<void> {
    const page = this.o.page.live();
    const run = runOf(page, this.o.page.view().openedAt);
    const { rows } = await this.o.db.execute(
      sql`select id from raids where starts_with(id, ${run}) order by started_at`,
    );
    for (const row of rows) {
      const r = await this.readRaid(row.id as string);
      if (!r) continue;
      const raid = this.make(r.def, r);
      if (r.freedAt !== null) {
        raid.freed = true;
        if (this.o.page.freedBosses()[r.def.id] === undefined) this.unannounced.add(r.id);
      }
      this.raids.set(r.id, raid);
    }
    const unpaid = await this.o.db.execute(sql`
      select distinct p.raid_id, p.phase, r.boss_id from raid_participants p
      join raids r on r.id = p.raid_id
      where p.tier > 0 and not p.paid`);
    for (const u of unpaid.rows) {
      const def = raidBoss(u.boss_id as string);
      if (def) this.pay(u.raid_id as string, Number(u.phase), def);
    }
  }

  // Calibration ---------------------------------------------------------------------------------

  /** The server's damage over the last 14 Page days, written and pending (PLAN §10). */
  async window(now = this.o.clock.now()): Promise<DamageWindow> {
    const start = now - RAID.windowDays * DAY_MS;
    const from = Math.floor(start / HOUR_MS);
    const { rows } = await this.o.db.execute(sql`
      select coalesce(sum(total), 0) as total, coalesce(sum(boss), 0) as boss,
        coalesce(sum(standing_ms), 0) as standing,
        coalesce(sum(total) filter (where standing_ms > 0), 0) as total_standing,
        min(hour) as first
      from raid_damage where hour >= ${from}`);
    const r = rows[0] ?? {};
    let total = Number(r.total ?? 0);
    let boss = Number(r.boss ?? 0);
    let standingMs = Number(r.standing ?? 0);
    let totalStanding = Number(r.total_standing ?? 0);
    let first = r.first == null ? Number.POSITIVE_INFINITY : Number(r.first);
    for (const [hour, b] of this.buckets) {
      if (hour < from) continue;
      total += b.total;
      boss += b.boss;
      standingMs += b.standingMs;
      if (b.standingMs > 0) totalStanding += b.total;
      first = Math.min(first, hour);
    }
    const since = Number.isFinite(first) ? Math.max(start, first * HOUR_MS) : now;
    return { total, boss, measuredMs: Math.max(0, now - since), standingMs, totalStanding };
  }

  // Writing -------------------------------------------------------------------------------------

  /** One raid's writes, one after another: a save never lands after the phase-end that follows it. */
  private serial<T>(r: Raid, work: () => Promise<T>): Promise<T> {
    const next = r.writes.then(work, work);
    r.writes = next.catch(() => {});
    return next;
  }

  /** Every 10 seconds: the pools, the participation since the last write, the damage meter. */
  async save(): Promise<void> {
    for (const r of this.raids.values()) {
      if (r.freed || r.ending) continue;
      const phase = r.phase;
      await this.serial(r, async () => {
        if (r.ending || r.phase !== phase) return;
        const taken = r.take();
        const hp = r.hp;
        const shield = r.shield;
        try {
          await this.o.db.transaction(async (tx) => {
            await upsertTallies(tx, r.id, phase, taken);
            if (r.dirty) {
              await tx.execute(sql`
                update raids set hp = ${hp}, shield = ${shield}, updated_at = now()
                where id = ${r.id} and phase = ${phase} and freed_at is null`);
            }
          });
          r.dirty = false;
        } catch (error) {
          r.restore(taken);
          throw error;
        }
      });
    }
    const buckets = this.buckets;
    if (buckets.size === 0) return;
    this.buckets = new Map();
    const hours = [...buckets.keys()];
    const b = hours.map((h) => buckets.get(h) as Bucket);
    try {
      await this.o.db.execute(sql`
        insert into raid_damage (hour, total, boss, standing_ms)
        select u.hour, u.total, u.boss, u.standing
        from unnest(${sql.param(hours)}::bigint[], ${sql.param(b.map((x) => x.total))}::float8[],
          ${sql.param(b.map((x) => x.boss))}::float8[],
          ${sql.param(b.map((x) => x.standingMs))}::float8[]) as u(hour, total, boss, standing)
        on conflict (hour) do update set total = raid_damage.total + excluded.total,
          boss = raid_damage.boss + excluded.boss,
          standing_ms = raid_damage.standing_ms + excluded.standing_ms`);
    } catch (error) {
      for (const [hour, x] of buckets) {
        const now = this.buckets.get(hour);
        if (!now) this.buckets.set(hour, x);
        else {
          now.total += x.total;
          now.boss += x.boss;
          now.standingMs += x.standingMs;
        }
      }
      throw error;
    }
  }

  // Phases --------------------------------------------------------------------------------------

  /** The pool emptied: close the phase once, then pay it and move on (or free the boss). */
  private empty(r: Raid): void {
    if (r.ending || r.freed) return;
    r.ending = true;
    this.serial(r, () => this.endPhase(r)).catch((error: unknown) => {
      // Retried by the next poll: the bodies wait, emptied, meanwhile.
      r.ending = false;
      this.log(`raid phase end for ${r.id} failed, retried: ${describeError(error)}`);
    });
  }

  private async endPhase(r: Raid): Promise<void> {
    const ended = r.phase;
    const last = ended >= r.def.phases;
    const now = this.o.clock.now();
    const window = last ? null : await this.window(now);
    const nextMax = window ? calibrateHp(r.def.rank, r.def.level, window, this.o.clock.rate) : 0;
    const nextShield = r.def.rank === "era" ? 1 : 0;
    const taken = r.take();
    const at = new Date(now).toISOString();
    let tiers: Record<string, number> = {};
    try {
      await this.o.db.transaction(async (tx) => {
        await upsertTallies(tx, r.id, ended, taken);
        tiers = await settleTiers(tx, r.id, ended);
        await tx.execute(sql`
          update raid_phases set ended_at = ${at}::timestamptz
          where raid_id = ${r.id} and phase = ${ended}`);
        if (last) {
          await tx.execute(sql`
            update raids set hp = 0, freed_at = ${at}::timestamptz,
              final_hit_by = ${r.finalHit?.id ?? null}, final_hit_name = ${r.finalHit?.name ?? null},
              updated_at = now()
            where id = ${r.id}`);
        } else {
          await tx.execute(sql`
            update raids set phase = ${ended + 1}, hp = ${nextMax}, max_hp = ${nextMax},
              shield = ${nextShield}, phase_started_at = ${at}::timestamptz, updated_at = now()
            where id = ${r.id}`);
          await tx.execute(sql`
            insert into raid_phases (raid_id, phase, max_hp, calibration, started_at)
            values (${r.id}, ${ended + 1}, ${nextMax}, ${JSON.stringify(window)}::jsonb,
              ${at}::timestamptz)
            on conflict do nothing`);
        }
      });
    } catch (error) {
      r.restore(taken);
      throw error;
    }
    const e: PhaseEnded = {
      raid: r.id,
      boss: r.def.id,
      phase: ended,
      maxHp: r.max,
      startedAt: r.phaseStartedAt,
      endedAt: now,
      tiers,
      next: last || !window ? null : { phase: ended + 1, maxHp: nextMax, window },
    };
    if (last) {
      r.freed = true;
      r.hp = 0;
    } else {
      r.phase = ended + 1;
      r.max = nextMax;
      r.hp = nextMax;
      r.shield = nextShield;
      r.phaseStartedAt = now;
      r.emptied = false;
      r.dirty = false;
    }
    r.ending = false;
    this.log(JSON.stringify({ raid: { phaseEnded: e } }));
    for (const l of this.ended) l(e);
    this.pay(r.id, ended, r.def);
    if (last) {
      this.unannounced.add(r.id);
      if (!this.announcing.has(r.id)) this.track("raid freed", this.announce(r));
    }
  }

  /** Freed without a fight here (an admin, a test): the bodies leave, nothing is paid. */
  private async markFreed(r: Raid, now: number): Promise<void> {
    await this.serial(r, async () => {
      await this.o.db.execute(sql`
        update raids set freed_at = ${new Date(now).toISOString()}::timestamptz, updated_at = now()
        where id = ${r.id} and freed_at is null`);
    });
    r.freed = true;
  }

  // Rewards and the notebook ---------------------------------------------------------------------

  /** Work started in the background that `settle` waits for. */
  private readonly inflight = new Set<Promise<unknown>>();

  private track(what: string, work: Promise<unknown>): void {
    const p = work.catch((error: unknown) => this.log(`${what} failed: ${describeError(error)}`));
    this.inflight.add(p);
    void p.finally(() => this.inflight.delete(p));
  }

  /** Resolves once every raid's writes and every payment started so far are done (tests, runs). */
  async settle(): Promise<void> {
    for (;;) {
      const pending = [...this.inflight, ...[...this.raids.values()].map((r) => r.writes)];
      await Promise.all(pending);
      if (this.inflight.size === 0) return;
    }
  }

  /** Pays every participant of a closed phase its tier's reward, once each, in the background. */
  private pay(raidId: string, phase: number, def: RaidBossDef): void {
    this.track("raid rewards", this.payPhase(raidId, phase, def));
  }

  /**
   * Pays a closed phase: each participant's `raid.reward`, which the participant row lets through
   * once, so running this again, from another process or after a restart, pays nobody twice.
   */
  async payPhase(raidId: string, phase: number, def: RaidBossDef): Promise<number> {
    const { rows } = await this.o.db.execute(sql`
      select character_id, tier from raid_participants
      where raid_id = ${raidId} and phase = ${phase} and tier > 0 and not paid
      order by character_id`);
    let paid = 0;
    for (const row of rows) {
      const id = row.character_id as string;
      const r = await this.run(id, `raid:${raidId}:${phase}`, {
        raid: raidId,
        phase,
        boss: def.id,
      });
      if (r?.ok && r.outcome.paid) {
        paid++;
        this.o.notify?.(id, r.change);
      }
    }
    this.log(JSON.stringify({ raid: { paid: { raid: raidId, phase, characters: paid } } }));
    return paid;
  }

  private async run(
    characterId: string,
    opId: string,
    request: { raid: string; phase: number; boss: string },
  ) {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.o.executor.execute(characterId, opId, "raid.reward", request);
      } catch (error) {
        if (!isTransient(error) || attempt >= 2) {
          this.log(`raid reward ${opId} for ${characterId} failed: ${describeError(error)}`);
          return undefined;
        }
      }
    }
  }

  /**
   * The boss is freed: the boards' titles, a clear for everyone who took part, and the Page
   * clock told once with the final hit and the leaders (PLAN §10 shared progress). Retried by
   * the poll until it went through.
   */
  private async announce(r: Raid): Promise<void> {
    this.announcing.add(r.id);
    try {
      await this.announceOnce(r);
    } finally {
      this.announcing.delete(r.id);
    }
  }

  private async announceOnce(r: Raid): Promise<void> {
    const live = this.o.live();
    if (!live) return;
    const { rows } = await this.o.db.execute(sql`
      select p.character_id, c.name, sum(p.damage) as damage, sum(p.support) as support,
        sum(p.objectives) as objectives, max(p.tier) as tier
      from raid_participants p join characters c on c.id = p.character_id
      where p.raid_id = ${r.id}
      group by p.character_id, c.name`);
    const fin = await this.o.db.execute(
      sql`select final_hit_by, final_hit_name from raids where id = ${r.id}`,
    );
    const leaders: { board: string; id: string; name: string }[] = [];
    for (const board of RAID_BOARDS) {
      let best: (typeof rows)[number] | undefined;
      for (const row of rows) {
        const v = Number(row[board]);
        if (v > 0 && (!best || v > Number(best[board]))) best = row;
      }
      if (!best) continue;
      const id = best.character_id as string;
      leaders.push({ board, id, name: best.name as string });
      await live.raidTitle(id, `raid-${board}-${r.def.id}`);
    }
    for (const row of rows) {
      if (Number(row.tier) > RaidTier.None) live.bossCleared(row.character_id as string, r.def.id);
    }
    const f = fin.rows[0];
    const record: FreedRecord = {
      leaders,
      ...(f?.final_hit_by
        ? { finalHit: { id: f.final_hit_by as string, name: f.final_hit_name as string } }
        : {}),
    };
    const result = await live.bossFreed(r.def.id, record);
    this.unannounced.delete(r.id);
    this.log(JSON.stringify({ raid: { freed: r.id, result, ...record } }));
  }

  /**
   * A 복습 cleared: the first-clear reward once (`boss_clears`), and a clear for the story either
   * way. In the background; a failure is logged and the next clear tries again.
   */
  firstClear(characterId: string, bossId: string): void {
    this.o.live()?.bossCleared(characterId, bossId);
    this.track("first clear", this.payFirstClear(characterId, bossId));
  }

  /** The first-clear reward, once per character and boss by its `boss_clears` row. */
  async payFirstClear(characterId: string, bossId: string): Promise<void> {
    for (let attempt = 0; ; attempt++) {
      try {
        const r = await this.o.executor.execute(
          characterId,
          `first-clear:${bossId}`,
          "raid.firstClear",
          { boss: bossId },
        );
        if (r.ok && r.outcome.paid) this.o.notify?.(characterId, r.change);
        this.log(
          JSON.stringify({
            raid: { firstClear: { characterId, bossId, outcome: r.ok ? r.outcome : r.error } },
          }),
        );
        return;
      } catch (error) {
        if (!isTransient(error) || attempt >= 2) throw error;
      }
    }
  }

  /** The raids this process holds, for the admin route and evidence. */
  list(): { id: string; boss: string; phase: number; hp: number; max: number; shield: number }[] {
    return [...this.raids.values()].map((r) => ({
      id: r.id,
      boss: r.def.id,
      phase: r.phase,
      hp: r.hp,
      max: r.max,
      shield: r.shield,
      ...(r.freed ? { freed: true } : {}),
      ...(r.emptied ? { emptied: true } : {}),
    }));
  }
}

/**
 * The prefix of every raid id of one run of a Page: the Page and the game ms its rift opened, so
 * a test server's restarted Page puts up its bosses again. A raid's id is this and the boss id.
 */
function runOf(page: number, openedAt: number): string {
  return `${page}:${Math.round(openedAt)}:`;
}

/** Adds one batch of participation to its phase's rows. */
async function upsertTallies(
  q: Queryable,
  raid: string,
  phase: number,
  t: ReadonlyMap<string, Tally>,
): Promise<void> {
  if (t.size === 0) return;
  const ids = [...t.keys()];
  const v = ids.map((id) => t.get(id) as Tally);
  await q.execute(sql`
    insert into raid_participants (raid_id, phase, character_id, damage, active_ms, objectives, support)
    select ${raid}, ${phase}, u.id, u.damage, u.active, u.objectives, u.support
    from unnest(${sql.param(ids)}::uuid[], ${sql.param(v.map((x) => x.damage))}::float8[],
      ${sql.param(v.map((x) => x.activeMs))}::float8[],
      ${sql.param(v.map((x) => x.objectives))}::integer[],
      ${sql.param(v.map((x) => x.support))}::integer[])
      as u(id, damage, active, objectives, support)
    where exists (select 1 from characters c where c.id = u.id)
    on conflict (raid_id, phase, character_id) do update set
      damage = raid_participants.damage + excluded.damage,
      active_ms = raid_participants.active_ms + excluded.active_ms,
      objectives = raid_participants.objectives + excluded.objectives,
      support = raid_participants.support + excluded.support`);
}

/** Sets every participant's tier of a closed phase; returns how many reached each. */
async function settleTiers(q: Queryable, raid: string, phase: number) {
  const { rows } = await q.execute(sql`
    select character_id, damage, active_ms, objectives, support from raid_participants
    where raid_id = ${raid} and phase = ${phase} and tier is null
    for update`);
  const ids: string[] = [];
  const tiers: number[] = [];
  const counts: Record<string, number> = {};
  for (const r of rows) {
    const tier = tierOf({
      damage: Number(r.damage),
      activeMs: Number(r.active_ms),
      objectives: Number(r.objectives),
      support: Number(r.support),
    });
    ids.push(r.character_id as string);
    tiers.push(tier);
    const name = RAID_TIER_NAMES[tier] || "none";
    counts[name] = (counts[name] ?? 0) + 1;
  }
  if (ids.length > 0) {
    await q.execute(sql`
      update raid_participants p set tier = u.tier
      from unnest(${sql.param(ids)}::uuid[], ${sql.param(tiers)}::smallint[]) as u(id, tier)
      where p.raid_id = ${raid} and p.phase = ${phase} and p.character_id = u.id`);
  }
  return counts;
}
