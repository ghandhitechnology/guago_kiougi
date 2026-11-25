/**
 * The WorldRoom against the real game server: one instance only, and a seat that survives the
 * ways a phone loses its connection.
 */
import { createServer } from "node:net";
import { ClientState, matchMaker } from "@colyseus/core";
import { Client, type Room } from "@colyseus/sdk";
import { API, MAP_ROOM, type PresenceMessage, WORLD_MESSAGES, WORLD_ROOM } from "@guago/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createGameServer } from "./app.ts";
import { createAuthService } from "./auth/service.ts";
import { createDb, type Db } from "./db/index.ts";
import { studentLooks } from "./looks.ts";
import { evictAccount } from "./seats.ts";
import { TEST_DATABASE_URL } from "./test/db-setup.ts";
import { call, cookieHeader, type Jar, remember, waitFor, within } from "./test/http.ts";
import { worldRoom } from "./world-room.ts";

const SETTINGS = {
  clientOrigin: "http://localhost:5173",
  secureCookies: false,
  trustProxy: true,
  serverSecret: "test",
};

let db: Db;
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

async function player(loginId: string): Promise<Jar> {
  const jar: Jar = {};
  const ip = `10.2.0.${nextIp++}`;
  remember(
    jar,
    await call(base, API.signup, {
      body: { loginId, password: "world pass", ageConfirmed: true },
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
  await call(base, API.character, {
    jar,
    body: { name: loginId.slice(0, 8), major: "math", look },
    ip,
  });
  return jar;
}

const sdk = (jar: Jar) => new Client(base, { headers: { cookie: cookieHeader(jar) } });

/** Joins the WorldRoom and waits until the server holds the client as fully joined. */
async function join(jar: Jar): Promise<{ room: Room; inbox: { type: string; body: unknown }[] }> {
  const room = await sdk(jar).joinOrCreate(WORLD_ROOM);
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

const serverClient = (room: Room) =>
  worldRoom()?.clients.find((c) => c.sessionId === room.sessionId);

beforeAll(async () => {
  db = createDb(TEST_DATABASE_URL);
  await db.pool.query("truncate accounts, login_failures cascade");
  const auth = createAuthService({ db, onSessionsRevoked: evictAccount });
  server = createGameServer(auth, SETTINGS, studentLooks);
  const port = await freePort();
  await server.listen(port);
  base = `http://127.0.0.1:${port}`;
  await matchMaker.createRoom(WORLD_ROOM, {});
});

afterAll(async () => {
  await server.gracefullyShutdown(false);
  await db.pool.end();
});

describe("one WorldRoom", () => {
  it("refuses a second instance and does not let clients create rooms", async () => {
    const jar = await player("maker");
    const before = (await matchMaker.query({ name: WORLD_ROOM })).length;
    await expect(matchMaker.createRoom(WORLD_ROOM, {})).rejects.toBeDefined();
    for (const name of [WORLD_ROOM, MAP_ROOM]) {
      const res = await fetch(`${base}/matchmake/create/${name}`, {
        method: "POST",
        headers: { cookie: cookieHeader(jar), "content-type": "application/json" },
        body: "{}",
      });
      expect(res.status).not.toBe(200);
    }
    expect((await matchMaker.query({ name: WORLD_ROOM })).length).toBe(before);
    expect((await matchMaker.query({ name: MAP_ROOM })).length).toBe(0);
  });
});

describe("reconnecting", () => {
  it("keeps the seat when the client reconnects before the server saw the old socket die", async () => {
    const jar = await player("phone");
    const { room } = await join(jar);
    // The old socket is still open on the server, as after a switch from Wi-Fi to mobile data.
    const back = await within(sdk(jar).reconnect(room.reconnectionToken), 5000, "reconnect");
    expect(back.sessionId).toBe(room.sessionId);
    await back.leave();
  });

  it("sends the presence list again and replays the client's last answers", async () => {
    const stays = await join(await player("stays"));
    const drops = await join(await player("drops"));
    const leaves = await join(await player("leaves"));
    await waitFor(() => leaves.inbox.some((m) => m.type === WORLD_MESSAGES.presence));
    const first = leaves.inbox.find((m) => m.type === WORLD_MESSAGES.presence);
    const leavesId = (first?.body as { you: string } | undefined)?.you;
    expect(leavesId).toBeDefined();

    // An answer the client already has, which the replay will repeat.
    drops.room.send(WORLD_MESSAGES.chat, { ch: "near", text: "here?", n: 7 });
    await waitFor(() => drops.inbox.some((m) => m.type === WORLD_MESSAGES.refused));

    // The connection dies; while it is down another player leaves.
    const dead = serverClient(drops.room)?.ref as unknown as { terminate(): void };
    dead.terminate();
    await waitFor(() => serverClient(drops.room) === undefined);
    await leaves.room.leave();
    await waitFor(() => stays.inbox.some((m) => (m.body as PresenceMessage).t === "leave"));

    const again = await within(
      new Client(base).reconnect(drops.room.reconnectionToken),
      5000,
      "reconnect",
    );
    const inbox: { type: string; body: unknown }[] = [];
    again.onMessage("*", (type, body) => inbox.push({ type: String(type), body }));
    await waitFor(() => inbox.length >= 2);

    const all = inbox.find((m) => (m.body as PresenceMessage).t === "all")?.body as Extract<
      PresenceMessage,
      { t: "all" }
    >;
    expect(all).toBeDefined();
    expect(all.list.map((p) => p.id)).not.toContain(leavesId);
    expect(
      inbox.some((m) => m.type === WORLD_MESSAGES.refused && (m.body as { n: number }).n === 7),
    ).toBe(true);
    await again.leave();
    await stays.room.leave();
  });
});
