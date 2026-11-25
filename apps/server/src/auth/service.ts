/**
 * Accounts, sessions and the one character per account (PLAN §20, §22). Every method returns
 * either a result or an `ApiErrorCode`; nothing here knows about HTTP.
 */
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
import { livePage } from "../live/current.ts";
import { startPlace } from "../world-maps.ts";
import {
  dummyHash,
  HashBusy,
  hashSecret,
  newRecoveryCode,
  newSessionToken,
  sessionTokenHash,
  verifySecret,
} from "./crypto.ts";
import { isBannedName } from "./names.ts";

export const SESSION_DAYS = 30;
export const LOGIN_WINDOW_MINUTES = 15;

/** PLAN §12 and §22 limits; the per-IP ceiling across all login ids caps Argon2 work per IP. */
export const DEFAULT_LIMITS = {
  signupsPerIpPerDay: 3,
  failuresPerKey: 5,
  failuresPerIp: 50,
};
export type Limits = typeof DEFAULT_LIMITS;
/** Where a new character first stands. */
/** Where new characters stand: where the story starts. */
const start = startPlace();

type Result<T> = { ok: true; value: T } | { ok: false; error: ApiErrorCode };
const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = (error: ApiErrorCode): { ok: false; error: ApiErrorCode } => ({ ok: false, error });

export interface Session {
  token: string;
  expiresAt: Date;
}

/**
 * Where an attempt comes from. `source` keys the 5-failure counter: the IP hash, or a device
 * cookie's key when the browser holds one for this login id.
 */
export interface Origin {
  ip: string;
  source: string;
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
  /**
   * Called inside the transaction that makes a character, so what it gives (the starter kit)
   * exists exactly when the character does.
   */
  onCharacterCreated?: (tx: Pick<Db, "execute">, characterId: string) => Promise<void>;
  limits?: Partial<Limits>;
  /** Moderation (moderation/service.ts): IP bans, and where each account comes in from. */
  gate?: AuthGate;
}

/** What the auth paths ask moderation. `ip` is always the keyed IP hash, never an address. */
export interface AuthGate {
  /** True when an active ban covers this IP hash: signup, login and recovery are refused. */
  ipBanned(ip: string): Promise<boolean>;
  /**
   * Called inside the transaction that opens a session (signup or login), so an IP ban can cover
   * the addresses the account has used.
   */
  seen(tx: Pick<Db, "execute">, accountId: string, ip: string): Promise<void>;
}

export function createAuthService({
  db,
  onSessionsRevoked,
  onCharacterCreated,
  limits,
  gate,
}: AuthServiceOptions) {
  const limit: Limits = { ...DEFAULT_LIMITS, ...limits };
  const windowStart = sql`now() - make_interval(mins => ${LOGIN_WINDOW_MINUTES})`;

  /** Opens the account's one session, replacing any other (unique `account_id`). */
  async function openSession(tx: Pick<Db, "insert">, accountId: string): Promise<Session> {
    const token = newSessionToken();
    const tokenHash = sessionTokenHash(token);
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 3600 * 1000);
    await tx
      .insert(sessions)
      .values({ tokenHash, accountId, expiresAt })
      .onConflictDoUpdate({
        target: sessions.accountId,
        set: { tokenHash, expiresAt, createdAt: sql`now()` },
      });
    return { token, expiresAt };
  }

  async function signupsFrom(tx: Pick<Db, "select">, ip: string): Promise<number> {
    const [count] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(accounts)
      .where(
        and(eq(accounts.signupIpHash, ip), gt(accounts.createdAt, sql`now() - interval '1 day'`)),
      );
    return count?.n ?? 0;
  }

  async function characterOf(accountId: string): Promise<Character | null> {
    const [row] = await db.select().from(characters).where(eq(characters.accountId, accountId));
    return row ? toCharacter(row) : null;
  }

  /**
   * Counts this attempt before the secret is checked, so a burst of parallel guesses cannot all
   * pass. Refused when its counter has more than 5 failures, or, for IP counters, when the IP has
   * more than the ceiling across every login id. Returns the attempt's row id, or null.
   */
  async function beginAttempt(loginId: string, from: Origin): Promise<number | null> {
    const [row] = await db
      .insert(loginFailures)
      .values({ loginId, source: from.source, ipHash: from.ip })
      .returning({ id: loginFailures.id });
    const fromIp = from.source === from.ip;
    const [count] = await db
      .select({
        key: sql<number>`(count(*) filter (where ${loginFailures.loginId} = ${loginId} and ${loginFailures.source} = ${from.source}))::int`,
        ip: sql<number>`(count(*) filter (where ${loginFailures.ipHash} = ${from.ip} and ${loginFailures.source} = ${from.ip}))::int`,
      })
      .from(loginFailures)
      .where(
        and(
          gt(loginFailures.at, windowStart),
          sql`((${loginFailures.loginId} = ${loginId} and ${loginFailures.source} = ${from.source}) or ${loginFailures.ipHash} = ${from.ip})`,
        ),
      );
    const overKey = (count?.key ?? 0) > limit.failuresPerKey;
    const overIp = fromIp && (count?.ip ?? 0) > limit.failuresPerIp;
    if (overKey || overIp || !row) {
      // A refused attempt does not extend the window.
      if (row) await forget(row.id);
      return null;
    }
    return row.id;
  }

  async function forget(attempt: number): Promise<void> {
    await db.delete(loginFailures).where(eq(loginFailures.id, attempt));
  }

  async function clearAttempts(loginId: string, from: Origin): Promise<void> {
    await db
      .delete(loginFailures)
      .where(and(eq(loginFailures.loginId, loginId), eq(loginFailures.source, from.source)));
  }

  /** Runs Argon2 work for a counted attempt; a saturated pool un-counts it and answers busy. */
  async function hashing<T>(attempt: number, work: () => Promise<T>): Promise<T | HashBusy> {
    try {
      return await work();
    } catch (error) {
      if (!(error instanceof HashBusy)) throw error;
      await forget(attempt);
      return error;
    }
  }

  /** As `authenticate`, from the stored hash (rooms keep the hash, never the token). */
  async function authenticateHash(tokenHash: string): Promise<AuthedAccount | null> {
    const [row] = await db
      .select({ id: accounts.id, loginId: accounts.loginId, status: accounts.status })
      .from(sessions)
      .innerJoin(accounts, eq(accounts.id, sessions.accountId))
      .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, sql`now()`)));
    if (row?.status !== "active") return null;
    return { account: { id: row.id, loginId: row.loginId }, status: row.status };
  }

  return {
    characterOf,
    authenticateHash,

    async signup(
      req: SignupRequest,
      ip: string,
    ): Promise<Result<{ session: Session; recoveryCode: string }>> {
      if (isBannedName(req.loginId)) return fail("login_banned");
      if (await gate?.ipBanned(ip)) return fail("account_banned");
      // Cheap check first, so a limited IP costs no Argon2 work; re-checked under the lock below.
      if ((await signupsFrom(db, ip)) >= limit.signupsPerIpPerDay) return fail("signup_limit");
      const recovery = newRecoveryCode();
      let passwordHash: string;
      let recoveryCodeHash: string;
      try {
        [passwordHash, recoveryCodeHash] = await Promise.all([
          hashSecret(req.password),
          hashSecret(recovery.code),
        ]);
      } catch (error) {
        if (error instanceof HashBusy) return fail("rate_limited");
        throw error;
      }
      try {
        return await db.transaction(async (tx) => {
          // Serialise signups per IP so three parallel requests cannot all pass the count.
          await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${ip}, 0))`);
          if ((await signupsFrom(tx, ip)) >= limit.signupsPerIpPerDay) return fail("signup_limit");
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
          await gate?.seen(tx, account.id, ip);
          return ok({ session, recoveryCode: recovery.display });
        });
      } catch (error) {
        if (pgErrorCode(error).code === "23505") return fail("login_taken");
        throw error;
      }
    },

    async login(
      req: LoginRequest,
      from: Origin,
    ): Promise<Result<{ session: Session; account: Account; character: Character | null }>> {
      if (await gate?.ipBanned(from.ip)) return fail("account_banned");
      const attempt = await beginAttempt(req.loginId, from);
      if (attempt === null) return fail("rate_limited");
      const [row] = await db.select().from(accounts).where(eq(accounts.loginId, req.loginId));
      // Unknown ids verify against a real hash too, so timing and code match a wrong password.
      const stored = row?.passwordHash ?? (await dummyHash());
      const matches = await hashing(attempt, () => verifySecret(stored, req.password));
      if (matches instanceof HashBusy) return fail("rate_limited");
      if (!row || !matches) return fail("bad_credentials");
      await clearAttempts(req.loginId, from);
      if (row.status !== "active") return fail("account_banned");
      // The session opens only if the hash just verified is still the account's: a recovery that
      // committed in between wins. The row lock also orders this against a racing recovery.
      const session = await db.transaction(async (tx) => {
        const [still] = await tx
          .update(accounts)
          .set({ lastLoginAt: sql`now()` })
          .where(
            and(
              eq(accounts.id, row.id),
              eq(accounts.passwordHash, row.passwordHash),
              eq(accounts.status, "active"),
            ),
          )
          .returning({ id: accounts.id });
        if (!still) return null;
        await gate?.seen(tx, row.id, from.ip);
        return openSession(tx, row.id);
      });
      if (!session) return fail("bad_credentials");
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
      return authenticateHash(sessionTokenHash(token));
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
        const row = await db.transaction(async (tx) => {
          const [made] = await tx
            .insert(characters)
            .values({
              accountId,
              name: req.name,
              major: req.major,
              look: req.look,
              mapId: start.map.id,
              x: start.x,
              y: start.y,
              cohort: livePage(),
            })
            .returning();
          if (!made) throw new Error("insert returned no character");
          await onCharacterCreated?.(tx, made.id);
          return made;
        });
        return ok(toCharacter(row));
      } catch (error) {
        const { code, constraint } = pgErrorCode(error);
        if (code === "23505" && constraint === "characters_name_key") return fail("name_taken");
        if (code === "23505") return fail("character_exists");
        throw error;
      }
    },

    /** Sets a new password and replaces the spent recovery code with a fresh one. */
    async recover(req: RecoverRequest, from: Origin): Promise<Result<{ recoveryCode: string }>> {
      if (await gate?.ipBanned(from.ip)) return fail("account_banned");
      const attempt = await beginAttempt(req.loginId, from);
      if (attempt === null) return fail("rate_limited");
      const [row] = await db.select().from(accounts).where(eq(accounts.loginId, req.loginId));
      const stored = row?.recoveryCodeHash ?? (await dummyHash());
      const fresh = newRecoveryCode();
      const work = await hashing(attempt, async () => {
        if (!(await verifySecret(stored, req.recoveryCode)) || !row?.recoveryCodeHash) return null;
        return Promise.all([hashSecret(req.newPassword), hashSecret(fresh.code)]);
      });
      if (work instanceof HashBusy) return fail("rate_limited");
      if (!work || !row) return fail("bad_credentials");
      const [passwordHash, recoveryCodeHash] = work;
      // The code is spent in the same statement that checks it, so two racing requests cannot
      // both use it.
      const spent = await db.transaction(async (tx) => {
        const [updated] = await tx
          .update(accounts)
          .set({ passwordHash, recoveryCodeHash })
          .where(and(eq(accounts.id, row.id), eq(accounts.recoveryCodeHash, stored)))
          .returning({ id: accounts.id });
        if (!updated) return false;
        await tx.delete(sessions).where(eq(sessions.accountId, row.id));
        return true;
      });
      if (!spent) return fail("bad_credentials");
      await clearAttempts(req.loginId, from);
      await onSessionsRevoked?.(row.id);
      return ok({ recoveryCode: fresh.display });
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
      await db.delete(loginFailures).where(lt(loginFailures.at, windowStart));
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
