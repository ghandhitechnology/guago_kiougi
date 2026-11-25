/**
 * The balance simulator (PLAN §9, §26). Plays one character day by day through the real formulas
 * and content: hunting in shared fields at the kill rate its loadout and the field's spawns allow,
 * the 수행평가 board, the offline 자습 pool, 제본, 제련, 필기, book and tool levels, the 자판기 and
 * deaths. Continuous income is taken at its expected value; discrete luck (필기 rolls, tool drops)
 * goes through one seeded `Random`, so a run is fully determined by its seed.
 */
import {
  type BookDef,
  bookById,
  booksOf,
  buy,
  type ClassId,
  DROPS,
  ELITE,
  FIELD_PACING,
  type FieldDef,
  fieldPopulation,
  monsterById,
  PAGE1_FIELDS,
  refillCap,
  STARTER_BOOKS,
  surgeShare,
  TOOLS,
  VENDING,
} from "@guago/content";
import {
  addBookExp,
  addExp,
  BOARD,
  BOOK_EXP_FROM_OWNER,
  BookGrade,
  type BookItem,
  bind,
  bindCost,
  type Currency,
  canAfford,
  catchUp,
  claimPool,
  completeQuest,
  drowsyMult,
  earn,
  expFalloff,
  feedSheets,
  forge,
  forgeFee,
  growth,
  KNOCKOUT,
  type LedgerEntry,
  type LogoutPlace,
  levelFactor,
  mergeTools,
  monsterCoin,
  monsterEXP,
  monsterHP,
  NO_STATS,
  type PoolFill,
  type Purse,
  pilgi,
  pilgiCost,
  poolFill,
  poolTerms,
  questReward,
  Random,
  type Rate,
  restedMult,
  type Stats,
  statEffects,
  statPoints,
  statsSpent,
  type ToolItem,
  tierAt,
} from "@guago/shared";
import { loadoutDamage, type OwnedBook } from "./dps.ts";

/** Assumptions the simulator makes about play; not game constants. */
export const ASSUME = {
  /** Chance that another player in the field also tags a given kill. */
  overlap: 0.25,
  /** Share of area damage that kills rather than overkills. */
  overkill: 0.7,
  /** 낱장 of other classes' books traded into one's own from 1학년 on, after tax and haggling. */
  tradeEfficiency: 0.5,
  /** 상점 earned per day of dailies, each cancelling one 벌점 (PLAN §11). */
  meritsPerDay: 1,
  /** Minutes lost per 기절: the walk back from the 보건실. */
  minutesPerDeath: 1,
  /** Potions bought per active hour. */
  potionsPerHour: 2,
  /** A 급식 buff on the day's menu stat, for the first 30 minutes. */
  meal: { seconds: 1800, amount: 0.1, menu: ["exp", "pinecone", "damage", "drop", "speed"] },
  /** Stat placement: the rest goes to 이해력. */
  focusShare: 0.2,
  /** 명령퇴사: −30% EXP for an hour (PLAN §11). */
  sentHome: { demerits: 20, minutes: 60, penalty: 0.3 },
} as const;

export interface Profile {
  readonly id: string;
  readonly cls: ClassId;
  readonly activeMinutes: number;
  /** Other players hunting the same field at this player's hours, including them. */
  readonly fieldPlayers: number;
  readonly logout: LogoutPlace;
  readonly mode: "semi" | "auto";
  readonly deathsPerHour: number;
  readonly repeatables: number;
  readonly weeklies: boolean;
  /** The live Page. A newcomer starts at level 1 below it and hunts sealed Pages. */
  readonly frontier: number;
}

/** What a run varies besides the profile; none of these are game constants. */
export interface SimOptions {
  /** Multiplies every EXP gain: the same as dividing `K(L)` by it. For tuning sweeps. */
  readonly expScale?: number;
  /** Replaces the pool share; the 자습실 keeps its ratio to the normal share. For sweeps. */
  readonly poolShare?: number;
  /** `built` follows the spending policy; `neglected` never binds, forges, feeds or writes 필기. */
  readonly policy?: "built" | "neglected";
}

export interface DayRecord {
  readonly day: number;
  readonly level: number;
  /** Average monster level hunted that day, to see hunting up. */
  readonly monsterLevel: number;
  readonly page: number;
  readonly kpm: number;
  readonly dpsKpm: number;
}

export interface RunResult {
  readonly profile: Profile;
  readonly days: readonly DayRecord[];
  /** 솔방울 by ledger key, positive in and negative out. */
  readonly pinecones: ReadonlyMap<string, number>;
  readonly purse: Purse;
  readonly books: readonly BookItem[];
  readonly tools: readonly ToolItem[];
  readonly expBySource: ReadonlyMap<string, number>;
  /** EXP into the final level. */
  readonly exp: number;
  readonly deaths: number;
  readonly sentHome: number;
  readonly ink: { readonly earned: number; readonly spent: number };
}

const DAY = 86_400;
const CHUNK_MINUTES = 10;
const SHEETS_ANY: Currency = "sheet:any";
/** M2's two books per class, given at character creation. */
const STARTERS: Readonly<Record<ClassId, readonly string[]>> = STARTER_BOOKS;

interface FieldMix {
  readonly field: FieldDef;
  readonly page: number;
  readonly min: number;
  readonly max: number;
  /** Per-monster averages over the spawn mix. */
  readonly hp: number;
  readonly exp: number;
  readonly coin: number;
}

/** The field a level hunts in: its Page's quarter, or the top field once past the live band. */
function fieldFor(level: number, livePage: number): FieldMix {
  const page = Math.min(livePage, Math.max(1, Math.ceil(level / 100)));
  const offset = (page - 1) * 100;
  const index = Math.min(3, Math.max(0, Math.floor((level - offset - 1) / 25)));
  const field = PAGE1_FIELDS[index] as FieldDef;
  const local = Math.min(field.levels.max, Math.max(field.levels.min, level - offset));
  let w = 0;
  let hp = 0;
  let exp = 0;
  let coin = 0;
  for (const r of field.roster) {
    if ((r.from ?? 0) > local || r.maxAlive) continue;
    const m = monsterById(r.monster);
    const pack = m.behavior.kind === "swarm" ? (m.behavior.packMin + m.behavior.packMax) / 2 : 1;
    // A 방패형 shrugs off most hits from the front; a third of hits land there.
    const shield = m.behavior.kind === "shielded" ? 1 / (1 - m.behavior.reduction / 3) : 1;
    const n = r.weight * pack;
    w += n;
    hp += n * m.hp * shield;
    exp += n * m.exp;
    coin += n * m.coin;
  }
  return {
    field,
    page,
    min: field.levels.min + offset,
    max: field.levels.max + offset,
    hp: hp / w,
    exp: exp / w,
    coin: coin / w,
  };
}

interface State {
  level: number;
  exp: number;
  stats: Stats;
  copies: Map<string, BookItem[]>;
  tools: Map<string, ToolItem>;
  purse: Purse;
  demerits: number;
  sentHomeMinutes: number;
  rested: boolean;
  poolRate: Rate;
  toolLuck: number;
  nextId: number;
  pinecones: Map<string, number>;
  expBySource: Map<string, number>;
  deaths: number;
  sentHome: number;
  ink: { earned: number; spent: number };
}

function bookLedger(s: State, entries: readonly LedgerEntry[]) {
  for (const e of entries) {
    if (e.currency === "pinecone") s.pinecones.set(e.key, (s.pinecones.get(e.key) ?? 0) + e.amount);
    if (e.currency === "ink") {
      if (e.amount > 0) s.ink.earned += e.amount;
      else s.ink.spent -= e.amount;
    }
  }
}

function gainExp(s: State, amount: number, source: string, equipped: readonly BookItem[]) {
  s.expBySource.set(source, (s.expBySource.get(source) ?? 0) + amount);
  const before = s.level;
  const next = addExp(s.level, s.exp, amount);
  s.level = next.level;
  s.exp = next.exp;
  for (const b of equipped) {
    const list = s.copies.get(b.def) as BookItem[];
    list[0] = addBookExp(list[0] as BookItem, amount * BOOK_EXP_FROM_OWNER, s.level);
  }
  return s.level - before;
}

function equippedBooks(s: State, cls: ClassId): BookItem[] {
  const slots = tierAt(s.level).books;
  const order = [
    ...STARTERS[cls],
    ...booksOf(cls)
      .map((b) => b.id)
      .filter((id) => !STARTERS[cls].includes(id)),
  ];
  return order
    .filter((id) => (s.copies.get(id)?.length ?? 0) > 0)
    .slice(0, slots)
    .map((id) => (s.copies.get(id) as BookItem[])[0] as BookItem);
}

function equippedTools(s: State, cls: ClassId) {
  const slots = tierAt(s.level).tools;
  const linked = new Set(booksOf(cls).map((b) => b.tool));
  return [...s.tools.values()]
    .sort((a, b) => Number(linked.has(b.def)) - Number(linked.has(a.def)) || b.level - a.level)
    .slice(0, slots)
    .map((t) => ({
      def: TOOLS.find((d) => d.id === t.def) as (typeof TOOLS)[number],
      level: t.level,
    }));
}

const defOf = (id: string): BookDef => bookById(id);

/** Placed stat points: the profile's split between 이해력 and 집중력. */
function placeStats(s: State) {
  const free = statPoints(s.level) - statsSpent(s.stats);
  if (free <= 0) return;
  const focus = Math.round(free * ASSUME.focusShare);
  s.stats = {
    ...s.stats,
    focus: s.stats.focus + focus,
    understanding: s.stats.understanding + free - focus,
  };
}

function newBook(s: State, def: string): BookItem {
  return {
    id: `b${s.nextId++}`,
    def,
    grade: BookGrade.Textbook,
    level: 1,
    exp: 0,
    pilgi: 0,
    pilgiFails: 0,
  };
}

export function simulate(
  profile: Profile,
  days: number,
  seed: number,
  options: SimOptions = {},
): RunResult {
  const random = new Random(seed);
  const expScale = options.expScale ?? 1;
  const policy = options.policy ?? "built";
  const terms = poolTerms(profile.logout);
  const poolScale =
    options.poolShare === undefined
      ? 1
      : (options.poolShare * (profile.logout === "study-hall" ? POOL_HALL_RATIO : 1)) / terms.share;
  const cls = profile.cls;
  const s: State = {
    level: 1,
    exp: 0,
    stats: NO_STATS,
    copies: new Map(),
    tools: new Map(),
    purse: {},
    demerits: 0,
    sentHomeMinutes: 0,
    rested: false,
    poolRate: { exp: 0, pinecone: 0, sheets: 0, ink: 0 },
    toolLuck: 0,
    nextId: 1,
    pinecones: new Map(),
    expBySource: new Map(),
    deaths: 0,
    sentHome: 0,
    ink: { earned: 0, spent: 0 },
  };
  for (const id of STARTERS[cls]) s.copies.set(id, [newBook(s, id)]);
  const record: DayRecord[] = [];
  const classBooks = booksOf(cls);
  const allWeight = 30 + 6 * (DROPS.spotlightWeight - 1);
  const bookWeight = (b: BookDef) => (b.subject === "math" ? DROPS.spotlightWeight : 1) / allWeight;

  for (let day = 0; day < days; day++) {
    // Claim yesterday's pool.
    if (day > 0) {
      const fill: PoolFill = poolFill(
        s.poolRate,
        DAY - profile.activeMinutes * 60,
        profile.logout,
        false,
        catchUp(s.level, profile.frontier),
      );
      const scaled = {
        ...fill,
        exp: fill.exp * poolScale * expScale,
        pinecone: fill.pinecone * poolScale,
        ink: fill.ink * poolScale,
        sheets: 0,
      };
      const claim = claimPool(s.purse, scaled, undefined);
      if (claim.ok) {
        s.purse = claim.state.purse;
        bookLedger(s, claim.ledger);
        gainExp(s, claim.state.exp, "pool", equippedBooks(s, cls));
        spreadSheets(s, fill.sheets * poolScale, classBooks, bookWeight, 1);
      }
    }

    const menu = ASSUME.meal.menu[day % ASSUME.meal.menu.length];
    let minute = 0;
    let dayKpm = 0;
    let dayDps = 0;
    let dayMonster = 0;
    let best: Rate = s.poolRate;
    while (minute < profile.activeMinutes) {
      const span = Math.min(CHUNK_MINUTES, profile.activeMinutes - minute);
      const equipped = equippedBooks(s, cls);
      const owned: OwnedBook[] = equipped.map((b) => ({
        def: defOf(b.def),
        level: b.level,
        grade: b.grade,
        pilgi: b.pilgi,
      }));
      const dmg = loadoutDamage({
        cls,
        books: owned,
        tools: equippedTools(s, cls),
        stats: s.stats,
      });
      const mealDamage =
        menu === "damage" && minute * 60 < ASSUME.meal.seconds ? 1 + ASSUME.meal.amount : 1;
      const hunt = chooseField(s.level, profile, dmg.aoe * mealDamage);
      const { mix, monLevel, kpm, dpsKpm } = hunt;
      const deaths = (hunt.deathsPerHour * span) / 60;
      s.deaths += deaths;
      s.demerits += deaths * KNOCKOUT.demeritsOnWake;
      const huntMinutes = Math.max(0, span - deaths * ASSUME.minutesPerDeath);
      const kills = kpm * huntMinutes;
      const elites = kills / ELITE.everyKills;

      const fx = statEffects(s.stats);
      const sessionSeconds = minute * 60;
      const mealOn = sessionSeconds < ASSUME.meal.seconds;
      const base = expFalloff(s.level, monLevel);
      let mult =
        restedMult(s.rested, sessionSeconds) * catchUp(s.level, profile.frontier) * expScale;
      if (profile.mode === "auto") mult *= drowsyMult(sessionSeconds);
      if (mealOn && menu === "exp") mult *= 1 + ASSUME.meal.amount;
      if (s.sentHomeMinutes > 0) {
        mult *= 1 - ASSUME.sentHome.penalty;
        s.sentHomeMinutes = Math.max(0, s.sentHomeMinutes - span);
      }
      const baseExp =
        (kills * mix.exp * monsterEXP(monLevel, 1) + elites * monsterEXP(monLevel, ELITE.rank)) *
        base;
      const coinMult = fx.coinMult * (mealOn && menu === "pinecone" ? 1 + ASSUME.meal.amount : 1);
      const coins =
        (kills * mix.coin * monsterCoin(monLevel, 1) + elites * monsterCoin(monLevel, ELITE.rank)) *
        coinMult;
      const dropMult = fx.dropMult * (mealOn && menu === "drop" ? 1 + ASSUME.meal.amount : 1);
      const sheets = (kills * DROPS.pageChance.normal + elites * DROPS.pageChance.elite) * dropMult;
      const mean = ([lo, hi]: readonly number[]) => ((lo ?? 0) + (hi ?? 0)) / 2;
      const ink =
        (kills * DROPS.inkChance.normal * mean(DROPS.inkCount.normal) +
          elites * DROPS.inkChance.elite * mean(DROPS.inkCount.elite)) *
        dropMult;
      const binding =
        (kills * DROPS.bindingChance.normal + elites * DROPS.bindingChance.elite) * dropMult;

      const normalCoins = kills * mix.coin * monsterCoin(monLevel, 1) * coinMult;
      const got = earn(s.purse, { pinecone: normalCoins, ink, binding }, "drop.normal");
      const gotElite = earn(got.purse, { pinecone: coins - normalCoins }, "drop.elite");
      s.purse = gotElite.purse;
      bookLedger(s, [...got.ledger, ...gotElite.ledger]);
      spreadSheets(s, sheets, classBooks, bookWeight, s.level >= 30 ? ASSUME.tradeEfficiency : 0);
      gainExp(s, baseExp * mult, "hunt", equipped);

      s.toolLuck += elites * DROPS.toolChance.elite;
      while (s.toolLuck >= 1) {
        s.toolLuck -= 1;
        addTool(s, random.pick(TOOLS).id);
      }
      // The pool measures base income per second: no 숙면, 급식 or catch-up in it.
      if (span >= CHUNK_MINUTES) {
        const rate = {
          exp: baseExp / (span * 60),
          pinecone: coins / (span * 60),
          sheets: sheets / (span * 60),
          ink: ink / (span * 60),
        };
        if (rate.exp > best.exp || best === s.poolRate) best = rate;
      }
      dayKpm += kpm * span;
      dayMonster += monLevel * span;
      dayDps += Math.min(dpsKpm, 9999) * span;
      minute += span;
    }
    if (profile.activeMinutes >= CHUNK_MINUTES) s.poolRate = best;

    board(s, profile, day, classBooks, expScale);
    if (s.demerits >= ASSUME.sentHome.demerits) {
      s.demerits = 0;
      s.sentHome++;
      s.sentHomeMinutes = ASSUME.sentHome.minutes;
    }
    if (policy === "built") spend(s, profile, random);
    else placeStats(s);
    s.rested = profile.logout === "dorm";
    record.push({
      day,
      level: s.level,
      monsterLevel: dayMonster / Math.max(1, profile.activeMinutes),
      page: fieldFor(Math.min(s.level, profile.frontier * 100), profile.frontier).page,
      kpm: dayKpm / Math.max(1, profile.activeMinutes),
      dpsKpm: dayDps / Math.max(1, profile.activeMinutes),
    });
  }
  return {
    profile,
    days: record,
    pinecones: s.pinecones,
    purse: s.purse,
    books: [...s.copies.values()].flat(),
    tools: [...s.tools.values()],
    expBySource: s.expBySource,
    exp: s.exp,
    deaths: s.deaths,
    sentHome: s.sentHome,
    ink: s.ink,
  };
}

const POOL_HALL_RATIO = poolTerms("study-hall").share / poolTerms("field").share;

interface Hunt {
  readonly mix: FieldMix;
  readonly monLevel: number;
  readonly kpm: number;
  readonly dpsKpm: number;
  readonly deathsPerHour: number;
}

/**
 * Where a player hunts: the monster level, from 30 below to 45 above their own and never past the
 * live band, that pays the most EXP a minute. A field's kills are the lesser of what its players'
 * damage allows and what refill and the standing horde supply; damage falls with the level
 * factor and dying gets likelier the higher they go (monster damage grows ×10 a Page, so the
 * danger is taken as G(d)³).
 */
export function chooseField(level: number, profile: Profile, aoe: number): Hunt {
  const top = profile.frontier * 100;
  const cycle = FIELD_PACING.surgeSeconds + FIELD_PACING.lullSeconds;
  let best: Hunt | undefined;
  let bestScore = -1;
  for (let m = Math.min(top, level + 45); m >= Math.max(1, Math.min(top, level) - 30); m--) {
    const mix = fieldFor(m, profile.frontier);
    const hp = monsterHP(m, 1) * mix.hp;
    const dpsKpm = ((aoe * levelFactor(level, m) * ASSUME.overkill) / hp) * 60;
    const sealed = m <= (profile.frontier - 1) * 100;
    const players = sealed
      ? Math.max(1, Math.round(profile.fieldPlayers / 3))
      : profile.fieldPlayers;
    const supply =
      60 * (refillCap(players, "surge") * surgeShare() + fieldPopulation(players) / cycle);
    const fieldKpm = Math.min(players * dpsKpm, supply);
    const kpm = (fieldKpm / players) * (1 + ASSUME.overlap * (players - 1));
    const deathsPerHour = profile.deathsPerHour * Math.max(1, growth(m - level) ** 3);
    const alive = Math.max(0, 1 - (deathsPerHour / 60) * ASSUME.minutesPerDeath);
    const perKill =
      (mix.exp * monsterEXP(m, 1) + monsterEXP(m, ELITE.rank) / ELITE.everyKills) *
      expFalloff(level, m);
    const score = kpm * alive * perKill;
    if (score > bestScore * (1 + 1e-9)) {
      bestScore = score;
      best = { mix, monLevel: m, kpm, dpsKpm, deathsPerHour };
    }
  }
  return best as Hunt;
}

/** 낱장 by drop weight: the class's own books directly, the rest through trading at a loss. */
function spreadSheets(
  s: State,
  total: number,
  classBooks: readonly BookDef[],
  weight: (b: BookDef) => number,
  trade: number,
) {
  if (total <= 0) return;
  const gain: Partial<Record<Currency, number>> = {};
  let own = 0;
  for (const b of classBooks) {
    const n = total * weight(b);
    gain[`sheet:${b.id}`] = n;
    own += n;
  }
  gain[SHEETS_ANY] = (total - own) * trade;
  s.purse = earn(s.purse, gain, "drop.sheets").purse;
}

function addTool(s: State, def: string) {
  const have = s.tools.get(def);
  if (!have) {
    s.tools.set(def, { id: `t${s.nextId++}`, def, level: 1 });
    return;
  }
  const merged = mergeTools(have, { id: `t${s.nextId++}`, def, level: 1 });
  if (merged.ok) s.tools.set(def, merged.state);
}

function board(
  s: State,
  profile: Profile,
  day: number,
  classBooks: readonly BookDef[],
  expScale: number,
) {
  const target = classBooks.find((b) => !s.copies.has(b.id)) ?? classBooks[0];
  const turnIn = (cadence: "daily" | "weekly" | "repeat", done: number) => {
    const fieldLevel = Math.min(profile.frontier * 100, s.level);
    const reward = questReward(
      cadence,
      fieldLevel,
      done,
      s.level,
      catchUp(s.level, profile.frontier),
    );
    const r = completeQuest(s.purse, reward, cadence, target?.id ?? "wangdo");
    if (!r.ok) return;
    s.purse = r.state.purse;
    bookLedger(s, r.ledger);
    gainExp(s, r.state.exp * expScale, `quest.${cadence}`, equippedBooks(s, profile.cls));
  };
  if (profile.activeMinutes >= 15) for (let i = 0; i < BOARD.daily; i++) turnIn("daily", 0);
  if (profile.weeklies && day % 7 === 6) for (let i = 0; i < BOARD.weekly; i++) turnIn("weekly", 0);
  for (let i = 0; i < profile.repeatables; i++) turnIn("repeat", i);
  s.demerits = Math.max(0, s.demerits - ASSUME.meritsPerDay);
}

/** The spending policy: stats, books to fill slots, forging, 필기, feeding laggards, potions. */
function spend(s: State, profile: Profile, random: Random) {
  placeStats(s);
  const cls = profile.cls;
  const page = 1;
  const order = [
    ...STARTERS[cls],
    ...booksOf(cls)
      .map((b) => b.id)
      .filter((id) => !STARTERS[cls].includes(id)),
  ];
  const slots = tierAt(s.level).books;
  const wanted = order.slice(0, slots);

  // Traded 낱장 go to the first wanted book with the fewest sheets.
  const any = s.purse[SHEETS_ANY] ?? 0;
  if (any >= 1) {
    const needy = wanted
      .map((id) => ({ id, n: s.purse[`sheet:${id}`] ?? 0, owned: s.copies.has(id) }))
      .sort((a, b) => Number(a.owned) - Number(b.owned) || a.n - b.n)[0];
    if (needy) {
      const moved = Math.floor(any);
      s.purse = {
        ...s.purse,
        [SHEETS_ANY]: any - moved,
        [`sheet:${needy.id}`]: (s.purse[`sheet:${needy.id}`] ?? 0) + moved,
      };
    }
  }

  const tryBind = (id: string): boolean => {
    if (!canAfford(s.purse, bindCost(id, page))) return false;
    const r = bind(s.purse, { id: `b${s.nextId++}`, def: id, page });
    if (!r.ok) return false;
    s.purse = r.state.purse;
    bookLedger(s, r.ledger);
    const list = s.copies.get(id) ?? [];
    list.push(r.state.item);
    s.copies.set(id, list);
    return true;
  };

  // First copies of books for open slots, then spare copies of equipped books for forging.
  for (const id of wanted) if (!s.copies.has(id)) tryBind(id);
  for (const id of wanted) {
    while (s.copies.has(id) && (s.purse[`sheet:${id}`] ?? 0) >= 20) if (!tryBind(id)) break;
  }

  // Forge any three copies of one grade; the main copy keeps its level.
  for (const id of wanted) {
    for (let grade = BookGrade.Textbook; grade < BookGrade.Original; grade++) {
      const list = s.copies.get(id);
      if (!list) break;
      const same = list.filter((b) => b.grade === grade).sort((a, b) => b.level - a.level);
      if (same.length < 3) continue;
      const trio = same.slice(0, 3);
      const r = forge(s.purse, trio, page);
      if (!r.ok) break;
      s.purse = r.state.purse;
      bookLedger(s, r.ledger);
      const rest = list.filter((b) => !trio.includes(b));
      rest.push(r.state.item);
      rest.sort((a, b) => b.grade - a.grade || b.level - a.level);
      s.copies.set(id, rest);
      grade--;
    }
  }

  // Feed sheets to a book that lags its owner by more than ten levels.
  for (const id of wanted) {
    const list = s.copies.get(id);
    const main = list?.[0];
    if (!list || !main || main.level >= s.level - 10) continue;
    const n = Math.floor(s.purse[`sheet:${id}`] ?? 0);
    if (n < 1) continue;
    const r = feedSheets({ item: main, purse: s.purse }, n, s.level);
    if (r.ok) {
      s.purse = r.state.purse;
      list[0] = r.state.item;
    }
  }

  // Potions first, then 필기 with what is left above a reserve for the next forge.
  const potion = VENDING.fixed.find((v) => v.id === "banana-milk");
  if (potion) {
    const qty = Math.max(1, Math.ceil((profile.activeMinutes / 60) * ASSUME.potionsPerHour));
    const r = buy(s.purse, potion, qty, page);
    if (r.ok) {
      s.purse = r.state.purse;
      bookLedger(s, r.ledger);
    }
  }
  const equipped = () =>
    wanted.map((id) => s.copies.get(id)?.[0]).filter((b): b is BookItem => !!b);
  const reserve = Math.max(0, ...equipped().map((b) => forgeFee(b.grade, page)));
  for (let attempt = 0; attempt < 500; attempt++) {
    const book = equipped().sort((a, b) => a.pilgi - b.pilgi)[0];
    if (!book) break;
    const cost = pilgiCost(book.pilgi, book.grade, book.level);
    if ((s.purse.pinecone ?? 0) - cost.pinecone < reserve || (s.purse.ink ?? 0) < cost.ink) break;
    const r = pilgi({ item: book, purse: s.purse }, random.next());
    if (!r.ok) break;
    s.purse = r.state.purse;
    bookLedger(s, r.ledger);
    (s.copies.get(book.def) as BookItem[])[0] = r.state.item;
  }
}
