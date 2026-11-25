import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { API, type Look } from "@guago/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, type Db } from "../db/index.ts";
import { studentLooks } from "../looks.ts";
import { TEST_DATABASE_URL } from "../test/db-setup.ts";
import { createApiHandler } from "./http.ts";
import { type AuthService, createAuthService } from "./service.ts";

let db: Db;
let auth: AuthService;
let server: Server;
let base: string;

const LOOK: Look = {
  body: "fair",
  hair: "crop",
  hairColor: "black",
  face: "bright",
  uniform: "blazer",
  accessories: ["glasses"],
};

interface Reply {
  status: number;
  body: Record<string, unknown>;
  cookie: string | undefined;
}

/** One request as a browser at `ip` would send it. */
async function call(
  path: string,
  options: { body?: unknown; cookie?: string | undefined; ip?: string } = {},
): Promise<Reply> {
  const headers: Record<string, string> = { "x-forwarded-for": options.ip ?? "10.0.0.1" };
  if (options.cookie) headers.cookie = options.cookie;
  if (options.body !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(base + path, {
    method: options.body === undefined ? "GET" : "POST",
    headers,
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  const set = res.headers.get("set-cookie");
  return {
    status: res.status,
    body: (await res.json()) as Record<string, unknown>,
    cookie: set ? set.split(";")[0] : undefined,
  };
}

const signup = (loginId: string, password = "correct horse", ip?: string) =>
  call(API.signup, { body: { loginId, password, ageConfirmed: true }, ...(ip ? { ip } : {}) });

beforeAll(async () => {
  db = createDb(TEST_DATABASE_URL);
  auth = createAuthService({ db });
  const settings = {
    clientOrigin: "http://localhost:5173",
    secureCookies: false,
    trustProxy: true,
    ipHashSecret: "test",
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

describe("accounts", () => {
  it("signs up, logs in and answers me, keeping one session per account", async () => {
    const created = await signup("sora_01");
    expect(created.status).toBe(200);
    expect(created.body.recoveryCode).toMatch(/^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/);
    expect(created.cookie).toMatch(/^sid=.{43}$/);

    const fresh = await call(API.me, { cookie: created.cookie });
    expect(fresh.body).toMatchObject({ account: { loginId: "sora_01" }, character: null });

    const login = await call(API.login, {
      body: { loginId: "SORA_01", password: "correct horse" },
    });
    expect(login.status).toBe(200);
    expect(login.body).toMatchObject({ account: { loginId: "sora_01" }, character: null });

    // The login replaced the signup session.
    expect((await call(API.me, { cookie: created.cookie })).status).toBe(401);

    const made = await call(API.character, {
      cookie: login.cookie,
      body: { name: "소라", major: "physics", look: LOOK },
    });
    expect(made.status).toBe(200);
    const me = await call(API.me, { cookie: login.cookie });
    expect(me.body.character).toMatchObject({
      name: "소라",
      major: "physics",
      level: 1,
      look: LOOK,
    });

    const second = await call(API.character, {
      cookie: login.cookie,
      body: { name: "다른이름", major: "math", look: LOOK },
    });
    expect(second.body).toEqual({ error: "character_exists" });
  });

  it("refuses a wrong password, then locks the account and IP after 5 failures", async () => {
    await signup("haneul");
    const attempt = (password: string, ip = "10.0.0.7") =>
      call(API.login, { body: { loginId: "haneul", password }, ip });

    for (let i = 0; i < 5; i++) {
      expect((await attempt("wrong password")).body).toEqual({ error: "bad_credentials" });
    }
    // Even the right password is refused now, from this IP.
    expect((await attempt("correct horse")).body).toEqual({ error: "rate_limited" });
    // Another IP is not locked out of the account.
    expect((await attempt("correct horse", "10.0.0.8")).status).toBe(200);
    // An unknown id gets the same answer as a wrong password.
    const unknown = await call(API.login, { body: { loginId: "nobody", password: "whatever1" } });
    expect(unknown.body).toEqual({ error: "bad_credentials" });
  });

  it("gives a login id to exactly one of two racing signups", async () => {
    const replies = await Promise.all([
      signup("twin", "first pass", "10.0.1.1"),
      signup("twin", "other pass", "10.0.1.2"),
    ]);
    expect(replies.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(replies.find((r) => r.status === 409)?.body).toEqual({ error: "login_taken" });
  });

  it("gives a character name to exactly one of two racing creators, ignoring case", async () => {
    const a = await signup("racer_a", "correct horse", "10.0.2.1");
    const b = await signup("racer_b", "correct horse", "10.0.2.2");
    const create = (cookie: string | undefined, name: string) =>
      call(API.character, { cookie, body: { name, major: "chemistry", look: LOOK } });
    const replies = await Promise.all([create(a.cookie, "Nova"), create(b.cookie, "NOVA")]);
    expect(replies.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(replies.find((r) => r.status === 409)?.body).toEqual({ error: "name_taken" });
    expect((await call(`${API.nameAvailable}?name=nova`)).body).toEqual({
      available: false,
      reason: "name_taken",
    });
  });

  it("stops honouring a session once it expires", async () => {
    const { cookie } = await signup("expiring");
    expect((await call(API.me, { cookie })).status).toBe(200);
    await db.pool.query("update sessions set expires_at = now() - interval '1 second'");
    expect((await call(API.me, { cookie })).status).toBe(401);
    await auth.sweep();
    expect((await db.pool.query("select 1 from sessions")).rowCount).toBe(0);
  });

  it("accepts a recovery code once", async () => {
    const created = await signup("forgetful");
    const code = String(created.body.recoveryCode).toLowerCase();
    const recover = (newPassword: string) =>
      call(API.recover, { body: { loginId: "forgetful", recoveryCode: code, newPassword } });

    expect((await recover("brand new pass")).body).toEqual({ ok: true });
    // Recovery signs out everywhere.
    expect((await call(API.me, { cookie: created.cookie })).status).toBe(401);
    const login = (password: string) =>
      call(API.login, { body: { loginId: "forgetful", password }, ip: "10.0.3.1" });
    expect((await login("correct horse")).body).toEqual({ error: "bad_credentials" });
    expect((await login("brand new pass")).status).toBe(200);

    expect((await recover("third password")).body).toEqual({ error: "bad_credentials" });
  });
});
