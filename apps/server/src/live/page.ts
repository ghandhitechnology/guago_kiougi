/**
 * The Page clock (PLAN §10): one server-wide state, stored in `server_state` and the 0조
 * 연구노트 tables. Which milestone the story has reached is derived from the clock and the bosses
 * freed (`pageProgress`); this module notices when it moves, sends each milestone's announcement
 * once, seals the notebook page at 시대 전환, and turns the board day and week over.
 */
import {
  LIFECYCLES,
  lifecycleOf,
  type Milestone,
  milestonesBetween,
  narrative,
  type PageProgress,
  pageProgress,
} from "@guago/content";
import {
  boardDay,
  boardWeek,
  type ClockAnchor,
  dayStart,
  type NotebookPage,
  type NotebookView,
  type PageView,
  weekStart,
} from "@guago/shared";
import { sql } from "drizzle-orm";
import type { Db } from "../db/index.ts";
import { timeFromDb } from "../economy/rows.ts";
import type { LiveClock } from "./clock.ts";

/** Twelve Pages make Theme 1 (PLAN §5). */
export const NOTEBOOK_PAGES = 12;

export interface FreedRecord {
  finalHit?: { id: string; name: string };
  leaders?: { board: string; id: string; name: string }[];
}

export interface PageHooks {
  /** A server line to everyone: a narrative announcement or system message id. */
  announce(key: string, params?: Record<string, string | number>): void;
  /** The story reached a milestone (each one once, in order). */
  milestone(m: Milestone): Promise<void> | void;
  /** A boss was freed. */
  freed(boss: string): Promise<void> | void;
  /** A new board day, and a new board week, began (the week's previous number is given too). */
  day(day: number): Promise<void> | void;
  week(week: number, previous: number): Promise<void> | void;
}

interface Row {
  page: number;
  openedAt: number;
  milestone: Milestone;
  lastDay: number;
  lastWeek: number;
}

const NO_HOOKS: PageHooks = {
  announce() {},
  milestone() {},
  freed() {},
  day() {},
  week() {},
};

export class PageClock {
  private readonly db: Db;
  readonly clock: LiveClock;
  /** Set by the living world (`createLive`). */
  hooks: PageHooks = NO_HOOKS;
  private row: Row | undefined;
  private freed: Record<string, number> = {};
  private ticking: Promise<void> | undefined;
  private finalHits = new Map<string, string>();

  constructor(db: Db, clock: LiveClock) {
    this.db = db;
    this.clock = clock;
  }

  /**
   * Reads the stored state, or opens Page 1 now on a fresh database. The clock takes the stored
   * anchor; `rate` applies only to a fresh one.
   */
  async load(rate = 1): Promise<void> {
    const wall = Date.now();
    const fresh = this.clock.state;
    await this.db.execute(sql`
      insert into server_state (id, current_page, page_opened_at, milestone, clock_real_ms,
        clock_game_ms, clock_rate, last_day, last_week)
      values (1, ${LIFECYCLES[0]?.page ?? 1}, ${new Date(fresh.gameMs).toISOString()}::timestamptz,
        'opening', ${wall}, ${fresh.gameMs}, ${rate}, ${boardDay(fresh.gameMs)}, ${boardWeek(fresh.gameMs)})
      on conflict (id) do nothing`);
    const { rows } = await this.db.execute(sql`select * from server_state where id = 1`);
    const r = rows[0] as Record<string, unknown>;
    this.clock.set({
      realMs: Number(r.clock_real_ms),
      gameMs: Number(r.clock_game_ms),
      rate: Number(r.clock_rate),
    });
    this.row = {
      page: Number(r.current_page),
      openedAt: (timeFromDb(r.page_opened_at) as Date).getTime(),
      milestone: r.milestone as Milestone,
      lastDay: Number(r.last_day),
      lastWeek: Number(r.last_week),
    };
    await this.db.execute(sql`
      insert into notebook (page, opened_at)
      values (${this.row.page}, ${new Date(this.row.openedAt).toISOString()}::timestamptz)
      on conflict (page) do nothing`);
    const freed = await this.db.execute(sql`
      select boss_id, freed_at, final_hit_name from notebook_bosses where page = ${this.row.page}`);
    this.freed = Object.fromEntries(
      freed.rows.map((f) => [f.boss_id as string, (timeFromDb(f.freed_at) as Date).getTime()]),
    );
    this.finalHits = new Map(
      freed.rows.flatMap((f) =>
        f.final_hit_name == null ? [] : [[f.boss_id as string, f.final_hit_name as string]],
      ),
    );
  }

  private get state(): Row {
    if (!this.row) throw new Error("page clock not loaded");
    return this.row;
  }

  /** The live Page: fees, catch-up and prices follow it. */
  live = (): number => this.row?.page ?? LIFECYCLES[0]?.page ?? 1;

  progress(now = this.clock.now()): PageProgress {
    const r = this.state;
    return pageProgress(r.page, r.openedAt, this.freed, now);
  }

  /** The milestone announced so far: what `drawNotices`, barks and story quests read. */
  milestone(): Milestone {
    return this.state.milestone;
  }

  view(): PageView {
    const now = this.clock.now();
    const p = this.progress(now);
    return {
      page: p.page,
      milestone: this.state.milestone,
      week: p.week,
      openedAt: this.state.openedAt,
      now,
      rate: this.clock.rate,
      maps: [...p.maps],
      bosses: { ...p.bosses },
      frontierLevel: p.frontierLevel,
      nextAt: p.nextAt,
      sealed: p.sealed,
      nextDaily: dayStart(boardDay(now) + 1),
      nextWeekly: weekStart(boardWeek(now) + 1),
    };
  }

  /** One pass: milestones reached, days and weeks turned. Overlapping calls share one pass. */
  tick(): Promise<void> {
    this.ticking ??= this.pass().finally(() => {
      this.ticking = undefined;
    });
    return this.ticking;
  }

  private async pass(): Promise<void> {
    const r = this.state;
    const now = this.clock.now();
    const p = this.progress(now);
    for (const m of milestonesBetween(r.milestone, p.milestone)) {
      r.milestone = m;
      await this.db.execute(
        sql`update server_state set milestone = ${m}, updated_at = now() where id = 1`,
      );
      for (const beat of narrative.NARRATIVE.story.filter((b) => b.after === m)) {
        for (const key of beat.announce ?? []) this.hooks.announce(key, this.announceParams(key));
      }
      if (m === lifecycleOf(r.page)?.steps.at(-1)?.milestone) {
        await this.db.execute(sql`
          update notebook set sealed_at = ${new Date(now).toISOString()}::timestamptz
          where page = ${r.page} and sealed_at is null`);
      }
      await this.hooks.milestone(m);
    }
    const day = boardDay(now);
    const week = boardWeek(now);
    if (day !== r.lastDay || week !== r.lastWeek) {
      const previousWeek = r.lastWeek;
      const turnedDay = day !== r.lastDay;
      r.lastDay = day;
      r.lastWeek = week;
      await this.db.execute(
        sql`update server_state set last_day = ${day}, last_week = ${week}, updated_at = now() where id = 1`,
      );
      if (week !== previousWeek) await this.hooks.week(week, previousWeek);
      if (turnedDay) {
        this.hooks.announce("daily-reset");
        await this.hooks.day(day);
      }
    }
  }

  /** The era change names the player who landed the final hit on the era boss. */
  private announceParams(key: string): Record<string, string> | undefined {
    if (key !== "era-change") return undefined;
    return { player: this.finalHits.get(lifecycleOf(this.live())?.bosses.at(-1) ?? "") ?? "" };
  }

  /**
   * The raid system calls this when a boss is freed (PLAN §10). Refused unless the boss stands
   * open on the live Page; a second call for the same boss changes nothing.
   */
  async free(boss: string, record: FreedRecord = {}): Promise<"freed" | "not_open" | "already"> {
    const r = this.state;
    const now = this.clock.now();
    const state = this.progress(now).bosses[boss];
    if (state === "freed") return "already";
    if (state !== "open") return "not_open";
    const { rowCount } = await this.db.execute(sql`
      insert into notebook_bosses (page, boss_id, freed_at, final_hit_by, final_hit_name, board_leaders)
      values (${r.page}, ${boss}, ${new Date(now).toISOString()}::timestamptz,
        ${record.finalHit?.id ?? null}, ${record.finalHit?.name ?? null},
        ${JSON.stringify(record.leaders ?? [])}::jsonb)
      on conflict (page, boss_id) do nothing`);
    if (!rowCount) return "already";
    this.freed[boss] = now;
    if (record.finalHit) this.finalHits.set(boss, record.finalHit.name);
    await this.tick();
    await this.hooks.freed(boss);
    return "freed";
  }

  freedBosses(): Readonly<Record<string, number>> {
    return this.freed;
  }

  /** Stores a new clock anchor. */
  async saveClock(a: ClockAnchor): Promise<void> {
    await this.db.execute(sql`
      update server_state set clock_real_ms = ${a.realMs}, clock_game_ms = ${a.gameMs},
        clock_rate = ${a.rate}, updated_at = now()
      where id = 1`);
  }

  /**
   * Test servers only: the live Page starts over from its rift opening now. The notebook page
   * and its freed bosses are cleared; characters keep everything.
   */
  async restart(): Promise<void> {
    const r = this.state;
    const now = this.clock.now();
    await this.db.execute(sql`delete from notebook where page = ${r.page}`);
    await this.db.execute(sql`
      update server_state set page_opened_at = ${new Date(now).toISOString()}::timestamptz,
        milestone = 'opening', updated_at = now()
      where id = 1`);
    await this.load(this.clock.rate);
  }

  /** The 0조 연구노트: twelve stubs, the freed dates and the names for each boss. */
  async notebook(): Promise<NotebookView> {
    const pages = await this.db.execute(sql`select page, opened_at, sealed_at from notebook`);
    const bosses = await this.db.execute(sql`
      select page, boss_id, freed_at, final_hit_by, final_hit_name, board_leaders from notebook_bosses`);
    const out: NotebookPage[] = [];
    for (let page = 1; page <= NOTEBOOK_PAGES; page++) {
      const row = pages.rows.find((p) => Number(p.page) === page);
      const sealedAt = timeFromDb(row?.sealed_at)?.getTime() ?? null;
      const ids = lifecycleOf(page)?.bosses ?? [];
      out.push({
        page,
        state: !row ? "stub" : sealedAt !== null ? "returned" : "live",
        sealedAt,
        bosses: row
          ? ids.map((boss) => {
              const b = bosses.rows.find((x) => Number(x.page) === page && x.boss_id === boss);
              return {
                boss,
                freedAt: timeFromDb(b?.freed_at)?.getTime() ?? null,
                finalHit:
                  b?.final_hit_name != null
                    ? {
                        id: (b.final_hit_by as string | null) ?? "",
                        name: b.final_hit_name as string,
                      }
                    : null,
                leaders: (b?.board_leaders as NotebookPage["bosses"][number]["leaders"]) ?? [],
              };
            })
          : [],
      });
    }
    return { pages: out };
  }
}
