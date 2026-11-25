/**
 * The one path every change to items and currency goes through (PLAN §19, §21, §22).
 *
 * One operation is one transaction over one or more characters (its parties):
 *  1. Lock every party's character row (`for no key update`), one at a time in ascending id
 *     order, then look the operation id up in a second statement. Every operation on a
 *     character takes this lock first, so two operations on one character, or on one of its
 *     items, run one after the other; and since every operation takes its locks in the same
 *     order, two trades in opposite directions (or a ring of them) can never wait on each other.
 *     Every other row of a character is locked only while its character lock is held.
 *  2. A known id with the same request returns the recorded result and applies nothing; a known
 *     id with another request is refused.
 *  3. Lock the listings the operation names, then load and lock exactly each party's rows:
 *     items (by id, every equipped item when asked, listed items by their listing's
 *     operations), quest rows, the wallet and the material rows of the currencies it touches.
 *  4. Roll the server's randomness and run the pure rule.
 *  5. Check the answer against what was loaded: the purse may only move where ledger entries
 *     say it moved, amounts are whole, items written were loaded or made here, nothing outside
 *     the loaded rows is touched. A broken answer throws and the transaction rolls back.
 *  6. Write rows as deltas in exact `numeric` arithmetic, book the ledger (items included, +1
 *     when made or received and -1 when used up or given), record the operation id with each
 *     party's one result, commit.
 *
 * The database backs every step: currency and counts cannot go negative, an item cannot sit in
 * two slots or share one, and the operation id is a primary key.
 */
import { createHash, getRandomValues, randomUUID } from "node:crypto";
import {
  type ChangeNotice,
  koreanDay,
  type LedgerEntry,
  type OpError,
  type OpOutcome,
  type OpResult,
  type Purse,
  type QuestView,
} from "@guago/shared";
import { sql } from "drizzle-orm";
import { type Db, describeError, pgErrorCode } from "../db/index.ts";
import { livePage } from "../live/current.ts";
import { loadLive, writeLive } from "../live/rows.ts";
import { PARTY_OPS } from "../trade/ops.ts";
import {
  type AnyOp,
  type Applied,
  type Ctx,
  checkGrant,
  type Env,
  type ExactEntry,
  type GrantRequest,
  type Loaded,
  type Locked,
  OPS,
  type PartyOpDef,
  type Requests,
  type SoloOp,
  solo,
  type TradeLogRow,
  type World,
} from "./ops.ts";
import {
  CHARACTER_COLUMNS,
  type CharacterRow,
  characterFromDb,
  ITEM_COLUMNS,
  type ItemRow,
  itemFromDb,
  itemView,
  LISTING_COLUMNS,
  type ListingRow,
  listingFromDb,
  progressionView,
  type QuestRow,
  questFromDb,
  questView,
} from "./rows.ts";

/**
 * Operation ids are kept this long (`Economy.prune`), the kit's for good. A client retries within
 * seconds (its call times out after 8 s; a dropped socket has 30 s to come back), and a grant
 * batch still in flight keeps its record however old it is.
 */
export const OPERATION_RETENTION_MINUTES = 60;

/** `db` itself or an open transaction on it: anything that can run a statement. */
export type Queryable = Pick<Db, "execute">;

/** A rule answered something the executor cannot write: a bug, never a player's mistake. */
export class ContractError extends Error {
  override name = "ContractError";
}

/** Where the wallet keeps each wallet currency. Everything else is a `materials` row. */
const WALLET: Readonly<Record<string, string>> = {
  pinecone: "pinecones",
  merit: "merit_points",
  token: "tokens",
};
const isWallet = (c: string) => c in WALLET;

/** A result as the executor gives it: client operations and the server's own (kit, grant). */
type Widen<T> = T extends unknown ? Omit<T, "op"> & { op: AnyOp } : never;
export type ExecResult = Widen<OpResult>;

export interface OpContext {
  /** The initiator: whose request it is, or whose listing expires. */
  characterId: string;
  opId: string;
  name: AnyOp;
}

/** Every operation as a party operation: one-character ones are their initiator's alone. */
const DEFS: { [K in AnyOp]: PartyOpDef<Requests[K]> } = {
  ...(Object.fromEntries(Object.entries(OPS).map(([name, def]) => [name, solo(def as never)])) as {
    [K in SoloOp]: PartyOpDef<Requests[K]>;
  }),
  ...PARTY_OPS,
};

export interface ExecutorOptions {
  /** Server randomness in [0, 1); a CSPRNG unless a test scripts the rolls. */
  random?: () => number;
  now?: () => Date;
  /** The live Page. Fees and catch-up follow it; server state will own it (PLAN §10). */
  page?: () => number;
  /** Test seams inside the transaction, after the rows are locked and before the commit. */
  hooks?: {
    afterLoad?(op: OpContext): Promise<void> | void;
    beforeCommit?(op: OpContext): Promise<void> | void;
  };
  /** Called after a commit that changed the character's level. */
  onLevel?(characterId: string, level: number): void;
  /**
   * A party other than the initiator was changed (the seller of a listing bought while they
   * were offline or elsewhere): their notice, for their client.
   */
  onChange?(characterId: string, change: ChangeNotice): void;
  /** Called after every operation that applied, once it committed (the living world listens). */
  onApplied?(characterId: string, name: AnyOp, result: ExecResult): void;
}

const cryptoRoll = () => (getRandomValues(new Uint32Array(1))[0] as number) / 2 ** 32;

/** Stable JSON: keys sorted, so a retry built in another order hashes the same. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function requestHash(name: string, request: unknown): string {
  return createHash("sha256").update(canonical({ name, request })).digest("hex");
}

/** An exact decimal for a whole-number double, including those past 2^53. */
function decimal(n: number): string {
  if (!Number.isInteger(n)) throw new ContractError(`amount ${n} is not whole`);
  return BigInt(n).toString();
}

/** An item another party gives this one, as it will stand once moved. */
interface Received {
  row: ItemRow;
}

interface Plan {
  /** Exact deltas per touched currency, from the ledger. */
  deltas: Map<string, bigint>;
  ledger: { currency: string; key: string; amount: string; item: string | null }[];
  inserts: ItemRow[];
  updates: ItemRow[];
  removes: string[];
  gives: NonNullable<Applied["give"]>[number][];
  received: readonly Received[];
}

/**
 * Step 5: everything the rule answered must be writable as it stands. Returns the writes.
 */
function plan(
  loaded: Loaded,
  applied: Applied,
  touched: ReadonlySet<string>,
  made: Set<string>,
  received: readonly Received[],
) {
  const deltas = new Map<string, bigint>();
  const sums = new Map<string, number>();
  const ledger: Plan["ledger"] = [];
  const booked = new Map<string, { currency: string; key: string; amount: bigint }>();
  for (const e of (applied.ledger ?? []) as readonly (LedgerEntry | ExactEntry)[]) {
    if (!touched.has(e.currency)) throw new ContractError(`books ${e.currency}, never loaded`);
    let amount: bigint;
    if (typeof e.amount === "bigint") {
      amount = e.amount;
    } else {
      if (!Number.isFinite(e.amount)) throw new ContractError("empty amount");
      amount = BigInt(decimal(e.amount));
    }
    if (amount === 0n) throw new ContractError("empty amount");
    deltas.set(e.currency, (deltas.get(e.currency) ?? 0n) + amount);
    sums.set(e.currency, (sums.get(e.currency) ?? 0) + Number(amount));
    // One ledger row per (currency, key) and operation.
    const k = `${e.currency}\u0000${e.key}`;
    const row = booked.get(k) ?? { currency: e.currency, key: e.key, amount: 0n };
    row.amount += amount;
    booked.set(k, row);
  }
  for (const row of booked.values()) {
    if (row.amount !== 0n) {
      ledger.push({
        currency: row.currency,
        key: row.key,
        amount: row.amount.toString(),
        item: null,
      });
    }
  }

  // The purse may move only where the ledger says it moved.
  const next: Readonly<Record<string, number | undefined>> = applied.purse ?? loaded.purse;
  const was: Readonly<Record<string, number | undefined>> = loaded.purse;
  for (const c of new Set([...Object.keys(next), ...touched])) {
    const before = was[c] ?? 0;
    const after = next[c] ?? 0;
    if (!touched.has(c)) {
      if (after !== 0) throw new ContractError(`purse holds ${c}, never loaded`);
      continue;
    }
    const moved = after - before;
    const said = sums.get(c) ?? 0;
    // Exact below 2^53; above it a double holds only nearby values, so allow a few units of
    // its own precision. The write itself is the exact ledger delta.
    const slack = Math.max(Math.abs(before), Math.abs(after)) * 2 ** -50;
    if (Math.abs(moved - said) > slack) {
      throw new ContractError(`purse moved ${c} by ${moved}, ledger says ${said}`);
    }
  }

  const inserts: ItemRow[] = [];
  const updates: ItemRow[] = [];
  const seen = new Set<string>();
  const removes = [...(applied.remove ?? [])];
  for (const row of applied.put ?? []) {
    if (seen.has(row.id)) throw new ContractError(`item ${row.id} written twice`);
    seen.add(row.id);
    const before = loaded.items.get(row.id);
    if (before) {
      if (before.def !== row.def || before.kind !== row.kind) {
        throw new ContractError(`item ${row.id} changed what it is`);
      }
      updates.push(row);
    } else if (made.has(row.id)) {
      inserts.push(row);
    } else {
      throw new ContractError(`item ${row.id} was neither loaded nor made here`);
    }
  }
  for (const id of removes) {
    if (!loaded.items.has(id) || seen.has(id)) throw new ContractError(`cannot remove ${id}`);
    seen.add(id);
  }
  const gives = [...(applied.give ?? [])];
  for (const g of gives) {
    if (!loaded.items.has(g.id) || seen.has(g.id)) throw new ContractError(`cannot give ${g.id}`);
    if (g.to === loaded.character.id) throw new ContractError(`gives ${g.id} to its owner`);
    seen.add(g.id);
  }
  const keyOf = (id: string) =>
    typeof applied.itemKey === "function" ? applied.itemKey(id) : (applied.itemKey ?? "unknown");
  for (const row of inserts) {
    ledger.push({ currency: `item:${row.def}`, key: keyOf(row.id), amount: "1", item: row.id });
  }
  for (const r of received) {
    ledger.push({
      currency: `item:${r.row.def}`,
      key: keyOf(r.row.id),
      amount: "1",
      item: r.row.id,
    });
  }
  for (const id of [...removes, ...gives.map((g) => g.id)]) {
    const def = (loaded.items.get(id) as ItemRow).def;
    ledger.push({ currency: `item:${def}`, key: keyOf(id), amount: "-1", item: id });
  }
  return { deltas, ledger, inserts, updates, removes, gives, received } satisfies Plan;
}

/** True when the only thing that moved on an item is its EXP. */
function onlyExp(before: ItemRow, after: ItemRow): boolean {
  return (
    before.exp !== after.exp &&
    before.level === after.level &&
    before.grade === after.grade &&
    before.pilgi === after.pilgi &&
    before.pilgiFails === after.pilgiFails &&
    before.evolved === after.evolved &&
    before.slot === after.slot
  );
}

/**
 * Items in a change notice: whole views for items that changed, and for books whose EXP alone
 * moved (equipped books sharing their owner's EXP, every grant) just the new EXP.
 */
function notices(loaded: Loaded, p: Plan): Pick<ChangeNotice, "items" | "exp"> {
  const exp: Record<string, number> = {};
  const items = [...p.inserts, ...p.received.map((r) => r.row)];
  for (const row of p.updates) {
    if (row.listing !== null) continue;
    const before = loaded.items.get(row.id) as ItemRow;
    if (onlyExp(before, row)) exp[row.id] = row.exp;
    else items.push(row);
  }
  return {
    ...(items.length > 0 ? { items: items.map(itemView) } : {}),
    ...(Object.keys(exp).length > 0 ? { exp } : {}),
  };
}

// Loading -------------------------------------------------------------------------------------

/**
 * Step 1: the parties' character rows, one statement each in ascending id order, so the order
 * the locks are taken in is the order every operation takes them in. Undefined when one of
 * them does not exist.
 */
async function lockCharacters(q: Queryable, parties: readonly string[]) {
  const characters = new Map<string, CharacterRow>();
  for (const id of parties) {
    const { rows } = await q.execute(sql`
      select ${sql.raw(CHARACTER_COLUMNS)} from characters c
      where c.id = ${id}
      for no key update`);
    const row = rows[0];
    if (!row) return undefined;
    characters.set(id, characterFromDb(row));
  }
  return characters;
}

/**
 * Step 2. The lookup is its own statement on purpose: a transaction that waited for a lock
 * re-reads only the locked row, so a join in the locking statement would miss the record the
 * transaction it waited for just committed. A new statement sees it (READ COMMITTED).
 */
async function lookup(q: Queryable, records: readonly { characterId: string; opId: string }[]) {
  const { rows } = await q.execute(sql`
    select o.character_id, o.request_hash, o.result from operations o
    join unnest(
      ${sql.param(records.map((r) => r.characterId))}::uuid[],
      ${sql.param(records.map((r) => r.opId))}::text[]) as k(character_id, op_id)
      on o.character_id = k.character_id and o.op_id = k.op_id`);
  return rows as { character_id: string; request_hash: string; result: ExecResult }[];
}

/**
 * The listings an operation names. Those whose seller is a party are locked, under the seller's
 * character lock like every other row of theirs; any other is only read, and cannot be written
 * (a closed listing never changes again; someone else's live one is not this operation's).
 */
async function lockListings(
  q: Queryable,
  ids: readonly string[],
  parties: readonly string[],
  now: () => Date,
) {
  const locked = new Map<string, ListingRow>();
  const seen = new Map<string, ListingRow>();
  if (ids.length === 0) return { locked, seen };
  const mine = await q.execute(sql`
    select ${sql.raw(LISTING_COLUMNS)} from listings
    where id = any(${sql.param([...ids])}::uuid[]) and seller_id = any(${sql.param([...parties])}::uuid[])
    order by id
    for update`);
  for (const r of mine.rows) locked.set(r.id as string, listingFromDb(r, now()));
  const rest = ids.filter((id) => !locked.has(id));
  if (rest.length > 0) {
    const { rows } = await q.execute(sql`
      select ${sql.raw(LISTING_COLUMNS)} from listings where id = any(${sql.param(rest)}::uuid[])`);
    for (const r of rows) seen.set(r.id as string, listingFromDb(r, now()));
  }
  return { locked, seen };
}

/** Bag and worn items by id (and every worn one when asked); listed items only by `listed`. */
async function loadItems(
  q: Queryable,
  owner: string,
  ids: readonly string[],
  worn: boolean,
  listed: readonly string[],
): Promise<Map<string, ItemRow>> {
  if (ids.length === 0 && !worn && listed.length === 0) return new Map();
  const { rows } = await q.execute(sql`
    select ${sql.raw(ITEM_COLUMNS)} from items
    where owner_id = ${owner}
      and ((listing_id is null
            and (id = any(${sql.param([...ids])}::uuid[]) or (${worn} and slot is not null)))
        or (listing_id is not null and id = any(${sql.param([...listed])}::uuid[])))
    order by id
    for update`);
  return new Map(rows.map((r) => [r.id as string, itemFromDb(r)]));
}

async function countListings(q: Queryable, sellerId: string): Promise<number> {
  const { rows } = await q.execute(sql`
    select count(*)::int as n from listings where seller_id = ${sellerId} and state = 'live'`);
  return (rows[0]?.n as number | undefined) ?? 0;
}

async function loadQuests(q: Queryable, characterId: string, ids: readonly string[]) {
  if (ids.length === 0) return new Map<string, QuestRow>();
  const { rows } = await q.execute(sql`
    select quest_id, state, progress, target, offer from quest_progress
    where character_id = ${characterId} and quest_id = any(${sql.param([...ids])}::text[])
    order by quest_id
    for update`);
  return new Map(rows.map((r) => [r.quest_id as string, questFromDb(r)]));
}

async function loadPurse(q: Queryable, characterId: string, currencies: readonly string[]) {
  const purse: Record<string, number> = {};
  const exact: Record<string, bigint> = {};
  if (currencies.some(isWallet)) {
    const read = () =>
      q.execute(sql`
        select pinecones, merit_points, tokens from wallets
        where character_id = ${characterId} for update`);
    let { rows } = await read();
    if (rows.length === 0) {
      // The character lock is held, so no one else can be making this row.
      await q.execute(sql`insert into wallets (character_id) values (${characterId})`);
      ({ rows } = await read());
    }
    const w = rows[0] as Record<string, string>;
    for (const c of currencies.filter(isWallet)) {
      purse[c] = Number(w[WALLET[c] as string]);
      exact[c] = BigInt(w[WALLET[c] as string] as string);
    }
  }
  const stacks = currencies.filter((c) => !isWallet(c));
  if (stacks.length > 0) {
    for (const c of stacks) {
      purse[c] = 0;
      exact[c] = 0n;
    }
    const { rows } = await q.execute(sql`
      select def_id, qty from materials
      where character_id = ${characterId} and def_id = any(${sql.param(stacks)}::text[])
      order by def_id
      for update`);
    for (const r of rows) {
      purse[r.def_id as string] = Number(r.qty);
      exact[r.def_id as string] = BigInt(r.qty as string);
    }
  }
  return { purse, exact };
}

// Writing -------------------------------------------------------------------------------------

interface Written {
  character: CharacterRow;
  wallet?: Record<string, string>;
  materials?: Record<string, number>;
  codex: string[];
  /** Notices the operation posted. */
  posted: QuestView[];
}

async function write(
  q: Queryable,
  loaded: Loaded,
  applied: Applied,
  p: Plan,
  opId: string,
  coalesce: boolean,
  day: string,
): Promise<Written> {
  const c = loaded.character.id;
  const out: Partial<Written> = { codex: [] };

  const wallet = Object.entries(WALLET).map(([cur]) => p.deltas.get(cur) ?? 0n);
  if (wallet.some((d) => d !== 0n)) {
    const [pine, merit, token] = wallet.map((d) => d.toString());
    const { rows } = await q.execute(sql`
      update wallets set
        pinecones = pinecones + ${pine}::numeric,
        merit_points = merit_points + ${merit}::numeric,
        tokens = tokens + ${token}::numeric
      where character_id = ${c}
      returning pinecones, merit_points, tokens`);
    const w = rows[0] as Record<string, string>;
    out.wallet = { pinecone: w.pinecones, merit: w.merit_points, token: w.tokens } as Record<
      string,
      string
    >;
  }

  const stacks = [...p.deltas].filter(([cur, d]) => !isWallet(cur) && d !== 0n);
  if (stacks.length > 0) {
    // Existing stacks move by their delta; new ones are inserted. (`on conflict do update`
    // would check the proposed negative row against the constraint before seeing the conflict.)
    const { rows } = await q.execute(sql`
      with d as (
        select * from unnest(
          ${sql.param(stacks.map(([cur]) => cur))}::text[],
          ${sql.param(stacks.map(([, d]) => d.toString()))}::bigint[]) as t(def, n)
      ), moved as (
        update materials m set qty = m.qty + d.n from d
        where m.character_id = ${c} and m.def_id = d.def
        returning m.def_id, m.qty
      ), made as (
        insert into materials (character_id, def_id, qty)
        select ${c}, d.def, d.n from d where d.def not in (select def_id from moved)
        returning def_id, qty
      )
      select def_id, qty from moved union all select def_id, qty from made`);
    out.materials = Object.fromEntries(rows.map((r) => [r.def_id as string, Number(r.qty)]));
  }

  if (p.removes.length > 0) {
    const gone = await q.execute(sql`
      delete from items where owner_id = ${c} and id = any(${sql.param(p.removes)}::uuid[])`);
    if (gone.rowCount !== p.removes.length) throw new ContractError("removed items went missing");
  }
  if (p.updates.length > 0) {
    // Moved items leave their old slots first, so a swap never holds two items in one slot.
    const moved = p.updates.filter((r) => r.slot !== loaded.items.get(r.id)?.slot).map((r) => r.id);
    if (moved.length > 0) {
      await q.execute(sql`
        update items set slot = null
        where owner_id = ${c} and id = any(${sql.param(moved)}::uuid[])`);
    }
    const u = p.updates;
    const done = await q.execute(sql`
      update items i set
        grade = u.grade, level = u.level, exp = u.exp, pilgi = u.pilgi,
        pilgi_fail_streak = u.fails, evolved = u.evolved, slot = u.slot,
        listing_id = u.listing, updated_at = now()
      from unnest(
        ${sql.param(u.map((r) => r.id))}::uuid[],
        ${sql.param(u.map((r) => r.grade))}::smallint[],
        ${sql.param(u.map((r) => r.level))}::integer[],
        ${sql.param(u.map((r) => r.exp))}::float8[],
        ${sql.param(u.map((r) => r.pilgi))}::integer[],
        ${sql.param(u.map((r) => r.pilgiFails))}::integer[],
        ${sql.param(u.map((r) => r.evolved))}::boolean[],
        ${sql.param(u.map((r) => r.slot))}::smallint[],
        ${sql.param(u.map((r) => r.listing))}::uuid[]
      ) as u(id, grade, level, exp, pilgi, fails, evolved, slot, listing)
      where i.id = u.id and i.owner_id = ${c}`);
    if (done.rowCount !== u.length) throw new ContractError("updated items went missing");
  }
  if (p.gives.length > 0) {
    // Whole and unchanged, into the receiver's bag; out of any listing that held it.
    const g = p.gives;
    const moved = await q.execute(sql`
      update items i set
        owner_id = g.owner, slot = null, listing_id = null, tradable_at = g.tradable,
        updated_at = now()
      from unnest(
        ${sql.param(g.map((r) => r.id))}::uuid[],
        ${sql.param(g.map((r) => r.to))}::uuid[],
        ${sql.param(g.map((r) => r.tradableAt.toISOString()))}::timestamptz[]
      ) as g(id, owner, tradable)
      where i.id = g.id and i.owner_id = ${c}`);
    if (moved.rowCount !== g.length) throw new ContractError("given items went missing");
  }
  if (p.inserts.length > 0) {
    const n = p.inserts;
    await q.execute(sql`
      insert into items (id, owner_id, def_id, kind, grade, level, exp, pilgi, pilgi_fail_streak,
        evolved, slot, bound, tradable_at)
      select u.id, ${c}, u.def, u.kind, u.grade, u.level, u.exp, u.pilgi, u.fails, u.evolved,
        u.slot, u.bound, u.tradable
      from unnest(
        ${sql.param(n.map((r) => r.id))}::uuid[],
        ${sql.param(n.map((r) => r.def))}::text[],
        ${sql.param(n.map((r) => r.kind))}::text[],
        ${sql.param(n.map((r) => r.grade))}::smallint[],
        ${sql.param(n.map((r) => r.level))}::integer[],
        ${sql.param(n.map((r) => r.exp))}::float8[],
        ${sql.param(n.map((r) => r.pilgi))}::integer[],
        ${sql.param(n.map((r) => r.pilgiFails))}::integer[],
        ${sql.param(n.map((r) => r.evolved))}::boolean[],
        ${sql.param(n.map((r) => r.slot))}::smallint[],
        ${sql.param(n.map((r) => r.bound))}::boolean[],
        ${sql.param(n.map((r) => r.tradableAt?.toISOString() ?? null))}::timestamptz[]
      ) as u(id, def, kind, grade, level, exp, pilgi, fails, evolved, slot, bound, tradable)`);
  }

  for (const quest of applied.quests ?? []) {
    if (!loaded.quests.has(quest.id)) throw new ContractError(`quest ${quest.id} never loaded`);
    await q.execute(sql`
      update quest_progress set state = ${quest.state}, progress = ${quest.progress}
      where character_id = ${c} and quest_id = ${quest.id}`);
  }

  if ((applied.codex ?? []).length > 0) {
    const { rows } = await q.execute(sql`
      insert into codex_unlocks (character_id, entry_id)
      select ${c}, unnest(${sql.param([...(applied.codex ?? [])])}::text[])
      on conflict do nothing
      returning entry_id`);
    out.codex = rows.map((r) => r.entry_id as string);
  }

  out.posted = (await writeLive(q, c, opId, applied.live)).quests;
  const ch = { ...loaded.character, ...applied.character };
  const { rows } = await q.execute(sql`
    update characters set
      level = ${ch.level}, exp = ${ch.exp},
      stat_understanding = ${ch.stats.understanding}, stat_memory = ${ch.stats.memory},
      stat_focus = ${ch.stats.focus}, stat_vitality = ${ch.stats.vitality},
      stat_agility = ${ch.stats.agility}, stat_luck = ${ch.stats.luck},
      pool_started_at = ${ch.poolStartedAt}, pool_rates = ${ch.poolRates ? JSON.stringify(ch.poolRates) : null}::jsonb,
      pool_place = ${ch.poolPlace}, pool_sheet_book = ${ch.poolSheetBook},
      rev = rev + 1, updated_at = now()
    where id = ${c}
    returning ${sql.raw(CHARACTER_COLUMNS.replaceAll("c.", ""))}`);
  out.character = characterFromDb(rows[0] as Record<string, unknown>);

  // Combat grants add into one row per character, day, currency and source (the ledger's
  // growth, PLAN §19 persistence); items and every other operation keep a row of their own.
  const pooled = coalesce ? p.ledger.filter((e) => e.item === null) : [];
  const single = coalesce ? p.ledger.filter((e) => e.item !== null) : p.ledger;
  if (single.length > 0) {
    const l = single;
    await q.execute(sql`
      insert into economy_ledger (day, character_id, operation_id, currency, source_or_sink, amount, item_id)
      select ${day}::date, ${c}, ${opId}, u.currency, u.key, u.amount, u.item
      from unnest(
        ${sql.param(l.map((e) => e.currency))}::text[],
        ${sql.param(l.map((e) => e.key))}::text[],
        ${sql.param(l.map((e) => e.amount))}::numeric[],
        ${sql.param(l.map((e) => e.item))}::uuid[]
      ) as u(currency, key, amount, item)`);
  }
  if (pooled.length > 0) {
    const l = pooled;
    await q.execute(sql`
      insert into economy_ledger
        (day, character_id, operation_id, currency, source_or_sink, amount, coalesced)
      select ${day}::date, ${c}, ${opId}, u.currency, u.key, u.amount, true
      from unnest(
        ${sql.param(l.map((e) => e.currency))}::text[],
        ${sql.param(l.map((e) => e.key))}::text[],
        ${sql.param(l.map((e) => e.amount))}::numeric[]
      ) as u(currency, key, amount)
      on conflict (character_id, day, currency, source_or_sink) where coalesced
      do update set amount = economy_ledger.amount + excluded.amount,
        entries = economy_ledger.entries + 1, operation_id = excluded.operation_id,
        at = excluded.at`);
  }
  return out as Written;
}

/** Listings new (made here, sold by a party) or changed (locked here, same listing). */
async function writeListings(
  q: Queryable,
  rows: readonly ListingRow[],
  locked: ReadonlyMap<string, ListingRow>,
  made: ReadonlySet<string>,
  parties: ReadonlySet<string>,
): Promise<void> {
  const seen = new Set<string>();
  for (const l of rows) {
    if (seen.has(l.id)) throw new ContractError(`listing ${l.id} written twice`);
    seen.add(l.id);
    const before = locked.get(l.id);
    if (before) {
      const same =
        before.sellerId === l.sellerId &&
        before.def === l.def &&
        before.itemId === l.itemId &&
        before.unitPrice === l.unitPrice &&
        l.qty <= before.qty;
      if (!same) throw new ContractError(`listing ${l.id} changed what it sells`);
      await q.execute(sql`
        update listings set state = ${l.state}, qty = ${l.qty}, closed_at = ${l.closedAt?.toISOString() ?? null}
        where id = ${l.id}`);
    } else if (made.has(l.id) && parties.has(l.sellerId)) {
      await q.execute(sql`
        insert into listings (id, seller_id, state, category, def_id, grade, item_id, item, qty,
          listed_qty, unit_price, fee, created_at, expires_at)
        values (${l.id}, ${l.sellerId}, ${l.state}, ${l.category}, ${l.def}, ${l.grade},
          ${l.itemId}, ${l.item ? JSON.stringify(l.item) : null}::jsonb, ${l.qty}, ${l.listedQty},
          ${l.unitPrice.toString()}::numeric, ${l.fee.toString()}::numeric,
          ${l.createdAt.toISOString()}::timestamptz, ${l.expiresAt.toISOString()}::timestamptz)`);
    } else {
      throw new ContractError(`listing ${l.id} was neither locked nor made here`);
    }
  }
}

async function writeLog(q: Queryable, log: TradeLogRow, opId: string, at: Date): Promise<void> {
  const b = log.board;
  await q.execute(sql`
    insert into trade_log (kind, op_id, at, from_id, to_id, item_ids, defs, tax, payload,
      listing_id, def_id, grade, qty, unit_price)
    values (${log.kind}, ${opId}, ${at.toISOString()}::timestamptz, ${log.fromId}, ${log.toId},
      ${sql.param(log.itemIds)}::uuid[], ${sql.param(log.defs)}::text[],
      ${log.tax.toString()}::numeric, ${JSON.stringify(log.payload)}::jsonb,
      ${b?.listingId ?? null}, ${b?.def ?? null}, ${b?.grade ?? null}, ${b?.qty ?? null},
      ${b ? b.unitPrice.toString() : null}::numeric)`);
}

async function record(
  q: Queryable,
  op: OpContext,
  hash: string,
  result: ExecResult,
): Promise<void> {
  await q.execute(sql`
    insert into operations (character_id, op_id, name, request_hash, ok, result)
    values (${op.characterId}, ${op.opId}, ${op.name}, ${hash}, ${result.ok}, ${JSON.stringify(result)}::jsonb)`);
}

// The executor --------------------------------------------------------------------------------

/** The live Page (PLAN §10): the Page clock's, once the server provided it (live/current.ts). */
export { livePage };

/**
 * Errors worth retrying unchanged: the connection or the database server failed, not the
 * request. Anything else (a broken rule, a refused constraint, a bug) fails the same way again.
 */
export function isTransient(error: unknown): boolean {
  if (error instanceof ContractError) return false;
  const { code } = pgErrorCode(error);
  if (code) return /^(08|40|53|57|58)/.test(code) || code === "55P03" || /^E[A-Z]+$/.test(code);
  const message = error instanceof Error ? error.message : "";
  return /Connection terminated|timeout exceeded when trying to connect/.test(message);
}

export function createExecutor(db: Db, options: ExecutorOptions = {}) {
  const roll = options.random ?? cryptoRoll;
  const now = options.now ?? (() => new Date());
  const page = options.page ?? livePage;
  const hooks = options.hooks ?? {};
  const lanes = new Map<string, Promise<void>>();

  /**
   * One operation per character at a time in this process, queued before it takes a database
   * connection, so a player flooding requests waits on their own queue and never parks the
   * pool's connections on their character lock. The lock still orders operations from anywhere
   * else (another process, a tool). An operation of several characters joins every party's
   * queue at once, synchronously, so two of them can never each hold a queue the other waits
   * for: every queue sees them in the same order.
   */
  function inLanes<T>(characterIds: readonly string[], work: () => Promise<T>): Promise<T> {
    const ids = [...new Set(characterIds)];
    const before = Promise.all(ids.map((id) => lanes.get(id) ?? Promise.resolve()));
    const result = before.then(work);
    const done = result.then(
      () => {},
      () => {},
    );
    for (const id of ids) lanes.set(id, done);
    void done.then(() => {
      for (const id of ids) if (lanes.get(id) === done) lanes.delete(id);
    });
    return result;
  }

  interface Ran {
    /** Each recorded party's result. Only the initiator's on an unrecorded refusal. */
    results: Map<string, ExecResult>;
    /** Parties whose level changed. */
    levels: Map<string, number>;
    /**
     * Read back from the id's record: nothing was applied now, so no listener hears it again
     * (a resent claim or purchase must not notify, count or credit twice).
     */
    replayed: boolean;
  }

  /** Steps 1 to 6 on an open transaction. */
  async function run<K extends AnyOp>(
    q: Queryable,
    op: OpContext & { name: K },
    request: Requests[K],
    hash: string,
    others: readonly string[],
  ): Promise<Ran> {
    const def = DEFS[op.name] as PartyOpDef<Requests[K]>;
    const initiator = op.characterId;
    const unrecorded = (error: OpError): Ran => ({
      results: new Map([[initiator, { id: op.opId, op: op.name, ok: false, error }]]),
      levels: new Map(),
      replayed: false,
    });
    const parties = [...new Set([initiator, ...others])].sort();
    // Each party's record: the shared id, or the initiator's id under the initiator's name.
    const records = parties.map((characterId) => ({
      characterId,
      opId: def.shared || characterId === initiator ? op.opId : `${op.opId}@${initiator}`,
    }));

    const characters = await lockCharacters(q, parties);
    if (!characters) return unrecorded("no_character");
    const recorded = await lookup(q, records);
    if (recorded.length > 0) {
      if (recorded.some((r) => r.request_hash !== hash)) return unrecorded("op_id_reused");
      return {
        results: new Map(recorded.map((r) => [r.character_id, r.result])),
        levels: new Map(),
        replayed: true,
      };
    }

    const ctx: Ctx = { now: now(), page: page() };
    const made = new Set<string>();
    const env: Env = {
      ...ctx,
      roll,
      newId() {
        const id = randomUUID();
        made.add(id);
        return id;
      },
    };
    const named = await lockListings(
      q,
      [...(def.listings?.(request) ?? [])].sort(),
      parties,
      () => ctx.now,
    );
    const listings = new Map([...named.seen, ...named.locked]);
    const locked: Locked = { initiator, characters, listings };
    const loaded = new Map<string, Loaded>();
    const touchedBy = new Map<string, Set<string>>();
    for (const id of parties) {
      const character = characters.get(id) as CharacterRow;
      const want = def.rows(request, id, locked);
      const items = await loadItems(q, id, want.items ?? [], want.worn ?? false, want.listed ?? []);
      const quests = await loadQuests(q, id, want.quests ?? []);
      const touched = new Set(
        def.currencies(request, id, { character, items, quests }, locked, ctx),
      );
      const { purse, exact } = await loadPurse(q, id, [...touched].sort());
      const worn = want.worn ? [...items.values()].filter((r) => r.slot !== null) : [];
      const listingCount = want.listingCount ? await countListings(q, id) : 0;
      const live = await loadLive(q, id, want.live);
      touchedBy.set(id, touched);
      loaded.set(id, {
        character,
        items,
        worn,
        quests,
        purse: purse as Purse,
        exact: exact as Loaded["exact"],
        listingCount,
        live,
      });
    }
    const facts = (await def.facts?.(q, request, locked)) ?? {};
    await hooks.afterLoad?.(op);

    const world: World = { initiator, parties: loaded, listings, facts };
    const step = def.apply(world, request, env);
    const results = new Map<string, ExecResult>();
    const levels = new Map<string, number>();
    if (!step.ok) {
      for (const id of parties) {
        results.set(id, { id: op.opId, op: op.name, ok: false, error: step.error });
      }
    } else {
      const answer = step.value;
      for (const id of answer.parties.keys()) {
        if (!loaded.has(id)) throw new ContractError(`answers for ${id}, never a party`);
      }
      // Items change hands whole: what one party gives, the other receives as it stood.
      const received = new Map<string, Received[]>(parties.map((id) => [id, []]));
      for (const [from, applied] of answer.parties) {
        for (const g of applied.give ?? []) {
          const row = loaded.get(from)?.items.get(g.id);
          const into = received.get(g.to);
          if (!row || !into) throw new ContractError(`gives ${g.id} to ${g.to}, never a party`);
          into.push({ row: { ...row, slot: null, listing: null, tradableAt: g.tradableAt } });
        }
      }
      const plans = new Map<string, Plan>();
      for (const id of parties) {
        const l = loaded.get(id) as Loaded;
        const applied = answer.parties.get(id) ?? {};
        plans.set(
          id,
          plan(l, applied, touchedBy.get(id) as Set<string>, made, received.get(id) ?? []),
        );
      }
      // Listings first: a listed item points at its listing.
      await writeListings(q, answer.listings ?? [], named.locked, made, new Set(parties));
      for (const [i, id] of parties.entries()) {
        const l = loaded.get(id) as Loaded;
        const applied = answer.parties.get(id) ?? {};
        const p = plans.get(id) as Plan;
        const written = await write(
          q,
          l,
          applied,
          p,
          (records[i] as { opId: string }).opId,
          op.name === "grant",
          koreanDay(ctx.now.getTime()),
        );
        // A listed item leaves the bag as far as the client knows, as it does for the snapshot.
        const listed = p.updates.filter((r) => r.listing !== null).map((r) => r.id);
        const gone = [...p.removes, ...p.gives.map((g) => g.id), ...listed];
        results.set(id, {
          id: op.opId,
          op: op.name,
          ok: true,
          outcome: (applied.outcome ?? {}) as OpOutcome,
          change: {
            rev: written.character.rev,
            ...(written.wallet ? { wallet: written.wallet } : {}),
            ...(written.materials ? { materials: written.materials } : {}),
            ...notices(l, p),
            ...(gone.length > 0 ? { removed: gone } : {}),
            ...(applied.character
              ? { progression: progressionView(written.character, ctx.now, ctx.page) }
              : {}),
            ...(written.codex.length > 0 ? { codex: written.codex } : {}),
            ...(applied.quests || written.posted.length > 0
              ? { quests: [...(applied.quests ?? []).map(questView), ...written.posted] }
              : {}),
          },
        });
        if (written.character.level !== l.character.level) levels.set(id, written.character.level);
      }
      if (answer.log) await writeLog(q, answer.log, op.opId, ctx.now);
    }
    for (const r of records) {
      await record(q, { ...op, ...r }, hash, results.get(r.characterId) as ExecResult);
    }
    await hooks.beforeCommit?.(op);
    return { results, levels, replayed: false };
  }

  /** Runs one operation under its id, inside `tx` when the caller owns the transaction. */
  async function runAll<K extends AnyOp>(
    characterId: string,
    opId: string,
    name: K,
    request: Requests[K],
    on: { tx?: Queryable } = {},
  ): Promise<Map<string, ExecResult>> {
    if (name === "grant") {
      const bad = checkGrant(request as GrantRequest);
      if (bad) throw new ContractError(`grant has a bad ${bad}`);
    }
    const op = { characterId, opId, name };
    const hash = requestHash(name, request);
    const def = DEFS[name] as PartyOpDef<Requests[K]>;
    const others = (await def.others(on.tx ?? db, request, characterId)).filter(
      (id) => id !== characterId,
    );
    if (on.tx) return (await run(on.tx, op, request, hash, others)).results;
    return inLanes([characterId, ...others], () => transact(op, request, hash, others));
  }

  /**
   * Runs one operation under its id and returns the initiator's result. Pass `tx` to run inside
   * a transaction the caller owns (character creation makes the kit this way); the caller then
   * commits.
   */
  async function execute<K extends AnyOp>(
    characterId: string,
    opId: string,
    name: K,
    request: Requests[K],
    on: { tx?: Queryable } = {},
  ): Promise<ExecResult> {
    const results = await runAll(characterId, opId, name, request, on);
    return results.get(characterId) as ExecResult;
  }

  async function transact<K extends AnyOp>(
    op: OpContext & { name: K },
    request: Requests[K],
    hash: string,
    others: readonly string[],
  ): Promise<Map<string, ExecResult>> {
    const { characterId, opId, name } = op;
    const alone = (error: OpError) =>
      new Map<string, ExecResult>([[characterId, { id: opId, op: name, ok: false, error }]]);
    for (let attempt = 0; ; attempt++) {
      try {
        const out = await db.transaction((tx) => run(tx, op, request, hash, others));
        // Listeners hear what was applied, once: never a result read back from its record.
        if (!out.replayed) {
          for (const [id, level] of out.levels) notifyLevel(id, level);
          for (const [id, result] of out.results) {
            if (!result.ok) continue;
            notifyApplied(id, name, result);
            if (id !== characterId && !DEFS[name].quiet) notifyChange(id, result.change);
          }
        }
        return out.results;
      } catch (error) {
        const { code, constraint } = pgErrorCode(error);
        // Reachable past the character lock only if a double above 2^53 rounded an
        // affordability check up: the exact balance refuses it, and nothing was written.
        if (
          code === "23514" &&
          (constraint === "wallets_nonnegative_check" || constraint === "materials_qty_check")
        ) {
          return alone("insufficient");
        }
        // Another transaction recorded this id first; its result is the answer.
        if (
          code === "23505" &&
          constraint === "operations_character_id_op_id_pk" &&
          attempt === 0
        ) {
          continue;
        }
        if (error instanceof ContractError) {
          console.error(`operation ${name} broke its contract: ${error.message}`);
        } else {
          console.error(`operation ${name} failed: ${describeError(error)}`);
        }
        throw error;
      }
    }
  }

  function notifyApplied(characterId: string, name: AnyOp, result: ExecResult): void {
    try {
      options.onApplied?.(characterId, name, result);
    } catch (error) {
      console.error(`operation listener failed: ${describeError(error)}`);
    }
  }

  function notifyLevel(characterId: string, level: number): void {
    try {
      options.onLevel?.(characterId, level);
    } catch (error) {
      console.error(`level listener failed: ${describeError(error)}`);
    }
  }

  function notifyChange(characterId: string, change: ChangeNotice): void {
    try {
      options.onChange?.(characterId, change);
    } catch (error) {
      console.error(`change listener failed: ${describeError(error)}`);
    }
  }

  return { execute, executeAll: runAll };
}

export type Executor = ReturnType<typeof createExecutor>;
