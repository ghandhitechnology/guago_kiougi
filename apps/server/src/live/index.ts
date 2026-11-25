/**
 * The living world (PLAN §10, §11, §15): the Page clock, the 수행평가 board and 도움 notices,
 * the 도감, the 자습 pool at logout and the school rules, wired to the executor, the seats and
 * the WorldRoom. `createLive` returns the service; `live.events` is what combat, navigation and
 * the raid system call. Nothing here runs on a map's simulation tick: events land in memory and
 * the database work happens in batches and in the background.
 */
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  CODEX_SETS,
  codexBonus,
  completedSets,
  freedEntries,
  LIFECYCLES,
  type Milestone,
  mealById,
  mealOf,
  NEAT,
} from "@guago/content";
import {
  boardWeek,
  type Character,
  CLUB_EXP_FOR_NOTICE,
  type CodexView,
  DEMERIT_WARNING,
  DEMERITS,
  DESK_CURE_SECONDS,
  type DemeritReason,
  DROWSY,
  EXPEL,
  FLOOR_LEADERS,
  type HelpTemplate,
  helpCancelSchema,
  helpPostSchema,
  helpTakeSchema,
  LIVE_MESSAGES,
  LIVE_RATE,
  type LivePush,
  type LiveRead,
  type LiveRefusal,
  type LiveRefusalCode,
  type LookOptions,
  liveReadSchema,
  MERITS,
  type MeritReason,
  type Modifiers,
  modifiers,
  NO_MODIFIERS,
  type RuleState,
  type RulesView,
  SECOND_MS,
  WORLD_MESSAGES,
  type WorldMessageSchema,
} from "@guago/shared";
import { sql } from "drizzle-orm";
import { clubActivity } from "../club-activity.ts";
import type { Db } from "../db/index.ts";
import { describeError } from "../db/index.ts";
import { Buckets } from "../economy/buckets.ts";
import { type ExecResult, isTransient } from "../economy/executor.ts";
import type { Economy } from "../economy/index.ts";
import type { AnyOp, Requests } from "../economy/ops.ts";
import {
  CHARACTER_COLUMNS,
  type CharacterRow,
  characterFromDb,
  timeFromDb,
} from "../economy/rows.ts";
import { places } from "../places.ts";
import type { SeatSlot } from "../seats.ts";
import { Board, noticeView } from "./board.ts";
import type { LiveClock } from "./clock.ts";
import { dailyIds, helpQuestId } from "./ops.ts";
import type { FreedRecord, PageClock } from "./page.ts";
import { IncomeTracker, isHub, logoutPlace } from "./pool.ts";
import { ProgressBuffer } from "./progress.ts";

/** What the living world needs from the WorldRoom: pushes and server lines to players. */
export interface LiveWorld {
  sendTo(characterId: string, type: string, body: unknown): void;
  notify(characterId: string, change: Extract<ExecResult, { ok: true }>["change"]): void;
  system(line: { key: string; params?: Record<string, string | number> }, to?: string): void;
}

/** A WorldRoom request handler: the room checks the schema, then runs it for the sender. */
export interface WorldHandler {
  type: string;
  schema: WorldMessageSchema<unknown>;
  run(characterId: string, message: unknown): Promise<void>;
}

export interface LiveOptions {
  clock: LiveClock;
  page: PageClock;
  economy: Economy;
  /** The WorldRoom, once it exists. */
  world: () => LiveWorld | undefined;
  /** Student look options, to tell the school uniform. */
  looks?: () => LookOptions;
  /**
   * A test server: the admin route may also move the clock, free bosses, restart the Page and
   * inject combat and navigation events. Off, it only reads.
   */
  testEvents?: boolean;
  /** Bearer token `POST /admin/live` requires (`SERVER_SECRET`); without it the route is off. */
  adminSecret?: string;
  log?: (line: string) => void;
}

interface Online {
  sessionId: string;
  name: string;
  look: Character["look"];
  rules: RuleState;
}

interface Help {
  helperId: string;
  notice: string;
  posterId: string;
  template: string;
  slots: Record<string, string | number>;
  questId: string | null;
}

const refusalOf: Readonly<Record<string, LiveRefusalCode>> = {
  help_level: "help_level",
  help_open: "help_open",
  help_quest: "help_quest",
  help_gone: "help_gone",
  help_self: "help_self",
  help_helper_level: "help_helper_level",
  help_busy: "help_busy",
  help_not_poster: "help_not_poster",
  board_closed: "board_closed",
};

export function createLive(db: Db, o: LiveOptions) {
  const { clock, page, economy } = o;
  const executor = economy.executor;
  const log = o.log ?? ((line: string) => console.error(line));
  const now = () => clock.now();
  const income = new IncomeTracker(now);
  const board = new Board(db, executor, {
    now,
    page: page.live,
    milestone: () => page.milestone(),
    maps: () => page.progress().maps,
    frontierLevel: () => page.progress().frontierLevel,
  });
  const online = new Map<string, Online>();
  const helping = new Map<string, Help>();
  const autoSince = new Map<string, number>();
  const deskSince = new Map<string, number>();
  const homeUntil = new Map<string, number>();
  const sentHome = new Set<(characterId: string, until: number) => void>();
  let floorLeaders = { week: -1, ids: new Set<string>() };
  const buckets = new Buckets();

  const world = () => o.world();
  const push = (characterId: string, p: LivePush) =>
    world()?.sendTo(characterId, LIVE_MESSAGES.push, p);
  const line = (key: string, params?: Record<string, string | number>, to?: string) =>
    world()?.system({ key, ...(params ? { params } : {}) }, to);
  const notify = (characterId: string, r: ExecResult) => {
    if (r.ok) world()?.notify(characterId, r.change);
  };
  /** Work off the caller's path: it never throws, and a caller may leave the promise alone. */
  const background = (what: string, work: () => Promise<unknown>): Promise<void> =>
    Promise.resolve()
      .then(work)
      .then(
        () => {},
        (error) => log(`live ${what} failed: ${describeError(error)}`),
      );

  /** Runs a server operation, retrying a dropped connection under the same id. */
  async function run<K extends AnyOp>(
    characterId: string,
    opId: string,
    name: K,
    request: Requests[K],
  ): Promise<ExecResult> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await executor.execute(characterId, opId, name, request);
      } catch (error) {
        if (!isTransient(error) || attempt >= 2) throw error;
      }
    }
  }

  // Character state -------------------------------------------------------------------------

  async function character(
    characterId: string,
  ): Promise<(CharacterRow & { name: string }) | undefined> {
    const { rows } = await db.execute(
      sql`select ${sql.raw(CHARACTER_COLUMNS)}, c.name from characters c where c.id = ${characterId}`,
    );
    const r = rows[0];
    return r ? { ...characterFromDb(r), name: r.name as string } : undefined;
  }

  async function unlocked(characterId: string): Promise<{ id: string; at: number }[]> {
    const { rows } = await db.execute(sql`
      select entry_id, unlocked_at from codex_unlocks where character_id = ${characterId}
      order by unlocked_at, entry_id`);
    return rows.map((r) => ({
      id: r.entry_id as string,
      at: (timeFromDb(r.unlocked_at) as Date).getTime(),
    }));
  }

  function ruleState(c: CharacterRow, codex: readonly string[]): RuleState {
    const def = c.mealId ? mealById(c.mealId) : undefined;
    return {
      restedUntil: c.restedUntil?.getTime() ?? null,
      penaltyUntil: c.penaltyUntil?.getTime() ?? null,
      drowsy: c.drowsy,
      meal:
        def && c.mealUntil
          ? { until: c.mealUntil.getTime(), stat: def.stat, amount: def.amount }
          : null,
      codex: codexBonus(new Set(codex)),
    };
  }

  async function isFloorLeader(characterId: string): Promise<boolean> {
    const week = boardWeek(now());
    if (floorLeaders.week !== week) {
      const { rows } = await db.execute(
        sql`select character_id from floor_leaders where week = ${week}`,
      );
      floorLeaders = { week, ids: new Set(rows.map((r) => r.character_id as string)) };
    }
    return floorLeaders.ids.has(characterId);
  }

  /** Reads the rules state fresh, caches it for `modifiers`, and pushes it if online. */
  async function refreshRules(characterId: string, n?: number): Promise<RulesView | undefined> {
    const c = await character(characterId);
    if (!c) return undefined;
    const codex = (await unlocked(characterId)).map((u) => u.id);
    const rules = ruleState(c, codex);
    const me = online.get(characterId);
    if (me) me.rules = rules;
    const t = now();
    const week = boardWeek(t);
    const tally = await db.execute(sql`
      select n from weekly_tally where week = ${week} and kind = 'merit' and character_id = ${characterId}`);
    const home = c.homeUntil && c.homeUntil.getTime() > t ? c.homeUntil.getTime() : null;
    if (home) homeUntil.set(characterId, home);
    const view: RulesView = {
      demerits: c.demerits,
      expelAt: EXPEL.at,
      merits: c.merits,
      weekMerits: Number(tally.rows[0]?.n ?? 0),
      floorLeader: await isFloorLeader(characterId),
      homeUntil: home,
      penaltyUntil: c.penaltyUntil?.getTime() ?? null,
      restedUntil: c.restedUntil?.getTime() ?? null,
      drowsy: c.drowsy,
      meal:
        c.mealId && c.mealUntil && c.mealUntil.getTime() > t
          ? { id: c.mealId, until: c.mealUntil.getTime() }
          : null,
      todayMeal: mealOf(t).id,
      titles: c.titles,
      patrolCatches: c.patrolCatches,
      boardStreak: c.boardStreak,
      modifiers: modifiers(rules, t),
    };
    push(characterId, { t: "rules", rules: view, ...(n === undefined ? {} : { n }) });
    return view;
  }

  async function codexView(characterId: string): Promise<CodexView> {
    const list = await unlocked(characterId);
    const have = new Set(list.map((u) => u.id));
    const { rows } = await db.execute(
      sql`select monster_id, kills from kill_counts where character_id = ${characterId}`,
    );
    const done = new Set(completedSets(have).map((s) => s.id));
    return {
      unlocked: list,
      kills: Object.fromEntries(rows.map((r) => [r.monster_id as string, Number(r.kills)])),
      sets: CODEX_SETS.map((s) => ({
        id: s.id,
        have: s.entries.filter((e) => have.has(e)).length,
        need: s.entries.length,
        done: done.has(s.id),
      })),
      bonus: codexBonus(have),
    };
  }

  // Board -----------------------------------------------------------------------------------

  async function ensureBoard(characterId: string, pushIt: boolean, n?: number): Promise<void> {
    const r = await board.ensure(characterId);
    if (r) notify(characterId, r);
    if (pushIt) {
      push(characterId, {
        t: "board",
        board: await board.view(characterId),
        ...(n === undefined ? {} : { n }),
      });
    }
  }

  /** The `done` push for notices a batch finished, and what follows for 도움 notices. */
  async function finished(characterId: string, done: readonly string[]): Promise<void> {
    for (const id of done) {
      const q = await board.quest(characterId, id);
      if (q) push(characterId, { t: "done", quest: noticeView(q) });
      if (id.startsWith("help:")) {
        const h = helping.get(characterId);
        helping.delete(characterId);
        line("merit.help", undefined, characterId);
        clubActivity.add(characterId, CLUB_EXP_FOR_NOTICE.help);
        const view = await board.notice(id.slice("help:".length));
        if (view) {
          push(characterId, { t: "help", notice: view });
          push(view.poster.id, { t: "help", notice: view });
        }
        if (h) void refreshRules(characterId);
      }
    }
    // The poster finished a quest a helper was helping with (`help-finish`).
    for (const h of helping.values()) {
      if (
        h.posterId === characterId &&
        h.template === "help-finish" &&
        h.questId &&
        done.includes(h.questId)
      ) {
        if (sameRoom(h.helperId, characterId))
          progress.help(h.helperId, helpQuestId(h.notice), h.notice);
      }
    }
  }

  const progress = new ProgressBuffer(db, executor, () => clock.date(), {
    log,
    onLanded(characterId, result) {
      notify(characterId, result);
      const done = (result.outcome.done as readonly string[] | undefined) ?? [];
      const codex = result.change.codex ?? [];
      if (codex.length > 0) {
        push(characterId, { t: "unlock", entries: [...codex] });
        background("rules", () => refreshRules(characterId));
      }
      if (done.length > 0) background("done", () => finished(characterId, done));
    },
  });

  function sameRoom(a: string, b: string): boolean {
    const pa = places.get(a);
    const pb = places.get(b);
    return pa !== undefined && pb !== undefined && pa.roomId === pb.roomId;
  }

  function helpersOf(posterId: string): Help[] {
    return [...helping.values()].filter((h) => h.posterId === posterId);
  }

  async function loadHelping(): Promise<void> {
    helping.clear();
    for (const h of await board.helping()) helping.set(h.helperId, h);
  }

  // School rules ----------------------------------------------------------------------------

  function neat(characterId: string): boolean {
    const me = online.get(characterId);
    const at = places.get(characterId);
    if (!me || !at || !isHub(at.mapId)) return false;
    const layers = o.looks?.().accessories ?? {};
    return (
      (NEAT.uniforms as readonly string[]).includes(me.look.uniform) &&
      !me.look.accessories.some((a) => layers[a] === NEAT.jacketLayer)
    );
  }

  async function conduct(
    characterId: string,
    req: { kind: "demerit"; reason: DemeritReason } | { kind: "merit"; reason: MeritReason },
    opId = `conduct:${randomUUID()}`,
  ): Promise<ExecResult> {
    const amount = req.kind === "demerit" ? DEMERITS[req.reason] : MERITS[req.reason];
    const result = await run(
      characterId,
      opId,
      "live.conduct",
      req.kind === "demerit"
        ? { kind: "demerit", reason: req.reason, amount }
        : {
            kind: "merit",
            reason: req.reason,
            amount,
            neat: neat(characterId),
            week: boardWeek(now()),
          },
    );
    if (!result.ok) {
      log(`conduct ${req.kind}.${req.reason} for ${characterId} refused: ${result.error}`);
      return result;
    }
    notify(characterId, result);
    const out = result.outcome;
    line(`${req.kind}.${req.reason}`, undefined, characterId);
    if (req.kind === "merit" && Number(out.cancelled) > 0) {
      line("merit.cancel", { count: Number(out.demerits) }, characterId);
    }
    if (req.kind === "demerit" && !out.expelled && Number(out.demerits) >= DEMERIT_WARNING) {
      line("demerit.warning", { count: Number(out.demerits) }, characterId);
    }
    if (out.expelled) {
      const until = now() + EXPEL.homeSeconds * SECOND_MS;
      homeUntil.set(characterId, until);
      line("expel.notice", undefined, characterId);
      push(characterId, { t: "home", until });
      for (const l of sentHome) {
        try {
          l(characterId, until);
        } catch (error) {
          log(`sent-home listener failed: ${describeError(error)}`);
        }
      }
    }
    for (const award of (out.titles as readonly string[] | undefined) ?? []) {
      push(characterId, { t: "award", award });
      if (award === "went-home") {
        const name = online.get(characterId)?.name ?? (await character(characterId))?.name ?? "";
        line("expel.title", { player: name });
      }
    }
    await refreshRules(characterId);
    return result;
  }

  async function eat(characterId: string): Promise<"ok" | "meal_full" | "sent_home"> {
    if ((homeUntil.get(characterId) ?? 0) > now()) return "sent_home";
    const t = now();
    const meal = mealOf(t);
    const result = await run(characterId, `meal:${randomUUID()}`, "live.meal", {
      meal: meal.id,
      week: boardWeek(t),
    });
    if (!result.ok) return "meal_full";
    notify(characterId, result);
    await refreshRules(characterId);
    return "ok";
  }

  async function setDrowsy(characterId: string, drowsy: boolean): Promise<void> {
    const r = await run(characterId, `drowsy:${randomUUID()}`, "live.drowsy", { drowsy });
    notify(characterId, r);
    await refreshRules(characterId);
  }

  /** 졸음 and its cures, on the server clock. */
  function checkDrowsy(t: number): void {
    for (const [id, me] of online) {
      const since = autoSince.get(id);
      if (!me.rules.drowsy && since !== undefined && t - since >= DROWSY.afterSeconds * SECOND_MS) {
        me.rules = { ...me.rules, drowsy: true };
        background("drowsy", () => setDrowsy(id, true));
      }
      const desk = deskSince.get(id);
      if (me.rules.drowsy && desk !== undefined && t - desk >= DESK_CURE_SECONDS * SECOND_MS) {
        me.rules = { ...me.rules, drowsy: false };
        deskSince.delete(id);
        if (autoSince.has(id)) autoSince.set(id, t);
        background("drowsy", () => setDrowsy(id, false));
      }
    }
  }

  function checkHome(t: number): void {
    for (const [id, until] of homeUntil) {
      if (until > t) continue;
      homeUntil.delete(id);
      if (online.has(id)) line("expel.return", undefined, id);
    }
  }

  // Codex -------------------------------------------------------------------------------------

  async function freedCodex(characterId: string): Promise<void> {
    const { rows } = await db.execute(sql`select boss_id from notebook_bosses`);
    const entries = [...new Set(rows.flatMap((r) => freedEntries(r.boss_id as string)))].sort();
    if (entries.length === 0) return;
    const r = await run(
      characterId,
      `codex-freed:${entries.join(",")}`.slice(0, 64),
      "live.codex",
      {
        entries,
      },
    );
    notify(characterId, r);
    const codex = r.ok ? (r.change.codex ?? []) : [];
    if (codex.length > 0) {
      push(characterId, { t: "unlock", entries: [...codex] });
      await refreshRules(characterId);
    }
  }

  // Sessions ----------------------------------------------------------------------------------

  async function joined(c: Character, slot: SeatSlot, sessionId: string): Promise<void> {
    if (slot !== "world") return;
    const row = await character(c.id);
    online.set(c.id, {
      sessionId,
      name: c.name,
      look: c.look,
      rules: row ? ruleState(row, []) : NO_RULES,
    });
    const login = await run(c.id, `login:${sessionId}`, "live.login", {});
    notify(c.id, login);
    push(c.id, { t: "page", page: page.view() });
    await freedCodex(c.id);
    await ensureBoard(c.id, false);
    await refreshRules(c.id);
    const home = homeUntil.get(c.id);
    if (home && home > now()) push(c.id, { t: "home", until: home });
  }

  async function left(
    characterId: string,
    slot: SeatSlot,
    sessionId: string,
    replaced: boolean,
  ): Promise<void> {
    await progress.flush(characterId);
    if (slot !== "world" || replaced) return;
    const me = online.get(characterId);
    if (!me || me.sessionId !== sessionId) return;
    online.delete(characterId);
    autoSince.delete(characterId);
    deskSince.delete(characterId);
    const at = places.get(characterId)?.at();
    let where = { mapId: places.get(characterId)?.mapId ?? "", x: at?.x ?? 0, y: at?.y ?? 0 };
    if (!at) {
      const { rows } = await db.execute(
        sql`select map_id, x, y from characters where id = ${characterId}`,
      );
      const r = rows[0];
      if (r) where = { mapId: r.map_id as string, x: Number(r.x), y: Number(r.y) };
    }
    const measured = income.measure(characterId);
    income.end(characterId);
    const result = await run(characterId, `logout:${sessionId}`, "live.logout", {
      place: logoutPlace(where.mapId, where.x, where.y),
      measured,
      floorLeader: await isFloorLeader(characterId),
    });
    if (!result.ok) log(`logout pool for ${characterId} refused: ${result.error}`);
  }

  // Page hooks ------------------------------------------------------------------------------

  async function onMilestone(_m: Milestone): Promise<void> {
    const view = page.view();
    for (const id of online.keys()) {
      push(id, { t: "page", page: view });
      background("board", () => ensureBoard(id, true));
    }
  }

  async function onFreed(_boss: string): Promise<void> {
    for (const id of online.keys()) background("codex", () => freedCodex(id));
  }

  async function onDay(): Promise<void> {
    await board.sweep();
    for (const id of online.keys()) background("board", () => ensureBoard(id, true));
  }

  /** The week turned: the last week's five most 상점 become 층장, the most meals 다 먹었상. */
  async function onWeek(week: number, previous: number): Promise<void> {
    const leaders = await db.execute(sql`
      select character_id from weekly_tally where week = ${previous} and kind = 'merit' and n > 0
      order by n desc, character_id limit ${FLOOR_LEADERS}`);
    const ids = leaders.rows.map((r) => r.character_id as string);
    for (const [rank, id] of ids.entries()) {
      await db.execute(sql`
        insert into floor_leaders (week, character_id, rank) values (${week}, ${id}, ${rank + 1})
        on conflict do nothing`);
    }
    floorLeaders = { week, ids: new Set(ids) };
    for (const id of ids) {
      await conduct(id, { kind: "merit", reason: "floor-leader" }, `floor-leader:${week}`);
    }
    const meals = await db.execute(sql`
      select character_id from weekly_tally where week = ${previous} and kind = 'meal' and n > 0
      order by n desc, character_id limit 1`);
    const eater = meals.rows[0]?.character_id as string | undefined;
    if (eater) {
      const r = await run(eater, `award:ate-it-all:${week}`, "live.award", { award: "ate-it-all" });
      if (r.ok && r.outcome.award) {
        notify(eater, r);
        push(eater, { t: "award", award: "ate-it-all" });
      }
    }
  }

  // Listening to operations -------------------------------------------------------------------

  function onApplied(characterId: string, name: AnyOp, result: ExecResult): void {
    if (!result.ok) return;
    if (name === "quest.claim") {
      const quest = result.change.quests?.[0]?.id ?? "";
      const [kind, day] = quest.split(":");
      const club = CLUB_EXP_FOR_NOTICE[kind as keyof typeof CLUB_EXP_FOR_NOTICE];
      if (club) clubActivity.add(characterId, club);
      if (kind === "daily" && dailyIds(Number(day)).includes(quest)) {
        background("streak", async () => {
          const r = await run(characterId, `board-day:${day}`, "live.boardDay", {
            day: Number(day),
          });
          notify(characterId, r);
          if (r.ok && r.outcome.award)
            push(characterId, { t: "award", award: String(r.outcome.award) });
        });
      }
      if (kind === "repeat") background("board", () => ensureBoard(characterId, true));
    }
    if (name === "craft" && (result.change.codex ?? []).length > 0) {
      push(characterId, { t: "unlock", entries: [...(result.change.codex ?? [])] });
      background("rules", () => refreshRules(characterId));
    }
    if (name === "drowsy.drink") {
      const me = online.get(characterId);
      if (me) me.rules = { ...me.rules, drowsy: false };
      if (autoSince.has(characterId)) autoSince.set(characterId, now());
      background("rules", () => refreshRules(characterId));
    }
  }

  // Events: what combat, navigation and the raid system call ---------------------------------

  const events = {
    // Combat.
    /** `count` kills of `monsterId` credited to the character (hunt notices, 오개념 entries). */
    kill(characterId: string, monsterId: string, count = 1): void {
      if (!progress.count(characterId, "kills", monsterId, count)) return;
      const h = helping.get(characterId);
      if (
        h?.template === "help-hunt" &&
        h.slots.monster === monsterId &&
        sameRoom(characterId, h.posterId)
      ) {
        progress.help(characterId, helpQuestId(h.notice), h.notice, count);
      }
    },
    /** Drops picked up: `sheet`, `ink` or `binding` (collect notices). */
    collect(characterId: string, item: string, qty = 1): void {
      progress.count(characterId, "collect", item, qty);
    },
    /** A wave (a surge to its 쉬는 시간) cleared at `placeId` without being hit. */
    cleanWave(characterId: string, placeId: string): void {
      progress.count(characterId, "nohit", placeId);
    },
    /** 기절 in a field: +1 벌점. */
    knockout(characterId: string): Promise<void> {
      return background("knockout", () =>
        conduct(characterId, { kind: "demerit", reason: "knockout" }),
      );
    },
    /** One player got another back up: +1 상점, and a `help-revive` notice moves. */
    revive(reviverId: string, revivedId: string): Promise<void> {
      if (reviverId === revivedId) return Promise.resolve();
      const h = helping.get(reviverId);
      if (h?.template === "help-revive" && h.posterId === revivedId) {
        progress.help(reviverId, helpQuestId(h.notice), h.notice);
      }
      return background("revive", () => conduct(reviverId, { kind: "merit", reason: "revive" }));
    },
    /** Full-auto hunting started or stopped: two unbroken hours bring 졸음. */
    autoHunting(characterId: string, on: boolean): void {
      if (on && !autoSince.has(characterId)) autoSince.set(characterId, now());
      if (!on) autoSince.delete(characterId);
    },

    // Navigation.
    /** Entered a place: a map or a named room (school entries, `help-walk`). */
    visit(characterId: string, placeId: string): void {
      if (!progress.mark(characterId, "visit", placeId)) return;
      for (const h of helpersOf(characterId)) {
        if (
          h.template === "help-walk" &&
          h.slots.place === placeId &&
          sameRoom(h.helperId, characterId)
        ) {
          progress.help(h.helperId, helpQuestId(h.notice), h.notice);
        }
      }
    },
    deliver(characterId: string, npcId: string): void {
      progress.count(characterId, "deliver", npcId);
    },
    /** An escort reached its end. */
    escort(characterId: string, npcId: string): void {
      progress.count(characterId, "escort", npcId);
    },
    /** Talked to a speaker for the first time (the 아리스타르코스 entry). */
    met(characterId: string, speakerId: string): void {
      progress.mark(characterId, "met", speakerId);
    },
    /** A story beat played through (its personal chapter). */
    story(characterId: string, beatId: string): void {
      progress.mark(characterId, "story", beatId);
    },
    /** Spotted by a patrol in a 위험 구역: +2 벌점. */
    patrolCaught(characterId: string): Promise<void> {
      return background("patrol", () =>
        conduct(characterId, { kind: "demerit", reason: "patrol" }),
      );
    },
    /** 권 사감 caught a snack in the 기숙사: +1 벌점. */
    dormSnack(characterId: string): Promise<void> {
      return background("dorm-food", () =>
        conduct(characterId, { kind: "demerit", reason: "dorm-food" }),
      );
    },
    /** Standing at a 졸방대 began or ended: thirty seconds clear 졸음. */
    atDesk(characterId: string, on: boolean): void {
      if (on && !deskSince.has(characterId)) deskSince.set(characterId, now());
      if (!on) deskSince.delete(characterId);
    },
    /** Ate at the 급식실: today's menu as a 30-minute buff. */
    eat,
    /** The 청소 당번 daily was done: +1 상점. */
    cleaning(characterId: string): Promise<void> {
      return background("cleaning", () =>
        conduct(characterId, { kind: "merit", reason: "cleaning" }),
      );
    },

    // Moderation.
    /** A chat filter strike an admin confirmed: +3 벌점. */
    chatStrike(characterId: string): Promise<void> {
      return background("chat", () => conduct(characterId, { kind: "demerit", reason: "chat" }));
    },

    // The raid system.
    /** A boss was freed on the live Page. */
    bossFreed(bossId: string, record: FreedRecord = {}): Promise<"freed" | "not_open" | "already"> {
      return page.free(bossId, record);
    },
    /** A player cleared a boss fight: the live raid or their 복습 (the chapter's personal version). */
    bossCleared(characterId: string, bossId: string): void {
      progress.mark(characterId, "bosses", bossId);
    },
  };

  // WorldRoom requests ----------------------------------------------------------------------

  const refuse = (characterId: string, type: string, code: LiveRefusalCode, n?: number) =>
    world()?.sendTo(characterId, WORLD_MESSAGES.refused, {
      type,
      code,
      ...(n === undefined ? {} : { n }),
    } satisfies LiveRefusal);

  function limited(characterId: string, type: string, n: number): boolean {
    const wait = buckets.take(`${characterId}\u0000live`, LIVE_RATE, Date.now());
    if (wait > 0) {
      world()?.sendTo(characterId, WORLD_MESSAGES.refused, {
        type,
        code: "rate_limited",
        n,
        retryMs: wait,
      } satisfies LiveRefusal);
    }
    return wait > 0;
  }

  async function read(characterId: string, m: LiveRead): Promise<void> {
    switch (m.what) {
      case "page":
        return push(characterId, { t: "page", page: page.view(), n: m.n });
      case "board":
        return ensureBoard(characterId, true, m.n);
      case "codex":
        return push(characterId, { t: "codex", codex: await codexView(characterId), n: m.n });
      case "notebook":
        return push(characterId, { t: "notebook", notebook: await page.notebook(), n: m.n });
      case "rules":
        await refreshRules(characterId, m.n);
    }
  }

  async function postHelp(
    characterId: string,
    template: HelpTemplate,
    quest: string | undefined,
    n: number,
  ) {
    if ((homeUntil.get(characterId) ?? 0) > now())
      return refuse(characterId, LIVE_MESSAGES.helpPost, "sent_home", n);
    const out = await board.post(characterId, template, quest);
    if ("refused" in out) return refuse(characterId, LIVE_MESSAGES.helpPost, out.refused, n);
    if (!out.result.ok) {
      return refuse(
        characterId,
        LIVE_MESSAGES.helpPost,
        refusalOf[out.result.error] ?? "server_error",
        n,
      );
    }
    const view = await board.notice(out.notice);
    if (view) push(characterId, { t: "help", notice: view });
  }

  async function takeHelp(characterId: string, notice: string, n: number) {
    const r = await board.take(characterId, notice);
    if ("refused" in r) return refuse(characterId, LIVE_MESSAGES.helpTake, r.refused, n);
    if (!r.ok)
      return refuse(characterId, LIVE_MESSAGES.helpTake, refusalOf[r.error] ?? "server_error", n);
    notify(characterId, r);
    await loadHelping();
    const view = await board.notice(notice);
    if (view) {
      push(characterId, { t: "help", notice: view });
      push(view.poster.id, { t: "help", notice: view });
    }
  }

  async function cancelHelp(characterId: string, notice: string, n: number) {
    const r = await board.cancel(characterId, notice);
    if (!r.ok)
      return refuse(characterId, LIVE_MESSAGES.helpCancel, refusalOf[r.error] ?? "server_error", n);
    const view = await board.notice(notice);
    if (view) push(characterId, { t: "help", notice: view });
  }

  const guarded =
    <T extends { n: number }>(
      type: string,
      work: (characterId: string, m: T) => Promise<unknown>,
    ) =>
    async (characterId: string, m: unknown) => {
      const message = m as T;
      if (limited(characterId, type, message.n)) return;
      try {
        await work(characterId, message);
      } catch (error) {
        log(`live ${type} failed: ${describeError(error)}`);
        refuse(characterId, type, "server_error", message.n);
      }
    };

  const handlers: WorldHandler[] = [
    {
      type: LIVE_MESSAGES.read,
      schema: liveReadSchema as WorldMessageSchema<unknown>,
      run: guarded<LiveRead>(LIVE_MESSAGES.read, read),
    },
    {
      type: LIVE_MESSAGES.helpPost,
      schema: helpPostSchema as WorldMessageSchema<unknown>,
      run: guarded<{ template: HelpTemplate; quest?: string; n: number }>(
        LIVE_MESSAGES.helpPost,
        (id, m) => postHelp(id, m.template, m.quest, m.n),
      ),
    },
    {
      type: LIVE_MESSAGES.helpTake,
      schema: helpTakeSchema as WorldMessageSchema<unknown>,
      run: guarded<{ notice: string; n: number }>(LIVE_MESSAGES.helpTake, (id, m) =>
        takeHelp(id, m.notice, m.n),
      ),
    },
    {
      type: LIVE_MESSAGES.helpCancel,
      schema: helpCancelSchema as WorldMessageSchema<unknown>,
      run: guarded<{ notice: string; n: number }>(LIVE_MESSAGES.helpCancel, (id, m) =>
        cancelHelp(id, m.notice, m.n),
      ),
    },
  ];

  // Admin -------------------------------------------------------------------------------------

  const DURATION = /^(\d+(?:\.\d+)?)(ms|s|m|h|d|w)$/;
  const UNIT: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
    w: 604_800_000,
  };
  const duration = (v: unknown): number => {
    if (typeof v === "number") return v;
    const m = DURATION.exec(String(v));
    if (!m) throw new Error(`not a duration: ${String(v)}`);
    return Number(m[1]) * (UNIT[m[2] as string] as number);
  };

  async function admin(body: Record<string, unknown>): Promise<unknown> {
    if (!o.testEvents && !ADMIN_READS.has(String(body.cmd))) {
      throw new Error(`${String(body.cmd)} is for test servers (LIVE_TEST_EVENTS=1)`);
    }
    switch (body.cmd) {
      case "state":
        return { page: page.view(), freed: page.freedBosses() };
      case "step":
        await page.saveClock(clock.step(duration(body.by)));
        await page.tick();
        return { page: page.view() };
      case "rate":
        await page.saveClock(clock.setRate(Number(body.rate)));
        return { page: page.view() };
      case "free":
        return {
          result: await page.free(
            String(body.boss),
            (body.record as FreedRecord | undefined) ?? {},
          ),
          page: page.view(),
        };
      case "notebook":
        return page.notebook();
      case "flush":
        await economy.grants.flush();
        await progress.flush();
        return { ok: true };
      case "restart":
        await page.restart();
        await page.tick();
        return { page: page.view() };
      case "credit": {
        // Income as combat hands it to the grant buffer, for the pool's measurement.
        const credit = body.credit as Parameters<IncomeTracker["credit"]>[1];
        for (let i = 0; i < Number(body.times ?? 1); i++) {
          income.credit(String(body.character), credit);
          if (body.every) clock.step(duration(body.every));
        }
        if (body.every) await page.saveClock(clock.state);
        return { measured: income.measure(String(body.character)) };
      }
      case "event": {
        const name = String(body.name) as keyof typeof events;
        const fn = events[name] as ((...args: unknown[]) => unknown) | undefined;
        if (!fn) throw new Error(`no event ${name}`);
        const out = await fn(...((body.args as unknown[]) ?? []));
        if (body.flush) await progress.flush();
        return { result: out ?? null };
      }
      default:
        throw new Error(`unknown command ${String(body.cmd)}`);
    }
  }

  const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
  const secret = o.adminSecret ? createHash("sha256").update(o.adminSecret).digest() : undefined;
  /** The bearer token, compared in constant time over digests of equal length. */
  const authorized = (header: string | undefined) => {
    const token = /^Bearer (.+)$/.exec(header ?? "")?.[1];
    if (!secret || !token) return false;
    return timingSafeEqual(createHash("sha256").update(token).digest(), secret);
  };
  /**
   * `POST /admin/live`: from this machine, not through a proxy (any forwarding header refuses),
   * and with `Authorization: Bearer <SERVER_SECRET>`. Reads always; the rest on test servers.
   */
  const adminRoute = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (req.url !== "/admin/live" || req.method !== "POST") return next();
    const proxied = PROXY_HEADERS.some((h) => req.headers[h] !== undefined);
    if (!secret || !LOOPBACK.has(req.socket.remoteAddress ?? "") || proxied) {
      res.statusCode = 404;
      return res.end();
    }
    if (!authorized(req.headers.authorization)) {
      res.statusCode = 401;
      return res.end();
    }
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > ADMIN_BODY_MAX) req.destroy();
      else chunks.push(c);
    });
    req.on("end", () => {
      void (async () => {
        res.setHeader("content-type", "application/json");
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
          res.end(JSON.stringify(await admin(body)));
        } catch (error) {
          res.statusCode = 400;
          res.end(
            JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
          );
        }
      })();
    });
  };

  page.hooks = {
    announce: (key, params) => line(key, params),
    milestone: onMilestone,
    freed: onFreed,
    day: onDay,
    week: onWeek,
  };

  // Running ---------------------------------------------------------------------------------

  let ticker: ReturnType<typeof setInterval> | undefined;
  let stopProgress: (() => void) | undefined;
  let lastSweep = 0;

  return {
    clock,
    page,
    board,
    progress,
    events,
    handlers,
    adminRoute,
    admin,
    onApplied,

    /** For `GrantBuffer({ onCredit })`: the income the pool is measured from. */
    credit: (characterId: string, credit: Parameters<IncomeTracker["credit"]>[1]) =>
      income.credit(characterId, credit),

    /** Seat hooks: the world seat is the session. */
    joined,
    left,

    /** What combat multiplies by for this character: buffs, penalties, 도감 sets. */
    modifiers(characterId: string): Modifiers {
      const me = online.get(characterId);
      return me ? modifiers(me.rules, now()) : NO_MODIFIERS;
    },
    /** Game ms until which the character is sent home, or null. */
    homeUntil(characterId: string): number | null {
      const until = homeUntil.get(characterId);
      return until !== undefined && until > now() ? until : null;
    },
    /** Called when 명령퇴사 sends a player home (navigation moves them to the `home` map). */
    onSentHome(listener: (characterId: string, until: number) => void): () => void {
      sentHome.add(listener);
      return () => sentHome.delete(listener);
    },
    /** This week's 층장 (the 대자보 pin right reads it). */
    isFloorLeader,
    /**
     * Whether a map is open now: campus maps always, a Page's era maps once its lifecycle opened
     * them (PLAN §10). Navigation refuses a portal to a closed map with it.
     */
    isOpen(mapId: string): boolean {
      return !ERA_MAPS.has(mapId) || page.progress().maps.includes(mapId);
    },

    async start(): Promise<void> {
      await loadHelping();
      await page.tick();
      stopProgress = progress.start();
      ticker = setInterval(() => {
        const t = now();
        checkDrowsy(t);
        checkHome(t);
        void page.tick().catch((error) => log(`page tick failed: ${describeError(error)}`));
        if (Date.now() - lastSweep > 60_000) {
          lastSweep = Date.now();
          void board.sweep().catch(() => {});
        }
      }, 1000);
      ticker.unref();
    },

    async stop(): Promise<void> {
      if (ticker) clearInterval(ticker);
      stopProgress?.();
      await progress.flush();
    },
  };
}

export type Live = ReturnType<typeof createLive>;

/** Every map a Page's lifecycle opens; anything else is campus and always open. */
const ERA_MAPS = new Set(LIFECYCLES.flatMap((l) => l.steps.flatMap((s) => s.maps ?? [])));

/** Admin commands a live server answers; the rest are for test servers. */
const ADMIN_READS = new Set(["state", "notebook"]);
/** Headers a forwarding proxy adds: a request carrying one did not start on this machine. */
const PROXY_HEADERS = ["x-forwarded-for", "forwarded", "x-real-ip", "via"];
const ADMIN_BODY_MAX = 64 * 1024;

const NO_RULES: RuleState = {
  restedUntil: null,
  penaltyUntil: null,
  drowsy: false,
  meal: null,
  codex: {},
};
