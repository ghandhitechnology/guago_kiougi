/**
 * Admin identity (PLAN §22 "Admin: separate login"): its own accounts, sessions and cookie,
 * never a flag on a player account. Admins are made only by `pnpm admin` on the server machine.
 * The same hygiene as players (Argon2id, 256-bit tokens stored hashed, failure limits counted
 * before the password is checked), with short sessions: 8 hours at most, 30 minutes idle.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { PASSWORD_MAX } from "@guago/shared";
import { sql } from "drizzle-orm";
import {
  dummyHash,
  HashBusy,
  hashSecret,
  newSessionToken,
  sessionTokenHash,
  verifySecret,
} from "../auth/crypto.ts";
import type { Db } from "../db/index.ts";
import { record } from "../moderation/audit.ts";

export const ADMIN_ROLES = ["moderator", "owner"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export const ADMIN_SESSION_HOURS = 8;
export const ADMIN_IDLE_MINUTES = 30;
export const ADMIN_LOGIN_WINDOW_MINUTES = 15;
export const ADMIN_FAILURES_PER_KEY = 5;
export const ADMIN_FAILURES_PER_IP = 20;
/** Admin passwords are longer than players': this is the key to every account. */
export const ADMIN_PASSWORD_MIN = 12;
export const ADMIN_LOGIN_ID = /^[a-z0-9_]{3,32}$/;

export interface Admin {
  id: string;
  loginId: string;
  role: AdminRole;
  /** The session's token hash, for the CSRF token. */
  tokenHash: string;
}

export type LoginResult =
  | { ok: true; token: string; expiresAt: Date; admin: Admin }
  | { ok: false; error: "bad_credentials" | "rate_limited" };

export function checkAdminPassword(password: string): string | null {
  if (password.length < ADMIN_PASSWORD_MIN) return `at least ${ADMIN_PASSWORD_MIN} characters`;
  if (password.length > PASSWORD_MAX) return `at most ${PASSWORD_MAX} characters`;
  return null;
}

export function createAdminAuth(db: Db, secret: string) {
  const window = sql`now() - make_interval(mins => ${ADMIN_LOGIN_WINDOW_MINUTES})`;

  /** Counts the attempt first, so parallel guesses cannot all pass. Returns its id or null. */
  async function beginAttempt(loginId: string, ip: string): Promise<number | null> {
    const { rows } = await db.execute(sql`
      insert into admin_login_failures (login_id, ip_hash) values (${loginId}, ${ip})
      returning id`);
    const id = Number(rows[0]?.id);
    const counted = await db.execute(sql`
      select
        count(*) filter (where login_id = ${loginId} and ip_hash = ${ip})::int as key,
        count(*) filter (where ip_hash = ${ip})::int as ip
      from admin_login_failures where at > ${window}`);
    const c = counted.rows[0] as { key: number; ip: number };
    if (c.key > ADMIN_FAILURES_PER_KEY || c.ip > ADMIN_FAILURES_PER_IP) {
      await db.execute(sql`delete from admin_login_failures where id = ${id}`);
      return null;
    }
    return id;
  }

  return {
    csrfToken(admin: Admin): string {
      return createHmac("sha256", secret)
        .update(`admin-csrf\0${admin.tokenHash}`)
        .digest("base64url");
    },

    csrfMatches(admin: Admin, given: string | undefined): boolean {
      if (!given) return false;
      const want = Buffer.from(this.csrfToken(admin));
      const got = Buffer.from(given);
      return want.length === got.length && timingSafeEqual(want, got);
    },

    async login(loginId: string, password: string, ip: string): Promise<LoginResult> {
      const id = loginId.trim().toLowerCase();
      if (!ADMIN_LOGIN_ID.test(id) || password.length > PASSWORD_MAX) {
        return { ok: false, error: "bad_credentials" };
      }
      const attempt = await beginAttempt(id, ip);
      if (attempt === null) return { ok: false, error: "rate_limited" };
      const { rows } = await db.execute(
        sql`select id, password_hash, role, status from admin_accounts where login_id = ${id}`,
      );
      const row = rows[0] as
        | { id: string; password_hash: string; role: AdminRole; status: string }
        | undefined;
      let matches: boolean;
      try {
        matches = await verifySecret(row?.password_hash ?? (await dummyHash()), password);
      } catch (error) {
        if (!(error instanceof HashBusy)) throw error;
        await db.execute(sql`delete from admin_login_failures where id = ${attempt}`);
        return { ok: false, error: "rate_limited" };
      }
      // A disabled admin gets the same answer as a wrong password.
      if (!row || !matches || row.status !== "active") {
        return { ok: false, error: "bad_credentials" };
      }
      await db.execute(
        sql`delete from admin_login_failures where login_id = ${id} and ip_hash = ${ip}`,
      );
      const token = newSessionToken();
      const tokenHash = sessionTokenHash(token);
      const expiresAt = new Date(Date.now() + ADMIN_SESSION_HOURS * 3600_000);
      await db.transaction(async (tx) => {
        await tx.execute(sql`
          insert into admin_sessions (token_hash, admin_id, expires_at, idle_until)
          values (${tokenHash}, ${row.id}, ${expiresAt.toISOString()}::timestamptz,
                  least(${expiresAt.toISOString()}::timestamptz,
                        now() + make_interval(mins => ${ADMIN_IDLE_MINUTES})))
          on conflict (admin_id) do update set token_hash = excluded.token_hash,
            expires_at = excluded.expires_at, idle_until = excluded.idle_until,
            created_at = now()`);
        await tx.execute(sql`update admin_accounts set last_login_at = now() where id = ${row.id}`);
        await record(tx, { adminId: row.id, action: "login", target: `admin:${row.id}` });
      });
      return {
        ok: true,
        token,
        expiresAt,
        admin: { id: row.id, loginId: id, role: row.role, tokenHash },
      };
    },

    /**
     * The admin behind a cookie token, or null when unknown, expired, idle too long or disabled.
     * A live session's idle end moves forward, at most once a minute.
     */
    async authenticate(token: string | undefined): Promise<Admin | null> {
      if (!token || token.length > 128) return null;
      const tokenHash = sessionTokenHash(token);
      const { rows } = await db.execute(sql`
        select a.id, a.login_id, a.role from admin_sessions s
        join admin_accounts a on a.id = s.admin_id
        where s.token_hash = ${tokenHash} and s.expires_at > now() and s.idle_until > now()
          and a.status = 'active'`);
      const row = rows[0] as { id: string; login_id: string; role: AdminRole } | undefined;
      if (!row) return null;
      await db.execute(sql`
        update admin_sessions
        set idle_until = least(expires_at, now() + make_interval(mins => ${ADMIN_IDLE_MINUTES}))
        where token_hash = ${tokenHash}
          and idle_until < now() + make_interval(mins => ${ADMIN_IDLE_MINUTES - 1})`);
      return { id: row.id, loginId: row.login_id, role: row.role, tokenHash };
    },

    async logout(admin: Admin): Promise<void> {
      await db.transaction(async (tx) => {
        await tx.execute(sql`delete from admin_sessions where token_hash = ${admin.tokenHash}`);
        await record(tx, { adminId: admin.id, action: "logout", target: `admin:${admin.id}` });
      });
    },

    async list() {
      const { rows } = await db.execute(sql`
        select id, login_id, role, status, created_at, last_login_at from admin_accounts
        order by login_id`);
      return rows.map((r) => ({
        id: r.id as string,
        loginId: r.login_id as string,
        role: r.role as AdminRole,
        status: r.status as string,
        createdAt: new Date(r.created_at as string).toISOString(),
        lastLoginAt: r.last_login_at ? new Date(r.last_login_at as string).toISOString() : null,
      }));
    },

    /**
     * Changes another admin's role or status (owners only, checked by the route). Disabling ends
     * their session. An owner cannot change themselves, so the last owner cannot lock everyone
     * out by accident.
     */
    async edit(
      by: Admin,
      adminId: string,
      change: { role?: AdminRole; status?: "active" | "disabled" },
      reason: string,
    ): Promise<"ok" | "not_found" | "self"> {
      if (adminId === by.id) return "self";
      return db.transaction(async (tx) => {
        const { rows } = await tx.execute(sql`
          update admin_accounts set
            role = coalesce(${change.role ?? null}, role),
            status = coalesce(${change.status ?? null}, status)
          where id = ${adminId}
          returning status`);
        if (!rows[0]) return "not_found";
        if (rows[0].status !== "active") {
          await tx.execute(sql`delete from admin_sessions where admin_id = ${adminId}`);
        }
        await record(tx, {
          adminId: by.id,
          action: "admin.edit",
          target: `admin:${adminId}`,
          reason,
          detail: change,
        });
        return "ok";
      });
    },

    /** Command line only (`pnpm admin create`). */
    async create(loginId: string, password: string, role: AdminRole): Promise<string> {
      const passwordHash = await hashSecret(password);
      const { rows } = await db.execute(sql`
        insert into admin_accounts (login_id, password_hash, role)
        values (${loginId}, ${passwordHash}, ${role}) returning id`);
      return rows[0]?.id as string;
    },

    /** Command line only. Ends the admin's session. */
    async setPassword(loginId: string, password: string): Promise<boolean> {
      const passwordHash = await hashSecret(password);
      return db.transaction(async (tx) => {
        const { rows } = await tx.execute(sql`
          update admin_accounts set password_hash = ${passwordHash} where login_id = ${loginId}
          returning id`);
        if (!rows[0]) return false;
        await tx.execute(sql`delete from admin_sessions where admin_id = ${rows[0].id}`);
        return true;
      });
    },

    /** Command line only. */
    async setStatus(loginId: string, status: "active" | "disabled"): Promise<boolean> {
      return db.transaction(async (tx) => {
        const { rows } = await tx.execute(sql`
          update admin_accounts set status = ${status} where login_id = ${loginId} returning id`);
        if (!rows[0]) return false;
        if (status === "disabled") {
          await tx.execute(sql`delete from admin_sessions where admin_id = ${rows[0].id}`);
        }
        return true;
      });
    },

    async sweep(): Promise<void> {
      await db.execute(
        sql`delete from admin_sessions where expires_at < now() or idle_until < now()`,
      );
      await db.execute(sql`delete from admin_login_failures where at < ${window}`);
    },
  };
}

export type AdminAuth = ReturnType<typeof createAdminAuth>;
