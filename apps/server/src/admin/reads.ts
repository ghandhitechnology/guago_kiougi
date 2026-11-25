/**
 * What the admin page reads. Nothing here writes, except that reading a player's chat or
 * inventory is itself recorded in the audit log (PLAN §12 privacy), by the routes.
 */
import { sql } from "drizzle-orm";
import type { Db } from "../db/index.ts";
import { dailyTotals } from "../economy/audit.ts";
import { livePage } from "../economy/executor.ts";
import { readInventory } from "../economy/reads.ts";
import { adminMutes } from "../moderation/mutes.ts";

const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);

export interface PlayerRow {
  accountId: string;
  loginId: string;
  status: string;
  characterId: string | null;
  name: string | null;
  level: number | null;
  major: string | null;
  createdAt: string | null;
  lastLoginAt: string | null;
}

const PLAYER_COLUMNS = sql`
  a.id as account_id, a.login_id, a.status, a.created_at, a.last_login_at,
  c.id as character_id, c.name, c.level, c.major`;

function playerRow(r: Record<string, unknown>): PlayerRow {
  return {
    accountId: r.account_id as string,
    loginId: r.login_id as string,
    status: r.status as string,
    characterId: (r.character_id as string | null) ?? null,
    name: (r.name as string | null) ?? null,
    level: (r.level as number | null) ?? null,
    major: (r.major as string | null) ?? null,
    createdAt: iso(r.created_at),
    lastLoginAt: iso(r.last_login_at),
  };
}

export interface ChatRow {
  id: number;
  at: string;
  channel: string;
  senderId: string | null;
  sender: string | null;
  target: string | null;
  /** The whisper or system line's receiving character, by name. */
  targetName: string | null;
  body: string;
  masked: boolean;
  struck: boolean;
}

export interface ChatQuery {
  /** A character: lines it sent, and whispers and system lines sent to it. */
  character?: string;
  channel?: string;
  from?: Date;
  to?: Date;
  /** Paging: lines older than this time. */
  before?: Date;
  limit?: number;
}

/** What the trading lane provides once its trade log lands on `main` (PLAN §13). */
export interface TradeLogSource {
  search(q: { character?: string; from?: Date; to?: Date; limit: number }): Promise<TradeRow[]>;
}

export interface TradeRow {
  id: number;
  at: string;
  kind: "board" | "direct";
  from: string;
  to: string;
  /** What moved, as the trade log records it. */
  payload: unknown;
  tax: string;
}

export function createReads(db: Db, trades: TradeLogSource | null = null) {
  async function chat(q: ChatQuery): Promise<ChatRow[]> {
    const limit = Math.min(Math.max(q.limit ?? 200, 1), 1000);
    const who = q.character ?? null;
    // Partition pruning needs a bound on `at`: no range reads the 90 days kept.
    const { rows } = await db.execute(sql`
      select l.id, l.at, l.channel, l.sender_id, s.name as sender, l.target, t.name as target_name,
        l.body, l.masked, (f.id is not null) as struck
      from chat_log l
      left join characters s on s.id = l.sender_id
      left join characters t on l.channel in ('whisper', 'system') and t.id::text = l.target
      left join filter_strikes f on f.line_id = l.id and f.line_at = l.at
      where (${who}::uuid is null or l.sender_id = ${who}::uuid
             or (l.channel in ('whisper', 'system') and l.target = ${who}::text))
        and (${q.channel ?? null}::text is null or l.channel = ${q.channel ?? null})
        and l.at >= coalesce(${q.from?.toISOString() ?? null}::timestamptz, now() - interval '90 days')
        and l.at <= coalesce(${q.to?.toISOString() ?? null}::timestamptz, now())
        and (${q.before?.toISOString() ?? null}::timestamptz is null
             or l.at < ${q.before?.toISOString() ?? null}::timestamptz)
      order by l.at desc, l.id desc
      limit ${limit}`);
    return rows.map((r) => ({
      id: Number(r.id),
      at: iso(r.at) as string,
      channel: r.channel as string,
      senderId: (r.sender_id as string | null) ?? null,
      sender: (r.sender as string | null) ?? null,
      target: (r.target as string | null) ?? null,
      targetName: (r.target_name as string | null) ?? null,
      body: r.body as string,
      masked: Boolean(r.masked),
      struck: Boolean(r.struck),
    }));
  }

  return {
    chat,

    async search(raw: string): Promise<PlayerRow[]> {
      const q = raw.trim();
      if (q.length === 0) {
        const { rows } = await db.execute(sql`
          select ${PLAYER_COLUMNS} from accounts a left join characters c on c.account_id = a.id
          order by a.last_login_at desc nulls last limit 50`);
        return rows.map(playerRow);
      }
      const uuid = /^[0-9a-f-]{36}$/i.test(q) ? q.toLowerCase() : null;
      const like = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
      const { rows } = await db.execute(sql`
        select ${PLAYER_COLUMNS} from accounts a left join characters c on c.account_id = a.id
        where (${uuid}::uuid is not null and (a.id = ${uuid}::uuid or c.id = ${uuid}::uuid))
           or c.name ilike ${like} or a.login_id ilike ${like}
        order by (lower(c.name) = lower(${q}) or a.login_id = lower(${q})) desc,
          a.last_login_at desc nulls last
        limit 50`);
      return rows.map(playerRow);
    },

    /** The player page: account, character, sanctions with history, reports both ways. */
    async player(accountId: string) {
      const { rows } = await db.execute(sql`
        select ${PLAYER_COLUMNS}, a.age_confirmed, c.demerits, c.merits, c.map_id, c.tier,
          (select count(*)::int from account_ips i where i.account_id = a.id) as ips
        from accounts a left join characters c on c.account_id = a.id
        where a.id = ${accountId}`);
      const r = rows[0];
      if (!r) return null;
      const player = playerRow(r);
      const characterId = player.characterId;
      const bans = await db.execute(sql`
        select b.id, b.reason, b.starts_at, b.ends_at, cardinality(b.ip_hashes) as ips,
          m.login_id as admin, b.lifted_at, l.login_id as lifted_by, b.lift_reason
        from account_bans b join admin_accounts m on m.id = b.admin_id
        left join admin_accounts l on l.id = b.lifted_by
        where b.account_id = ${accountId} order by b.starts_at desc`);
      const sanctions = (rows2: Record<string, unknown>[]) =>
        rows2.map((b) => ({
          id: Number(b.id),
          reason: b.reason as string,
          startsAt: iso(b.starts_at) as string,
          endsAt: iso(b.ends_at),
          admin: b.admin as string,
          liftedAt: iso(b.lifted_at),
          liftedBy: (b.lifted_by as string | null) ?? null,
          liftReason: (b.lift_reason as string | null) ?? null,
          ...(b.ips === undefined ? {} : { ips: Number(b.ips) }),
        }));
      let mutes: Record<string, unknown>[] = [];
      let strikes: Record<string, unknown>[] = [];
      let reports: Record<string, unknown>[] = [];
      if (characterId) {
        mutes = (
          await db.execute(sql`
            select u.id, u.reason, u.starts_at, u.ends_at, m.login_id as admin, u.lifted_at,
              l.login_id as lifted_by, u.lift_reason
            from mutes u join admin_accounts m on m.id = u.admin_id
            left join admin_accounts l on l.id = u.lifted_by
            where u.character_id = ${characterId} order by u.starts_at desc`)
        ).rows;
        strikes = (
          await db.execute(sql`
            select f.id, f.at, f.line_id, f.line_at, f.body, f.demerits, m.login_id as admin
            from filter_strikes f join admin_accounts m on m.id = f.admin_id
            where f.character_id = ${characterId} order by f.at desc`)
        ).rows;
        reports = (
          await db.execute(sql`
            select r.id, r.created_at, r.category, r.state, r.note,
              case when r.target_id = ${characterId}::uuid then 'against' else 'by' end as side,
              rc.name as reporter, tc.name as target
            from reports r
            left join characters rc on rc.id = r.reporter_id
            left join characters tc on tc.id = r.target_id
            where r.target_id = ${characterId} or r.reporter_id = ${characterId}
            order by r.created_at desc limit 100`)
        ).rows;
      }
      const now = Date.now();
      const muteEnd = characterId ? adminMutes.until(characterId, now) : 0;
      return {
        ...player,
        ageConfirmed: Boolean(r.age_confirmed),
        demerits: (r.demerits as number | null) ?? null,
        merits: (r.merits as number | null) ?? null,
        mapId: (r.map_id as string | null) ?? null,
        tier: (r.tier as number | null) ?? null,
        ips: Number(r.ips),
        mutedUntil: muteEnd === 0 ? null : Number.isFinite(muteEnd) ? muteEnd : "lifted",
        bans: sanctions(bans.rows),
        mutes: sanctions(mutes),
        strikes: strikes.map((s) => ({
          id: Number(s.id),
          at: iso(s.at) as string,
          lineId: Number(s.line_id),
          lineAt: iso(s.line_at) as string,
          body: s.body as string,
          demerits: Number(s.demerits),
          admin: s.admin as string,
        })),
        reports: reports.map((x) => ({
          id: Number(x.id),
          at: iso(x.created_at) as string,
          category: x.category as string,
          state: x.state as string,
          note: (x.note as string | null) ?? null,
          side: x.side as "by" | "against",
          reporter: (x.reporter as string | null) ?? null,
          target: (x.target as string | null) ?? null,
        })),
      };
    },

    /** Wallets, stacks and items as the player's own login read sees them, and recent ledger rows. */
    async inventory(characterId: string) {
      const snapshot = await readInventory(db, characterId, new Date(), livePage());
      if (!snapshot) return null;
      const { rows } = await db.execute(sql`
        select id, at, operation_id, currency, source_or_sink, amount::text as amount, item_id
        from economy_ledger where character_id = ${characterId}
        order by id desc limit 100`);
      return {
        wallet: snapshot.wallet,
        materials: snapshot.materials,
        items: snapshot.items,
        ledger: rows.map((r) => ({
          id: Number(r.id),
          at: iso(r.at) as string,
          operation: r.operation_id as string,
          currency: r.currency as string,
          sourceOrSink: r.source_or_sink as string,
          amount: r.amount as string,
          itemId: (r.item_id as string | null) ?? null,
        })),
      };
    },

    async reports(state: string) {
      const { rows } = await db.execute(sql`
        select r.id, r.created_at, r.category, r.state, r.note, r.target_id,
          rc.name as reporter, tc.name as target, tc.account_id as target_account,
          jsonb_array_length(r.context->'lines') as lines,
          (select count(*)::int from reports o where o.target_id = r.target_id and o.state = 'open')
            as open_on_target
        from reports r
        left join characters rc on rc.id = r.reporter_id
        left join characters tc on tc.id = r.target_id
        where r.state = ${state}
        order by r.created_at ${state === "open" ? sql`asc` : sql`desc`}
        limit 200`);
      return rows.map((r) => ({
        id: Number(r.id),
        at: iso(r.created_at) as string,
        category: r.category as string,
        state: r.state as string,
        note: (r.note as string | null) ?? null,
        targetId: r.target_id as string,
        targetAccount: (r.target_account as string | null) ?? null,
        reporter: (r.reporter as string | null) ?? null,
        target: (r.target as string | null) ?? null,
        lines: Number(r.lines ?? 0),
        openOnTarget: Number(r.open_on_target),
      }));
    },

    /**
     * One report: its attached lines, and the chat around it (15 minutes before the report to
     * 5 after) on the channels the reported player spoke in.
     */
    async report(id: number) {
      const { rows } = await db.execute(sql`
        select r.*, rc.name as reporter, tc.name as target, tc.account_id as target_account,
          x.action, x.note as resolution_note, x.at as resolved_at, m.login_id as handled_by_name
        from reports r
        left join characters rc on rc.id = r.reporter_id
        left join characters tc on tc.id = r.target_id
        left join report_resolutions x on x.report_id = r.id
        left join admin_accounts m on m.id = x.admin_id
        where r.id = ${id}`);
      const r = rows[0];
      if (!r) return null;
      const createdAt = new Date(r.created_at as string);
      const around = await db.execute(sql`
        with spoke as (
          select distinct channel, target from chat_log
          where sender_id = ${r.target_id as string}
            and at between ${createdAt.toISOString()}::timestamptz - interval '15 minutes'
                       and ${createdAt.toISOString()}::timestamptz + interval '5 minutes'
            and channel in ('world', 'near', 'party', 'club')
        )
        select l.id, l.at, l.channel, l.sender_id, s.name as sender, l.target,
          t.name as target_name, l.body, l.masked, (f.id is not null) as struck
        from chat_log l
        left join characters s on s.id = l.sender_id
        left join characters t on l.channel in ('whisper', 'system') and t.id::text = l.target
        left join filter_strikes f on f.line_id = l.id and f.line_at = l.at
        where l.at between ${createdAt.toISOString()}::timestamptz - interval '15 minutes'
                       and ${createdAt.toISOString()}::timestamptz + interval '5 minutes'
          and (l.sender_id = ${r.target_id as string}::uuid
               or (l.channel = 'whisper' and l.target = ${r.target_id as string}::text)
               or exists (select 1 from spoke s2 where s2.channel = l.channel
                          and s2.target is not distinct from l.target))
        order by l.at, l.id
        limit 400`);
      return {
        id: Number(r.id),
        at: createdAt.toISOString(),
        category: r.category as string,
        state: r.state as string,
        note: (r.note as string | null) ?? null,
        reporterId: r.reporter_id as string,
        reporter: (r.reporter as string | null) ?? null,
        targetId: r.target_id as string,
        targetAccount: (r.target_account as string | null) ?? null,
        target: (r.target as string | null) ?? null,
        context: r.context as {
          lines: { ch: string; target: string | null; body: string; masked: boolean; at: string }[];
        },
        resolution: r.action
          ? {
              action: r.action as string,
              note: (r.resolution_note as string | null) ?? null,
              at: iso(r.resolved_at) as string,
              by: (r.handled_by_name as string | null) ?? null,
            }
          : null,
        around: around.rows.map((l) => ({
          id: Number(l.id),
          at: iso(l.at) as string,
          channel: l.channel as string,
          senderId: (l.sender_id as string | null) ?? null,
          sender: (l.sender as string | null) ?? null,
          target: (l.target as string | null) ?? null,
          targetName: (l.target_name as string | null) ?? null,
          body: l.body as string,
          masked: Boolean(l.masked),
          struck: Boolean(l.struck),
        })),
      };
    },

    /**
     * Daily faucets and sinks of each currency by Korean calendar day (PLAN §13), from the
     * `economy_daily` view. The trading lane's daily roll-up replaces this read when it lands.
     */
    async economy(days: number) {
      const today = new Date(Date.now() + 9 * 3600_000);
      const to = today.toISOString().slice(0, 10);
      const from = new Date(today.getTime() - (days - 1) * 86_400_000).toISOString().slice(0, 10);
      return { from, to, rows: await dailyTotals(db, { from, to }) };
    },

    async trades(q: { character?: string; from?: Date; to?: Date }) {
      if (!trades) return { available: false as const, rows: [] as TradeRow[] };
      return { available: true as const, rows: await trades.search({ ...q, limit: 200 }) };
    },
  };
}

export type Reads = ReturnType<typeof createReads>;
