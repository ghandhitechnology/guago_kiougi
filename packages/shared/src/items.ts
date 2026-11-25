/**
 * Books and tools as items, and the operations that change them (PLAN §8): 필기, 제본, 제련,
 * book levels, tool merges and evolution. Pure: each takes state, a request and, where luck is
 * involved, one roll in [0, 1) from the server's `Random`, and returns the new state with its
 * ledger entries. Nothing here downgrades or destroys a book except the two copies 제련 eats.
 */
import { growth } from "./growth.ts";
import { type Amounts, balance, type Outcome, type Purse, pay, sheet } from "./ledger.ts";
import { BookGrade, bookExpToNext, GRADE_MULTIPLIER } from "./numbers.ts";

export interface BookItem {
  readonly id: string;
  readonly def: string;
  readonly grade: BookGrade;
  readonly level: number;
  /** EXP into the current level. */
  readonly exp: number;
  readonly pilgi: number;
  /** Failures since the last success; each adds `PILGI_PITY` to the next attempt. */
  readonly pilgiFails: number;
  /** Set once the book has evolved (PLAN §8); grade, level and 필기 carry over. */
  readonly evolved?: boolean;
}

export interface ToolItem {
  readonly id: string;
  readonly def: string;
  readonly level: number;
}

/** Fees grow ×10 per Page, with income (PLAN §9 growth constant). Page 1 pays the base. */
export function pageScale(page: number): number {
  return 10 ** (Math.max(1, page) - 1);
}

// ── 필기 ───────────────────────────────────────────────────────────────────

/** Base success of the attempt from `level` to `level + 1` (PLAN §8 table). */
export function pilgiBaseChance(level: number): number {
  if (level < 5) return 1;
  if (level < 10) return [0.9, 0.8, 0.7, 0.6, 0.5][level - 5] as number;
  if (level < 15) return [0.45, 0.4, 0.35, 0.3, 0.25][level - 10] as number;
  return 0.2;
}

/** Every failure adds 10 points until a success; at the 20% floor the ninth try always lands. */
export const PILGI_PITY = 0.1;

export function pilgiChance(level: number, fails: number): number {
  return Math.min(1, pilgiBaseChance(level) + PILGI_PITY * fails);
}

/**
 * 잉크 = 10 × 1.15ⁿ and 솔방울 = base × 1.15ⁿ × grade multiplier × G(book level), rounded up.
 * PLAN §8 has no G term; without it the 솔방울 cost stood still while income grew ×10 a Page.
 */
export const PILGI_INK_BASE = 10;
export const PILGI_COIN_BASE = 100;
export const PILGI_COST_GROWTH = 1.15;

export function pilgiCost(
  level: number,
  grade: BookGrade,
  bookLevel = 0,
): { ink: number; pinecone: number } {
  const g = PILGI_COST_GROWTH ** level;
  return {
    ink: Math.ceil(PILGI_INK_BASE * g),
    pinecone: Math.ceil(PILGI_COIN_BASE * g * (GRADE_MULTIPLIER[grade] ?? 1) * growth(bookLevel)),
  };
}

export interface Holding<T> {
  readonly item: T;
  readonly purse: Purse;
}

/** One 필기 attempt. Costs are paid either way; failure only raises the pity. */
export function pilgi(
  state: Holding<BookItem>,
  roll: number,
): Outcome<Holding<BookItem> & { readonly success: boolean }> {
  const { item: book } = state;
  const cost = pilgiCost(book.pilgi, book.grade, book.level);
  const paid = pay(state.purse, cost, "sink.pilgi");
  if (!paid) return { ok: false, error: "pilgi_cost" };
  const success = roll < pilgiChance(book.pilgi, book.pilgiFails);
  const item: BookItem = success
    ? { ...book, pilgi: book.pilgi + 1, pilgiFails: 0 }
    : { ...book, pilgiFails: book.pilgiFails + 1 };
  return { ok: true, state: { item, purse: paid.purse, success }, ledger: paid.ledger };
}

/** Attempts a book needs on average from `from` to `to`, pity included. */
export function pilgiExpectedAttempts(from: number, to: number): number {
  let total = 0;
  for (let level = from; level < to; level++) {
    // Expected tries until success with a chance that grows each failure.
    let miss = 1;
    let tries = 0;
    for (let fails = 0; miss > 1e-12; fails++) {
      tries += miss;
      miss *= 1 - pilgiChance(level, fails);
    }
    total += tries;
  }
  return total;
}

// ── 제본 ───────────────────────────────────────────────────────────────────

/** 20 낱장 of a book, one 제본 재료 and a fee make one 교과서 copy at level 1. */
export const BIND = { sheets: 20, binding: 1, fee: 10000 } as const;

export function bindCost(book: string, page: number): Amounts {
  return {
    [sheet(book)]: BIND.sheets,
    binding: BIND.binding,
    pinecone: BIND.fee * pageScale(page),
  };
}

/** A fresh 교과서 copy at level 1, as 제본 and the starter kit make it. */
export function textbook(id: string, def: string): BookItem {
  return { id, def, grade: BookGrade.Textbook, level: 1, exp: 0, pilgi: 0, pilgiFails: 0 };
}

export function bind(
  purse: Purse,
  request: { readonly id: string; readonly def: string; readonly page: number },
): Outcome<Holding<BookItem>> {
  const paid = pay(purse, bindCost(request.def, request.page), "sink.bind");
  if (!paid) return { ok: false, error: "bind_cost" };
  const item = textbook(request.id, request.def);
  return { ok: true, state: { item, purse: paid.purse }, ledger: paid.ledger };
}

// ── 제련 ───────────────────────────────────────────────────────────────────

/** Fee to forge three copies of `grade` into the next: ×3 per grade (PLAN §13). */
export const FORGE_FEE_BASE = 20000;
export const FORGE_FEE_GROWTH = 3;

export function forgeFee(grade: BookGrade, page: number): number {
  return FORGE_FEE_BASE * FORGE_FEE_GROWTH ** grade * pageScale(page);
}

/**
 * Three copies of one book at one grade become one copy of the next grade, keeping the highest
 * level (with its EXP) and the highest 필기 among them. The pity of the 필기 kept carries over.
 */
export function forge(
  purse: Purse,
  copies: readonly BookItem[],
  page: number,
): Outcome<Holding<BookItem> & { readonly consumed: readonly string[] }> {
  const [a, b, c] = copies;
  if (!a || !b || !c || copies.length !== 3) return { ok: false, error: "forge_three" };
  if (new Set(copies.map((x) => x.id)).size !== 3) return { ok: false, error: "forge_same_item" };
  if (copies.some((x) => x.def !== a.def || x.grade !== a.grade))
    return { ok: false, error: "forge_mismatch" };
  if (a.grade >= BookGrade.Original) return { ok: false, error: "forge_top_grade" };
  const paid = pay(purse, { pinecone: forgeFee(a.grade, page) }, "sink.forge");
  if (!paid) return { ok: false, error: "forge_cost" };
  const top = copies.reduce((x, y) =>
    y.level > x.level || (y.level === x.level && y.exp > x.exp) ? y : x,
  );
  const pen = copies.reduce((x, y) => (y.pilgi > x.pilgi ? y : x));
  const item: BookItem = {
    ...top,
    grade: (a.grade + 1) as BookGrade,
    pilgi: pen.pilgi,
    pilgiFails: pen.pilgiFails,
    // An evolution, once earned, is not forged away.
    ...(copies.some((x) => x.evolved) ? { evolved: true } : {}),
  };
  return {
    ok: true,
    state: {
      item,
      purse: paid.purse,
      consumed: copies.filter((x) => x.id !== top.id).map((x) => x.id),
    },
    ledger: paid.ledger,
  };
}

/** 교과서 copies one book of `grade` costs. */
export function copiesForGrade(grade: BookGrade): number {
  return 3 ** grade;
}

// ── Book levels ─────────────────────────────────────────────────────────────

/**
 * Adds EXP and levels the book while it can, never past its owner. At the cap it banks at most
 * one level's worth, which pays out as soon as the owner levels.
 */
export function addBookExp(book: BookItem, exp: number, ownerLevel: number): BookItem {
  let { level } = book;
  let banked = book.exp + exp;
  // A hair of tolerance so twenty twentieths make a whole level in floating point.
  while (level < ownerLevel && banked >= bookExpToNext(level) * (1 - 1e-12)) {
    banked = Math.max(0, banked - bookExpToNext(level));
    level++;
  }
  if (level >= ownerLevel) banked = Math.min(banked, bookExpToNext(level));
  return { ...book, level, exp: banked };
}

/** EXP a book earns from its owner's: 10% while equipped (PLAN §8). */
export const BOOK_EXP_FROM_OWNER = 0.1;

/** One fed 낱장 is worth a twentieth of the book's current level: twenty sheets, one level. */
export const SHEET_FEED_SHARE = 1 / 20;

/**
 * Feeds up to `count` 낱장 of the book's own, one at a time: each is worth a twentieth of the
 * level the book has when that sheet goes in, and feeding stops once the book reaches its
 * owner's level. Only the sheets used are paid, and `used` says how many. Feeding the same
 * sheets in one request or in several ends in the same book.
 */
export function feedSheets(
  state: Holding<BookItem>,
  count: number,
  ownerLevel: number,
): Outcome<Holding<BookItem> & { readonly used: number }> {
  if (!Number.isInteger(count) || count <= 0) return { ok: false, error: "feed_count" };
  if (state.item.level >= ownerLevel) return { ok: false, error: "feed_capped" };
  const currency = sheet(state.item.def);
  const offered = Math.min(count, Math.floor(balance(state.purse, currency)));
  let item = state.item;
  let used = 0;
  while (used < offered && item.level < ownerLevel) {
    item = addBookExp(item, bookExpToNext(item.level) * SHEET_FEED_SHARE, ownerLevel);
    used++;
  }
  const paid = used > 0 ? pay(state.purse, { [currency]: used }, "sink.feed") : null;
  if (!paid) return { ok: false, error: "feed_cost" };
  return { ok: true, state: { item, purse: paid.purse, used }, ledger: paid.ledger };
}

// ── Tools ───────────────────────────────────────────────────────────────────

export const TOOL_MAX_LEVEL = 5;

/**
 * A tool's level is the copies merged into it, up to 5. Merging moves `from`'s levels onto
 * `into` until it reaches 5; whatever does not fit stays on `from`, which is used up (null) only
 * when nothing is left on it. No merge loses a level. A tool already at 5 takes no merge.
 */
export function mergeTools(
  into: ToolItem,
  from: ToolItem,
): Outcome<{ readonly into: ToolItem; readonly from: ToolItem | null }> {
  if (into.id === from.id) return { ok: false, error: "merge_same_item" };
  if (into.def !== from.def) return { ok: false, error: "merge_mismatch" };
  if (into.level >= TOOL_MAX_LEVEL) return { ok: false, error: "merge_max" };
  const moved = Math.min(from.level, TOOL_MAX_LEVEL - into.level);
  const left = from.level - moved;
  return {
    ok: true,
    state: {
      into: { ...into, level: into.level + moved },
      from: left > 0 ? { ...from, level: left } : null,
    },
    ledger: [],
  };
}

// ── Evolution ───────────────────────────────────────────────────────────────

export const EVOLUTION = {
  grade: BookGrade.Advanced,
  level: 100,
  toolLevel: TOOL_MAX_LEVEL,
} as const;

/**
 * A book evolves at grade 심화서 or higher and level 100+, with its own linked tool at level 5,
 * once its owner has reached the 3학년 전직 (PLAN §7, §8).
 */
export function canEvolve(
  book: BookItem,
  tool: ToolItem | undefined,
  linkedTool: string,
  evolutionUnlocked: boolean,
): boolean {
  return (
    evolutionUnlocked &&
    book.grade >= EVOLUTION.grade &&
    book.level >= EVOLUTION.level &&
    tool?.def === linkedTool &&
    tool.level >= EVOLUTION.toolLevel
  );
}

/** Evolves a book in place. Its linked tool stays as it is. */
export function evolve(
  book: BookItem,
  tool: ToolItem | undefined,
  linkedTool: string,
  evolutionUnlocked: boolean,
): Outcome<BookItem> {
  if (book.evolved) return { ok: false, error: "evolve_done" };
  if (!canEvolve(book, tool, linkedTool, evolutionUnlocked)) {
    return { ok: false, error: "evolve_requirements" };
  }
  return { ok: true, state: { ...book, evolved: true }, ledger: [] };
}
