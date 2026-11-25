/**
 * Player trading (PLAN §13 "Player trading", §12 rate limits, §21): the rules' numbers and
 * formulas, the direct trade messages and their pushes, and the 매점 게시판 reads.
 *
 * Direct trade messages and board reads are requests in the social systems' shape: each carries
 * `n` (the client's request number, one counter with chat and social) and gets exactly one
 * answer, `done { type, n, data }` or `refused { type, n, code }`; a trade window's changes are
 * pushed on one message type, `trade` (`TradeUpdate`). Listing create, buy and cancel move items
 * and 솔방울, so they are item operations (`OPS` in inventory.ts) with an operation id, answered
 * by one `result` like every other.
 *
 * Amounts of 솔방울 travel as exact decimal strings, like `WalletView`: prices late in a Theme
 * pass 2^53.
 */
import type { WorldMessageSchema } from "./chat.ts";
import type { ChangeNotice, ItemView, OpError } from "./inventory.ts";
import type { ItemKind } from "./loadout.ts";

export const TRADE = {
  /** 1학년 (PLAN §13): both sides of a direct trade, every seller and every buyer. */
  level: 30,
  /** Direct trade: both players within this many tiles on the same map instance. */
  rangeTiles: 5,
  /** Percent of the 솔방울 moved in a direct trade, taken from what the receiver gets. */
  directTaxPercent: 5,
  /** An item bought or received cannot be traded again for this long. */
  retradeHours: 24,
  /** An unanswered request lapses after this long. */
  inviteSeconds: 30,
  /** An open trade window closes after this long, finished or not. */
  sessionSeconds: 300,
  /** Most different items and stacks one side may put in a window. */
  maxItems: 12,
  maxStacks: 8,
  board: {
    listings: 10,
    hours: 48,
    /** Paid up front on the whole asking price, never refunded. */
    feePercent: 2,
    /** Taken from the seller's proceeds of each sale. */
    taxPercent: 5,
    historyDays: 14,
    pageSize: 20,
  },
} as const;

/**
 * `source_or_sink` keys of trading. `trade.*` and `escrow.*` move units between players and net
 * to zero across the game; `sink.*` leave it.
 */
export const TRADE_KEYS = {
  direct: "trade.direct",
  board: "trade.board",
  /** A stack going into a listing and coming back out of it on cancel or expiry. */
  escrow: "escrow.board",
  directTax: "sink.trade-tax",
  listingFee: "sink.board-fee",
  saleTax: "sink.board-tax",
} as const;

/** Keys that move units between players rather than into or out of the game. */
export const isTransferKey = (key: string) => key.startsWith("trade.") || key.startsWith("escrow.");

/** Most 솔방울 one price, offer or sale may carry: well inside `numeric(40, 0)`. */
export const MAX_TRADE_AMOUNT = 10n ** 30n - 1n;

/** `percent` of `amount`, rounded up: every taxed amount above zero pays at least one. */
export function percentUp(amount: bigint, percent: number): bigint {
  if (amount <= 0n) return 0n;
  const p = BigInt(percent);
  return (amount * p + 99n) / 100n;
}

export const directTax = (moved: bigint) => percentUp(moved, TRADE.directTaxPercent);
export const listingFee = (total: bigint) => percentUp(total, TRADE.board.feePercent);
export const saleTax = (total: bigint) => percentUp(total, TRADE.board.taxPercent);

/**
 * Stacks a player may trade or list by quantity: 잉크, 제본 재료, 낱장 and 자판기 goods. 상점
 * and 탐구 토큰 are earned, never traded.
 */
export const TRADABLE_STACK = /^(ink|binding|(sheet|snack):[a-z0-9-]{1,40})$/;

/** A 매점 게시판 category: what a browse filters by. */
export const LISTING_CATEGORIES = ["book", "tool", "sheet", "material", "snack"] as const;
export type ListingCategory = (typeof LISTING_CATEGORIES)[number];

export function stackCategory(def: string): ListingCategory {
  if (def.startsWith("sheet:")) return "sheet";
  if (def.startsWith("snack:")) return "snack";
  return "material";
}

/** Why a trade or listing request was not carried out. The client owns the copy for each. */
export const TRADE_ERRORS = [
  "trade_level",
  "trade_offline",
  "trade_self",
  "trade_far",
  "trade_busy",
  "trade_no_session",
  "trade_changed",
  "trade_empty",
  "trade_too_many",
  "trade_item_gone",
  "trade_item_bound",
  "trade_item_equipped",
  "trade_item_cooldown",
  "trade_stack",
  "trade_funds",
  "listing_limit",
  "listing_missing",
  "listing_closed",
  "listing_expired",
  "listing_own",
  "listing_qty",
  "listing_price",
  "listing_funds",
] as const;
export type TradeErrorCode = (typeof TRADE_ERRORS)[number];

// Direct trade messages --------------------------------------------------------------------

/**
 * Client to WorldRoom, each `{ n, ...TradeRequests[type] }`, answered by one `done` whose data
 * is `{ session }`, or `refused` with a `TradeRefusalCode`.
 */
export const TRADE_MESSAGES = {
  request: "trade.request",
  accept: "trade.accept",
  decline: "trade.decline",
  offer: "trade.offer",
  confirm: "trade.confirm",
  cancel: "trade.cancel",
} as const;

/** One side's offer, as sent: item ids, stack counts and 솔방울. Replaces that side's offer. */
export interface TradeOffer {
  items: string[];
  stacks: Record<string, number>;
  pinecone: string;
}

export interface TradeRequests {
  "trade.request": { to: string };
  "trade.accept": { session: string };
  "trade.decline": { session: string };
  "trade.offer": { session: string } & TradeOffer;
  /** `version` is the window version the player looked at; a stale one is refused. */
  "trade.confirm": { session: string; version: number };
  "trade.cancel": { session: string };
}
export type TradeMessageName = keyof TradeRequests;
/** A trade request as the server handles it, once parsed: `req` is the body without `n`. */
export type TradeMessage = {
  [K in TradeMessageName]: { n: number; type: K; req: TradeRequests[K] };
}[TradeMessageName];

/** `refused` codes of trade requests and board reads. */
export type TradeRefusalCode = TradeErrorCode | "rate_limited" | "server_error";

export interface TradePerson {
  id: string;
  name: string;
}

/** An offer as both sides see it: whole item views, so neither trusts a client's description. */
export interface TradeOfferView {
  items: ItemView[];
  stacks: Record<string, number>;
  pinecone: string;
}

export type TradeCloseReason =
  | "cancelled"
  | "declined"
  | "expired"
  | "far"
  | "map"
  | "left"
  | "replaced"
  | "timeout";

export type TradeUpdate =
  /** To the player asked. The asker learns nothing until an answer or the lapse. */
  | { t: "invite"; session: string; from: TradePerson; expiresAt: number }
  | {
      t: "open";
      session: string;
      with: TradePerson;
      version: number;
      /** By character id. */
      offers: Record<string, TradeOfferView>;
      confirmed: string[];
      expiresAt: number;
    }
  /** Either offer changed: every confirmation is cleared. */
  | { t: "offer"; session: string; version: number; offers: Record<string, TradeOfferView> }
  | { t: "confirm"; session: string; version: number; confirmed: string[] }
  /** Both confirmed and the trade landed. `change` is this player's own. */
  | { t: "done"; session: string; change: ChangeNotice; tax: string }
  /**
   * Both confirmed but the commit was refused; the window stays open with confirmations cleared
   * and the offers as they now stand. After `server_error` the window closes instead.
   */
  | { t: "failed"; session: string; version: number; error: OpError }
  | { t: "closed"; session: string; reason: TradeCloseReason };

// 매점 게시판 ------------------------------------------------------------------------------

/** What a listing shows of a unique item: what sets its worth. Its 필기 pity stays hidden. */
export interface ListedItem {
  kind: ItemKind;
  grade: number;
  level: number;
  pilgi: number;
  evolved: boolean;
}

export interface ListingView {
  id: string;
  seller: TradePerson;
  category: ListingCategory;
  /** A book or tool def, or a stack id (`ink`, `sheet:<book>`, `snack:<id>`). */
  def: string;
  grade: number;
  /** Units left; a unique item is 1. Stacks sell in part, at `unitPrice` each. */
  qty: number;
  unitPrice: string;
  createdAt: string;
  expiresAt: string;
  item: ListedItem | null;
  /** In `listing.mine` only. */
  state?: "live" | "sold" | "cancelled" | "expired";
}

export interface PriceDay {
  /** Korean calendar day. */
  day: string;
  /** Units sold. */
  volume: number;
  low: string;
  high: string;
  /** Mean unit price, rounded down. */
  mean: string;
}

/** Client to WorldRoom, `{ n, ...BoardRequests[type] }`, answered by `done` with `BoardData`. */
export const BOARD_MESSAGES = {
  browse: "listing.browse",
  mine: "listing.mine",
  history: "listing.history",
} as const;

export interface BoardRequests {
  "listing.browse": {
    category?: ListingCategory;
    def?: string;
    grade?: number;
    sort: "price" | "-price";
    /** The `next` of the previous page. */
    after?: string;
  };
  "listing.mine": Record<string, never>;
  "listing.history": { def: string; grade?: number };
}
export type BoardMessageName = keyof BoardRequests;
export type BoardMessage = {
  [K in BoardMessageName]: { n: number; type: K; req: BoardRequests[K] };
}[BoardMessageName];

/** What each board read's `done` carries. */
export interface BoardData {
  "listing.browse": { listings: ListingView[]; next: string | null };
  "listing.mine": { listings: ListingView[] };
  "listing.history": { history: PriceDay[] };
}

// Validators ----------------------------------------------------------------------------------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DEF = /^[a-z0-9-]{1,40}$/;
/** A whole number of 솔방울, 0 allowed in an offer. */
export const AMOUNT = /^(0|[1-9][0-9]{0,29})$/;
const MAX_STACK = Number.MAX_SAFE_INTEGER;

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const only = (o: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(o).every((k) => keys.includes(k));
const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);
const isInt = (v: unknown, min: number, max: number): v is number =>
  Number.isInteger(v) && (v as number) >= min && (v as number) <= max;

/** Stack counts by id: tradable ids only, whole and positive. */
export function parseStacks(v: unknown, max: number): Record<string, number> | null {
  if (!isObject(v)) return null;
  const entries = Object.entries(v);
  if (entries.length > max) return null;
  const out: Record<string, number> = {};
  for (const [def, qty] of entries) {
    if (!TRADABLE_STACK.test(def) || !isInt(qty, 1, MAX_STACK)) return null;
    out[def] = qty;
  }
  return out;
}

const session = (r: Record<string, unknown>) =>
  only(r, ["session"]) && isUuid(r.session) ? { session: r.session } : null;

const TRADE_CHECKS: {
  [K in TradeMessageName]: (r: Record<string, unknown>) => TradeRequests[K] | null;
} = {
  "trade.request": (r) => (only(r, ["to"]) && isUuid(r.to) ? { to: r.to } : null),
  "trade.accept": session,
  "trade.decline": session,
  "trade.offer": (r) => {
    if (!only(r, ["session", "items", "stacks", "pinecone"]) || !isUuid(r.session)) return null;
    const items = r.items;
    if (!Array.isArray(items) || items.length > TRADE.maxItems || !items.every(isUuid)) {
      return null;
    }
    if (new Set(items).size !== items.length) return null;
    const stacks = parseStacks(r.stacks ?? {}, TRADE.maxStacks);
    const pinecone = r.pinecone ?? "0";
    if (!stacks || typeof pinecone !== "string" || !AMOUNT.test(pinecone)) return null;
    return { session: r.session, items: [...items], stacks, pinecone };
  },
  "trade.confirm": (r) =>
    only(r, ["session", "version"]) && isUuid(r.session) && isInt(r.version, 0, 1e9)
      ? { session: r.session, version: r.version }
      : null,
  "trade.cancel": session,
};

const BOARD_CHECKS: {
  [K in BoardMessageName]: (r: Record<string, unknown>) => BoardRequests[K] | null;
} = {
  "listing.browse": (r) => {
    if (!only(r, ["category", "def", "grade", "sort", "after"])) return null;
    const { category, def, grade, sort, after } = r;
    if (category !== undefined && !(LISTING_CATEGORIES as readonly unknown[]).includes(category)) {
      return null;
    }
    if (
      def !== undefined &&
      !(typeof def === "string" && (DEF.test(def) || TRADABLE_STACK.test(def)))
    ) {
      return null;
    }
    if (grade !== undefined && !isInt(grade, 0, 4)) return null;
    if (sort !== "price" && sort !== "-price") return null;
    if (
      after !== undefined &&
      !(typeof after === "string" && /^[0-9]{1,30}:[0-9a-f-]{36}$/.test(after))
    ) {
      return null;
    }
    return {
      sort,
      ...(category !== undefined ? { category: category as ListingCategory } : {}),
      ...(def !== undefined ? { def: def as string } : {}),
      ...(grade !== undefined ? { grade } : {}),
      ...(after !== undefined ? { after: after as string } : {}),
    };
  },
  "listing.mine": (r) => (only(r, []) ? {} : null),
  "listing.history": (r) => {
    if (!only(r, ["def", "grade"])) return null;
    const { def, grade } = r;
    if (!(typeof def === "string" && (DEF.test(def) || TRADABLE_STACK.test(def)))) return null;
    if (grade !== undefined && !isInt(grade, 0, 4)) return null;
    return { def, ...(grade !== undefined ? { grade } : {}) };
  },
};

function schemaOf<Out>(
  check: (value: unknown) => Out | null,
  name: string,
): WorldMessageSchema<Out> {
  return {
    "~standard": {
      version: 1,
      vendor: "guago",
      validate(value: unknown) {
        const out = check(value);
        return out === null ? { issues: [{ message: `malformed ${name}` }] } : { value: out };
      },
    },
  };
}

/** `{ n, ...body }`: `n` a whole number, the rest the request's own fields. */
function parseBody<R>(value: unknown, check: (r: Record<string, unknown>) => R | null) {
  if (!isObject(value)) return null;
  const { n, ...req } = value;
  if (!Number.isSafeInteger(n) || (n as number) < 0) return null;
  const parsed = check(req);
  return parsed === null ? null : { n: n as number, req: parsed };
}

/** The WorldRoom schema of one trade message: `{ n, ...fields }`. */
export function tradeSchema<K extends TradeMessageName>(
  type: K,
): WorldMessageSchema<{ n: number; type: K; req: TradeRequests[K] }> {
  return schemaOf((v) => {
    const body = parseBody(
      v,
      TRADE_CHECKS[type] as (r: Record<string, unknown>) => TradeRequests[K] | null,
    );
    return body && { ...body, type };
  }, type);
}

export function boardSchema<K extends BoardMessageName>(
  type: K,
): WorldMessageSchema<{ n: number; type: K; req: BoardRequests[K] }> {
  return schemaOf((v) => {
    const body = parseBody(
      v,
      BOARD_CHECKS[type] as (r: Record<string, unknown>) => BoardRequests[K] | null,
    );
    return body && { ...body, type };
  }, type);
}
