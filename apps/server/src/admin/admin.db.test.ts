/**
 * Moderation against the real game server and Postgres (PLAN §26): what would cost players
 * something if it regressed. A banned account gets in by no path; a grant is ledgered once
 * however often it is retried; an audit row is written with its action or not at all; the admin
 * API refuses without a session and is not served on the game port at all.
 */
import { request } from "node:http";
import { createServer, type Server } from "node:net";
import { matchMaker } from "@colyseus/core";
import { Client, type Room } from "@colyseus/sdk";
import { API, CLOSE_BANNED, WORLD_MESSAGES, WORLD_ROOM } from "@guago/shared";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createGameServer } from "../app.ts";
import { type AuthService, createAuthService } from "../auth/service.ts";
import { createDb, type Db } from "../db/index.ts";
import { checkInvariants } from "../economy/audit.ts";
import { createEconomy } from "../economy/index.ts";
import { provideLive } from "../live/current.ts";
import type { Live } from "../live/index.ts";
import { studentLooks } from "../looks.ts";
import { evictAccount } from "../seats.ts";
import { executorFees } from "../social/fees.ts";
import { createSocial } from "../social/index.ts";
import { TEST_DATABASE_URL } from "../test/db-setup.ts";
import { joinMap } from "../test/enter.ts";
import { call, cookieHeader, type Jar, remember, waitFor, within } from "../test/http.ts";
import { createModerationStack, type ModerationStack } from "./index.ts";

const SETTINGS = {
  clientOrigin: "http://localhost:5173",
  secureCookies: false,
  trustProxy: true,
  serverSecret: "test",
};

let db: Db;
let auth: AuthService;
let stack: ModerationStack;
let server: ReturnType<typeof createGameServer>;
let adminServer: { close(cb: () => void): void };
let base: string;
let admin: string;
let nextIp = 1;

async function freePort(): Promise<number> {
  const probe: Server = createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const { port } = probe.address() as { port: number };
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

const LOOK = {
  body: "fair",
  hair: "bob",
  hairColor: "black",
  face: "bright",
  uniform: "blazer",
  accessories: [],
};

/** A signed-in player with a character: its jar, account id, character id and IP. */
async function player(loginId: string) {
  const jar: Jar = {};
  const ip = `10.2.0.${nextIp++}`;
  remember(
    jar,
    await call(base, API.signup, {
      body: { loginId, password: "ban test pass", ageConfirmed: true },
      ip,
    }),
  );
  const made = await call(base, API.character, {
    jar,
    body: { name: loginId.slice(0, 8), major: "math", look: LOOK },
    ip,
  });
  const me = await call(base, API.me, { jar, ip });
  return {
    jar,
    ip,
    accountId: (me.body.account as { id: string }).id,
    characterId: (made.body.character as { id: string }).id,
  };
}

const sdk = (jar: Jar) => new Client(base, { headers: { cookie: cookieHeader(jar) } });
const closed = (room: Room) =>
  new Promise<number>((resolve) => room.onLeave((code) => resolve(code)));

/** A signed-in admin session against the admin port. */
async function adminSession(loginId: string, password: string) {
  let cookie = "";
  let csrf = "";
  const origin = admin;
  const send = async (path: string, body?: unknown, extra: Record<string, string> = {}) => {
    const res = await fetch(`${admin}/admin/api${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        origin,
        cookie,
        "x-csrf-token": csrf,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...extra,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const set = res.headers.getSetCookie()[0];
    if (set) cookie = set.split(";")[0] ?? "";
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  };
  const login = await send("/login", { loginId, password });
  expect(login.status).toBe(200);
  csrf = login.body.csrf as string;
  return { send, cookie: () => cookie, csrf: () => csrf };
}

let owner: Awaited<ReturnType<typeof adminSession>>;

beforeAll(async () => {
  db = createDb(TEST_DATABASE_URL);
  const economy = createEconomy(db);
  const social = createSocial(db, {
    fees: executorFees(db, economy.executor),
    jackets: () => ["navy"],
  });
  stack = await createModerationStack({
    db,
    executor: economy.executor,
    secret: "test",
    clubs: { vacate: (id, on) => social.vacate(id, on), announce: social.announce },
  });
  auth = createAuthService({ db, gate: stack.moderation.gate, onSessionsRevoked: evictAccount });
  server = createGameServer(
    auth,
    SETTINGS,
    studentLooks,
    { filter: stack.filter, social },
    { ops: economy.ops, routes: economy.routes(auth) },
  );
  const port = await freePort();
  await server.listen(port);
  base = `http://127.0.0.1:${port}`;
  await matchMaker.createRoom(WORLD_ROOM, {});
  const adminPort = await freePort();
  admin = `http://127.0.0.1:${adminPort}`;
  adminServer = await stack.listen({ host: "127.0.0.1", port: adminPort, origin: admin });
  await stack.auth.create("owner_test", "owner test password", "owner");
  owner = await adminSession("owner_test", "owner test password");
});

afterAll(async () => {
  await new Promise<void>((resolve) => adminServer.close(() => resolve()));
  await server.gracefullyShutdown(false);
  await db.pool.end();
});

describe("a ban", () => {
  it("closes live seats and holds against login, the old cookie, a second tab and the reconnection", async () => {
    const p = await player("banned1");
    const world = await sdk(p.jar).joinOrCreate(WORLD_ROOM);
    world.reconnection.enabled = false;
    const { room: map } = await joinMap(base, p.jar);
    const mapClosed = closed(map);
    const token = world.reconnectionToken;
    const roomId = world.roomId;
    await waitFor(() => (matchMaker.getLocalRoomById(roomId)?.clients.length ?? 0) === 1);

    // The link drops: the server holds the seat for the 30-second reconnection.
    const live = matchMaker.getLocalRoomById(roomId)?.clients[0]?.ref as unknown as {
      terminate(): void;
    };
    live.terminate();
    await waitFor(() => matchMaker.getLocalRoomById(roomId)?.clients.length === 0);

    const banned = await owner.send(`/players/${p.accountId}/ban`, {
      reason: "욕설 반복",
      minutes: null,
      ip: true,
    });
    expect(banned.status).toBe(200);
    expect(await within(mapClosed, 3000, "the map seat to close")).toBe(CLOSE_BANNED);

    await expect(sdk(p.jar).reconnect(token)).rejects.toBeDefined();
    await expect(sdk(p.jar).joinOrCreate(WORLD_ROOM)).rejects.toBeDefined();
    expect((await call(base, API.me, { jar: p.jar, ip: p.ip })).status).toBe(401);
    expect((await call(base, API.inventory, { jar: p.jar, ip: p.ip })).status).toBe(401);
    const login = await call(base, API.login, {
      body: { loginId: "banned1", password: "ban test pass" },
      ip: "10.2.9.1",
    });
    expect(login.body.error).toBe("account_banned");
    // The IP hashes it came from take no new accounts or logins.
    const fresh = await call(base, API.signup, {
      body: { loginId: "banned1alt", password: "ban test pass", ageConfirmed: true },
      ip: p.ip,
    });
    expect(fresh.body.error).toBe("account_banned");

    expect(
      (await owner.send(`/players/${p.accountId}/unban`, { reason: "소명 확인" })).status,
    ).toBe(200);
    const back = await call(base, API.login, {
      body: { loginId: "banned1", password: "ban test pass" },
      ip: "10.2.9.1",
    });
    expect(back.status).toBe(200);
  });

  it("ends by itself at its end time", async () => {
    const p = await player("banned2");
    await owner.send(`/players/${p.accountId}/ban`, { reason: "도배", minutes: 60, ip: false });
    await db.execute(sql`
      update account_bans set starts_at = now() - interval '2 hours', ends_at = now() - interval '1 hour'
      where account_id = ${p.accountId}`);
    await stack.sweep();
    const login = await call(base, API.login, {
      body: { loginId: "banned2", password: "ban test pass" },
      ip: "10.2.9.2",
    });
    expect(login.status).toBe(200);
  });
});

describe("a grant", () => {
  const ledgerRows = async (characterId: string) => {
    const { rows } = await db.execute(sql`
      select currency, amount::text as amount from economy_ledger
      where character_id = ${characterId} and source_or_sink like 'admin.%' order by currency`);
    return rows;
  };
  const auditRows = async (opId: string) => {
    const { rows } = await db.execute(
      sql`select id from admin_actions where action = 'grant' and op_id like ${`%:${opId}`}`,
    );
    return rows.length;
  };

  it("is ledgered once however it is retried", async () => {
    const p = await player("granted1");
    const opId = "grant-retry-0001";
    const body = {
      opId,
      reason: "버그 보상",
      amounts: { pinecone: 5000, ink: 3 },
      add: ["compass"],
      remove: [],
    };
    const first = await owner.send(`/players/${p.accountId}/grant`, body);
    expect(first.status).toBe(200);
    const again = await Promise.all([
      owner.send(`/players/${p.accountId}/grant`, body),
      owner.send(`/players/${p.accountId}/grant`, body),
    ]);
    for (const r of again) expect(r.body.replayed).toBe(true);
    // After the executor forgets the id, the audit row still holds it.
    await db.execute(sql`delete from operations where op_id like 'admin:%'`);
    expect((await owner.send(`/players/${p.accountId}/grant`, body)).body.replayed).toBe(true);

    expect(await ledgerRows(p.characterId)).toEqual([
      { currency: "ink", amount: "3" },
      { currency: "item:compass", amount: "1" },
      { currency: "pinecone", amount: "5000" },
    ]);
    expect(await auditRows(opId)).toBe(1);
    expect(
      (await checkInvariants(db)).violations.filter((v) => v.check !== "ledger_has_operation"),
    ).toEqual([]);
  });

  it("concurrent first sends apply once", async () => {
    const p = await player("granted2");
    const body = { opId: "grant-race-0001", reason: "이벤트", amounts: { token: 7 } };
    const all = await Promise.all(
      Array.from({ length: 4 }, () => owner.send(`/players/${p.accountId}/grant`, body)),
    );
    expect(all.every((r) => r.status === 200)).toBe(true);
    expect(await ledgerRows(p.characterId)).toEqual([{ currency: "token", amount: "7" }]);
    expect(await auditRows("grant-race-0001")).toBe(1);
  });

  it("refused, writes nothing", async () => {
    const p = await player("granted3");
    const out = await owner.send(`/players/${p.accountId}/grant`, {
      opId: "grant-short-0001",
      reason: "회수",
      amounts: { pinecone: -1 },
    });
    expect(out.body.error).toBe("insufficient");
    expect(await ledgerRows(p.characterId)).toEqual([]);
    expect(await auditRows("grant-short-0001")).toBe(0);
  });

  it("is refused to a moderator", async () => {
    const p = await player("granted4");
    await stack.auth.create("mod_test", "moderator test password", "moderator");
    const mod = await adminSession("mod_test", "moderator test password");
    const out = await mod.send(`/players/${p.accountId}/grant`, {
      opId: "grant-mod-0001",
      reason: "x",
      amounts: { pinecone: 1 },
    });
    expect(out.status).toBe(403);
    expect(await ledgerRows(p.characterId)).toEqual([]);
  });
});

describe("the audit log", () => {
  const count = async (action: string, t: string) => {
    const { rows } = await db.execute(
      sql`select count(*)::int as n from admin_actions where action = ${action} and target = ${t}`,
    );
    return rows[0]?.n as number;
  };

  it("is written with its action or not at all", async () => {
    const p = await player("audited1");
    // The ban's own write fails inside the transaction: no ban, no row, sessions intact.
    await db.execute(sql`
      create function fail_ban() returns trigger language plpgsql as $$
      begin raise exception 'injected'; end $$`);
    await db.execute(
      sql`create trigger fail_ban before insert on account_bans for each row execute function fail_ban()`,
    );
    try {
      const out = await owner.send(`/players/${p.accountId}/ban`, { reason: "x", minutes: null });
      expect(out.status).toBe(500);
    } finally {
      await db.execute(sql`drop trigger fail_ban on account_bans`);
      await db.execute(sql`drop function fail_ban()`);
    }
    expect(await count("ban", `account:${p.accountId}`)).toBe(0);
    expect((await call(base, API.me, { jar: p.jar, ip: p.ip })).status).toBe(200);

    // A strike lands once with one row and one 벌점 call; a second strike of the line adds neither.
    const struck: string[] = [];
    provideLive({
      events: { chatStrike: async (id: string) => void struck.push(id) },
    } as unknown as Live);
    await db.execute(sql`
      insert into chat_log (channel, sender_id, target, body, masked, at)
      values ('world', ${p.characterId}, null, '시발 진짜', true, now())`);
    const { rows } = await db.execute(
      sql`select id, at from chat_log where sender_id = ${p.characterId}`,
    );
    const line = { id: Number(rows[0]?.id), at: new Date(rows[0]?.at as string).toISOString() };
    expect((await owner.send("/chat/strike", { ...line, reason: "욕설" })).status).toBe(200);
    expect((await owner.send("/chat/strike", { ...line, reason: "욕설" })).body.error).toBe(
      "already_struck",
    );
    provideLive(undefined);
    expect(struck).toEqual([p.characterId]);
    expect(await count("strike", `character:${p.characterId}`)).toBe(1);
  });

  it("refuses every change and removal", async () => {
    await expect(db.execute(sql`update admin_actions set reason = 'x'`)).rejects.toThrow();
    await expect(db.execute(sql`delete from admin_actions`)).rejects.toThrow();
    await expect(db.execute(sql`truncate admin_actions`)).rejects.toThrow();
  });
});

describe("the admin API", () => {
  it("is not served on the game port", async () => {
    for (const path of ["/admin/api/me", "/admin/api/players", "/admin/"]) {
      expect((await fetch(`${base}${path}`)).status).toBe(404);
    }
    const login = await fetch(`${base}/admin/api/login`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: admin },
      body: JSON.stringify({ loginId: "owner_test", password: "owner test password" }),
    });
    expect(login.status).toBe(404);
  });

  it("refuses without a session, a CSRF token, its origin or its host", async () => {
    const get = (headers: Record<string, string>) =>
      fetch(`${admin}/admin/api/players`, { headers }).then((r) => r.status);
    expect(await get({})).toBe(401);
    // A player's game session is no admin session.
    const p = await player("plainuser");
    expect(await get({ cookie: cookieHeader(p.jar) })).toBe(401);
    expect(await get({ cookie: owner.cookie() })).toBe(403);
    expect(await get({ cookie: owner.cookie(), "x-csrf-token": owner.csrf() })).toBe(200);
    expect(
      await get({
        cookie: owner.cookie(),
        "x-csrf-token": owner.csrf(),
        origin: "http://localhost:5173",
      }),
    ).toBe(403);
    expect(
      await get({
        cookie: owner.cookie(),
        "x-csrf-token": owner.csrf(),
        "sec-fetch-site": "same-site",
      }),
    ).toBe(403);
    // A page on another name that resolves here (DNS rebinding) gets nothing.
    const rebound = await new Promise<number>((resolve, reject) => {
      const url = new URL(`${admin}/admin/api/players`);
      request(
        {
          host: url.hostname,
          port: url.port,
          path: url.pathname,
          headers: { host: "evil.example" },
        },
        (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        },
      )
        .on("error", reject)
        .end();
    });
    expect(rebound).toBe(421);
    const post = await fetch(`${admin}/admin/api/broadcast`, {
      method: "POST",
      headers: {
        cookie: owner.cookie(),
        "x-csrf-token": owner.csrf(),
        "content-type": "application/json",
      },
      body: JSON.stringify({ text: "점검 안내" }),
    });
    // No Origin on a state change: refused.
    expect(post.status).toBe(403);
  });
});

/** Sends one world request and waits for its one answer: `done` data or the refusal code. */
async function ask(room: Room, type: string, req: Record<string, unknown>) {
  const n = Math.floor(Math.random() * 1e9);
  return within(
    new Promise<string>((resolve) => {
      room.onMessage(WORLD_MESSAGES.refused, (r: { n?: number; code: string }) => {
        if (r.n === n) resolve(r.code);
      });
      room.onMessage(WORLD_MESSAGES.done, (r: { n?: number }) => {
        if (r.n === n) resolve("done");
      });
      room.onMessage(WORLD_MESSAGES.chat, (r: { n?: number }) => {
        if (r.n === n) resolve("sent");
      });
      room.send(type, { ...req, n });
    }),
    5000,
    type,
  );
}

const quiet = (room: Room) => {
  for (const t of [WORLD_MESSAGES.presence, WORLD_MESSAGES.system, "social", "live", "change"]) {
    room.onMessage(t, () => {});
  }
};

describe("a mute", () => {
  const EMBLEM = { shape: "shield", shapeColor: "navy", symbol: "atom", symbolColor: "gold" };

  it("holds on every text other players see, from an admin or the filter", async () => {
    const p = await player("muted1");
    const other = await player("muted1b");
    const room = await sdk(p.jar).joinOrCreate(WORLD_ROOM);
    const otherRoom = await sdk(other.jar).joinOrCreate(WORLD_ROOM);
    quiet(room);
    quiet(otherRoom);
    otherRoom.onMessage(WORLD_MESSAGES.chat, () => {});
    const texts: [string, Record<string, unknown>][] = [
      ["board.post", { cat: "chat", text: "골드 싸게 팝니다" }],
      ["board.pin", { text: "공지 아님" }],
      ["club.notice", { text: "공지" }],
      [
        "club.create",
        { op: "found-0001", name: "도배동아리", joinRule: "open", jacket: "navy", emblem: EMBLEM },
      ],
    ];

    await owner.send(`/players/${p.accountId}/mute`, { reason: "도배", minutes: 60 });
    for (const [type, req] of texts)
      expect([type, await ask(room, type, req)]).toEqual([type, "muted"]);
    await owner.send(`/players/${p.accountId}/unmute`, { reason: "해제" });
    expect(await ask(room, "board.post", texts[0]?.[1] ?? {})).toBe("done");

    // Two masked lines within ten minutes: the filter's own mute covers the same paths.
    const swear = { ch: "whisper", to: "muted1b", text: "시발 진짜" };
    expect(await ask(room, WORLD_MESSAGES.chat, swear)).toBe("sent");
    expect(await ask(room, WORLD_MESSAGES.chat, swear)).toBe("sent");
    expect(await ask(room, "board.post", { cat: "trade", text: "또 팝니다" })).toBe("muted");
    expect(await ask(room, "club.notice", { text: "공지" })).toBe("muted");
    await room.leave();
    await otherRoom.leave();
  });

  it("leaves a post an admin can read and take down, audited", async () => {
    const p = await player("poster1");
    const room = await sdk(p.jar).joinOrCreate(WORLD_ROOM);
    quiet(room);
    expect(await ask(room, "board.post", { cat: "chat", text: "현질 하실 분 연락" })).toBe("done");
    const listed = await owner.send("/posts");
    const post = (listed.body.board as { id: number; body: string }[]).find(
      (b) => b.body === "현질 하실 분 연락",
    );
    expect(post).toBeDefined();
    expect(
      (await owner.send(`/posts/board/${post?.id}/remove`, { reason: "현금 거래" })).status,
    ).toBe(200);
    const left = await db.execute(sql`select 1 from board_posts where id = ${post?.id}`);
    expect(left.rows).toEqual([]);
    const audit = await db.execute(
      sql`select detail from admin_actions where action = 'post.remove' and target = ${`character:${p.characterId}`}`,
    );
    expect(audit.rows[0]?.detail).toMatchObject({ body: "현질 하실 분 연락" });
    await room.leave();
  });
});
