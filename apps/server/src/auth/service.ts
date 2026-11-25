/**
 * Accounts, sessions and the one character per account (PLAN §20, §22). Every method returns
 * either a result or an `ApiErrorCode`; nothing here knows about HTTP.
 */
import { LAWN } from "@guago/content";
import {
  type Account,
  type ApiErrorCode,
  type Character,
  type CreateCharacterRequest,
  checkName,
  type LoginRequest,
  type Look,
  type Major,
  type NameAvailableResponse,
  normalizeName,
  type RecoverRequest,
  type SignupRequest,
} from "@guago/shared";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import { type Db, pgErrorCode } from "../db/index.ts";
import { accounts, characters, loginFailures, sessions } from "../db/schema.ts";
import {
  dummyHash,
  hashSecret,
  newRecoveryCode,
  newSessionToken,
  sessionTokenHash,
  verifySecret,
} from "./crypto.ts";
import { isBannedName } from "./names.ts";

export const SESSION_DAYS = 30;
export const SIGNUPS_PER_IP_PER_DAY = 3;
export const LOGIN_FAILURES_ALLOWED = 5;
export const LOGIN_WINDOW_MINUTES = 15;
/** 기수 for new characters. Becomes the live Page once server state exists (PLAN §10). */
export const CURRENT_COHORT = 1;
/** Where a new character first stands. */
export const START_MAP = LAWN;

type Result<T> = { ok: true; value: T } | { ok: false; error: ApiErrorCode };
const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = (error: ApiErrorCode): { ok: false; error: ApiErrorCode } => ({ ok: false, error });

export interface Session {
  token: string;
  expiresAt: Date;
}

export interface AuthedAccount {
  account: Account;
  status: string;
}

type CharacterRow = typeof characters.$inferSelect;

export function toCharacter(row: CharacterRow): Character {
  return {
    id: row.id,
    name: row.name,
    major: row.major as Major,
    look: row.look as Look,
    level: row.level,
    mapId: row.mapId,
    x: row.x,
    y: row.y,
    cohort: row.cohort,
  };
}

export interface AuthServiceOptions {
  db: Db;
  /** Called after an account's sessions are replaced or revoked, to close its live seat. */
  onSessionsRevoked?: (accountId: string) => void | Promise<void>;
}

export function createAuthService({ db, onSessionsRevoked }: AuthServiceOptions) {
  async function openSession(tx: Pick<Db, "insert">, accountId: string): Promise<Session> {
    const token = newSessionToken();
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 3600 * 1000);
    await tx.insert(sessions).values({ tokenHash: sessionTokenHash(token), accountId, expiresAt });
    return { token, expiresAt };
  }

  async function characterOf(accountId: string): Promise<Character | null> {
    const [row] = await db.select().from(characters).where(eq(characters.accountId, accountId));
    return row ? toCharacter(row) : null;
  }

  /**
   * Counts this attempt before the password is checked, so a burst of parallel guesses cannot
   * all pass the limit. Returns the attempt's row id, or null when the key is already limited.
   */
  async function beginAttempt(loginId: string, ip: string): Promise<number | null> {
    const [row] = await db
      .insert(loginFailures)
      .values({ loginId, ipHash: ip })
      .returning({ id: loginFailures.id });
    const since = sql`now() - make_interval(mins => ${LOGIN_WINDOW_MINUTES})`;
    const [count] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(loginFailures)
      .where(
        and(
          eq(loginFailures.loginId, loginId),
          eq(loginFailures.ipHash, ip),
          gt(loginFailures.at, since),
        ),
      );
    if ((count?.n ?? 0) > LOGIN_FAILURES_ALLOWED) {
      // A refused attempt does not extend the window.
      await db.delete(loginFailures).where(eq(loginFailures.id, row?.id ?? -1));
      return null;
    }
    return row?.id ?? null;
  }

  async function clearAttempts(loginId: string, ip: string): Promise<void> {
    await db
      .delete(loginFailures)
      .where(and(eq(loginFailures.loginId, loginId), eq(loginFailures.ipHash, ip)));
  }

  return {
    characterOf,

    async signup(
      req: SignupRequest,
      ip: string,
    ): Promise<Result<{ session: Session; recoveryCode: string }>> {
      if (isBannedName(req.loginId)) return fail("login_banned");
      const recovery = newRecoveryCode();
      const [passwordHash, recoveryCodeHash] = await Promise.all([
        hashSecret(req.password),
        hashSecret(recovery.code),
      ]);
      try {
        return await db.transaction(async (tx) => {
          // Serialise signups per IP so three parallel requests cannot all pass the count.
          await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${ip}, 0))`);
          const [count] = await tx
            .select({ n: sql<number>`count(*)::int` })
            .from(accounts)
            .where(
              and(
                eq(accounts.signupIpHash, ip),
                gt(accounts.createdAt, sql`now() - interval '1 day'`),
              ),
            );
          if ((count?.n ?? 0) >= SIGNUPS_PER_IP_PER_DAY) return fail("signup_limit");
          const [account] = await tx
            .insert(accounts)
            .values({
              loginId: req.loginId,
              passwordHash,
              recoveryCodeHash,
              ageConfirmed: req.ageConfirmed,
              signupIpHash: ip,
              lastLoginAt: new Date(),
            })
            .returning({ id: accounts.id });
          if (!account) throw new Error("insert returned no account");
          const session = await openSession(tx, account.id);
          return ok({ session, recoveryCode: recovery.display });
        });
      } catch (error) {
        if (pgErrorCode(error).code === "23505") return fail("login_taken");
        throw error;
      }
    },

    async login(
      req: LoginRequest,
      ip: string,
    ): Promise<Result<{ session: Session; account: Account; character: Character | null }>> {
      const attempt = await beginAttempt(req.loginId, ip);
      if (attempt === null) return fail("rate_limited");
      const [row] = await db.select().from(accounts).where(eq(accounts.loginId, req.loginId));
      // Unknown ids verify against a real hash too, so timing and code match a wrong password.
      const matches = await verifySecret(row?.passwordHash ?? (await dummyHash()), req.password);
      if (!row || !matches) return fail("bad_credentials");
      await clearAttempts(req.loginId, ip);
      if (row.status !== "active") return fail("account_banned");
      // Single session (PLAN §19): a new login replaces every other session of the account.
      const session = await db.transaction(async (tx) => {
        await tx.delete(sessions).where(eq(sessions.accountId, row.id));
        await tx.update(accounts).set({ lastLoginAt: new Date() }).where(eq(accounts.id, row.id));
        return openSession(tx, row.id);
      });
      await onSessionsRevoked?.(row.id);
      return ok({
        session,
        account: { id: row.id, loginId: row.loginId },
        character: await characterOf(row.id),
      });
    },

    /** The account behind a session token, or null when the token is unknown or expired. */
    async authenticate(token: string | undefined): Promise<AuthedAccount | null> {
      if (!token || token.length > 128) return null;
      const [row] = await db
        .select({ id: accounts.id, loginId: accounts.loginId, status: accounts.status })
        .from(sessions)
        .innerJoin(accounts, eq(accounts.id, sessions.accountId))
        .where(
          and(eq(sessions.tokenHash, sessionTokenHash(token)), gt(sessions.expiresAt, sql`now()`)),
        );
      if (row?.status !== "active") return null;
      return { account: { id: row.id, loginId: row.loginId }, status: row.status };
    },

    async logout(token: string | undefined): Promise<void> {
      if (!token) return;
      const [gone] = await db
        .delete(sessions)
        .where(eq(sessions.tokenHash, sessionTokenHash(token)))
        .returning({ accountId: sessions.accountId });
      if (gone) await onSessionsRevoked?.(gone.accountId);
    },

    async nameAvailable(raw: string): Promise<NameAvailableResponse> {
      if (raw.length > 32 || checkName(raw)) return { available: false, reason: "name_invalid" };
      const name = normalizeName(raw);
      if (isBannedName(name)) return { available: false, reason: "name_banned" };
      const [taken] = await db
        .select({ id: characters.id })
        .from(characters)
        .where(sql`lower(${characters.name}) = lower(${name})`);
      return taken ? { available: false, reason: "name_taken" } : { available: true };
    },

    async createCharacter(
      accountId: string,
      req: CreateCharacterRequest,
    ): Promise<Result<Character>> {
      if (isBannedName(req.name)) return fail("name_banned");
      try {
        const [row] = await db
          .insert(characters)
          .values({
            accountId,
            name: req.name,
            major: req.major,
            look: req.look,
            mapId: START_MAP.id,
            x: START_MAP.spawn.x,
            y: START_MAP.spawn.y,
            cohort: CURRENT_COHORT,
          })
          .returning();
        if (!row) throw new Error("insert returned no character");
        return ok(toCharacter(row));
      } catch (error) {
        const { code, constraint } = pgErrorCode(error);
        if (code === "23505" && constraint === "characters_name_key") return fail("name_taken");
        if (code === "23505") return fail("character_exists");
        throw error;
      }
    },

    async recover(req: RecoverRequest, ip: string): Promise<Result<true>> {
      const attempt = await beginAttempt(req.loginId, ip);
      if (attempt === null) return fail("rate_limited");
      const [row] = await db.select().from(accounts).where(eq(accounts.loginId, req.loginId));
      const stored = row?.recoveryCodeHash ?? (await dummyHash());
      const matches = await verifySecret(stored, req.recoveryCode);
      if (!row?.recoveryCodeHash || !matches) return fail("bad_credentials");
      const passwordHash = await hashSecret(req.newPassword);
      // The code is spent in the same statement that checks it, so two racing requests cannot
      // both use it.
      const spent = await db.transaction(async (tx) => {
        const [updated] = await tx
          .update(accounts)
          .set({ passwordHash, recoveryCodeHash: null })
          .where(and(eq(accounts.id, row.id), eq(accounts.recoveryCodeHash, stored)))
          .returning({ id: accounts.id });
        if (!updated) return false;
        await tx.delete(sessions).where(eq(sessions.accountId, row.id));
        return true;
      });
      if (!spent) return fail("bad_credentials");
      await clearAttempts(req.loginId, ip);
      await onSessionsRevoked?.(row.id);
      return ok(true);
    },

    async saveCharacterPlace(id: string, mapId: string, x: number, y: number): Promise<void> {
      await db
        .update(characters)
        .set({ mapId, x, y, updatedAt: new Date() })
        .where(eq(characters.id, id));
    },

    /** Drops expired sessions and failures past the window. Run every few minutes. */
    async sweep(): Promise<void> {
      await db.delete(sessions).where(lt(sessions.expiresAt, sql`now()`));
      await db
        .delete(loginFailures)
        .where(lt(loginFailures.at, sql`now() - make_interval(mins => ${LOGIN_WINDOW_MINUTES})`));
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
