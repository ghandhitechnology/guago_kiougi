/**
 * Item and currency operations on the WorldRoom (PLAN §21), against the real game server: each
 * operation id gets one `result`, the HTTP route answers from the same handler, a malformed
 * message drops the sender, sending too fast is refused, and a level-up reaches the 전체 gate.
 */
import { randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { ClientState, matchMaker } from "@colyseus/core";
import { Client, type Room } from "@colyseus/sdk";
import {
  API,
  bindCost,
  expToNext,
  OP_RATE,
  type OpResult,
  type PresenceMessage,
  WORLD_CHAT_LEVEL,
  WORLD_MESSAGES,
  WORLD_ROOM,
} from "@guago/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createGameServer } from "../app.ts";
import { createAuthService } from "../auth/service.ts";
import { createDb, type Db } from "../db/index.ts";
import { studentLooks } from "../looks.ts";
import { evictAccount } from "../seats.ts";
import { TEST_DATABASE_URL } from "../test/db-setup.ts";
import { call, cookieHeader, type Jar, remember, waitFor } from "../test/http.ts";
import { worldRoom } from "../world-room.ts";
import { checkInvariants } from "./audit.ts";
import { createEconomy, type Economy } from "./index.ts";

const SETTINGS = {
  clientOrigin: "http://localhost:5173",
  secureCookies: false,
  trustProxy: true,
  serverSecret: "test",
};
const SOURCE = {
  kind: "monster",
  fieldId: "test-field",
  monsterId: "odap",
  rank: "normal",
} as const;

let db: Db;
let economy: Economy;
let server: ReturnType<typeof createGameServer>;
let base: string;
let nextIp = 1;

async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const { port } = probe.address() as { port: number };
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

async function player(loginId: string): Promise<{ jar: Jar; id: string }> {
  const jar: Jar = {};
  const ip = `10.3.0.${nextIp++}`;
  remember(
    jar,
    await call(base, API.signup, {
      body: { loginId, password: "item pass", ageConfirmed: true },
      ip,
    }),
  );
  const look = {
    body: "fair",
    hair: "bob",
    hairColor: "black",
    face: "bright",
    uniform: "blazer",
    accessories: [],
  };
  const made = await call(base, API.character, {
    jar,
    body: { name: loginId.slice(0, 8), major: "math", look },
    ip,
  });
  return { jar, id: (made.body.character as { id: string }).id };
}

async function join(jar: Jar): Promise<{ room: Room; inbox: { type: string; body: unknown }[] }> {
  const room = await new Client(base, { headers: { cookie: cookieHeader(jar) } }).joinOrCreate(
    WORLD_ROOM,
  );
  const inbox: { type: string; body: unknown }[] = [];
  room.onMessage("*", (type, body) => inbox.push({ type: String(type), body }));
  room.reconnection.enabled = false;
  await waitFor(
    () =>
      worldRoom()?.clients.find((c) => c.sessionId === room.sessionId)?.state ===
      ClientState.JOINED,
  );
  return { room, inbox };
}

const results = (inbox: { type: string; body: unknown }[]) =>
  inbox.filter((m) => m.type === WORLD_MESSAGES.result).map((m) => m.body as OpResult);

beforeAll(async () => {
  db = createDb(TEST_DATABASE_URL);
  await db.pool.query("truncate accounts, login_failures cascade");
  economy = createEconomy(db, { onLevel: (id, level) => worldRoom()?.setLevel(id, level) });
  const auth = createAuthService({
    db,
    onSessionsRevoked: evictAccount,
    onCharacterCreated: economy.giveKit,
  });
  server = createGameServer(
    auth,
    SETTINGS,
    studentLooks,
    {},
    { ops: economy.ops, routes: economy.routes(auth) },
  );
  const port = await freePort();
  await server.listen(port);
  base = `http://127.0.0.1:${port}`;
  await matchMaker.createRoom(WORLD_ROOM, {});
});

afterAll(async () => {
  expect((await checkInvariants(db)).violations).toEqual([]);
  await server.gracefullyShutdown(false);
  await db.pool.end();
});

describe("operations on the WorldRoom", () => {
  it("answers each operation id with one result, the same over the room and over HTTP", async () => {
    const { jar, id } = await player("crafter");
    const snapshot = await call(base, API.inventory, { jar });
    expect(snapshot.body.items).toHaveLength(2);
    const cost = bindCost("wangdo", 1);
    await economy.executor.execute(id, randomUUID(), "grant", {
      exp: 0,
      drops: [
        { item: { kind: "coin", amount: cost.pinecone ?? 0 }, source: SOURCE },
        { item: { kind: "binding", qty: cost.binding ?? 0 }, source: SOURCE },
        { item: { kind: "page", book: "wangdo", qty: cost["sheet:wangdo"] ?? 0 }, source: SOURCE },
      ],
    });

    const { room, inbox } = await join(jar);
    const opId = randomUUID();
    room.send("craft", { id: opId, req: { def: "wangdo" } });
    await waitFor(() => results(inbox).length === 1);
    room.send("craft", { id: opId, req: { def: "wangdo" } });
    await waitFor(() => results(inbox).length === 2);
    const [first, again] = results(inbox);
    expect(first).toMatchObject({ id: opId, op: "craft", ok: true });
    expect(again).toEqual(first);
    const http = await call(base, API.op, {
      jar,
      body: { id: opId, op: "craft", req: { def: "wangdo" } },
    });
    expect(http.body).toEqual(first);
    expect((await call(base, API.inventory, { jar })).body.items).toHaveLength(3);
    const bad = await call(base, API.op, { jar, body: { id: "short", op: "craft", req: {} } });
    expect(bad.body).toMatchObject({ ok: false, error: "bad_request" });
    await room.leave();
  });

  it("refuses an operation sent too fast and drops a sender whose message does not parse", async () => {
    const { jar } = await player("spammer");
    const { room, inbox } = await join(jar);
    const burst = OP_RATE.pilgi?.burst ?? OP_RATE.default.burst;
    for (let i = 0; i <= burst; i++) {
      room.send("pilgi", { id: randomUUID(), req: { item: randomUUID() } });
    }
    await waitFor(() => results(inbox).length === burst + 1);
    const answers = results(inbox);
    expect(answers.filter((r) => !r.ok && r.error === "item_missing")).toHaveLength(burst);
    expect(answers.find((r) => !r.ok && r.error === "rate_limited")).toMatchObject({
      retryMs: expect.any(Number),
    });

    const left = new Promise<number>((resolve) => room.onLeave((code) => resolve(code)));
    room.send("pilgi", { id: "x", req: {} });
    await left;
    await waitFor(() => !worldRoom()?.clients.some((c) => c.sessionId === room.sessionId));
  });

  it("tells the room about a level-up, which opens 전체 chat", async () => {
    const { jar, id } = await player("climber");
    const { room, inbox } = await join(jar);
    room.send(WORLD_MESSAGES.chat, { ch: "world", text: "안녕", n: 1 });
    await waitFor(() => inbox.some((m) => m.type === WORLD_MESSAGES.refused));
    expect(inbox.find((m) => m.type === WORLD_MESSAGES.refused)?.body).toMatchObject({
      code: "level",
    });

    let exp = 0;
    for (let level = 1; level < WORLD_CHAT_LEVEL; level++) exp += expToNext(level);
    await economy.executor.execute(id, randomUUID(), "grant", { exp, drops: [] });
    await waitFor(() =>
      inbox.some((m) => {
        const p = m.body as PresenceMessage;
        return m.type === WORLD_MESSAGES.presence && p.t === "level" && p.id === id;
      }),
    );

    room.send(WORLD_MESSAGES.chat, { ch: "world", text: "안녕", n: 2 });
    await waitFor(() => inbox.some((m) => m.type === WORLD_MESSAGES.chat));
    await room.leave();
  });
});
