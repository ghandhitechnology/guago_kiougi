/**
 * Every item and currency operation, as glue between rows and the pure rules in `@guago/shared`
 * and `@guago/content`. An operation names the rows it touches before anything runs, then maps
 * the loaded rows onto a rule and the rule's answer back onto rows. No rule lives here: costs,
 * odds, slots and rewards all come from the pure functions. The executor checks every answer
 * against what was loaded before it writes anything.
 */
import {
  BOOKS,
  bookById,
  buy,
  craftedCodex,
  type Drop,
  dropLedger,
  dropOrigin,
  goodsOf,
  ledgerKey,
  STARTER_BOOKS,
  TOOLS,
  vendingStock,
  vendingWeek,
} from "@guago/content";
import {
  type Amounts,
  addBookExp,
  addExp,
  allInBag,
  allocateStats,
  BOOK_EXP_FROM_OWNER,
  bind,
  bindCost,
  type Currency,
  claimPool,
  completeQuest,
  earn,
  equip,
  evolve,
  feedSheets,
  forge,
  hasUnlock,
  type LedgerEntry,
  mergeTools,
  NO_STATS,
  type OpError,
  type OpOutcome,
  type OpRequests,
  type Purse,
  pay,
  payClubFee,
  pilgi,
  pilgiChance,
  resetStats,
  sheet,
  TIERS,
  type Tier,
  textbook,
  unequip,
  type Wearer,
  type Worn,
} from "@guago/shared";
import { type LiveRequests, liveOps } from "../live/ops.ts";
import type { LiveLoaded, LiveRows, LiveWrite } from "../live/rows.ts";
import { type RaidRequests, raidOps } from "../raid/ops.ts";
import type { ExpireRequest, TradeCommitRequest } from "../trade/ops.ts";
import type { Queryable } from "./executor.ts";
import {
  type CharacterRow,
  type ItemRow,
  inherit,
  type ListingRow,
  newBookRow,
  newToolRow,
  poolNow,
  type QuestRow,
  toBook,
  toTool,
  wearable,
  withBook,
  withTool,
  worn,
} from "./rows.ts";

/**
 * Operations only the server starts: the starter kit, combat's batched grants, the commit of a
 * direct trade both sides confirmed, and a listing's expiry.
 */
export interface InternalRequests {
  kit: Record<string, never>;
  grant: GrantRequest;
  /** The 동아리 founding fee, run inside the founding transaction (social/fees.ts). */
  "club.found": Record<string, never>;
  "trade.commit": TradeCommitRequest;
  "listing.expire": ExpireRequest;
  /** An admin's grant or removal (moderation/service.ts), run inside its audit transaction. */
  "admin.adjust": AdminAdjustRequest;
}

/**
 * Items and currency an admin gives or takes, checked by `checkAdjust` (moderation/service.ts) before
 * it gets here. Booked as `admin.grant` and `admin.remove`; who and why ride in the request, so
 * the operation's record and the audit row say the same.
 */
export interface AdminAdjustRequest {
  admin: string;
  reason: string;
  /** Whole amounts per currency: positive is given, negative taken. */
  amounts: Amounts;
  /** Definitions to make: books as 교과서 copies, tools at level 1. */
  add: readonly string[];
  /** Item ids to take away. */
  remove: readonly string[];
}

/** What combat credits one character with since its last flush (PLAN §6 drops, §9 EXP). */
export interface GrantRequest {
  /** EXP after every multiplier combat applies (party, catch-up, 숙면, 졸음). */
  exp: number;
  drops: Drop[];
}

export type Requests = OpRequests & InternalRequests & LiveRequests & RaidRequests;
export type AnyOp = keyof Requests;
/** Operations over listings or several characters; the rest touch one character's own rows. */
export type PartyOp =
  | "listing.create"
  | "listing.buy"
  | "listing.cancel"
  | "listing.expire"
  | "trade.commit";
export type SoloOp = Exclude<AnyOp, PartyOp>;

/** The world an operation runs in. `page` is the live Page: fees and catch-up follow it. */
export interface Ctx {
  readonly now: Date;
  readonly page: number;
}

export interface Env extends Ctx {
  /** One server roll in [0, 1) (PLAN §19: all randomness is rolled on the server). */
  roll(): number;
  /** A fresh item id; the executor accepts new items only under ids made here. */
  newId(): string;
}

/** The rows an operation reads and locks, besides the character row itself. */
export interface Rows {
  /** Items in the bag or worn. A listed item is out of the bag and never among them. */
  items?: readonly string[];
  /** Every equipped item, for slot rules and the books that share their owner's EXP. */
  worn?: boolean;
  quests?: readonly string[];
  /** Items held in a listing; only that listing's own operations name them. */
  listed?: readonly string[];
  /** Count the character's live listings. */
  listingCount?: boolean;
  /** Living-world rows (live/rows.ts). */
  live?: LiveRows;
}

export interface Loaded {
  readonly character: CharacterRow;
  /** Every item loaded, worn ones included. */
  readonly items: ReadonlyMap<string, ItemRow>;
  /** Equipped items; empty unless the operation asked for `worn`. */
  readonly worn: readonly ItemRow[];
  readonly quests: ReadonlyMap<string, QuestRow>;
  /** The touched currencies only; a missing one is zero. */
  readonly purse: Purse;
  /** The same balances exactly, for rules whose amounts pass 2^53 (trading). */
  readonly exact: Readonly<Partial<Record<Currency, bigint>>>;
  /** Live listings, when the operation asked for `listingCount`. */
  readonly listingCount: number;
  readonly live: LiveLoaded;
}

export type CharacterChange = Partial<
  Pick<
    CharacterRow,
    "level" | "exp" | "stats" | "poolStartedAt" | "poolRates" | "poolPlace" | "poolSheetBook"
  >
>;

/** A ledger entry in exact units, for amounts that pass 2^53. */
export interface ExactEntry {
  readonly currency: Currency;
  readonly amount: bigint;
  readonly key: string;
}

/** An item that changes owner, whole and unchanged, out of the bag or a listing. */
export interface Give {
  readonly id: string;
  readonly to: string;
  /** When the new owner may trade it on (PLAN §13 re-trade cooldown). */
  readonly tradableAt: Date;
}

/** An operation's answer, in rows. Items in `put` are whole rows, new or changed. */
export interface Applied {
  character?: CharacterChange;
  purse?: Purse;
  ledger?: readonly (LedgerEntry | ExactEntry)[];
  put?: readonly ItemRow[];
  remove?: readonly string[];
  /** Items this character hands to another party; booked -1 here and +1 there. */
  give?: readonly Give[];
  /** `source_or_sink` for items made or used up: one key, or one per item id. */
  itemKey?: string | ((id: string) => string);
  quests?: readonly QuestRow[];
  codex?: readonly string[];
  outcome?: OpOutcome;
  /** Living-world writes (live/rows.ts). */
  live?: LiveWrite;
}

export type Step = { ok: true; value: Applied } | { ok: false; error: OpError };

export interface OpDef<R> {
  /** Whether a client may ask for it; kit and grants are the server's own. */
  readonly client: boolean;
  rows(req: R, character: CharacterRow): Rows;
  /** Currencies touched, once the rows are loaded (a book's 낱장 depend on which book). */
  currencies(
    req: R,
    loaded: Omit<Loaded, "purse" | "exact" | "worn" | "listingCount" | "live">,
    ctx: Ctx,
  ): readonly string[];
  apply(loaded: Loaded, req: R, env: Env): Step;
}

/** A trade's record for the admin search (PLAN §13), written in the operation's transaction. */
export interface TradeLogRow {
  kind: "board" | "direct";
  fromId: string;
  toId: string;
  itemIds: string[];
  defs: string[];
  tax: bigint;
  payload: unknown;
  board?: { listingId: string; def: string; grade: number; qty: number; unitPrice: bigint };
}

/** What every party of an operation loaded, and the listings it locked. */
export interface World {
  readonly initiator: string;
  readonly parties: ReadonlyMap<string, Loaded>;
  readonly listings: ReadonlyMap<string, ListingRow>;
  /** What the operation's `facts` read, once everything was locked. */
  readonly facts: Readonly<Record<string, boolean | number>>;
}

export interface PartyApplied {
  /** Each party's answer; a party left out is written with no change but its `rev`. */
  readonly parties: ReadonlyMap<string, Applied>;
  /** Listings new or changed, as whole rows. */
  readonly listings?: readonly ListingRow[];
  readonly log?: TradeLogRow;
}

export type PartyStep = { ok: true; value: PartyApplied } | { ok: false; error: OpError };

/** Rows locked before the parties' own rows are named. */
export interface Locked {
  readonly initiator: string;
  readonly characters: ReadonlyMap<string, CharacterRow>;
  readonly listings: ReadonlyMap<string, ListingRow>;
}

/**
 * An operation over several characters, listings or both. The executor locks the characters in
 * one fixed order, then the listings, then each party's rows, and writes every party in the one
 * transaction.
 */
export interface PartyOpDef<R> {
  readonly client: boolean;
  /**
   * Everyone besides the initiator, read before any lock. Only facts that never change may name
   * them (a listing's seller, the two sides of a trade); everything else is checked once locked.
   */
  others(q: Queryable, req: R, initiator: string): Promise<readonly string[]>;
  /** Listings to lock, after the characters. */
  listings?(req: R): readonly string[];
  /**
   * Every party is recorded under the one operation id, so a retry from either side finds the
   * result (both sides of a direct trade started it). Otherwise only the initiator is, and the
   * others under `<id>@<initiator>`, which no client id can take.
   */
  readonly shared?: boolean;
  /** The parties hear of it some other way (a trade window's `done`), not by `onChange`. */
  readonly quiet?: boolean;
  rows(req: R, party: string, locked: Locked): Rows;
  /** Facts outside the economy's rows, read in the transaction (a block, a day's count). */
  facts?(q: Queryable, req: R, locked: Locked, ctx: Ctx): Promise<Record<string, boolean | number>>;
  currencies(
    req: R,
    party: string,
    loaded: Omit<Loaded, "purse" | "exact" | "worn" | "listingCount" | "live">,
    locked: Locked,
    ctx: Ctx,
  ): readonly string[];
  apply(world: World, req: R, env: Env): PartyStep;
}

/** A one-character operation as a party operation of its initiator alone. */
export function solo<R>(def: OpDef<R>): PartyOpDef<R> {
  return {
    client: def.client,
    others: async () => [],
    rows: (req, _party, locked) =>
      def.rows(req, locked.characters.get(locked.initiator) as CharacterRow),
    currencies: (req, _party, loaded, _locked, ctx) => def.currencies(req, loaded, ctx),
    apply(world, req, env) {
      const step = def.apply(world.parties.get(world.initiator) as Loaded, req, env);
      return step.ok
        ? { ok: true, value: { parties: new Map([[world.initiator, step.value]]) } }
        : step;
    },
  };
}

const ok = (value: Applied): Step => ({ ok: true, value });
const no = (error: string): Step => ({ ok: false, error: error as OpError });

function find(l: Loaded, id: string, kind: "book" | "tool"): ItemRow | OpError {
  const row = l.items.get(id);
  if (!row) return "item_missing";
  return row.kind === kind ? row : "item_kind";
}

const tierOf = (c: CharacterRow): Tier => TIERS[c.tier] ?? (TIERS[0] as Tier);
const wearer = (c: CharacterRow): Wearer => ({ tier: tierOf(c), major: c.major, minor: c.minor });

/** EXP to the character, and 10% of it to each equipped book (PLAN §8), capped at the owner. */
export function gainExp(l: Loaded, exp: number): { character: CharacterChange; put: ItemRow[] } {
  if (exp <= 0) return { character: {}, put: [] };
  const next = addExp(l.character.level, l.character.exp, exp);
  const put = l.worn
    .filter((r) => r.kind === "book")
    .map((r) => withBook(r, addBookExp(toBook(r), exp * BOOK_EXP_FROM_OWNER, next.level)));
  return { character: next, put };
}

/** Rows whose slot differs between what was loaded and a loadout answer. */
function reslot(l: Loaded, next: readonly Worn[]): ItemRow[] {
  const slotOf = new Map(next.map((w) => [w.id, w.slot]));
  return [...l.items.values()]
    .filter((r) => (slotOf.get(r.id) ?? null) !== r.slot)
    .map((r) => ({ ...r, slot: slotOf.get(r.id) ?? null }));
}

const wornAmong = (rows: readonly ItemRow[]): Worn[] =>
  rows.filter((r) => r.slot !== null).map(worn);

const isBook = (def: string) => BOOKS.some((b) => b.id === def);

export const OPS: { [K in SoloOp]: OpDef<Requests[K]> } = {
  // The living world's operations (PLAN §9, §11, §15), in live/ops.ts.
  ...liveOps({ gainExp }),
  ...raidOps(),
  kit: {
    client: false,
    rows: () => ({}),
    // The wallet row is made with the kit.
    currencies: () => ["pinecone"],
    apply(l, _req, env) {
      let loadout: readonly Worn[] = [];
      const put: ItemRow[] = [];
      for (const [slot, def] of STARTER_BOOKS[l.character.major].entries()) {
        const row = newBookRow(textbook(env.newId(), def), "kit");
        const r = equip(loadout, wearable(row), slot, wearer(l.character));
        if (!r.ok) return no(r.error);
        loadout = r.state;
        put.push({ ...row, slot });
      }
      return ok({ put, itemKey: "kit", outcome: { items: put.map((r) => r.id) } });
    },
  },

  "club.found": {
    client: false,
    rows: () => ({}),
    currencies: () => ["pinecone"],
    apply(l, _req, env) {
      const r = payClubFee(l.purse, env.page);
      if (!r.ok) return no(r.error);
      return ok({ purse: r.purse, ledger: r.ledger });
    },
  },

  "admin.adjust": {
    client: false,
    rows: (req) => ({ items: req.remove }),
    currencies: (req) => Object.keys(req.amounts),
    apply(l, req, env) {
      const gain: Amounts = {};
      const cost: Amounts = {};
      for (const [c, n] of Object.entries(req.amounts) as [keyof Amounts, number][]) {
        if (n > 0) gain[c] = n;
        else if (n < 0) cost[c] = -n;
      }
      const paid = pay(l.purse, cost, "admin.remove");
      if (!paid) return no("insufficient");
      const given = earn(paid.purse, gain, "admin.grant");
      if (req.remove.some((id) => !l.items.has(id))) return no("item_missing");
      const put = req.add.map((def) =>
        isBook(def)
          ? newBookRow(textbook(env.newId(), def), "admin")
          : newToolRow({ id: env.newId(), def, level: 1 }, "admin"),
      );
      const taken = new Set(req.remove);
      return ok({
        purse: given.purse,
        ledger: [...paid.ledger, ...given.ledger],
        put,
        remove: req.remove,
        itemKey: (id) => (taken.has(id) ? "admin.remove" : "admin.grant"),
        outcome: { admin: req.admin, items: put.map((r) => r.id), removed: req.remove },
      });
    },
  },

  grant: {
    client: false,
    rows: (req) => ({ worn: req.exp > 0 }),
    currencies: (req) => req.drops.flatMap((d) => dropLedger(d)?.currency ?? []),
    apply(l, req, env) {
      let purse = l.purse;
      const ledger: LedgerEntry[] = [];
      const tools: ItemRow[] = [];
      const keys = new Map<string, string>();
      for (const drop of req.drops) {
        const entry = dropLedger(drop);
        if (entry) {
          const r = earn(purse, { [entry.currency]: entry.amount }, entry.key);
          purse = r.purse;
          ledger.push(...r.ledger);
        } else if (drop.item.kind === "tool") {
          const row = newToolRow(
            { id: env.newId(), def: drop.item.tool, level: 1 },
            dropOrigin(drop.source),
          );
          tools.push(row);
          keys.set(row.id, ledgerKey(drop.source));
        }
      }
      const gained = gainExp(l, req.exp);
      return ok({
        purse,
        ledger,
        put: [...gained.put, ...tools],
        itemKey: (id) => keys.get(id) ?? "grant",
        character: gained.character,
        outcome: { exp: req.exp, drops: req.drops.length },
      });
    },
  },

  craft: {
    client: true,
    rows: () => ({}),
    currencies: (req, _l, ctx) => (isBook(req.def) ? Object.keys(bindCost(req.def, ctx.page)) : []),
    apply(l, req, env) {
      if (!isBook(req.def)) return no("unknown_def");
      const r = bind(l.purse, { id: env.newId(), def: req.def, page: env.page });
      if (!r.ok) return no(r.error);
      const row = newBookRow(r.state.item, "craft");
      return ok({
        purse: r.state.purse,
        ledger: r.ledger,
        put: [row],
        itemKey: "craft",
        codex: craftedCodex(req.def),
        outcome: { item: row.id },
      });
    },
  },

  pilgi: {
    client: true,
    rows: (req) => ({ items: [req.item] }),
    currencies: () => ["ink", "pinecone"],
    apply(l, req, env) {
      const row = find(l, req.item, "book");
      if (typeof row === "string") return no(row);
      const book = toBook(row);
      // The odds the player saw are the odds applied, or nothing happens.
      const chance = pilgiChance(book.pilgi, book.pilgiFails);
      if (req.chance !== undefined && Math.abs(req.chance - chance) > 1e-9)
        return no("odds_changed");
      const r = pilgi({ item: book, purse: l.purse }, env.roll());
      if (!r.ok) return no(r.error);
      return ok({
        purse: r.state.purse,
        ledger: r.ledger,
        put: [withBook(row, r.state.item)],
        outcome: { success: r.state.success, chance },
      });
    },
  },

  forge: {
    client: true,
    rows: (req) => ({ items: req.items }),
    currencies: () => ["pinecone"],
    apply(l, req, env) {
      const rows: ItemRow[] = [];
      for (const id of req.items) {
        const row = find(l, id, "book");
        if (typeof row === "string") return no(row);
        rows.push(row);
      }
      const r = forge(
        l.purse,
        rows.map((row) => toBook(row)),
        env.page,
      );
      if (!r.ok) return no(r.error);
      if (!allInBag(wornAmong(rows), r.state.consumed)) return no("item_equipped");
      const kept = l.items.get(r.state.item.id) as ItemRow;
      return ok({
        purse: r.state.purse,
        ledger: r.ledger,
        put: [inherit(withBook(kept, r.state.item), rows)],
        remove: r.state.consumed,
        itemKey: "sink.forge",
        outcome: { item: kept.id, consumed: r.state.consumed },
      });
    },
  },

  feed: {
    client: true,
    rows: (req) => ({ items: [req.item] }),
    currencies(req, l) {
      const row = l.items.get(req.item);
      return row?.kind === "book" ? [sheet(row.def)] : [];
    },
    apply(l, req) {
      const row = find(l, req.item, "book");
      if (typeof row === "string") return no(row);
      const r = feedSheets({ item: toBook(row), purse: l.purse }, req.count, l.character.level);
      if (!r.ok) return no(r.error);
      return ok({
        purse: r.state.purse,
        ledger: r.ledger,
        put: [withBook(row, r.state.item)],
        outcome: { used: r.state.used },
      });
    },
  },

  merge: {
    client: true,
    rows: (req) => ({ items: [req.into, req.from] }),
    currencies: () => [],
    apply(l, req) {
      const into = find(l, req.into, "tool");
      if (typeof into === "string") return no(into);
      const from = find(l, req.from, "tool");
      if (typeof from === "string") return no(from);
      const r = mergeTools(toTool(into), toTool(from));
      if (!r.ok) return no(r.error);
      const left = r.state.from;
      // A copy that is used up must come from the bag; one with levels left keeps its place.
      if (left === null && !allInBag(wornAmong([from]), [from.id])) return no("item_equipped");
      return ok({
        put: [
          inherit(withTool(into, r.state.into), [from]),
          ...(left ? [withTool(from, left)] : []),
        ],
        remove: left ? [] : [from.id],
        itemKey: "sink.merge",
        outcome: { item: into.id, level: r.state.into.level, left: left?.level ?? 0 },
      });
    },
  },

  evolve: {
    client: true,
    rows: (req) => ({ items: [req.item, req.tool] }),
    currencies: () => [],
    apply(l, req) {
      const book = find(l, req.item, "book");
      if (typeof book === "string") return no(book);
      const tool = find(l, req.tool, "tool");
      if (typeof tool === "string") return no(tool);
      const unlocked = hasUnlock(tierOf(l.character), "evolution");
      const r = evolve(toBook(book), toTool(tool), bookById(book.def).tool, unlocked);
      if (!r.ok) return no(r.error);
      // The tool is not used up, but what it made carries its binding: an era boss's bound tool
      // must not be a factory of tradable evolutions.
      return ok({ put: [inherit(withBook(book, r.state), [tool])] });
    },
  },

  equip: {
    client: true,
    rows: (req) => ({ items: [req.item], worn: true }),
    currencies: () => [],
    apply(l, req) {
      const row = l.items.get(req.item);
      if (!row) return no("item_missing");
      const r = equip(l.worn.map(worn), wearable(row), req.slot, wearer(l.character));
      if (!r.ok) return no(r.error);
      return ok({ put: reslot(l, r.state) });
    },
  },

  unequip: {
    client: true,
    rows: (req) => ({ items: [req.item], worn: true }),
    currencies: () => [],
    apply(l, req) {
      if (!l.items.has(req.item)) return no("item_missing");
      const r = unequip(l.worn.map(worn), req.item);
      if (!r.ok) return no(r.error);
      return ok({ put: reslot(l, r.state) });
    },
  },

  "stats.allocate": {
    client: true,
    rows: () => ({}),
    currencies: () => [],
    apply(l, req) {
      const r = allocateStats(l.character.stats, req.add, l.character.level);
      if (!r.ok) return no(r.error);
      return ok({ character: { stats: r.state } });
    },
  },

  "stats.reset": {
    client: true,
    rows: () => ({}),
    currencies: () => ["pinecone"],
    apply(l) {
      const r = resetStats(l.purse, l.character.level);
      if (!r.ok) return no(r.error);
      return ok({ purse: r.state.purse, ledger: r.ledger, character: { stats: NO_STATS } });
    },
  },

  "shop.buy": {
    client: true,
    rows: () => ({}),
    currencies: (req) => ["pinecone", goodsOf(req.item)],
    apply(l, req, env) {
      const item = vendingStock(vendingWeek(env.now.getTime())).find((i) => i.id === req.item);
      if (!item) return no("unknown_def");
      const r = buy(l.purse, item, req.qty, env.page);
      if (!r.ok) return no(r.error);
      return ok({
        purse: r.state.purse,
        ledger: r.ledger,
        outcome: { item: r.state.item, qty: r.state.qty },
      });
    },
  },

  claimPool: {
    client: true,
    rows: () => ({ worn: true }),
    currencies: (_req, l) => [
      "pinecone",
      "ink",
      ...(l.character.poolSheetBook ? [sheet(l.character.poolSheetBook)] : []),
    ],
    apply(l, _req, env) {
      const pool = poolNow(l.character, env.now, env.page);
      if (!pool) return no("pool_empty");
      const r = claimPool(l.purse, pool.fill, l.character.poolSheetBook ?? undefined);
      if (!r.ok) return no(r.error);
      const gained = gainExp(l, r.state.exp);
      return ok({
        purse: r.state.purse,
        ledger: r.ledger,
        put: gained.put,
        character: {
          ...gained.character,
          poolStartedAt: null,
          poolRates: null,
          poolPlace: null,
          poolSheetBook: null,
        },
        outcome: { exp: r.state.exp, seconds: pool.fill.seconds },
      });
    },
  },

  "quest.claim": {
    client: true,
    rows: (req) => ({ quests: [req.quest], worn: true }),
    currencies(req, l) {
      const offer = l.quests.get(req.quest)?.offer;
      if (!offer) return [];
      return ["pinecone", "ink", "binding", sheet(offer.sheetBook)];
    },
    apply(l, req) {
      const quest = l.quests.get(req.quest);
      if (!quest) return no("quest_missing");
      if (quest.state === "claimed") return no("quest_claimed");
      if (quest.state !== "done") return no("quest_not_done");
      const { reward, cadence, sheetBook } = quest.offer;
      const r = completeQuest(l.purse, reward, cadence, sheetBook);
      if (!r.ok) return no(r.error);
      const gained = gainExp(l, r.state.exp);
      return ok({
        purse: r.state.purse,
        ledger: r.ledger,
        put: gained.put,
        character: gained.character,
        quests: [{ ...quest, state: "claimed" }],
        outcome: { exp: r.state.exp },
      });
    },
  },
};

// Grants from combat --------------------------------------------------------------------------

const KEY_PART = /^[a-z0-9-]{1,40}$/;
const TOOL_IDS = new Set(TOOLS.map((t) => t.id));
/** Most of one material a stack holds: `materials_qty_check`, exact in a JS number. */
export const MAX_STACK = Number.MAX_SAFE_INTEGER;
/** Most 솔방울 one drop carries. Late-Theme coin passes 2^53; the ledger stores it exactly. */
const MAX_COIN = 1e30;
const whole = (n: unknown, max: number): n is number =>
  Number.isInteger(n) && (n as number) > 0 && (n as number) <= max;

/** What is wrong with one drop, or null. Combat is server code, but a bug there must not mint. */
export function checkDrop({ item, source }: Drop): string | null {
  if (source?.kind !== "monster" || !["normal", "elite", "boss"].includes(source.rank)) {
    return "source";
  }
  if (!KEY_PART.test(source.fieldId) || !KEY_PART.test(source.monsterId)) return "source";
  if (source.era !== undefined && (source.era !== true || source.rank !== "boss")) return "source";
  switch (item?.kind) {
    case "coin":
      return whole(item.amount, MAX_COIN) ? null : "coin";
    case "page":
      return whole(item.qty, MAX_STACK) && isBook(item.book) ? null : "page";
    case "ink":
    case "binding":
      return whole(item.qty, MAX_STACK) ? null : item.kind;
    case "tool":
      return TOOL_IDS.has(item.tool) ? null : "tool";
    default:
      return "kind";
  }
}

/** What is wrong with a grant, or null: no fractions, negatives, NaN, overflows or unknown items. */
export function checkGrant(req: GrantRequest): string | null {
  if (!Number.isFinite(req.exp) || req.exp < 0) return "exp";
  for (const drop of req.drops) {
    const bad = checkDrop(drop);
    if (bad) return bad;
  }
  return null;
}
