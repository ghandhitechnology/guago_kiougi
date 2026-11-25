/**
 * The living world's operations (PLAN §9, §11, §15), run by the one executor like every item and
 * currency operation: one transaction under the character lock, an idempotent id, ledger entries
 * for every unit and a conduct ledger row for every 벌점 and 상점. All are the server's own but
 * `drowsy.drink`. No rule lives here: thresholds and amounts come from `@guago/shared` and
 * `@guago/content`.
 */
import { goodsOf, killEntries, mealById, metEntries, visitEntries } from "@guago/content";
import {
  AWARD_RULES,
  addDemerits,
  addMerits,
  boardStreak,
  boardWeek,
  claimPool,
  type DemeritReason,
  EXPEL,
  earn,
  HELP_PAIR_DAILY,
  type LedgerEntry,
  type LogoutPlace,
  MEAL,
  MERITS,
  type MeritReason,
  mayHelp,
  mayPostHelp,
  neatBonus,
  type Purse,
  pay,
  type Rate,
  restedSeconds,
  SECOND_MS,
  sheet,
  tallyCredit,
} from "@guago/shared";
import type { Applied, CharacterChange, Loaded, OpDef, Step } from "../economy/ops.ts";
import {
  type CharacterRow,
  type ItemRow,
  poolNow,
  type QuestRow,
  type StoredOffer,
} from "../economy/rows.ts";
import type { HelpNoticeRow, LiveCharacter, LiveWrite } from "./rows.ts";

/** A notice as the board posts it: the quest row and when it comes down (game ms). */
export interface PostedQuest {
  id: string;
  target: number;
  offer: StoredOffer;
  resetAt: number | null;
}

/** One character's batched events since its last flush (PLAN §15 quest kinds). */
export interface ProgressRequest {
  /** Active quest rows to consider, read just before the flush. */
  quests: string[];
  kills: Record<string, number>;
  collect: Record<string, number>;
  deliver: Record<string, number>;
  escort: Record<string, number>;
  /** Waves cleared without being hit, by place. */
  nohit: Record<string, number>;
  /** Story beats played; bosses cleared (a 복습 fight or the live one). */
  story: string[];
  bosses: string[];
  /** `help:` quest rows to move, with how far. */
  help: Record<string, number>;
  visit: string[];
  met: string[];
  /** The 도움 notice behind the `help:` row, when there is one. */
  notice?: string;
  /** Board day of the batch, for the daily 상점 caps. */
  day: number;
}

export interface LogoutRequest {
  place: LogoutPlace;
  /** The session's best measured rate, in the field `field`, when a full window was measured. */
  measured: (Rate & { field: string; sheetBook: string | null }) | null;
  floorLeader: boolean;
}

export type ConductRequest =
  | { kind: "demerit"; reason: DemeritReason; amount: number }
  | {
      kind: "merit";
      reason: MeritReason;
      amount: number;
      neat: boolean;
      week: number;
      /** Board day, for the daily tally caps. */
      day: number;
    };

export interface LiveRequests {
  "live.board": { quests: PostedQuest[] };
  "live.progress": ProgressRequest;
  "live.codex": { entries: string[] };
  "live.conduct": ConductRequest;
  "live.login": Record<string, never>;
  "live.logout": LogoutRequest;
  "live.meal": { meal: string; week: number };
  "live.drowsy": { drowsy: boolean };
  "live.award": { award: string };
  /** 층장 of board week `week`: +5 상점, paid once by the row's `paid` flag. */
  "live.floorLeader": { week: number };
  "live.boardDay": { day: number };
  "live.helpPost": {
    notice: {
      id: string;
      template: string;
      slots: Record<string, string | number>;
      count: number;
      questId: string | null;
      postedAt: number;
      expiresAt: number;
    };
    frontierLevel: number;
  };
  "live.helpTake": { notice: string; quest: PostedQuest };
  "live.helpCancel": { notice: string };
  /** The helper gives a taken notice back: it is open again, their row ends unpaid. */
  "live.helpDrop": { notice: string };
}

/** The 도움 row of a helper: `help:<notice id>`. */
export const helpQuestId = (notice: string) => `help:${notice}`;
/** The five daily notices of board day `day`. */
export const dailyIds = (day: number) => [0, 1, 2, 3, 4].map((i) => `daily:${day}:${i}`);

interface Helpers {
  gainExp(l: Loaded, exp: number): { character: CharacterChange; put: ItemRow[] };
}

type LiveOp = keyof LiveRequests | "drowsy.drink";
type Defs = {
  [K in LiveOp]: OpDef<K extends keyof LiveRequests ? LiveRequests[K] : Record<string, never>>;
};

const ok = (value: Applied & { live?: LiveWrite }): Step => ({ ok: true, value });
const no = (error: string): Step => ({ ok: false, error: error as never });
const at = (ms: number) => new Date(ms);
const addTitle = (c: CharacterRow, title: string) =>
  c.titles.includes(title) ? c.titles : [...c.titles, title];

/**
 * 상점 earned: they cancel 벌점 first, the rest lands in the wallet as 학생회 상점 currency
 * (PLAN §11). Lifetime 상점 and the week's tally count every point.
 */
function earnMerits(
  c: CharacterRow,
  purse: Purse,
  amount: number,
  reason: string,
  /** The board week, and how many of `amount` count toward its 층장 tally. */
  tally: { week: number; counted: number },
): { purse: Purse; ledger: LedgerEntry[]; live: LiveWrite; cancelled: number; spare: number } {
  const { week, counted } = tally;
  const m = addMerits({ demerits: c.demerits }, amount);
  const paid = earn(purse, { merit: m.spare }, `merit.${reason}`);
  return {
    purse: paid.purse,
    ledger: paid.ledger,
    cancelled: m.cancelled,
    spare: m.spare,
    live: {
      character: { demerits: m.demerits, merits: c.merits + amount },
      conduct: [
        { kind: "merit", amount, reason },
        { kind: "demerit", amount: -m.cancelled, reason: "merit.cancel" },
      ],
      tally: counted > 0 ? [{ week, kind: "merit", n: counted }] : [],
    },
  };
}

/** What of `amount` counts toward the tally today, and the `merit_daily` row recording it. */
function counted(l: Loaded, reason: MeritReason, amount: number, day: number) {
  const n = tallyCredit(reason, amount, l.live.daily.get(reason) ?? 0);
  return { n, daily: { day, key: reason, n } };
}

function mergeLive(a: LiveWrite, b: LiveWrite): LiveWrite {
  return {
    ...a,
    ...b,
    character: { ...a.character, ...b.character },
    conduct: [...(a.conduct ?? []), ...(b.conduct ?? [])],
    tally: [...(a.tally ?? []), ...(b.tally ?? [])],
    daily: [...(a.daily ?? []), ...(b.daily ?? [])],
  };
}

const sum = (r: Record<string, number>) => Object.values(r).reduce((s, n) => s + n, 0);

/** How far one batch moves one notice. */
function increment(q: QuestRow, r: ProgressRequest): number {
  const o = q.offer;
  const slot = (k: string) => o.slots?.[k];
  if (o.cadence === "help") return r.help[q.id] ?? 0;
  if (o.cadence === "story") {
    const boss = o.kind === "boss" ? String(slot("boss") ?? "") : "";
    return boss ? Number(r.bosses.includes(boss)) : Number(r.story.includes(o.template ?? ""));
  }
  const pick = (m: Record<string, number>, key: string) => {
    const v = slot(key);
    return v === undefined ? sum(m) : (m[String(v)] ?? 0);
  };
  switch (o.kind) {
    case "hunt":
      return r.kills[String(slot("monster"))] ?? 0;
    case "collect":
      return r.collect[String(slot("item"))] ?? 0;
    case "deliver":
      return pick(r.deliver, "npc");
    case "escort":
      return pick(r.escort, "npc");
    case "nohit":
      return pick(r.nohit, "place");
    default:
      return 0;
  }
}

export function liveOps(h: Helpers): Defs {
  return {
    "live.board": {
      client: false,
      rows: () => ({}),
      currencies: () => [],
      apply(_l, req) {
        const quests = req.quests.map((p) => ({
          row: {
            id: p.id,
            state: "active" as const,
            progress: 0,
            target: p.target,
            offer: p.offer,
          },
          resetAt: p.resetAt === null ? null : at(p.resetAt),
        }));
        return ok({ character: {}, live: { quests }, outcome: { posted: quests.length } });
      },
    },

    "live.progress": {
      client: false,
      rows: (req) => ({
        quests: req.quests,
        live: {
          tallyDay: req.day,
          kills: Object.keys(req.kills),
          ...(req.notice ? { notice: req.notice } : {}),
        },
      }),
      currencies: (req) => (Object.keys(req.help).length > 0 ? ["merit"] : []),
      apply(l, req, env) {
        const now = env.now.getTime();
        const changed: QuestRow[] = [];
        const done: string[] = [];
        let purse = l.purse;
        const ledger: LedgerEntry[] = [];
        let live: LiveWrite = {};
        for (const q of l.quests.values()) {
          if (q.state !== "active") continue;
          if (q.offer.expiresAt != null && q.offer.expiresAt <= now) continue;
          const inc = increment(q, req);
          if (inc <= 0) continue;
          const progress = Math.min(q.target, q.progress + inc);
          if (progress < q.target) {
            changed.push({ ...q, progress });
            continue;
          }
          done.push(q.id);
          if (q.offer.cadence !== "help") {
            changed.push({ ...q, progress, state: "done" });
            continue;
          }
          // A 도움 notice pays the helper on the spot, once: the row goes straight to claimed.
          changed.push({ ...q, progress, state: "claimed" });
          const n = l.live.notice;
          // The same helper and poster are paid once a board day; the notice still counts done.
          const pair = n ? `help:${n.posterId}` : "";
          const paidPair =
            (l.live.daily.get(pair) ?? 0) + (live.daily ?? []).filter((d) => d.key === pair).length;
          if (q.offer.merit && n && paidPair < HELP_PAIR_DAILY) {
            const c = counted(l, "help", q.offer.merit, req.day);
            const m = earnMerits(
              { ...l.character, ...live.character } as CharacterRow,
              purse,
              q.offer.merit,
              "help",
              { week: boardWeek(now), counted: c.n },
            );
            purse = m.purse;
            ledger.push(...m.ledger);
            live = mergeLive(live, {
              ...m.live,
              daily: [c.daily, { day: req.day, key: pair, n: 1 }],
            });
          }
          if (
            n &&
            n.id === q.offer.notice &&
            n.state === "taken" &&
            n.helperId === l.character.id
          ) {
            live.notice = { update: { id: n.id, state: "done", helperId: n.helperId } };
          }
        }
        // Lifetime kills, and the 오개념 entries they reach.
        const kills: Record<string, number> = {};
        for (const [m, n] of Object.entries(req.kills)) kills[m] = (l.live.kills.get(m) ?? 0) + n;
        const total = (ms: readonly string[]) =>
          ms.reduce((s, m) => s + (kills[m] ?? l.live.kills.get(m) ?? 0), 0);
        const codex = [
          ...killEntries()
            .filter((e) => e.monsters.some((m) => m in kills) && total(e.monsters) >= e.count)
            .map((e) => e.id),
          ...req.visit.flatMap(visitEntries),
          ...req.met.flatMap(metEntries),
        ];
        if (Object.keys(kills).length > 0) live.kills = kills;
        return ok({
          character: {},
          purse,
          ledger,
          quests: changed,
          codex: [...new Set(codex)],
          live,
          outcome: { done },
        });
      },
    },

    "live.codex": {
      client: false,
      rows: () => ({}),
      currencies: () => [],
      apply: (_l, req) => ok({ codex: req.entries, outcome: { entries: req.entries } }),
    },

    "live.conduct": {
      client: false,
      rows: (req) => (req.kind === "merit" ? { live: { tallyDay: req.day } } : {}),
      currencies: (req) => (req.kind === "merit" ? ["merit"] : []),
      apply(l, req, env) {
        const c = l.character;
        const now = env.now.getTime();
        if (req.kind === "merit") {
          const rolls = Array.from({ length: req.amount }, () => env.roll());
          const extra = req.neat ? neatBonus(req.amount, rolls) : 0;
          const total = req.amount + extra;
          const t = counted(l, req.reason, total, req.day);
          const m = earnMerits(c, l.purse, total, req.reason, { week: req.week, counted: t.n });
          return ok({
            character: {},
            purse: m.purse,
            ledger: m.ledger,
            live: { ...m.live, daily: [t.daily] },
            outcome: {
              cancelled: m.cancelled,
              spare: m.spare,
              extra,
              demerits: c.demerits - m.cancelled,
            },
          });
        }
        const d = addDemerits({ demerits: c.demerits }, req.amount);
        const ch: LiveCharacter = { demerits: d.demerits };
        const conduct: { kind: "demerit" | "merit"; amount: number; reason: string }[] = [
          { kind: "demerit", amount: req.amount, reason: req.reason },
        ];
        let titles = c.titles;
        if (req.reason === "patrol") {
          ch.patrolCatches = c.patrolCatches + 1;
          if (ch.patrolCatches >= AWARD_RULES.caught) titles = addTitle({ ...c, titles }, "caught");
        }
        if (d.expelled) {
          // 명령퇴사: home for ten minutes, then an hour at −30% EXP; 벌점 start again from 0.
          conduct.push({ kind: "demerit", amount: -d.reached, reason: "expel" });
          const home = now + EXPEL.homeSeconds * SECOND_MS;
          ch.homeUntil = at(home);
          ch.penaltyUntil = at(home + EXPEL.penaltySeconds * SECOND_MS);
          ch.expulsions = c.expulsions + 1;
          titles = addTitle({ ...c, titles }, "went-home");
        }
        if (titles !== c.titles) ch.titles = titles;
        return ok({
          character: {},
          live: { character: ch, conduct },
          outcome: {
            demerits: d.demerits,
            expelled: d.expelled,
            reached: d.reached,
            titles: titles.filter((t) => !c.titles.includes(t)),
          },
        });
      },
    },

    "live.login": {
      client: false,
      rows: () => ({}),
      currencies: () => [],
      apply(l, _req, env) {
        const c = l.character;
        const ch: LiveCharacter = {};
        const away = c.poolStartedAt !== null && c.poolStoppedAt === null;
        if (away) ch.poolStoppedAt = env.now;
        // 숙면, earned by how long the player actually slept in the 기숙사.
        const slept =
          away && c.poolPlace === "dorm" && c.poolStartedAt
            ? restedSeconds((env.now.getTime() - c.poolStartedAt.getTime()) / SECOND_MS)
            : 0;
        const rested = slept > 0;
        if (rested) ch.restedUntil = at(env.now.getTime() + slept * SECOND_MS);
        return ok({ character: {}, live: { character: ch }, outcome: { rested } });
      },
    },

    "live.logout": {
      client: false,
      rows: () => ({ worn: true }),
      currencies: (_req, l) => [
        "pinecone",
        "ink",
        ...(l.character.poolSheetBook ? [sheet(l.character.poolSheetBook)] : []),
      ],
      apply(l, req, env) {
        const c = l.character;
        // A pool left unclaimed is paid out before the new one starts, so no fill is lost.
        const old = poolNow(c, env.now, env.page);
        let purse = l.purse;
        const ledger: LedgerEntry[] = [];
        let gained: { character: CharacterChange; put: ItemRow[] } = { character: {}, put: [] };
        if (old) {
          const r = claimPool(purse, old.fill, c.poolSheetBook ?? undefined);
          if (!r.ok) return no(r.error);
          purse = r.state.purse;
          ledger.push(...r.ledger);
          gained = h.gainExp(l, r.state.exp);
        }
        const hunt = req.measured ?? c.huntRates;
        const rates: Rate = hunt
          ? { exp: hunt.exp, pinecone: hunt.pinecone, sheets: hunt.sheets, ink: hunt.ink }
          : { exp: 0, pinecone: 0, sheets: 0, ink: 0 };
        return ok({
          purse,
          ledger,
          put: gained.put,
          character: {
            ...gained.character,
            poolStartedAt: env.now,
            poolRates: { ...rates, ...(req.floorLeader ? { floorLeader: true } : {}) },
            poolPlace: req.place,
            poolSheetBook: hunt?.sheetBook ?? null,
          },
          live: {
            character: {
              poolStoppedAt: null,
              ...(req.measured ? { huntRates: req.measured } : {}),
            },
          },
          outcome: { place: req.place, settled: old ? old.fill.seconds : 0 },
        });
      },
    },

    "live.meal": {
      client: false,
      rows: () => ({}),
      currencies: () => [],
      apply(l, req, env) {
        const now = env.now.getTime();
        if (!mealById(req.meal)) return no("unknown_def");
        if (l.character.mealUntil && l.character.mealUntil.getTime() > now) return no("meal_full");
        const until = now + MEAL.seconds * SECOND_MS;
        return ok({
          character: {},
          live: {
            character: { mealId: req.meal, mealUntil: at(until) },
            tally: [{ week: req.week, kind: "meal", n: 1 }],
          },
          outcome: { meal: req.meal, until },
        });
      },
    },

    "live.drowsy": {
      client: false,
      rows: () => ({}),
      currencies: () => [],
      apply: (l, req) =>
        l.character.drowsy === req.drowsy
          ? ok({ outcome: { drowsy: req.drowsy } })
          : ok({
              character: {},
              live: { character: { drowsy: req.drowsy } },
              outcome: { drowsy: req.drowsy },
            }),
    },

    "drowsy.drink": {
      client: true,
      rows: () => ({}),
      currencies: () => [goodsOf("energy-drink")],
      apply(l) {
        const paid = pay(l.purse, { [goodsOf("energy-drink")]: 1 }, "use.energy-drink");
        if (!paid) return no("drink_none");
        return ok({
          purse: paid.purse,
          ledger: paid.ledger,
          character: {},
          live: { character: { drowsy: false } },
          outcome: { drowsy: false },
        });
      },
    },

    "live.award": {
      client: false,
      rows: () => ({}),
      currencies: () => [],
      apply(l, req) {
        if (l.character.titles.includes(req.award)) return ok({ outcome: { award: "" } });
        return ok({
          character: {},
          live: { character: { titles: addTitle(l.character, req.award) } },
          outcome: { award: req.award },
        });
      },
    },

    "live.floorLeader": {
      client: false,
      rows: (req) => ({ live: { leader: req.week } }),
      currencies: () => ["merit"],
      apply(l, req) {
        const row = l.live.leader;
        if (!row) return no("not_leader");
        if (row.paid) return ok({ outcome: { paid: false } });
        // The 층장's own +5 never counts toward choosing the next 층장.
        const m = earnMerits(l.character, l.purse, MERITS["floor-leader"], "floor-leader", {
          week: req.week,
          counted: 0,
        });
        return ok({
          character: {},
          purse: m.purse,
          ledger: m.ledger,
          live: { ...m.live, leaderPaid: req.week },
          outcome: {
            paid: true,
            cancelled: m.cancelled,
            demerits: l.character.demerits - m.cancelled,
          },
        });
      },
    },

    "live.boardDay": {
      client: false,
      rows: (req) => ({ quests: dailyIds(req.day) }),
      currencies: () => [],
      apply(l, req) {
        const c = l.character;
        const full =
          l.quests.size === dailyIds(req.day).length &&
          [...l.quests.values()].every((q) => q.state === "claimed");
        if (!full || c.boardStreakDay === req.day)
          return ok({ outcome: { streak: c.boardStreak } });
        const last =
          c.boardStreakDay === null ? null : { day: c.boardStreakDay, streak: c.boardStreak };
        const streak = boardStreak(last, req.day);
        const titles = streak >= AWARD_RULES.attendance ? addTitle(c, "attendance") : c.titles;
        return ok({
          character: {},
          live: {
            character: {
              boardStreak: streak,
              boardStreakDay: req.day,
              ...(titles !== c.titles ? { titles } : {}),
            },
          },
          outcome: { streak, award: titles !== c.titles ? "attendance" : "" },
        });
      },
    },

    "live.helpPost": {
      client: false,
      rows: (req) => ({
        quests: req.notice.questId ? [req.notice.questId] : [],
        live: { helpState: true },
      }),
      currencies: () => [],
      apply(l, req) {
        const n = req.notice;
        if (!mayPostHelp(l.character.level, req.frontierLevel)) return no("help_level");
        if (l.live.posted) return no("help_open");
        if (n.questId && l.quests.get(n.questId)?.state !== "active") return no("help_quest");
        const row: HelpNoticeRow = {
          ...n,
          posterId: l.character.id,
          posterLevel: l.character.level,
          state: "open",
          helperId: null,
          postedAt: at(n.postedAt),
          expiresAt: at(n.expiresAt),
        };
        return ok({ live: { notice: { insert: row } }, outcome: { notice: n.id } });
      },
    },

    "live.helpTake": {
      client: false,
      rows: (req) => ({ quests: [req.quest.id], live: { notice: req.notice, helpState: true } }),
      currencies: () => [],
      apply(l, req, env) {
        const n = l.live.notice;
        if (n?.state !== "open" || n.expiresAt.getTime() <= env.now.getTime())
          return no("help_gone");
        // A helper who gave this notice back does not take it again.
        if (l.quests.has(req.quest.id)) return no("help_gone");
        if (n.posterId === l.character.id) return no("help_self");
        if (!mayHelp(l.character.level, n.posterLevel)) return no("help_helper_level");
        if (l.live.helping) return no("help_busy");
        const p = req.quest;
        return ok({
          character: {},
          live: {
            notice: { update: { id: n.id, state: "taken", helperId: l.character.id } },
            quests: [
              {
                row: { id: p.id, state: "active", progress: 0, target: p.target, offer: p.offer },
                resetAt: p.resetAt === null ? null : at(p.resetAt),
              },
            ],
          },
          outcome: { notice: n.id, poster: n.posterId },
        });
      },
    },

    "live.helpCancel": {
      client: false,
      rows: (req) => ({ live: { notice: req.notice } }),
      currencies: () => [],
      apply(l) {
        const n = l.live.notice;
        if (!n || n.posterId !== l.character.id) return no("help_not_poster");
        if (n.state !== "open") return no("help_gone");
        return ok({
          live: { notice: { update: { id: n.id, state: "cancelled", helperId: null } } },
          outcome: { notice: n.id },
        });
      },
    },

    "live.helpDrop": {
      client: false,
      rows: (req) => ({ quests: [helpQuestId(req.notice)], live: { notice: req.notice } }),
      currencies: () => [],
      apply(l) {
        const n = l.live.notice;
        const q = l.quests.get(helpQuestId(n?.id ?? ""));
        if (n?.state !== "taken" || n.helperId !== l.character.id || q?.state !== "active") {
          return no("help_gone");
        }
        return ok({
          // Claimed with nothing paid: the row is over and blocks taking the notice again.
          quests: [{ ...q, state: "claimed", progress: q.target }],
          live: { notice: { update: { id: n.id, state: "open", helperId: null } } },
          outcome: { notice: n.id },
        });
      },
    },
  };
}
