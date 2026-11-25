import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { API, type Look } from "@guago/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, type Db, describeError } from "../db/index.ts";
import { accounts } from "../db/schema.ts";
import { studentLooks } from "../looks.ts";
import { TEST_DATABASE_URL } from "../test/db-setup.ts";
import { type Jar, call as rawCall, remember, waitFor } from "../test/http.ts";
import { hashingStats } from "./crypto.ts";
import { createApiHandler } from "./http.ts";
import { type AuthService, createAuthService } from "./service.ts";

let db: Db;
let auth: AuthService;
let server: Server;
let base: string;

/** Lowered from 50 so the ceiling test stays quick. */
const FAILURES_PER_IP = 8;

const LOOK: Look = {
  body: "fair",
  hair: "crop",
  hairColor: "black",
  face: "bright",
  uniform: "blazer",
  accessories: ["glasses"],
};

const call = (path: string, options: Parameters<typeof rawCall>[2] = {}) =>
  rawCall(base, path, options);

/** Signs up into `jar` (session and device cookies), from `ip`. */
const signup = (loginId: string, jar: Jar = {}, ip = "10.0.0.1", password = "correct horse") =>
  call(API.signup, { body: { loginId, password, ageConfirmed: true }, ip }).then((r) =>
    remember(jar, r),
  );

const login = (loginId: string, password: string, ip = "10.0.0.1", jar?: Jar) =>
  call(API.login, { body: { loginId, password }, ip, ...(jar ? { jar } : {}) }).then((r) =>
    jar ? remember(jar, r) : r,
  );

const sessionCount = async () => (await db.pool.query("select 1 from sessions")).rowCount;

beforeAll(async () => {
  db = createDb(TEST_DATABASE_URL);
  auth = createAuthService({ db, limits: { failuresPerIp: FAILURES_PER_IP } });
  const settings = {
    clientOrigin: "http://localhost:5173",
    secureCookies: false,
    trustProxy: true,
    serverSecret: "test",
  };
  server = createServer(createApiHandler(auth, settings, studentLooks));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  await db.pool.end();
});

beforeEach(async () => {
  await db.pool.query("truncate accounts, login_failures cascade");
});

describe("signup and login", () => {
  it("signs up, logs in and answers me, keeping one session per account", async () => {
    const first: Jar = {};
    const created = await signup("sora_01", first);
    expect(created.status).toBe(200);
    expect(created.body.recoveryCode).toMatch(/^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/);
    expect(first.sid).toMatch(/^.{43}$/);
    expect(first.did).toBeDefined();

    const fresh = await call(API.me, { jar: first });
    expect(fresh.body).toMatchObject({ account: { loginId: "sora_01" }, character: null });

    const second: Jar = {};
    const loggedIn = await login("SORA_01", "correct horse", "10.0.0.1", second);
    expect(loggedIn.body).toMatchObject({ account: { loginId: "sora_01" }, character: null });
    // The login replaced the signup session.
    expect((await call(API.me, { jar: first })).status).toBe(401);

    const made = await call(API.character, {
      jar: second,
      body: { name: "소라", major: "physics", look: LOOK },
    });
    expect(made.status).toBe(200);
    const me = await call(API.me, { jar: second });
    expect(me.body.character).toMatchObject({
      name: "소라",
      major: "physics",
      level: 1,
      look: LOOK,
    });
    const again = await call(API.character, {
      jar: second,
      body: { name: "다른이름", major: "math", look: LOOK },
    });
    expect(again.body).toEqual({ error: "character_exists" });
  });

  it("leaves exactly one live session when two correct logins race", async () => {
    await signup("doubled");
    const jars: Jar[] = [{}, {}];
    const replies = await Promise.all(
      jars.map((jar) => login("doubled", "correct horse", "10.0.0.1", jar)),
    );
    expect(replies.map((r) => r.status)).toEqual([200, 200]);
    expect(await sessionCount()).toBe(1);
    const live = await Promise.all(jars.map((jar) => call(API.me, { jar })));
    expect(live.map((r) => r.status).sort()).toEqual([200, 401]);
  });

  it("does not let a login that verified the old password outlive a recovery", async () => {
    await signup("overlap");
    // Hold the account row the way a recovery's update does, while a correct login is in flight.
    const recovery = await db.pool.connect();
    await recovery.query("begin");
    await recovery.query("select 1 from accounts where login_id = 'overlap' for update");
    const pending = login("overlap", "correct horse", "10.0.0.2");
    await waitFor(async () => {
      const { rows } = await db.pool.query(
        "select count(*)::int as n from pg_stat_activity where wait_event_type = 'Lock'",
      );
      return rows[0].n > 0;
    });
    await recovery.query(
      "update accounts set password_hash = 'replaced' where login_id = 'overlap'",
    );
    await recovery.query("delete from sessions");
    await recovery.query("commit");
    recovery.release();
    expect((await pending).body).toEqual({ error: "bad_credentials" });
    expect(await sessionCount()).toBe(0);
  });

  it("gives a login id to exactly one of two racing signups from one IP", async () => {
    const replies = await Promise.all([
      signup("twin"),
      signup("twin", {}, "10.0.0.1", "other pass"),
    ]);
    expect(replies.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(replies.find((r) => r.status === 409)?.body).toEqual({ error: "login_taken" });
  });

  it("lets only one of two racing signups take an IP's last daily slot", async () => {
    await signup("slot_one", {}, "10.0.4.1");
    await signup("slot_two", {}, "10.0.4.1");
    const replies = await Promise.all([
      signup("slot_a", {}, "10.0.4.1"),
      signup("slot_b", {}, "10.0.4.1"),
    ]);
    expect(replies.map((r) => r.status).sort()).toEqual([200, 429]);
    expect(replies.find((r) => r.status === 429)?.body).toEqual({ error: "signup_limit" });
  });

  it("refuses a signup over the IP limit before doing any Argon2 work", async () => {
    for (const id of ["full_1", "full_2", "full_3"]) await signup(id, {}, "10.0.4.2");
    const before = hashingStats.started;
    expect((await signup("full_4", {}, "10.0.4.2")).body).toEqual({ error: "signup_limit" });
    expect(hashingStats.started).toBe(before);
  });
});

describe("login limits", () => {
  it("locks an account and IP after 5 failures, but not the owner's device or other IPs", async () => {
    const owner: Jar = {};
    await signup("haneul", owner, "10.0.0.7");
    const guess = (password: string, ip = "10.0.0.7") => login("haneul", password, ip);

    for (let i = 0; i < 5; i++) {
      expect((await guess("wrong password")).body).toEqual({ error: "bad_credentials" });
    }
    // Same network, no device cookie: even the right password waits out the window.
    expect((await guess("correct horse")).body).toEqual({ error: "rate_limited" });
    // The owner's browser has its own counter.
    expect((await login("haneul", "correct horse", "10.0.0.7", owner)).status).toBe(200);
    // A forged device cookie counts as none.
    const forged = await login("haneul", "correct horse", "10.0.0.7", { did: "abc.def" });
    expect(forged.body).toEqual({ error: "rate_limited" });
    expect((await guess("correct horse", "10.0.0.8")).status).toBe(200);
    // An unknown id gets the same answer as a wrong password.
    expect((await login("nobody", "whatever1", "10.0.0.9")).body).toEqual({
      error: "bad_credentials",
    });
  });

  it("counts a burst of parallel wrong passwords before checking any of them", async () => {
    await signup("burst", {}, "10.0.5.1");
    const replies = await Promise.all(
      Array.from({ length: 12 }, () => login("burst", "wrong password", "10.0.5.2")),
    );
    const verified = replies.filter((r) => r.body.error === "bad_credentials").length;
    expect(verified).toBeGreaterThan(0);
    expect(verified).toBeLessThanOrEqual(5);
    expect(replies.filter((r) => r.body.error === "rate_limited")).toHaveLength(12 - verified);
  });

  it("caps failures from one IP across every login id", async () => {
    for (let i = 0; i < FAILURES_PER_IP; i++) {
      expect((await login(`rotate_${i}`, "wrong password", "10.0.6.1")).body).toEqual({
        error: "bad_credentials",
      });
    }
    expect((await login("rotate_new", "wrong password", "10.0.6.1")).body).toEqual({
      error: "rate_limited",
    });
    expect((await login("rotate_new", "wrong password", "10.0.6.2")).body).toEqual({
      error: "bad_credentials",
    });
  });
});

describe("sessions and recovery", () => {
  it("stops honouring a session once it expires", async () => {
    const jar: Jar = {};
    await signup("expiring", jar);
    expect((await call(API.me, { jar })).status).toBe(200);
    await db.pool.query("update sessions set expires_at = now() - interval '1 second'");
    expect((await call(API.me, { jar })).status).toBe(401);
    await auth.sweep();
    expect(await sessionCount()).toBe(0);
  });

  it("accepts a recovery code once and hands out a fresh one", async () => {
    const jar: Jar = {};
    const created = await signup("forgetful", jar);
    const recover = (code: string, newPassword: string) =>
      call(API.recover, { body: { loginId: "forgetful", recoveryCode: code, newPassword } });

    const first = String(created.body.recoveryCode).toLowerCase();
    const recovered = await recover(first, "brand new pass");
    expect(recovered.body).toMatchObject({ ok: true });
    const fresh = String(recovered.body.recoveryCode);
    expect(fresh).toMatch(/^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/);
    // Recovery signs out everywhere.
    expect((await call(API.me, { jar })).status).toBe(401);
    expect((await login("forgetful", "correct horse", "10.0.3.1")).body).toEqual({
      error: "bad_credentials",
    });
    expect((await login("forgetful", "brand new pass", "10.0.3.1")).status).toBe(200);

    expect((await recover(first, "third password")).body).toEqual({ error: "bad_credentials" });
    expect((await recover(fresh, "third password")).body).toMatchObject({ ok: true });
  });
});

describe("error logging", () => {
  it("describes a failed query without its parameters", async () => {
    const error = await db
      .insert(accounts)
      .values({
        loginId: "leaky",
        passwordHash: "SECRET-HASH-VALUE",
        ageConfirmed: true,
        signupIpHash: "ip",
        status: "nope",
      })
      .then(
        () => new Error("insert succeeded"),
        (e: unknown) => e as Error,
      );
    // Drizzle's own message carries the parameters; the log line must not.
    expect(String(error.message)).toContain("SECRET-HASH-VALUE");
    expect(describeError(error)).toMatch(/^postgres 23514 accounts_status_check/);
    expect(describeError(error)).not.toContain("SECRET");
  });
});
