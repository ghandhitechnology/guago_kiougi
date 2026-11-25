/**
 * The rows the living world's operations read and write besides the executor's own: kill counts,
 * the 도움 notice an operation works on, the conduct ledger, weekly tallies and the character's
 * living-world columns. The executor calls `loadLive` after it locked the character row and
 * `writeLive` before it writes that row back, inside the same transaction.
 */
import type { QuestView } from "@guago/shared";
import { type SQL, sql } from "drizzle-orm";
import type { Queryable } from "../economy/executor.ts";
import { type HuntRates, type QuestRow, questView, timeFromDb } from "../economy/rows.ts";

/** What an operation asks to read, by name, before it runs. */
export interface LiveRows {
  /** Monsters whose lifetime kill counts it needs. */
  kills?: readonly string[];
  /** A 도움 notice to load and lock. */
  notice?: string;
  /** Whether the character posted a notice still up, or holds one as helper. */
  helpState?: boolean;
  /** The character's `floor_leaders` row of this board week, locked. */
  leader?: number;
}

export interface HelpNoticeRow {
  id: string;
  posterId: string;
  posterLevel: number;
  template: string;
  slots: Record<string, string | number>;
  count: number;
  questId: string | null;
  state: "open" | "taken" | "done" | "cancelled";
  helperId: string | null;
  postedAt: Date;
  expiresAt: Date;
}

export interface LiveLoaded {
  kills: ReadonlyMap<string, number>;
  notice: HelpNoticeRow | null;
  /** The character's own notice still up, and the one it helps with. */
  posted: boolean;
  helping: boolean;
  /** The 층장 row asked for: absent, or whether it was paid. */
  leader: { paid: boolean } | null;
}

export const NO_LIVE: LiveLoaded = {
  kills: new Map(),
  notice: null,
  posted: false,
  helping: false,
  leader: null,
};

/** Living-world columns an operation sets on the character. */
export interface LiveCharacter {
  demerits?: number;
  merits?: number;
  restedUntil?: Date | null;
  poolStoppedAt?: Date | null;
  huntRates?: HuntRates | null;
  homeUntil?: Date | null;
  penaltyUntil?: Date | null;
  drowsy?: boolean;
  mealId?: string | null;
  mealUntil?: Date | null;
  titles?: string[];
  patrolCatches?: number;
  expulsions?: number;
  boardStreak?: number;
  boardStreakDay?: number | null;
}

export interface NewQuest {
  row: QuestRow;
  /** When the notice comes down (game time), or null. */
  resetAt: Date | null;
}

export interface LiveWrite {
  character?: LiveCharacter;
  /** Conduct ledger rows: `demerits` and `merits` move by exactly these. */
  conduct?: readonly { kind: "demerit" | "merit"; amount: number; reason: string }[];
  /** New lifetime totals by monster. */
  kills?: Readonly<Record<string, number>>;
  /** Weekly counts to add to. */
  tally?: readonly { week: number; kind: "merit" | "meal"; n: number }[];
  /** Notices to post; one already there under its id is left as it is. */
  quests?: readonly NewQuest[];
  notice?: { update: Pick<HelpNoticeRow, "id" | "state" | "helperId"> } | { insert: HelpNoticeRow };
  /** Marks the character's 층장 row of this week paid. */
  leaderPaid?: number;
}

export async function loadLive(
  q: Queryable,
  characterId: string,
  want: LiveRows | undefined,
): Promise<LiveLoaded> {
  if (!want) return NO_LIVE;
  const kills = new Map<string, number>();
  if (want.kills && want.kills.length > 0) {
    const { rows } = await q.execute(sql`
      select monster_id, kills from kill_counts
      where character_id = ${characterId} and monster_id = any(${sql.param([...want.kills])}::text[])`);
    for (const r of rows) kills.set(r.monster_id as string, Number(r.kills));
  }
  let notice: HelpNoticeRow | null = null;
  if (want.notice) {
    const { rows } = await q.execute(sql`
      select id, poster_id, poster_level, template, slots, count, quest_id, state, helper_id,
        posted_at, expires_at
      from help_notices where id = ${want.notice} for update`);
    const r = rows[0];
    if (r) notice = noticeFromDb(r);
  }
  let posted = false;
  let helping = false;
  if (want.helpState) {
    const { rows } = await q.execute(sql`
      select
        exists(select 1 from help_notices where poster_id = ${characterId} and state in ('open', 'taken')) as posted,
        exists(select 1 from help_notices where helper_id = ${characterId} and state = 'taken') as helping`);
    posted = rows[0]?.posted === true;
    helping = rows[0]?.helping === true;
  }
  let leader: LiveLoaded["leader"] = null;
  if (want.leader !== undefined) {
    const { rows } = await q.execute(sql`
      select paid from floor_leaders where week = ${want.leader} and character_id = ${characterId}
      for update`);
    if (rows[0]) leader = { paid: rows[0].paid === true };
  }
  return { kills, notice, posted, helping, leader };
}

export function noticeFromDb(r: Record<string, unknown>): HelpNoticeRow {
  return {
    id: r.id as string,
    posterId: r.poster_id as string,
    posterLevel: Number(r.poster_level),
    template: r.template as string,
    slots: r.slots as Record<string, string | number>,
    count: Number(r.count),
    questId: (r.quest_id as string | null) ?? null,
    state: r.state as HelpNoticeRow["state"],
    helperId: (r.helper_id as string | null) ?? null,
    postedAt: timeFromDb(r.posted_at) as Date,
    expiresAt: timeFromDb(r.expires_at) as Date,
  };
}

const COLUMNS: Readonly<Record<keyof LiveCharacter, string>> = {
  demerits: "demerits",
  merits: "merits",
  restedUntil: "rested_until",
  poolStoppedAt: "pool_stopped_at",
  huntRates: "hunt_rates",
  homeUntil: "home_until",
  penaltyUntil: "penalty_until",
  drowsy: "drowsy",
  mealId: "meal_id",
  mealUntil: "meal_until",
  titles: "titles",
  patrolCatches: "patrol_catches",
  expulsions: "expulsions",
  boardStreak: "board_streak",
  boardStreakDay: "board_streak_day",
};

function value(key: keyof LiveCharacter, v: unknown): SQL {
  if (v === null) return sql`null`;
  if (v instanceof Date) return sql`${v.toISOString()}::timestamptz`;
  if (key === "huntRates" || key === "titles") return sql`${JSON.stringify(v)}::jsonb`;
  return sql`${v}`;
}

/** Writes everything in `w`. Returns the views of notices it posted. */
export async function writeLive(
  q: Queryable,
  characterId: string,
  opId: string,
  w: LiveWrite | undefined,
): Promise<{ quests: QuestView[] }> {
  if (!w) return { quests: [] };
  const sets = Object.entries(w.character ?? {}).flatMap(([k, v]) =>
    v === undefined
      ? []
      : [
          sql`${sql.raw(COLUMNS[k as keyof LiveCharacter])} = ${value(k as keyof LiveCharacter, v)}`,
        ],
  );
  if (sets.length > 0) {
    await q.execute(
      sql`update characters set ${sql.join(sets, sql`, `)} where id = ${characterId}`,
    );
  }
  const conduct = (w.conduct ?? []).filter((c) => c.amount !== 0);
  if (conduct.length > 0) {
    await q.execute(sql`
      insert into conduct_ledger (character_id, operation_id, kind, amount, reason)
      select ${characterId}, ${opId}, u.kind, u.amount, u.reason
      from unnest(
        ${sql.param(conduct.map((c) => c.kind))}::text[],
        ${sql.param(conduct.map((c) => c.amount))}::integer[],
        ${sql.param(conduct.map((c) => c.reason))}::text[]
      ) as u(kind, amount, reason)`);
  }
  const kills = Object.entries(w.kills ?? {});
  if (kills.length > 0) {
    await q.execute(sql`
      insert into kill_counts (character_id, monster_id, kills)
      select ${characterId}, u.monster, u.kills
      from unnest(
        ${sql.param(kills.map(([m]) => m))}::text[],
        ${sql.param(kills.map(([, n]) => n))}::bigint[]
      ) as u(monster, kills)
      on conflict (character_id, monster_id) do update set kills = excluded.kills`);
  }
  for (const t of w.tally ?? []) {
    await q.execute(sql`
      insert into weekly_tally (week, kind, character_id, n)
      values (${t.week}, ${t.kind}, ${characterId}, ${t.n})
      on conflict (week, kind, character_id) do update set n = weekly_tally.n + excluded.n`);
  }
  let quests: QuestView[] = [];
  if (w.quests && w.quests.length > 0) {
    const n = w.quests;
    const { rows } = await q.execute(sql`
      insert into quest_progress (character_id, quest_id, state, progress, target, offer, reset_at)
      select ${characterId}, u.id, 'active', 0, u.target, u.offer, u.reset_at
      from unnest(
        ${sql.param(n.map((x) => x.row.id))}::text[],
        ${sql.param(n.map((x) => x.row.target))}::integer[],
        ${sql.param(n.map((x) => JSON.stringify(x.row.offer)))}::jsonb[],
        ${sql.param(n.map((x) => x.resetAt?.toISOString() ?? null))}::timestamptz[]
      ) as u(id, target, offer, reset_at)
      on conflict (character_id, quest_id) do nothing
      returning quest_id`);
    const made = new Set(rows.map((r) => r.quest_id as string));
    quests = n.filter((x) => made.has(x.row.id)).map((x) => questView(x.row));
  }
  if (w.leaderPaid !== undefined) {
    await q.execute(sql`
      update floor_leaders set paid = true
      where week = ${w.leaderPaid} and character_id = ${characterId}`);
  }
  if (w.notice && "insert" in w.notice) {
    const n = w.notice.insert;
    await q.execute(sql`
      insert into help_notices (id, poster_id, poster_level, template, slots, count, quest_id,
        state, posted_at, expires_at)
      values (${n.id}, ${n.posterId}, ${n.posterLevel}, ${n.template}, ${JSON.stringify(n.slots)}::jsonb,
        ${n.count}, ${n.questId}, ${n.state}, ${n.postedAt.toISOString()}::timestamptz,
        ${n.expiresAt.toISOString()}::timestamptz)`);
  } else if (w.notice) {
    const u = w.notice.update;
    await q.execute(sql`
      update help_notices set state = ${u.state}, helper_id = ${u.helperId} where id = ${u.id}`);
  }
  return { quests };
}
