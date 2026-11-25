/**
 * Item and currency operations on the wire (PLAN §21): request shapes and their validators, the
 * one `result` each operation id gets, the inventory snapshot read at login and the change
 * notices that follow each operation. The server runs the same validators the client may run.
 */
import type { WorldMessageSchema } from "./chat.ts";
import type { ItemKind } from "./loadout.ts";
import type { LogoutPlace, PoolFill } from "./progress.ts";
import { STAT_IDS, type Stats } from "./stats.ts";

/** Operations a client may request. Names follow PLAN §21 where it names them. */
export const OPS = [
  "craft",
  "pilgi",
  "forge",
  "feed",
  "merge",
  "evolve",
  "equip",
  "unequip",
  "stats.allocate",
  "stats.reset",
  "shop.buy",
  "claimPool",
  "quest.claim",
] as const;
export type OpName = (typeof OPS)[number];

export interface OpRequests {
  /** 제본: one 교과서 copy of `def` from 20 of its 낱장, 제본 재료 and a fee. */
  craft: { def: string };
  /** `chance` is the success the player was shown; a different current chance is refused. */
  pilgi: { item: string; chance?: number };
  forge: { items: [string, string, string] };
  feed: { item: string; count: number };
  /** Tool merge: `from` is used up, `into` gains its levels. */
  merge: { into: string; from: string };
  evolve: { item: string; tool: string };
  equip: { item: string; slot: number };
  unequip: { item: string };
  "stats.allocate": { add: Partial<Stats> };
  "stats.reset": Record<string, never>;
  "shop.buy": { item: string; qty: number };
  claimPool: Record<string, never>;
  "quest.claim": { quest: string };
}

export type OpMessage = { [K in OpName]: { id: string; op: K; req: OpRequests[K] } }[OpName];

/** Why an operation was not carried out. The client owns the copy for each. */
export const OP_ERRORS = [
  // Transport and executor
  "bad_request",
  "rate_limited",
  "op_id_reused",
  "no_character",
  "server_error",
  "insufficient",
  "item_missing",
  "item_kind",
  "item_equipped",
  "unknown_def",
  "odds_changed",
  "pool_empty",
  "quest_missing",
  "quest_not_done",
  "quest_claimed",
  // Rules (items.ts, progress.ts, loadout.ts, the 자판기)
  "pilgi_cost",
  "bind_cost",
  "forge_three",
  "forge_same_item",
  "forge_mismatch",
  "forge_top_grade",
  "forge_cost",
  "feed_count",
  "feed_capped",
  "feed_cost",
  "merge_same_item",
  "merge_mismatch",
  "merge_max",
  "evolve_done",
  "evolve_requirements",
  "stat_amount",
  "stat_points",
  "reset_cost",
  "buy_qty",
  "buy_cost",
  "equip_slot",
  "equip_subject",
  "equip_duplicate",
  "equip_minor_slots",
  "equip_not_worn",
] as const;
export type OpError = (typeof OP_ERRORS)[number];

export interface OpRate {
  readonly burst: number;
  readonly perSecond: number;
}

/** How fast each operation may be sent, per character: a burst, then so many a second. */
export const OP_RATE: { readonly default: OpRate } & Readonly<Partial<Record<OpName, OpRate>>> = {
  default: { burst: 10, perSecond: 5 },
  pilgi: { burst: 6, perSecond: 3 },
  craft: { burst: 5, perSecond: 2 },
  "shop.buy": { burst: 5, perSecond: 2 },
  claimPool: { burst: 2, perSecond: 0.2 },
};

// Views ---------------------------------------------------------------------------------------

/** The next 필기 attempt on a book: the odds applied and what it costs. */
export interface PilgiOdds {
  chance: number;
  ink: number;
  pinecone: number;
}

export interface ItemView {
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
  /** ISO time; null when tradable now. */
  tradableAt: string | null;
  /** Equipped slot of its kind, or null in the bag. */
  slot: number | null;
  /** Books only. */
  next?: PilgiOdds;
}

/** Currencies as exact decimal strings: balances can pass 2^53 late in a Theme. */
export interface WalletView {
  pinecone: string;
  merit: string;
  token: string;
}

export interface PoolView {
  startedAt: string;
  place: LogoutPlace;
  fill: PoolFill;
  /** Seconds the pool fills before it stops. */
  cap: number;
}

export interface ProgressionView {
  level: number;
  exp: number;
  expToNext: number;
  stats: Stats;
  /** Stat points not yet placed. */
  unspent: number;
  /** Index into `TIERS`. */
  tier: number;
  demerits: number;
  merits: number;
  restedUntil: string | null;
  pool: PoolView | null;
}

export interface QuestView {
  id: string;
  state: "active" | "done" | "claimed";
  progress: number;
  target: number;
}

/** Everything the client shows of a character's belongings, read once at login. */
export interface InventorySnapshot {
  /** Bumped by every applied operation; a notice applies on top of `rev - 1`. */
  rev: number;
  wallet: WalletView;
  /** Material and consumable counts by id: `ink`, `binding`, `sheet:<book>`, `snack:<id>`. */
  materials: Record<string, number>;
  items: ItemView[];
  progression: ProgressionView;
  codex: string[];
  quests: QuestView[];
}

/**
 * What one operation changed, as absolute values, so applying it twice is harmless. A client at
 * `rev - 1` applies it; a client further behind reloads the snapshot.
 */
export interface ChangeNotice {
  rev: number;
  wallet?: Partial<WalletView>;
  materials?: Record<string, number>;
  items?: ItemView[];
  removed?: string[];
  progression?: ProgressionView;
  codex?: string[];
  quests?: QuestView[];
}

/** Per-operation details beyond the change: whether 필기 landed, what a claim paid. */
export type OpOutcome = Readonly<Record<string, string | number | boolean | readonly string[]>>;

/** The one result an operation id gets. A retry of the same id gets the same result. */
export type OpResult =
  | { id: string; op: OpName; ok: true; outcome: OpOutcome; change: ChangeNotice }
  | { id: string; op: OpName | null; ok: false; error: OpError; retryMs?: number };

// Validators ----------------------------------------------------------------------------------

/**
 * Client-made operation ids: a UUID fits, so do other short opaque tokens. No `:`, which the
 * server's own ids (`kit`, `grant:…`) use, so a client can never take one of them first.
 */
export const OP_ID_PATTERN = /^[A-Za-z0-9_.-]{8,64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DEF = /^[a-z0-9-]{1,40}$/;

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);
const isDef = (v: unknown): v is string => typeof v === "string" && DEF.test(v);
const isInt = (v: unknown, min: number, max: number): v is number =>
  Number.isInteger(v) && (v as number) >= min && (v as number) <= max;
const only = (o: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(o).every((k) => keys.includes(k));

type Check<T> = (req: Record<string, unknown>) => T | null;

const CHECKS: { [K in OpName]: Check<OpRequests[K]> } = {
  craft: (r) => (only(r, ["def"]) && isDef(r.def) ? { def: r.def } : null),
  pilgi: (r) => {
    if (!only(r, ["item", "chance"]) || !isUuid(r.item)) return null;
    if (r.chance === undefined) return { item: r.item };
    const c = r.chance;
    return typeof c === "number" && c >= 0 && c <= 1 ? { item: r.item, chance: c } : null;
  },
  forge: (r) => {
    const items = r.items;
    if (!only(r, ["items"]) || !Array.isArray(items) || items.length !== 3) return null;
    const [a, b, c] = items as unknown[];
    return isUuid(a) && isUuid(b) && isUuid(c) ? { items: [a, b, c] } : null;
  },
  feed: (r) =>
    only(r, ["item", "count"]) && isUuid(r.item) && isInt(r.count, 1, 100_000)
      ? { item: r.item, count: r.count }
      : null,
  merge: (r) =>
    only(r, ["into", "from"]) && isUuid(r.into) && isUuid(r.from)
      ? { into: r.into, from: r.from }
      : null,
  evolve: (r) =>
    only(r, ["item", "tool"]) && isUuid(r.item) && isUuid(r.tool)
      ? { item: r.item, tool: r.tool }
      : null,
  equip: (r) =>
    only(r, ["item", "slot"]) && isUuid(r.item) && isInt(r.slot, 0, 5)
      ? { item: r.item, slot: r.slot }
      : null,
  unequip: (r) => (only(r, ["item"]) && isUuid(r.item) ? { item: r.item } : null),
  "stats.allocate": (r) => {
    const add = r.add;
    if (!only(r, ["add"]) || !isObject(add) || !only(add, STAT_IDS)) return null;
    const out: Partial<Record<(typeof STAT_IDS)[number], number>> = {};
    for (const [k, v] of Object.entries(add)) {
      if (!isInt(v, 0, 100_000)) return null;
      out[k as (typeof STAT_IDS)[number]] = v;
    }
    return { add: out };
  },
  "stats.reset": (r) => (only(r, []) ? {} : null),
  "shop.buy": (r) =>
    only(r, ["item", "qty"]) && isDef(r.item) && isInt(r.qty, 1, 99)
      ? { item: r.item, qty: r.qty }
      : null,
  claimPool: (r) => (only(r, []) ? {} : null),
  "quest.claim": (r) =>
    only(r, ["quest"]) && typeof r.quest === "string" && /^[a-z0-9:-]{1,64}$/.test(r.quest)
      ? { quest: r.quest }
      : null,
};

export function isOpName(v: unknown): v is OpName {
  return typeof v === "string" && (OPS as readonly string[]).includes(v);
}

/** Checks one request's body against its operation's shape. */
export function parseOpRequest<K extends OpName>(op: K, req: unknown): OpRequests[K] | null {
  if (!isObject(req)) return null;
  return CHECKS[op](req) as OpRequests[K] | null;
}

/** `{ id, op, req }`, or null for anything malformed. */
export function parseOpMessage(value: unknown): OpMessage | null {
  if (!isObject(value) || !only(value, ["id", "op", "req"])) return null;
  const { id, op, req } = value;
  if (typeof id !== "string" || !OP_ID_PATTERN.test(id) || !isOpName(op)) return null;
  const parsed = parseOpRequest(op, req ?? {});
  return parsed === null ? null : ({ id, op, req: parsed } as OpMessage);
}

/**
 * The WorldRoom form (PLAN §21): the message type is the operation's name and the body is
 * `{ id, req }`. As a Standard Schema (standardschema.dev v1), so the room can drop a sender
 * whose message does not parse, the way it treats chat.
 */
export function opSchema<K extends OpName>(op: K): WorldMessageSchema<OpMessage & { op: K }> {
  return {
    "~standard": {
      version: 1,
      vendor: "guago",
      validate(value: unknown) {
        const parsed = isObject(value) ? parseOpMessage({ ...value, op }) : null;
        return parsed === null
          ? { issues: [{ message: `malformed ${op}` }] }
          : { value: parsed as OpMessage & { op: K } };
      },
    },
  };
}
