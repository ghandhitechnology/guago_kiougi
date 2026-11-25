/**
 * The one path every change to items and currency goes through (PLAN §19, §21, §22).
 *
 * One operation is one transaction:
 *  1. Lock the character row (`for no key update`) and look up the operation id in the same
 *     statement. Every operation on a character takes this lock first, so two operations on one
 *     character, or on one of its items, run one after the other. Operations spanning several
 *     characters (trading, later) lock their character rows in ascending id order, then items,
 *     quests, the wallet and materials, so lock waits can never form a cycle.
 *  2. A known id with the same request returns the recorded result and applies nothing; a known
 *     id with another request is refused.
 *  3. Load and lock exactly the rows the operation names: items (by id, and every equipped item
 *     when asked), quest rows, the wallet and the material rows of the currencies it touches.
 *  4. Roll the server's randomness and run the pure rule.
 *  5. Check the answer against what was loaded: the purse may only move where ledger entries
 *     say it moved, amounts are whole, items written were loaded or made here, nothing outside
 *     the loaded rows is touched. A broken answer throws and the transaction rolls back.
 *  6. Write rows as deltas in exact `numeric` arithmetic, book the ledger (items included, +1
 *     when made and -1 when used up), record the operation id with its one result, commit.
 *
 * The database backs every step: currency and counts cannot go negative, an item cannot sit in
 * two slots or share one, and the operation id is a primary key.
 */
import { createHash, getRandomValues, randomUUID } from "node:crypto";
import type { LedgerEntry, OpError, OpOutcome, OpResult, Purse } from "@guago/shared";
import { sql } from "drizzle-orm";
import { CURRENT_COHORT } from "../auth/service.ts";
import { type Db, describeError, pgErrorCode } from "../db/index.ts";
import {
  type AnyOp,
  type Applied,
  type Ctx,
  checkGrant,
  type Env,
  type GrantRequest,
  type Loaded,
  OPS,
  type Requests,
} from "./ops.ts";
import {
  CHARACTER_COLUMNS,
  type CharacterRow,
  characterFromDb,
  ITEM_COLUMNS,
  type ItemRow,
  itemFromDb,
  itemView,
  progressionView,
  type QuestRow,
  questFromDb,
  questView,
} from "./rows.ts";

/** Operation ids are kept this long (`Economy.prune`); a retry comes within seconds. */
export const OPERATION_DAYS = 30;

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
  characterId: string;
  opId: string;
  name: AnyOp;
}

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

interface Plan {
  /** Exact deltas per touched currency, from the ledger. */
  deltas: Map<string, bigint>;
  ledger: { currency: string; key: string; amount: string; item: string | null }[];
  inserts: ItemRow[];
  updates: ItemRow[];
  removes: string[];
}

/**
 * Step 5: everything the rule answered must be writable as it stands. Returns the writes.
 */
function plan(loaded: Loaded, applied: Applied, touched: ReadonlySet<string>, made: Set<string>) {
  const deltas = new Map<string, bigint>();
  const sums = new Map<string, number>();
  const ledger: Plan["ledger"] = [];
  const booked = new Map<string, { currency: string; key: string; amount: bigint }>();
  for (const e of (applied.ledger ?? []) as readonly LedgerEntry[]) {
    if (!touched.has(e.currency)) throw new ContractError(`books ${e.currency}, never loaded`);
    if (!Number.isFinite(e.amount) || e.amount === 0) throw new ContractError("empty amount");
    const amount = BigInt(decimal(e.amount));
    deltas.set(e.currency, (deltas.get(e.currency) ?? 0n) + amount);
    sums.set(e.currency, (sums.get(e.currency) ?? 0) + e.amount);
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
  }
  const keyOf = (id: string) =>
    typeof applied.itemKey === "function" ? applied.itemKey(id) : (applied.itemKey ?? "unknown");
  for (const row of inserts) {
    ledger.push({ currency: `item:${row.def}`, key: keyOf(row.id), amount: "1", item: row.id });
  }
  for (const id of removes) {
    const def = (loaded.items.get(id) as ItemRow).def;
    ledger.push({ currency: `item:${def}`, key: keyOf(id), amount: "-1", item: id });
  }
  return { deltas, ledger, inserts, updates, removes } satisfies Plan;
}

// Loading -------------------------------------------------------------------------------------

async function lockCharacter(q: Queryable, characterId: string, opId: string) {
  const { rows } = await q.execute(sql`
    select ${sql.raw(CHARACTER_COLUMNS)}, o.request_hash, o.result
    from characters c
    left join operations o on o.character_id = c.id and o.op_id = ${opId}
    where c.id = ${characterId}
    for no key update of c`);
  return rows[0];
}

async function loadItems(
  q: Queryable,
  owner: string,
  ids: readonly string[],
  worn: boolean,
): Promise<Map<string, ItemRow>> {
  if (ids.length === 0 && !worn) return new Map();
  const { rows } = await q.execute(sql`
    select ${sql.raw(ITEM_COLUMNS)} from items
    where owner_id = ${owner}
      and (id = any(${sql.param([...ids])}::uuid[]) or (${worn} and slot is not null))
    order by id
    for update`);
  return new Map(rows.map((r) => [r.id as string, itemFromDb(r)]));
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
    }
  }
  const stacks = currencies.filter((c) => !isWallet(c));
  if (stacks.length > 0) {
    for (const c of stacks) purse[c] = 0;
    const { rows } = await q.execute(sql`
      select def_id, qty from materials
      where character_id = ${characterId} and def_id = any(${sql.param(stacks)}::text[])
      order by def_id
      for update`);
    for (const r of rows) purse[r.def_id as string] = Number(r.qty);
  }
  return purse;
}

// Writing -------------------------------------------------------------------------------------

interface Written {
  character: CharacterRow;
  wallet?: Record<string, string>;
  materials?: Record<string, number>;
  codex: string[];
}

async function write(
  q: Queryable,
  loaded: Loaded,
  applied: Applied,
  p: Plan,
  opId: string,
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
        pilgi_fail_streak = u.fails, evolved = u.evolved, slot = u.slot, updated_at = now()
      from unnest(
        ${sql.param(u.map((r) => r.id))}::uuid[],
        ${sql.param(u.map((r) => r.grade))}::smallint[],
        ${sql.param(u.map((r) => r.level))}::integer[],
        ${sql.param(u.map((r) => r.exp))}::float8[],
        ${sql.param(u.map((r) => r.pilgi))}::integer[],
        ${sql.param(u.map((r) => r.pilgiFails))}::integer[],
        ${sql.param(u.map((r) => r.evolved))}::boolean[],
        ${sql.param(u.map((r) => r.slot))}::smallint[]
      ) as u(id, grade, level, exp, pilgi, fails, evolved, slot)
      where i.id = u.id and i.owner_id = ${c}`);
    if (done.rowCount !== u.length) throw new ContractError("updated items went missing");
  }
  if (p.inserts.length > 0) {
    const n = p.inserts;
    await q.execute(sql`
      insert into items (id, owner_id, def_id, kind, grade, level, exp, pilgi, pilgi_fail_streak, evolved, slot)
      select u.id, ${c}, u.def, u.kind, u.grade, u.level, u.exp, u.pilgi, u.fails, u.evolved, u.slot
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
        ${sql.param(n.map((r) => r.slot))}::smallint[]
      ) as u(id, def, kind, grade, level, exp, pilgi, fails, evolved, slot)`);
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

  if (p.ledger.length > 0) {
    const l = p.ledger;
    await q.execute(sql`
      insert into economy_ledger (character_id, operation_id, currency, source_or_sink, amount, item_id)
      select ${c}, ${opId}, u.currency, u.key, u.amount, u.item
      from unnest(
        ${sql.param(l.map((e) => e.currency))}::text[],
        ${sql.param(l.map((e) => e.key))}::text[],
        ${sql.param(l.map((e) => e.amount))}::numeric[],
        ${sql.param(l.map((e) => e.item))}::uuid[]
      ) as u(currency, key, amount, item)`);
  }
  return out as Written;
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

export function createExecutor(db: Db, options: ExecutorOptions = {}) {
  const roll = options.random ?? cryptoRoll;
  const now = options.now ?? (() => new Date());
  const page = options.page ?? (() => CURRENT_COHORT);
  const hooks = options.hooks ?? {};

  /** Steps 1 to 6 on an open transaction. Returns the result and, if applied, the new level. */
  async function run<K extends AnyOp>(
    q: Queryable,
    op: OpContext & { name: K },
    request: Requests[K],
    hash: string,
  ): Promise<{ result: ExecResult; level?: number }> {
    const def = OPS[op.name];
    const refuse = (error: OpError): { result: ExecResult } => ({
      result: { id: op.opId, op: op.name, ok: false, error },
    });

    const found = await lockCharacter(q, op.characterId, op.opId);
    if (!found) return refuse("no_character");
    if (found.request_hash !== null) {
      if (found.request_hash !== hash) return refuse("op_id_reused");
      return { result: found.result as ExecResult };
    }
    const character = characterFromDb(found);
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

    const want = def.rows(request, character);
    const items = await loadItems(q, character.id, want.items ?? [], want.worn ?? false);
    const quests = await loadQuests(q, character.id, want.quests ?? []);
    const touched = new Set(def.currencies(request, { character, items, quests }, ctx));
    const purse = await loadPurse(q, character.id, [...touched].sort());
    const worn = want.worn ? [...items.values()].filter((r) => r.slot !== null) : [];
    const loaded: Loaded = { character, items, worn, quests, purse: purse as Purse };
    await hooks.afterLoad?.(op);

    const step = def.apply(loaded, request, env);
    let result: ExecResult;
    let level: number | undefined;
    if (!step.ok) {
      result = refuse(step.error).result;
    } else {
      const applied = step.value;
      const p = plan(loaded, applied, touched, made);
      const written = await write(q, loaded, applied, p, op.opId);
      result = {
        id: op.opId,
        op: op.name,
        ok: true,
        outcome: (applied.outcome ?? {}) as OpOutcome,
        change: {
          rev: written.character.rev,
          ...(written.wallet ? { wallet: written.wallet } : {}),
          ...(written.materials ? { materials: written.materials } : {}),
          ...(p.inserts.length + p.updates.length > 0
            ? { items: [...p.updates, ...p.inserts].map(itemView) }
            : {}),
          ...(p.removes.length > 0 ? { removed: p.removes } : {}),
          ...(applied.character
            ? { progression: progressionView(written.character, ctx.now, ctx.page) }
            : {}),
          ...(written.codex.length > 0 ? { codex: written.codex } : {}),
          ...(applied.quests ? { quests: applied.quests.map(questView) } : {}),
        },
      };
      if (written.character.level !== character.level) level = written.character.level;
    }
    await record(q, op, hash, result);
    await hooks.beforeCommit?.(op);
    return level === undefined ? { result } : { result, level };
  }

  /**
   * Runs one operation under its id. Pass `tx` to run inside a transaction the caller owns
   * (character creation makes the kit this way); the caller then commits.
   */
  async function execute<K extends AnyOp>(
    characterId: string,
    opId: string,
    name: K,
    request: Requests[K],
    on: { tx?: Queryable } = {},
  ): Promise<ExecResult> {
    if (name === "grant") {
      const bad = checkGrant(request as GrantRequest);
      if (bad) throw new ContractError(`grant has a bad ${bad}`);
    }
    const op = { characterId, opId, name };
    const hash = requestHash(name, request);
    if (on.tx) return (await run(on.tx, op, request, hash)).result;
    for (let attempt = 0; ; attempt++) {
      try {
        const out = await db.transaction((tx) => run(tx, op, request, hash));
        if (out.level !== undefined) notifyLevel(characterId, out.level);
        return out.result;
      } catch (error) {
        const { code, constraint } = pgErrorCode(error);
        // Reachable past the character lock only if a double above 2^53 rounded an
        // affordability check up: the exact balance refuses it, and nothing was written.
        if (code === "23514" && /^(wallets|materials)_/.test(constraint ?? "")) {
          return { id: opId, op: name, ok: false, error: "insufficient" };
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

  function notifyLevel(characterId: string, level: number): void {
    try {
      options.onLevel?.(characterId, level);
    } catch (error) {
      console.error(`level listener failed: ${describeError(error)}`);
    }
  }

  return { execute };
}

export type Executor = ReturnType<typeof createExecutor>;
