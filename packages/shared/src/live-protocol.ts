/**
 * The living world on the wire (PLAN §10, §11, §15, §21): requests the WorldRoom takes for the
 * Page, the 수행평가 board, 도움 notices, the 도감 and the 0조 연구노트, the `live` pushes it
 * sends, and the views both carry. Requests are validated by these schemas before a handler runs;
 * a refused request is answered on `refused` with a `LiveRefusal`, whose code the client words.
 */
import type { WorldMessageSchema } from "./chat.ts";
import type { QuestView } from "./inventory.ts";
import type { Modifiers } from "./live.ts";
import type { QuestReward } from "./progress.ts";

export const LIVE_MESSAGES = {
  /** Client to server: `LiveRead`. Answered by one `live` push of the view asked for. */
  read: "live.read",
  /** Client to server: `HelpPost`. Answered by a `help` push, or `refused`. */
  helpPost: "quest.help.post",
  /** Client to server: `HelpTake`. Answered by a `help` push to both players, or `refused`. */
  helpTake: "quest.help.take",
  /** Client to server: `HelpCancel`, by the poster, while nobody has taken the notice. */
  helpCancel: "quest.help.cancel",
  /** Client to server: `HelpDrop`, by the helper, giving a taken notice back. */
  helpDrop: "quest.help.drop",
  /** Server to client: `LivePush`. */
  push: "live",
} as const;

export const LIVE_READS = ["page", "board", "codex", "notebook", "rules"] as const;
export type LiveReadKind = (typeof LIVE_READS)[number];

export interface LiveRead {
  what: LiveReadKind;
  /** Client counter, echoed on the answer and on a refusal. */
  n: number;
}

export const HELP_TEMPLATES = ["help-hunt", "help-walk", "help-finish", "help-revive"] as const;
export type HelpTemplate = (typeof HELP_TEMPLATES)[number];

export interface HelpPost {
  template: HelpTemplate;
  /** `help-finish` only: the poster's own quest the helper helps finish. */
  quest?: string;
  n: number;
}

export interface HelpTake {
  notice: string;
  n: number;
}

export type HelpCancel = HelpTake;
export type HelpDrop = HelpTake;

/** Why a living-world request was refused. The client owns the copy for each. */
export const LIVE_REFUSAL_CODES = [
  "rate_limited",
  "server_error",
  /** No field of the live Page is open yet, so there is no board to draw. */
  "board_closed",
  /** The poster is not far enough below the frontier to ask for help. */
  "help_level",
  /** The poster already has an open notice. */
  "help_open",
  /** `help-finish` named a quest the poster does not have open. */
  "help_quest",
  /** The notice is gone, taken or finished. */
  "help_gone",
  "help_self",
  /** The helper is not far enough above the poster. */
  "help_helper_level",
  /** The helper already holds a notice. */
  "help_busy",
  /** Only the poster may take a notice down. */
  "help_not_poster",
  /** Sent home by 명령퇴사: the board waits. */
  "sent_home",
] as const;
export type LiveRefusalCode = (typeof LIVE_REFUSAL_CODES)[number];

export interface LiveRefusal {
  /** The message type that was refused. */
  type: string;
  code: LiveRefusalCode;
  n?: number;
  retryMs?: number;
}

// Views -----------------------------------------------------------------------------------

export type BossStateView = "sealed" | "open" | "freed";

/** The server's Page as everyone sees it. Times are game ms (the server clock). */
export interface PageView {
  page: number;
  milestone: string;
  /** Whole weeks since the rift opened. */
  week: number;
  openedAt: number;
  /** The server clock when the view was made, and how fast it runs against the wall. */
  now: number;
  rate: number;
  /** Era maps open on this Page. The hub is always open. */
  maps: string[];
  bosses: Record<string, BossStateView>;
  /** Highest monster level the open fields reach. */
  frontierLevel: number;
  /** The next time-driven step, if only time stands in its way. */
  nextAt: number | null;
  /** 시대 전환 reached. */
  sealed: boolean;
  /** When the daily and the weekly board next turn over. */
  nextDaily: number;
  nextWeekly: number;
}

export type NoticeCadence = "daily" | "weekly" | "repeat" | "story" | "help" | "chore";

/** A notice on a player's board: the quest row and what it was drawn as. */
export interface NoticeView extends QuestView {
  cadence: NoticeCadence;
  /** Narrative quest template id, or the story beat id for a story notice. */
  template: string;
  kind: string;
  /** Slot values the template is filled with: ids the client turns into names, and numbers. */
  slots: Record<string, string | number>;
  /** Fixed when the notice was posted. */
  reward: QuestReward;
  /** 상점 the notice pays (도움 notices pay the helper one). */
  merit: number;
  /** When the notice comes down; null for story chapters. */
  expiresAt: number | null;
}

export interface HelpNoticeView {
  id: string;
  poster: { id: string; name: string; level: number };
  helper: { id: string; name: string } | null;
  template: HelpTemplate;
  slots: Record<string, string | number>;
  count: number;
  progress: number;
  state: "open" | "taken" | "done" | "cancelled";
  postedAt: number;
  expiresAt: number;
}

export interface BoardView {
  /** Board day and week numbers (`boardDay`, `boardWeek`). */
  day: number;
  week: number;
  daily: NoticeView[];
  weekly: NoticeView[];
  /** The repeatable on offer now; the next one is drawn when it is claimed. */
  repeat: NoticeView | null;
  /** Repeatables claimed today, for the step-down. */
  repeatsToday: number;
  story: NoticeView[];
  /** Today's chores (청소 당번): finished in place, they pay their 상점 at once. */
  chores: NoticeView[];
  help: {
    /** The notice this player posted, while it is up. */
    mine: HelpNoticeView | null;
    /** The notice this player took to help someone. */
    taken: HelpNoticeView | null;
    /** Open notices this player could take, newest first. */
    open: HelpNoticeView[];
  };
}

export interface CodexView {
  /** Every unlocked entry with its server-clock time. */
  unlocked: { id: string; at: number }[];
  /** Lifetime kills by monster, for the 오개념 entries still locked. */
  kills: Record<string, number>;
  sets: { id: string; have: number; need: number; done: boolean }[];
  /** What completed sets add to `Modifiers`. */
  bonus: Partial<Record<keyof Modifiers, number>>;
}

export interface NotebookBoss {
  boss: string;
  freedAt: number | null;
  finalHit: { id: string; name: string } | null;
  /** Players who topped each board of the fight (damage, support, objectives). */
  leaders: { board: string; id: string; name: string }[];
}

/** One of the twelve stubs of the 0조 연구노트. */
export interface NotebookPage {
  page: number;
  /** `stub`: still torn out. `live`: the Page being played. `returned`: sealed. */
  state: "stub" | "live" | "returned";
  sealedAt: number | null;
  bosses: NotebookBoss[];
}

export interface NotebookView {
  pages: NotebookPage[];
}

export interface RulesView {
  /** 벌점 held, and where 명령퇴사 comes. */
  demerits: number;
  expelAt: number;
  /** Lifetime 상점. Spare 상점 is the wallet's `merit`. */
  merits: number;
  /** 상점 this board week, the 층장 count. */
  weekMerits: number;
  floorLeader: boolean;
  homeUntil: number | null;
  penaltyUntil: number | null;
  restedUntil: number | null;
  drowsy: boolean;
  meal: { id: string; until: number } | null;
  /** Today's 급식 menu id (`meal:<id>` describes it). */
  todayMeal: string;
  /** Award ids (`narrative.awards`). */
  titles: string[];
  patrolCatches: number;
  /** Full daily boards in a row, for 개근상. */
  boardStreak: number;
  modifiers: Modifiers;
}

export type LivePush =
  | { t: "page"; page: PageView; n?: number }
  | { t: "board"; board: BoardView; n?: number }
  | { t: "codex"; codex: CodexView; n?: number }
  | { t: "notebook"; notebook: NotebookView; n?: number }
  | { t: "rules"; rules: RulesView; n?: number }
  /** A notice reached its target (or a story chapter was played): ready for `quest.claim`. */
  | { t: "done"; quest: NoticeView }
  /** 도감 entries unlocked, by id. */
  | { t: "unlock"; entries: string[] }
  /** A 도움 notice this player posted or took changed. */
  | { t: "help"; notice: HelpNoticeView }
  /** 명령퇴사: home until then (game ms). */
  | { t: "home"; until: number }
  /** An award was given (`narrative.awards` id). */
  | { t: "award"; award: string }
  /** A scene's `play` condition the server met (`home-minute:3` in the home scene). */
  | { t: "scene"; until: string };

// Validators --------------------------------------------------------------------------------

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isCounter = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
const only = (o: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(o).every((k) => keys.includes(k));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const QUEST_ID_PATTERN = /^[a-z0-9:-]{1,64}$/;

function schema<Out>(check: (value: unknown) => Out | string): WorldMessageSchema<Out> {
  return {
    "~standard": {
      version: 1,
      vendor: "guago",
      validate(value) {
        const out = check(value);
        return typeof out === "string" ? { issues: [{ message: out }] } : { value: out };
      },
    },
  };
}

export const liveReadSchema = schema<LiveRead>((v) => {
  if (!isObject(v) || !only(v, ["what", "n"])) return "live.read is { what, n }";
  if (!(LIVE_READS as readonly unknown[]).includes(v.what)) return "unknown view";
  if (!isCounter(v.n)) return "n is a whole number";
  return { what: v.what as LiveReadKind, n: v.n };
});

export const helpPostSchema = schema<HelpPost>((v) => {
  if (!isObject(v) || !only(v, ["template", "quest", "n"])) return "help post is { template, n }";
  if (!(HELP_TEMPLATES as readonly unknown[]).includes(v.template)) return "unknown template";
  if (!isCounter(v.n)) return "n is a whole number";
  if (v.template === "help-finish") {
    if (typeof v.quest !== "string" || !QUEST_ID_PATTERN.test(v.quest))
      return "help-finish needs a quest";
    return { template: v.template, quest: v.quest, n: v.n };
  }
  if (v.quest !== undefined) return "only help-finish names a quest";
  return { template: v.template as HelpTemplate, n: v.n };
});

export const helpTakeSchema = schema<HelpTake>((v) => {
  if (!isObject(v) || !only(v, ["notice", "n"])) return "help take is { notice, n }";
  if (typeof v.notice !== "string" || !UUID.test(v.notice)) return "notice is an id";
  if (!isCounter(v.n)) return "n is a whole number";
  return { notice: v.notice, n: v.n };
});

export const helpCancelSchema: WorldMessageSchema<HelpCancel> = helpTakeSchema;
export const helpDropSchema: WorldMessageSchema<HelpDrop> = helpTakeSchema;

/** Reads a player may make: a burst, then so many a second. */
export const LIVE_RATE = { burst: 6, perSecond: 1 } as const;
