/**
 * Rows as the executor loads them, and the conversions to and from the pure shapes in
 * `@guago/shared` (`BookItem`, `ToolItem`) and the wire views (`ItemView`, `ProgressionView`).
 */
import { bindsOn, bookById, type ItemOrigin, toolSubject } from "@guago/content";
import {
  type BookGrade,
  type BookItem,
  catchUp,
  expToNext,
  type ItemKind,
  type ItemView,
  type ListedItem,
  type ListingCategory,
  type LogoutPlace,
  type Major,
  type PoolFill,
  type ProgressionView,
  pilgiChance,
  pilgiCost,
  poolFill,
  poolTerms,
  type QuestReward,
  type QuestView,
  type Rate,
  type STAT_IDS,
  type Stats,
  statPoints,
  statsSpent,
  type ToolItem,
  type Wearable,
  type Worn,
} from "@guago/shared";

export interface ItemRow {
  id: string;
  def: string;
  kind: ItemKind;
  grade: number;
  level: number;
  exp: number;
  pilgi: number;
  pilgiFails: number;
  evolved: boolean;
  bound: boolean;
  tradableAt: Date | null;
  slot: number | null;
  /** The live listing holding the item; it is out of the bag meanwhile. */
  listing: string | null;
  affixes: unknown[];
}

/** What the server measured for the 자습 pool at logout (`pool_rates`). */
export interface PoolRates extends Rate {
  /** 층장 of the week at logout: one more hour on the cap (PLAN §11). */
  readonly floorLeader?: boolean;
}

export interface CharacterRow {
  id: string;
  major: Major;
  minor: Major | null;
  level: number;
  exp: number;
  tier: number;
  stats: Stats;
  demerits: number;
  merits: number;
  poolStartedAt: Date | null;
  poolRates: PoolRates | null;
  poolPlace: LogoutPlace | null;
  poolSheetBook: string | null;
  restedUntil: Date | null;
  rev: number;
}

/** A 수행평가 notice as stored when it was posted: its reward is fixed from then on. */
export interface StoredOffer {
  readonly cadence: "daily" | "weekly" | "repeat";
  readonly reward: QuestReward;
  /** The book whose 낱장 the notice pays, named when it was accepted. */
  readonly sheetBook: string;
}

export interface QuestRow {
  id: string;
  state: QuestView["state"];
  progress: number;
  target: number;
  offer: StoredOffer;
}

// Database rows -------------------------------------------------------------------------------

export const ITEM_COLUMNS =
  "id, def_id, kind, grade, level, exp, pilgi, pilgi_fail_streak, affixes, evolved, bound, tradable_at, slot, listing_id";

/**
 * Drizzle's driver hands raw-query timestamps back as Postgres text (`2026-11-25 03:00:00+00`);
 * rows built by the query builder hold `Date`s. Either becomes a `Date`.
 */
export function timeFromDb(v: unknown): Date | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  const iso = String(v)
    .replace(" ", "T")
    .replace(/([+-]\d\d)$/, "$1:00");
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) throw new Error("unreadable timestamp");
  return at;
}

export function itemFromDb(r: Record<string, unknown>): ItemRow {
  return {
    id: r.id as string,
    def: r.def_id as string,
    kind: r.kind as ItemKind,
    grade: r.grade as number,
    level: r.level as number,
    exp: r.exp as number,
    pilgi: r.pilgi as number,
    pilgiFails: r.pilgi_fail_streak as number,
    affixes: r.affixes as unknown[],
    evolved: r.evolved as boolean,
    bound: r.bound as boolean,
    tradableAt: timeFromDb(r.tradable_at),
    slot: (r.slot as number | null) ?? null,
    listing: (r.listing_id as string | null) ?? null,
  };
}

export const CHARACTER_COLUMNS = `c.id, c.major, c.minor, c.level, c.exp, c.tier, c.demerits, c.merits,
  c.stat_understanding, c.stat_memory, c.stat_focus, c.stat_vitality, c.stat_agility, c.stat_luck,
  c.pool_started_at, c.pool_rates, c.pool_place, c.pool_sheet_book, c.rested_until, c.rev`;

export function characterFromDb(r: Record<string, unknown>): CharacterRow {
  return {
    id: r.id as string,
    major: r.major as Major,
    minor: (r.minor as Major | null) ?? null,
    level: r.level as number,
    exp: r.exp as number,
    tier: r.tier as number,
    stats: {
      understanding: r.stat_understanding as number,
      memory: r.stat_memory as number,
      focus: r.stat_focus as number,
      vitality: r.stat_vitality as number,
      agility: r.stat_agility as number,
      luck: r.stat_luck as number,
    },
    demerits: r.demerits as number,
    merits: r.merits as number,
    poolStartedAt: timeFromDb(r.pool_started_at),
    poolRates: (r.pool_rates as PoolRates | null) ?? null,
    poolPlace: (r.pool_place as LogoutPlace | null) ?? null,
    poolSheetBook: (r.pool_sheet_book as string | null) ?? null,
    restedUntil: timeFromDb(r.rested_until),
    rev: Number(r.rev),
  };
}

export function questFromDb(r: Record<string, unknown>): QuestRow {
  return {
    id: r.quest_id as string,
    state: r.state as QuestRow["state"],
    progress: r.progress as number,
    target: r.target as number,
    offer: r.offer as StoredOffer,
  };
}

// Pure shapes ---------------------------------------------------------------------------------

export function toBook(row: ItemRow): BookItem {
  return {
    id: row.id,
    def: row.def,
    grade: row.grade as BookGrade,
    level: row.level,
    exp: row.exp,
    pilgi: row.pilgi,
    pilgiFails: row.pilgiFails,
    ...(row.evolved ? { evolved: true } : {}),
  };
}

export function withBook(row: ItemRow, book: BookItem): ItemRow {
  return {
    ...row,
    grade: book.grade,
    level: book.level,
    exp: book.exp,
    pilgi: book.pilgi,
    pilgiFails: book.pilgiFails,
    evolved: book.evolved === true,
  };
}

export function toTool(row: ItemRow): ToolItem {
  return { id: row.id, def: row.def, level: row.level };
}

export function withTool(row: ItemRow, tool: ToolItem): ItemRow {
  return { ...row, level: tool.level };
}

const blank = (id: string, def: string, kind: ItemKind, origin: ItemOrigin): ItemRow => ({
  id,
  def,
  kind,
  grade: 0,
  level: 1,
  exp: 0,
  pilgi: 0,
  pilgiFails: 0,
  evolved: false,
  bound: bindsOn(origin),
  tradableAt: null,
  slot: null,
  listing: null,
  affixes: [],
});

/** A new item row; `origin` decides whether it is bound (PLAN §13 "Bound items"). */
export const newBookRow = (book: BookItem, origin: ItemOrigin): ItemRow =>
  withBook(blank(book.id, book.def, "book", origin), book);
export const newToolRow = (tool: ToolItem, origin: ItemOrigin): ItemRow =>
  withTool(blank(tool.id, tool.def, "tool", origin), tool);

export function subjectOf(row: ItemRow): Major {
  return row.kind === "book" ? bookById(row.def).subject : toolSubject(row.def);
}

export const wearable = (row: ItemRow): Wearable => ({
  id: row.id,
  def: row.def,
  kind: row.kind,
  subject: subjectOf(row),
});

export const worn = (row: ItemRow): Worn => ({ ...wearable(row), slot: row.slot as number });

// Views ---------------------------------------------------------------------------------------

export function itemView(row: ItemRow): ItemView {
  const view: ItemView = {
    id: row.id,
    def: row.def,
    kind: row.kind,
    grade: row.grade,
    level: row.level,
    exp: row.exp,
    pilgi: row.pilgi,
    pilgiFails: row.pilgiFails,
    evolved: row.evolved,
    bound: row.bound,
    tradableAt: row.tradableAt?.toISOString() ?? null,
    slot: row.slot,
  };
  if (row.kind === "book") {
    const cost = pilgiCost(row.pilgi, row.grade as BookGrade, row.level);
    view.next = { chance: pilgiChance(row.pilgi, row.pilgiFails), ...cost };
  }
  return view;
}

/**
 * The pool as it stands at `now`: what claiming it would pay. Catch-up follows the character's
 * level against the live Page (`frontier`), like every other EXP they earn.
 */
export function poolNow(
  c: CharacterRow,
  now: Date,
  frontier: number,
): { fill: PoolFill; cap: number } | null {
  if (!c.poolStartedAt || !c.poolRates || !c.poolPlace) return null;
  const rates = c.poolRates;
  const seconds = (now.getTime() - c.poolStartedAt.getTime()) / 1000;
  const floorLeader = rates.floorLeader === true;
  const mult = catchUp(c.level, frontier);
  return {
    fill: poolFill(rates, seconds, c.poolPlace, floorLeader, mult),
    cap: poolTerms(c.poolPlace, floorLeader).cap,
  };
}

export function progressionView(c: CharacterRow, now: Date, frontier: number): ProgressionView {
  const pool = poolNow(c, now, frontier);
  return {
    level: c.level,
    exp: c.exp,
    expToNext: expToNext(c.level),
    stats: c.stats,
    unspent: statPoints(c.level) - statsSpent(c.stats),
    tier: c.tier,
    demerits: c.demerits,
    merits: c.merits,
    restedUntil: c.restedUntil?.toISOString() ?? null,
    pool:
      pool && c.poolStartedAt && c.poolPlace
        ? { startedAt: c.poolStartedAt.toISOString(), place: c.poolPlace, ...pool }
        : null,
  };
}

export const questView = (q: QuestRow): QuestView => ({
  id: q.id,
  state: q.state,
  progress: q.progress,
  target: q.target,
});

export const STAT_COLUMNS: Readonly<Record<(typeof STAT_IDS)[number], string>> = {
  understanding: "stat_understanding",
  memory: "stat_memory",
  focus: "stat_focus",
  vitality: "stat_vitality",
  agility: "stat_agility",
  luck: "stat_luck",
};

// Listings ------------------------------------------------------------------------------------

export type ListingState = "live" | "sold" | "cancelled" | "expired";

export interface ListingRow {
  id: string;
  sellerId: string;
  state: ListingState;
  category: ListingCategory;
  def: string;
  grade: number;
  itemId: string | null;
  item: ListedItem | null;
  qty: number;
  listedQty: number;
  unitPrice: bigint;
  fee: bigint;
  createdAt: Date;
  expiresAt: Date;
  closedAt: Date | null;
  /** Past `expires_at` by the database's clock when the row was locked. Read only. */
  expired: boolean;
}

export const LISTING_COLUMNS = `id, seller_id, state, category, def_id, grade, item_id, item, qty,
  listed_qty, unit_price::text as unit_price, fee::text as fee, created_at, expires_at, closed_at,
  expires_at <= now() as expired`;

export function listingFromDb(r: Record<string, unknown>): ListingRow {
  return {
    id: r.id as string,
    sellerId: r.seller_id as string,
    state: r.state as ListingState,
    category: r.category as ListingCategory,
    def: r.def_id as string,
    grade: r.grade as number,
    itemId: (r.item_id as string | null) ?? null,
    item: (r.item as ListedItem | null) ?? null,
    qty: Number(r.qty),
    listedQty: Number(r.listed_qty),
    unitPrice: BigInt(r.unit_price as string),
    fee: BigInt(r.fee as string),
    createdAt: timeFromDb(r.created_at) as Date,
    expiresAt: timeFromDb(r.expires_at) as Date,
    closedAt: timeFromDb(r.closed_at),
    expired: r.expired === true,
  };
}

/** What the board shows of a listed book or tool. */
export const listedItem = (row: ItemRow): ListedItem => ({
  kind: row.kind,
  grade: row.grade,
  level: row.level,
  pilgi: row.pilgi,
  evolved: row.evolved,
});
