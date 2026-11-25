/**
 * The 수행평가 board (PLAN §15). Notices are drawn lazily and deterministically: the first time a
 * player's board is read on a board day, today's five dailies, this week's three weeklies, one
 * repeatable and every story chapter the server has reached are drawn from a seed of the
 * character and the day, and posted with their rewards fixed. A player who comes back after three
 * days gets today's board, once. 도움 notices are posted by players below the frontier and taken
 * by one helper each.
 */
import { randomUUID } from "node:crypto";
import {
  boardField,
  CHORE_PLACES,
  drawHelp,
  drawNotices,
  type FieldDef,
  type Milestone,
  milestoneReached,
  narrative,
  type QuestOffer,
  STARTER_BOOKS,
  STORY_CHAPTERS,
} from "@guago/content";
import {
  BOARD,
  boardDay,
  boardWeek,
  catchUp,
  DAY_MS,
  dayStart,
  HELP,
  type HelpNoticeView,
  type HelpTemplate,
  HOUR_MS,
  type Major,
  MERITS,
  type NoticeView,
  type QuestReward,
  Random,
  seedOf,
  storyReward,
  weekStart,
} from "@guago/shared";
import { sql } from "drizzle-orm";
import type { Db } from "../db/index.ts";
import type { ExecResult, Executor } from "../economy/executor.ts";
import { type QuestRow, questFromDb, type StoredOffer, timeFromDb } from "../economy/rows.ts";
import { helpQuestId, type PostedQuest } from "./ops.ts";
import { noticeFromDb } from "./rows.ts";

/** How long a notice's row is kept after it came down. */
export const BOARD_KEEP_MS = 7 * DAY_MS;

/** 상점 a chore pays when it is done, by chore id. */
const CHORE_MERITS: Readonly<Record<string, number>> = { cleaning: MERITS.cleaning };

const NO_REWARD: QuestReward = { exp: 0, pinecone: 0, ink: 0, binding: 0, sheets: 0 };

export interface BoardContext {
  now: () => number;
  page: () => number;
  milestone: () => Milestone;
  maps: () => readonly string[];
  frontierLevel: () => number;
}

interface Who {
  id: string;
  name: string;
  level: number;
  major: Major;
  /** The book in slot 0, whose 낱장 weeklies pay. */
  book: string;
}

const clamp = (level: number, f: FieldDef) => Math.min(f.levels.max, Math.max(f.levels.min, level));

function offerOf(o: QuestOffer, sheetBook: string, expiresAt: number | null): StoredOffer {
  return {
    cadence: o.cadence,
    reward: o.reward,
    sheetBook,
    template: o.template,
    kind: o.kind,
    slots: o.slots as Record<string, string | number>,
    expiresAt,
  };
}

export function noticeView(q: QuestRow): NoticeView {
  const o = q.offer;
  return {
    id: q.id,
    state: q.state,
    progress: q.progress,
    target: q.target,
    cadence: o.cadence,
    template: o.template ?? "",
    kind: o.kind ?? "",
    slots: { ...(o.slots ?? {}) },
    reward: o.reward,
    merit: o.merit ?? 0,
    expiresAt: o.expiresAt ?? null,
  };
}

export class Board {
  private readonly db: Db;
  private readonly executor: Pick<Executor, "execute">;
  private readonly ctx: BoardContext;

  constructor(db: Db, executor: Pick<Executor, "execute">, ctx: BoardContext) {
    this.db = db;
    this.executor = executor;
    this.ctx = ctx;
  }

  private async who(characterId: string): Promise<Who | undefined> {
    const { rows } = await this.db.execute(sql`
      select c.id, c.name, c.level, c.major,
        (select def_id from items i where i.owner_id = c.id and i.kind = 'book' and i.slot = 0) as book
      from characters c where c.id = ${characterId}`);
    const r = rows[0];
    if (!r) return undefined;
    const major = r.major as Major;
    return {
      id: r.id as string,
      name: r.name as string,
      level: Number(r.level),
      major,
      book: (r.book as string | null) ?? STARTER_BOOKS[major][0],
    };
  }

  /** Notices the board should hold now that it does not; drawn from fixed seeds. */
  private async missing(who: Who): Promise<PostedQuest[]> {
    const now = this.ctx.now();
    const day = boardDay(now);
    const week = boardWeek(now);
    const { rows } = await this.db.execute(sql`
      select quest_id, state from quest_progress
      where character_id = ${who.id}
        and (quest_id like ${`daily:${day}:%`} or quest_id like ${`weekly:${week}:%`}
          or quest_id like ${`repeat:${day}:%`} or quest_id like 'story:%'
          or quest_id like ${`chore:${day}:%`})`);
    const have = new Map(rows.map((r) => [r.quest_id as string, r.state as string]));
    const out: PostedQuest[] = [];
    const milestone = this.ctx.milestone();
    const field = boardField(who.level, this.ctx.maps());
    const mult = catchUp(who.level, this.ctx.page());
    if (field) {
      const draw = (
        cadence: "daily" | "weekly" | "repeat",
        count: number,
        seed: string,
        done = 0,
      ) =>
        drawNotices(new Random(seedOf(`${who.id}:${seed}`)), {
          cadence,
          count,
          level: who.level,
          field,
          milestone,
          completedToday: done,
          catchUpMult: mult,
        });
      if (![...have.keys()].some((id) => id.startsWith(`daily:${day}:`))) {
        const end = dayStart(day + 1);
        draw("daily", BOARD.daily, `daily:${day}`).forEach((o, i) => {
          out.push({
            id: `daily:${day}:${i}`,
            target: o.count,
            offer: offerOf(o, who.book, end),
            resetAt: end,
          });
        });
      }
      if (![...have.keys()].some((id) => id.startsWith(`weekly:${week}:`))) {
        const end = weekStart(week + 1);
        draw("weekly", BOARD.weekly, `weekly:${week}`).forEach((o, i) => {
          out.push({
            id: `weekly:${week}:${i}`,
            target: o.count,
            offer: offerOf(o, who.book, end),
            resetAt: end,
          });
        });
      }
      // One repeatable on offer at a time; the next is drawn once this one is claimed.
      const repeats = [...have].filter(([id]) => id.startsWith(`repeat:${day}:`));
      if (repeats.every(([, state]) => state === "claimed")) {
        const n = repeats.length;
        const end = dayStart(day + 1);
        const [o] = draw("repeat", 1, `repeat:${day}:${n}`, n);
        if (o)
          out.push({
            id: `repeat:${day}:${n}`,
            target: o.count,
            offer: offerOf(o, who.book, end),
            resetAt: end,
          });
      }
    }
    // Today's chores: the 청소 당번 notice, at a campus place drawn from the day's seed.
    for (const chore of narrative.NARRATIVE.chores ?? []) {
      const id = `chore:${day}:${chore.id}`;
      if (have.has(id)) continue;
      const end = dayStart(day + 1);
      const random = new Random(seedOf(`${who.id}:${id}`));
      const slots: Record<string, string> = {};
      if (chore.slots.includes("place")) slots.place = random.pick(CHORE_PLACES);
      out.push({
        id,
        target: 1,
        offer: {
          cadence: "chore",
          reward: NO_REWARD,
          sheetBook: who.book,
          template: chore.id,
          kind: "chore",
          slots,
          merit: CHORE_MERITS[chore.id] ?? 0,
          expiresAt: end,
        },
        resetAt: end,
      });
    }
    // Story chapters the server has reached, each played once for its first-clear reward.
    const level = field ? clamp(who.level, field) : who.level;
    for (const ch of STORY_CHAPTERS) {
      const id = `story:${ch.id}`;
      if (have.has(id) || !milestoneReached(milestone, ch.after)) continue;
      out.push({
        id,
        target: 1,
        offer: {
          cadence: "story",
          reward: storyReward(ch.boss !== undefined, level, who.level, mult),
          sheetBook: who.book,
          template: ch.id,
          kind: ch.boss ? "boss" : "beat",
          slots: ch.boss ? { boss: ch.boss } : {},
          expiresAt: null,
        },
        resetAt: null,
      });
    }
    return out;
  }

  /** Posts what the board is missing. Returns the operation's result, or null if nothing was. */
  async ensure(characterId: string): Promise<ExecResult | null> {
    const who = await this.who(characterId);
    if (!who) return null;
    const quests = await this.missing(who);
    if (quests.length === 0) return null;
    const id = `board:${seedOf(quests.map((q) => q.id).join(",")).toString(36)}:${quests[0]?.id}`;
    return this.executor.execute(characterId, id.slice(0, 64), "live.board", { quests });
  }

  async view(characterId: string): Promise<import("@guago/shared").BoardView> {
    const now = this.ctx.now();
    const day = boardDay(now);
    const week = boardWeek(now);
    const { rows } = await this.db.execute(sql`
      select quest_id, state, progress, target, offer from quest_progress
      where character_id = ${characterId}
        and (quest_id like ${`daily:${day}:%`} or quest_id like ${`weekly:${week}:%`}
          or quest_id like ${`repeat:${day}:%`} or quest_id like 'story:%'
          or quest_id like ${`chore:${day}:%`})
      order by quest_id`);
    const quests = rows.map((r) => questFromDb(r));
    const repeats = quests.filter((q) => q.id.startsWith("repeat:"));
    const sortRepeat = (a: QuestRow, b: QuestRow) =>
      Number(a.id.split(":")[2]) - Number(b.id.split(":")[2]);
    const help = await this.helpOf(characterId);
    return {
      day,
      week,
      daily: quests.filter((q) => q.id.startsWith("daily:")).map(noticeView),
      weekly: quests.filter((q) => q.id.startsWith("weekly:")).map(noticeView),
      repeat: (() => {
        const open = repeats.filter((q) => q.state !== "claimed").sort(sortRepeat)[0];
        return open ? noticeView(open) : null;
      })(),
      repeatsToday: repeats.filter((q) => q.state === "claimed").length,
      story: quests.filter((q) => q.id.startsWith("story:")).map(noticeView),
      chores: quests.filter((q) => q.id.startsWith("chore:")).map(noticeView),
      help,
    };
  }

  async quest(characterId: string, questId: string): Promise<QuestRow | undefined> {
    const { rows } = await this.db.execute(sql`
      select quest_id, state, progress, target, offer from quest_progress
      where character_id = ${characterId} and quest_id = ${questId}`);
    return rows[0] ? questFromDb(rows[0]) : undefined;
  }

  // 도움 notices ---------------------------------------------------------------------------

  private async helpRows(where: ReturnType<typeof sql>, limit = 20): Promise<HelpNoticeView[]> {
    const { rows } = await this.db.execute(sql`
      select n.*, p.name as poster_name, h.name as helper_name,
        coalesce(q.progress, 0) as helper_progress
      from help_notices n
      join characters p on p.id = n.poster_id
      left join characters h on h.id = n.helper_id
      left join quest_progress q on q.character_id = n.helper_id and q.quest_id = 'help:' || n.id::text
      where ${where}
      order by n.posted_at desc
      limit ${limit}`);
    return rows.map((r) => {
      const n = noticeFromDb(r);
      return {
        id: n.id,
        poster: { id: n.posterId, name: r.poster_name as string, level: n.posterLevel },
        helper: n.helperId ? { id: n.helperId, name: r.helper_name as string } : null,
        template: n.template as HelpTemplate,
        slots: n.slots,
        count: n.count,
        progress: Number(r.helper_progress),
        state: n.state,
        postedAt: n.postedAt.getTime(),
        expiresAt: n.expiresAt.getTime(),
      };
    });
  }

  async notice(id: string): Promise<HelpNoticeView | undefined> {
    return (await this.helpRows(sql`n.id = ${id}`, 1))[0];
  }

  private async helpOf(characterId: string): Promise<import("@guago/shared").BoardView["help"]> {
    const now = new Date(this.ctx.now()).toISOString();
    const mine = await this.helpRows(
      sql`n.poster_id = ${characterId} and n.state in ('open', 'taken') and n.expires_at > ${now}::timestamptz`,
      1,
    );
    const taken = await this.helpRows(
      sql`n.helper_id = ${characterId} and n.state = 'taken' and n.expires_at > ${now}::timestamptz`,
      1,
    );
    const open = await this.helpRows(
      sql`n.state = 'open' and n.poster_id <> ${characterId} and n.expires_at > ${now}::timestamptz`,
    );
    return { mine: mine[0] ?? null, taken: taken[0] ?? null, open };
  }

  /** Posts a 도움 notice for `characterId`. */
  async post(
    characterId: string,
    template: HelpTemplate,
    questId?: string,
  ): Promise<{ result: ExecResult; notice: string } | { refused: "board_closed" }> {
    const who = await this.who(characterId);
    const field = who && boardField(who.level, this.ctx.maps());
    if (!who || !field) return { refused: "board_closed" };
    const quest = questId ? await this.quest(characterId, questId) : undefined;
    const id = randomUUID();
    const now = this.ctx.now();
    const { slots, count } = drawHelp(new Random(seedOf(id)), {
      template,
      field,
      level: who.level,
      posterName: who.name,
      ...(quest?.offer.template ? { questTemplate: quest.offer.template } : {}),
    });
    const result = await this.executor.execute(characterId, `help-post:${id}`, "live.helpPost", {
      notice: {
        id,
        template,
        slots: slots as Record<string, string | number>,
        count,
        questId: questId ?? null,
        postedAt: now,
        expiresAt: now + HELP.hours * HOUR_MS,
      },
      frontierLevel: this.ctx.frontierLevel(),
    });
    return { result, notice: id };
  }

  /** `helperId` takes notice `id`: the notice is theirs and a `help:` row tracks it. */
  async take(helperId: string, id: string): Promise<ExecResult | { refused: "help_gone" }> {
    const { rows } = await this.db.execute(sql`select * from help_notices where id = ${id}`);
    const r = rows[0];
    if (!r) return { refused: "help_gone" };
    const n = noticeFromDb(r);
    const helper = await this.who(helperId);
    if (!helper) return { refused: "help_gone" };
    return this.executor.execute(helperId, `help-take:${id}:${randomUUID()}`, "live.helpTake", {
      notice: id,
      quest: {
        id: helpQuestId(id),
        target: n.count,
        offer: {
          cadence: "help",
          reward: NO_REWARD,
          sheetBook: helper.book,
          template: n.template,
          kind: "help",
          slots: n.slots,
          merit: MERITS.help,
          expiresAt: n.expiresAt.getTime(),
          notice: id,
        },
        resetAt: n.expiresAt.getTime(),
      },
    });
  }

  cancel(posterId: string, id: string): Promise<ExecResult> {
    return this.executor.execute(posterId, `help-cancel:${id}:${randomUUID()}`, "live.helpCancel", {
      notice: id,
    });
  }

  drop(helperId: string, id: string): Promise<ExecResult> {
    return this.executor.execute(helperId, `help-drop:${id}:${randomUUID()}`, "live.helpDrop", {
      notice: id,
    });
  }

  /** Taken notices by helper, for routing events while they play. */
  async helping(): Promise<
    {
      helperId: string;
      notice: string;
      posterId: string;
      template: string;
      slots: Record<string, string | number>;
      questId: string | null;
    }[]
  > {
    const { rows } = await this.db.execute(sql`
      select * from help_notices where state = 'taken'
        and expires_at > ${new Date(this.ctx.now()).toISOString()}::timestamptz`);
    return rows.map((r) => {
      const n = noticeFromDb(r);
      return {
        helperId: n.helperId as string,
        notice: n.id,
        posterId: n.posterId,
        template: n.template,
        slots: n.slots,
        questId: n.questId,
      };
    });
  }

  /** Notices whose time ran out come down. */
  async sweep(): Promise<void> {
    await this.db.execute(sql`
      update help_notices set state = 'cancelled'
      where state in ('open', 'taken') and expires_at <= ${new Date(this.ctx.now()).toISOString()}::timestamptz`);
    // Board rows a week past coming down are gone, done or not: a finished notice stays
    // claimable for that week. Story chapters never come down and are kept.
    const cutoff = new Date(this.ctx.now() - BOARD_KEEP_MS).toISOString();
    await this.db.execute(sql`
      delete from quest_progress
      where reset_at < ${cutoff}::timestamptz
        and (quest_id like 'daily:%' or quest_id like 'weekly:%' or quest_id like 'repeat:%'
          or quest_id like 'help:%' or quest_id like 'chore:%')`);
  }
}

export { timeFromDb };
