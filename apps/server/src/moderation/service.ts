/**
 * Moderation (PLAN §12 "Moderation"): ban, mute, kick, filter strikes, grants, notices and the
 * report queue. Every action that changes the database writes its audit row in the same
 * transaction, so an action and its record commit together or not at all; what happens outside
 * the database (closing sockets, a system line, the mute cache) runs only after the commit.
 *
 * A ban holds on every way in: `accounts.status` is `banned` (login and every session check read
 * it), the account's sessions are deleted (a still-valid cookie, a second tab and the 30-second
 * reconnection all need one), and its live seats are closed with `CLOSE_BANNED`, which also
 * refuses their reconnection.
 */
import { BOOKS, TOOLS, VENDING } from "@guago/content";
import {
  type Amounts,
  type ChangeNotice,
  CLOSE_BANNED,
  CLOSE_KICKED,
  type Currency,
  DEMERITS,
  type SystemLine,
} from "@guago/shared";
import { sql } from "drizzle-orm";
import type { AuthGate } from "../auth/service.ts";
import type { Db } from "../db/index.ts";
import type { Executor, Queryable } from "../economy/executor.ts";
import { MAX_STACK } from "../economy/ops.ts";
import { live } from "../live/current.ts";
import type { ClubChange } from "../social/clubs.ts";
import type { Tx } from "../social/tx.ts";
import { record, target } from "./audit.ts";
import { mutes } from "./mutes.ts";

export type ModError =
  | "not_found"
  | "not_banned"
  | "not_muted"
  | "already_struck"
  | "already_handled"
  | "bad_request"
  | "offline"
  | "insufficient"
  | "item_missing"
  | "op_id_reused";

export type ModResult<T extends object = object> =
  | ({ ok: true } & T)
  | { ok: false; error: ModError };

const fail = (error: ModError): { ok: false; error: ModError } => ({ ok: false, error });

/** Longest timed ban or mute: ten years, in minutes. Longer is "until lifted". */
export const MAX_MINUTES = 10 * 365 * 24 * 60;
export const MAX_REASON = 500;
export const MAX_NOTICE = 200;

export interface ModerationDeps {
  db: Db;
  executor: Executor;
  /** Closes every live seat of the account with this close code (seats.ts `evictAccount`). */
  evict(accountId: string, code: number): void;
  /** A system line to everyone, or to one character when online. False when the world is down. */
  system(line: Omit<SystemLine, "id" | "at">, toCharacterId?: string): boolean;
  /** An item or currency change the player did not ask for, sent if they are online. */
  notify(characterId: string, change: ChangeNotice): void;
  /**
   * Clubs (social `vacate` and `announce`): a permanent ban hands a 짱's club on or disbands it,
   * inside the ban's transaction. Without it (tests) clubs are left alone.
   */
  clubs?: {
    vacate(characterId: string, on: { tx: Tx }): Promise<ClubChange | null>;
    announce(change: ClubChange): void;
  };
}

/** After a commit: what happens outside the database. */
type After = () => void | Promise<void>;

export interface BanOptions {
  /** Recorded and shown to the player (`moderation.banned`), unless `told` says otherwise. */
  reason: string;
  /** What the player is told instead of `reason` (a report's action keeps its note internal). */
  told?: string;
  /** Null: until lifted. */
  minutes: number | null;
  /**
   * The addresses the account used in the last `IP_BAN_DAYS`: `none` leaves them alone,
   * `signup` refuses new accounts from them, `all` also refuses logins and room joins of every
   * account on them. A dormitory shares one address, so `signup` is the careful choice.
   */
  ip: IpScope;
}

export const IP_SCOPES = ["none", "signup", "all"] as const;
export type IpScope = (typeof IP_SCOPES)[number];
/** How far back an IP ban reaches into an account's addresses. */
export const IP_BAN_DAYS = 30;

export interface MuteOptions {
  reason: string;
  told?: string;
  minutes: number | null;
}

export interface AdjustInput {
  reason: string;
  amounts: Amounts;
  add: string[];
  remove: string[];
}

export type ReportAction = "none" | "mute" | "kick" | "ban";

export interface ResolveInput {
  state: "resolved" | "dismissed";
  action: ReportAction;
  /** For mute and ban; null is until lifted. */
  minutes: number | null;
  /** For ban. */
  ip: IpScope;
  /** Internal; never sent to anyone. */
  note: string;
  /** What the reported player is told, for any action but `none`. */
  told: string;
}

// Checks ---------------------------------------------------------------------------------------

export function cleanReason(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim().normalize("NFC");
  return t.length >= 1 && t.length <= MAX_REASON ? t : null;
}

export function checkMinutes(raw: unknown): number | null | undefined {
  if (raw === null) return null;
  return Number.isInteger(raw) && (raw as number) >= 1 && (raw as number) <= MAX_MINUTES
    ? (raw as number)
    : undefined;
}

const WALLET_CURRENCIES = new Set(["pinecone", "merit", "token"]);
const BOOK_IDS = new Set(BOOKS.map((b) => b.id));
const TOOL_IDS = new Set(TOOLS.map((t) => t.id));
const SNACK_IDS = new Set([...VENDING.fixed, ...VENDING.weekly].map((s) => s.id));
/** Most of a wallet currency one adjustment moves: far past any real balance, inside `numeric`. */
const MAX_WALLET_MOVE = 1e30;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const OP_ID = /^[A-Za-z0-9-]{8,64}$/;

export function isUuid(s: unknown): s is string {
  return typeof s === "string" && UUID.test(s);
}

function knownCurrency(c: string): boolean {
  if (WALLET_CURRENCIES.has(c) || c === "ink" || c === "binding") return true;
  if (c.startsWith("sheet:")) return BOOK_IDS.has(c.slice(6));
  if (c.startsWith("snack:")) return SNACK_IDS.has(c.slice(6));
  return false;
}

/** The adjustment as the executor takes it, or null when any part is malformed. */
export function checkAdjust(raw: unknown): AdjustInput | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const reason = cleanReason(r.reason);
  if (!reason) return null;
  const amounts: Partial<Record<Currency, number>> = {};
  const given = r.amounts ?? {};
  if (typeof given !== "object" || given === null || Array.isArray(given)) return null;
  for (const [c, n] of Object.entries(given)) {
    if (!knownCurrency(c) || !Number.isInteger(n) || n === 0) return null;
    const max = WALLET_CURRENCIES.has(c) ? MAX_WALLET_MOVE : MAX_STACK;
    if (Math.abs(n as number) > max) return null;
    amounts[c as Currency] = n as number;
  }
  const add = r.add ?? [];
  const remove = r.remove ?? [];
  if (!Array.isArray(add) || add.length > 20) return null;
  if (!add.every((d) => typeof d === "string" && (BOOK_IDS.has(d) || TOOL_IDS.has(d)))) {
    return null;
  }
  if (!Array.isArray(remove) || remove.length > 50 || !remove.every(isUuid)) return null;
  if (new Set(remove).size !== remove.length) return null;
  if (Object.keys(amounts).length + add.length + remove.length === 0) return null;
  return { reason, amounts, add: add as string[], remove: remove as string[] };
}

/** Plain notice text: one line, no control characters. */
export function cleanNotice(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw
    .normalize("NFC")
    .replace(/[\p{Cc}\p{Cf}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return t.length >= 1 && t.length <= MAX_NOTICE ? t : null;
}

// The service ----------------------------------------------------------------------------------

/**
 * Bans and mutes are about real people, so they run on the wall clock: Postgres `now()` here and
 * in every check, never the Page clock the executor reads (live/clock.ts), which a test server
 * may run faster than real time.
 */
const endsAt = (minutes: number | null) =>
  minutes === null ? sql`null` : sql`now() + make_interval(mins => ${minutes})`;

export function createModeration(deps: ModerationDeps) {
  const { db, executor } = deps;

  async function run(work: (tx: Tx) => Promise<ModResult<{ after?: After }>>) {
    const out = await db.transaction(async (tx) => work(tx));
    if (out.ok && out.after) await out.after();
    if (!out.ok) return out;
    const { after: _after, ...rest } = out;
    return rest as { ok: true };
  }

  async function lockAccount(tx: Queryable, accountId: string) {
    const { rows } = await tx.execute(
      sql`select id, status, signup_ip_hash from accounts where id = ${accountId} for update`,
    );
    return rows[0] as { id: string; status: string; signup_ip_hash: string } | undefined;
  }

  const characterOfAccount = async (tx: Queryable, accountId: string) =>
    (await tx.execute(sql`select id from characters where account_id = ${accountId}`)).rows[0]
      ?.id as string | undefined;

  /** The IP hashes the account signed up or logged in from in the last `IP_BAN_DAYS`. */
  async function recentAddresses(q: Queryable, accountId: string): Promise<string[]> {
    const { rows } = await q.execute(sql`
      select ip_hash from account_ips
      where account_id = ${accountId}
        and last_seen > now() - make_interval(days => ${IP_BAN_DAYS})
      union
      select signup_ip_hash from accounts
      where id = ${accountId} and created_at > now() - make_interval(days => ${IP_BAN_DAYS})`);
    return rows.map((r) => r.ip_hash as string);
  }

  async function banIn(tx: Tx, adminId: string, accountId: string, o: BanOptions) {
    const account = await lockAccount(tx, accountId);
    if (!account) return fail("not_found");
    const ips = o.ip === "none" ? [] : await recentAddresses(tx, accountId);
    const { rows } = await tx.execute(sql`
      insert into account_bans (account_id, reason, told, ends_at, ip_hashes, ip_scope, admin_id)
      values (${accountId}, ${o.reason}, ${o.told ?? o.reason}, ${endsAt(o.minutes)},
              ${sql.param(ips)}::text[], ${ips.length > 0 ? o.ip : "none"}, ${adminId})
      returning id, ends_at`);
    const ban = rows[0] as { id: string; ends_at: string | null };
    await tx.execute(sql`update accounts set status = 'banned' where id = ${accountId}`);
    await tx.execute(sql`delete from sessions where account_id = ${accountId}`);
    const characterId = await characterOfAccount(tx, accountId);
    // A permanent ban leaves no 짱 behind: the club passes on or disbands with the ban. A timed
    // ban leaves the club as it is.
    const club =
      o.minutes === null && characterId && deps.clubs
        ? await deps.clubs.vacate(characterId, { tx })
        : null;
    await record(tx, {
      adminId,
      action: "ban",
      target: target.account(accountId),
      reason: o.reason,
      detail: {
        ban: Number(ban.id),
        minutes: o.minutes,
        ips: ips.length,
        ipScope: ips.length > 0 ? o.ip : "none",
        told: o.told ?? o.reason,
        ...(club ? { club: club.club, disbanded: club.gone === true } : {}),
      },
    });
    const told = o.told ?? o.reason;
    return {
      ok: true as const,
      after: () => {
        // The line goes out on the world socket before it closes, so the client can say why.
        if (characterId) {
          deps.system(
            ban.ends_at === null
              ? { key: "moderation.banned-permanent", params: { reason: told } }
              : {
                  key: "moderation.banned",
                  params: { until: new Date(ban.ends_at).getTime(), reason: told },
                },
            characterId,
          );
        }
        deps.evict(accountId, CLOSE_BANNED);
        if (club) deps.clubs?.announce(club);
      },
    };
  }

  async function muteIn(tx: Queryable, adminId: string, characterId: string, o: MuteOptions) {
    const { rows } = await tx.execute(sql`
      insert into mutes (character_id, reason, told, ends_at, admin_id)
      select id, ${o.reason}, ${o.told ?? o.reason}, ${endsAt(o.minutes)}, ${adminId} from characters
      where id = ${characterId}
      returning id, floor(extract(epoch from coalesce(ends_at, 'infinity'::timestamptz))::float8 * 1000) as end_ms`);
    const mute = rows[0] as { id: string; end_ms: number } | undefined;
    if (!mute) return fail("not_found");
    await record(tx, {
      adminId,
      action: "mute",
      target: target.character(characterId),
      reason: o.reason,
      detail: { mute: Number(mute.id), minutes: o.minutes, told: o.told ?? o.reason },
    });
    return {
      ok: true as const,
      after: async () => {
        // Holds at once; the re-read confirms it (or a later one wins).
        mutes.muted(characterId, Number(mute.end_ms));
        void mutes.refresh(db, characterId).catch(() => {});
        // The player learns the action, its end and the reason they are told; never who asked.
        const until = mutes.adminUntil(characterId);
        const reason = o.told ?? o.reason;
        deps.system(
          Number.isFinite(until)
            ? { key: "moderation.muted", params: { until, reason } }
            : { key: "moderation.muted-permanent", params: { reason } },
          characterId,
        );
      },
    };
  }

  async function kickIn(
    tx: Queryable,
    adminId: string,
    accountId: string,
    reason: string,
    told = reason,
  ) {
    const account = await lockAccount(tx, accountId);
    if (!account) return fail("not_found");
    await tx.execute(sql`delete from sessions where account_id = ${accountId}`);
    const characterId = await characterOfAccount(tx, accountId);
    await record(tx, { adminId, action: "kick", target: target.account(accountId), reason });
    return {
      ok: true as const,
      after: () => {
        if (characterId) {
          deps.system({ key: "moderation.kicked", params: { reason: told } }, characterId);
        }
        deps.evict(accountId, CLOSE_KICKED);
      },
    };
  }

  return {
    ban: (adminId: string, accountId: string, o: BanOptions) =>
      run((tx) => banIn(tx, adminId, accountId, o)),

    /** Lifts every ban in force on the account. Its IP hashes are lifted with it. */
    unban: (adminId: string, accountId: string, reason: string) =>
      run(async (tx) => {
        if (!(await lockAccount(tx, accountId))) return fail("not_found");
        const { rows } = await tx.execute(sql`
          update account_bans set lifted_at = now(), lifted_by = ${adminId}, lift_reason = ${reason}
          where account_id = ${accountId} and lifted_at is null
            and (ends_at is null or ends_at > now())
          returning id`);
        if (rows.length === 0) return fail("not_banned");
        await tx.execute(sql`update accounts set status = 'active' where id = ${accountId}`);
        await record(tx, {
          adminId,
          action: "unban",
          target: target.account(accountId),
          reason,
          detail: { bans: rows.map((r) => Number(r.id)) },
        });
        return { ok: true };
      }),

    mute: (adminId: string, characterId: string, o: MuteOptions) =>
      run((tx) => muteIn(tx, adminId, characterId, o)),

    /** Lifts the admin mutes on the character. A filter mute still running stays. */
    unmute: (adminId: string, characterId: string, reason: string) =>
      run(async (tx) => {
        const { rows } = await tx.execute(sql`
          update mutes set lifted_at = now(), lifted_by = ${adminId}, lift_reason = ${reason}
          where character_id = ${characterId} and lifted_at is null
            and (ends_at is null or ends_at > now())
          returning id`);
        if (rows.length === 0) return fail("not_muted");
        await record(tx, {
          adminId,
          action: "unmute",
          target: target.character(characterId),
          reason,
          detail: { mutes: rows.map((r) => Number(r.id)) },
        });
        return {
          ok: true,
          after: () => {
            mutes.unmuted(characterId);
            void mutes.refresh(db, characterId).catch(() => {});
          },
        };
      }),

    /** Closes the session: the player is out and may log in again. */
    kick: (adminId: string, accountId: string, reason: string) =>
      run((tx) => kickIn(tx, adminId, accountId, reason)),

    /**
     * Confirms a logged line as a filter strike, once per line: the strike and its audit row
     * commit together, then the living world adds the +3 벌점 (PLAN §11) with everything that
     * follows from it (the warning line, 명령퇴사 at 20) through `live().events.chatStrike`.
     * `line` is the `chat_log` key, id and time.
     */
    strike: (adminId: string, line: { id: number; at: Date }, reason: string) =>
      run(async (tx) => {
        // The page holds the line's time to the millisecond; the row may be finer. The range
        // also lets Postgres read the one day partition.
        const at = line.at.toISOString();
        const { rows } = await tx.execute(sql`
          select l.sender_id, l.body, l.masked, l.channel, l.at from chat_log l
          join characters c on c.id = l.sender_id
          where l.id = ${line.id} and l.at >= ${at}::timestamptz
            and l.at < ${at}::timestamptz + interval '1 millisecond'`);
        const found = rows[0] as
          | { sender_id: string; body: string; masked: boolean; channel: string; at: Date }
          | undefined;
        if (!found) return fail("not_found");
        const made = await tx.execute(sql`
          insert into filter_strikes (character_id, line_id, line_at, body, demerits, admin_id)
          select ${found.sender_id}, l.id, l.at, ${found.body}, ${DEMERITS.chat}, ${adminId}
          from chat_log l where l.id = ${line.id} and l.at >= ${at}::timestamptz
            and l.at < ${at}::timestamptz + interval '1 millisecond'
          on conflict (line_id, line_at) do nothing
          returning id`);
        const strike = made.rows[0];
        if (!strike) return fail("already_struck");
        await record(tx, {
          adminId,
          action: "strike",
          target: target.character(found.sender_id),
          reason,
          detail: {
            strike: Number(strike.id),
            line: line.id,
            lineAt: line.at.toISOString(),
            channel: found.channel,
            masked: found.masked,
            demerits: DEMERITS.chat,
          },
        });
        // Its own operation in the live world, which logs (never throws) when it fails.
        return {
          ok: true,
          after: async () => {
            deps.system({ key: "moderation.strike" }, found.sender_id);
            await live()?.events.chatStrike(found.sender_id, String(strike.id));
          },
        };
      }),

    /**
     * Gives or takes items and currency through the executor, as its own `admin.adjust`
     * operation, with the audit row in the same transaction. `opId` comes from the admin page's
     * form: a retry of it applies nothing twice, even after the executor has forgotten the id,
     * because the audit row keeps it for good.
     */
    async adjust(
      adminId: string,
      characterId: string,
      opId: string,
      input: AdjustInput,
    ): Promise<ModResult<{ replayed: boolean; items: string[] }>> {
      const key = `admin:${adminId}:${opId}`;
      const out = await db.transaction(async (tx) => {
        const prior = await tx.execute(
          sql`select detail from admin_actions where admin_id = ${adminId} and op_id = ${key}`,
        );
        if (prior.rows[0]) {
          const items = ((prior.rows[0].detail as { items?: string[] }).items ?? []) as string[];
          return { ok: true as const, replayed: true, items };
        }
        const result = await executor.execute(
          characterId,
          key,
          "admin.adjust",
          { admin: adminId, ...input },
          { tx },
        );
        if (!result.ok) {
          const known: ModError[] = ["insufficient", "item_missing", "op_id_reused"];
          const error = known.includes(result.error as ModError) ? result.error : "not_found";
          return fail(error as ModError);
        }
        const items = (result.outcome.items ?? []) as string[];
        const first = await record(tx, {
          adminId,
          action: "grant",
          target: target.character(characterId),
          reason: input.reason,
          detail: { amounts: input.amounts, add: input.add, remove: input.remove, items },
          opId: key,
        });
        // A replay (another send of this id) changed nothing, so it tells the player nothing.
        return {
          ok: true as const,
          replayed: !first,
          items,
          ...(first ? { change: result.change } : {}),
        };
      });
      if (!out.ok) return out;
      if ("change" in out && out.change) deps.notify(characterId, out.change);
      return { ok: true, replayed: out.replayed, items: out.items };
    },

    /** Takes down a 대자보 post (the 층장 notice included). Its text stays in the audit row. */
    removePost: (adminId: string, postId: number, reason: string) =>
      run(async (tx) => {
        const { rows } = await tx.execute(sql`
          delete from board_posts where id = ${postId}
          returning author_id, category, body`);
        const post = rows[0] as { author_id: string; category: string; body: string } | undefined;
        if (!post) return fail("not_found");
        await record(tx, {
          adminId,
          action: "post.remove",
          target: target.character(post.author_id),
          reason,
          detail: { post: postId, category: post.category, body: post.body },
        });
        return { ok: true };
      }),

    /** Takes down a club notice; the club's members see it gone at once. */
    removeClubNotice: (adminId: string, noticeId: number, reason: string) =>
      run(async (tx) => {
        const { rows } = await tx.execute(sql`
          delete from club_notices where id = ${noticeId}
          returning club_id, author_id, body`);
        const notice = rows[0] as { club_id: number; author_id: string; body: string } | undefined;
        if (!notice) return fail("not_found");
        await record(tx, {
          adminId,
          action: "notice.remove",
          target: target.character(notice.author_id),
          reason,
          detail: { notice: noticeId, club: notice.club_id, body: notice.body },
        });
        return { ok: true, after: () => deps.clubs?.announce({ club: notice.club_id }) };
      }),

    /** A notice on the system channel. Audited first: no row, no notice. */
    async broadcast(adminId: string, text: string): Promise<ModResult> {
      await record(db, { adminId, action: "broadcast", target: target.server, detail: { text } });
      if (!deps.system({ key: "notice", text })) return fail("offline");
      return { ok: true };
    },

    /**
     * Closes an open report with an action and a note, in one transaction with the action itself.
     * The reported player is told only the action (a mute, a closed session); the reporter and
     * the note are never sent to anyone.
     */
    resolveReport: (adminId: string, reportId: number, r: ResolveInput) =>
      run(async (tx) => {
        const { rows } = await tx.execute(sql`
          select r.state, r.target_id, c.account_id from reports r
          left join characters c on c.id = r.target_id
          where r.id = ${reportId} for update of r`);
        const report = rows[0] as
          | { state: string; target_id: string; account_id: string | null }
          | undefined;
        if (!report) return fail("not_found");
        if (report.state !== "open") return fail("already_handled");
        if (r.state === "dismissed" && r.action !== "none") return fail("bad_request");
        if (r.action !== "none" && !r.told) return fail("bad_request");
        const reason = `report #${reportId}${r.note ? `: ${r.note}` : ""}`;
        let after: After | undefined;
        if (r.action !== "none") {
          if (!report.account_id) return fail("not_found");
          const done =
            r.action === "mute"
              ? await muteIn(tx, adminId, report.target_id, {
                  reason,
                  told: r.told,
                  minutes: r.minutes,
                })
              : r.action === "kick"
                ? await kickIn(tx, adminId, report.account_id, reason, r.told)
                : await banIn(tx, adminId, report.account_id, {
                    reason,
                    told: r.told,
                    minutes: r.minutes,
                    ip: r.ip,
                  });
          if (!done.ok) return done;
          after = done.after;
        }
        await tx.execute(sql`
          update reports set state = ${r.state}, handled_by = ${adminId}, handled_at = now()
          where id = ${reportId}`);
        await tx.execute(sql`
          insert into report_resolutions (report_id, admin_id, action, note)
          values (${reportId}, ${adminId}, ${r.action}, ${r.note || null})`);
        await record(tx, {
          adminId,
          action: "report.resolve",
          target: target.report(reportId),
          reason: r.note || null,
          detail: {
            state: r.state,
            action: r.action,
            minutes: r.minutes,
            character: report.target_id,
          },
        });
        return after ? { ok: true, after } : { ok: true };
      }),

    /** Accounts whose every ban has ended are active again. Run every minute. */
    async sweep(): Promise<number> {
      const { rowCount } = await db.execute(sql`
        update accounts a set status = 'active'
        where a.status = 'banned'
          and exists (select 1 from account_bans b where b.account_id = a.id)
          and not exists (
            select 1 from account_bans b where b.account_id = a.id and b.lifted_at is null
              and (b.ends_at is null or b.ends_at > now()))`);
      return rowCount ?? 0;
    },

    /**
     * What an IP ban of this account would cover, shown before it is confirmed: its recent
     * addresses, and how many other accounts used them in the same days.
     */
    async ipPreview(accountId: string): Promise<{ addresses: number; otherAccounts: number }> {
      const ips = await recentAddresses(db, accountId);
      if (ips.length === 0) return { addresses: 0, otherAccounts: 0 };
      const { rows } = await db.execute(sql`
        select count(distinct account_id)::int as n from (
          select account_id from account_ips
          where ip_hash = any(${sql.param(ips)}::text[])
            and last_seen > now() - make_interval(days => ${IP_BAN_DAYS})
          union all
          select id from accounts
          where signup_ip_hash = any(${sql.param(ips)}::text[])
            and created_at > now() - make_interval(days => ${IP_BAN_DAYS})
        ) seen where account_id <> ${accountId}`);
      return { addresses: ips.length, otherAccounts: Number(rows[0]?.n ?? 0) };
    },

    /** For `createAuthService({ gate })`. */
    gate: {
      async ipBanned(ip: string, use: "signup" | "login"): Promise<boolean> {
        const scopes = use === "signup" ? ["signup", "all"] : ["all"];
        const { rows } = await db.execute(sql`
          select 1 from account_bans
          where ip_hashes @> array[${ip}]::text[] and lifted_at is null
            and ip_scope = any(${sql.param(scopes)}::text[])
            and (ends_at is null or ends_at > now())
          limit 1`);
        return rows.length > 0;
      },
      async seen(tx: Queryable, accountId: string, ip: string): Promise<void> {
        await tx.execute(sql`
          insert into account_ips (account_id, ip_hash) values (${accountId}, ${ip})
          on conflict (account_id, ip_hash) do update set last_seen = now()`);
      },
    } satisfies AuthGate,
  };
}

export type Moderation = ReturnType<typeof createModeration>;
