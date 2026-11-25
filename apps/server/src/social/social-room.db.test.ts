/**
 * Social requests through the real WorldRoom with SDK clients holding real sessions: what a
 * blocked player sends never arrives and looks delivered, and a malformed request drops the
 * sender.
 */
import { createServer } from "node:net";
import { ClientState, matchMaker } from "@colyseus/core";
import { Client, type Room } from "@colyseus/sdk";
import {
  API,
  CLUB_FOUND_LEVEL,
  type Done,
  type Refusal,
  type SocialEvent,
  WORLD_MESSAGES,
  WORLD_ROOM,
} from "@guago/shared";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createGameServer } from "../app.ts";
import { createAuthService } from "../auth/service.ts";
import { createDb, type Db } from "../db/index.ts";
import { studentLooks } from "../looks.ts";
import { parties } from "../parties.ts";
import { evictAccount } from "../seats.ts";
import { TEST_DATABASE_URL } from "../test/db-setup.ts";
import { call, cookieHeader, type Jar, remember, waitFor } from "../test/http.ts";
import { worldRoom } from "../world-room.ts";
import { MemoryWallet } from "./fees.ts";
import { createSocial } from "./index.ts";

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

async function player(name: string): Promise<Jar> {
  const jar: Jar = {};
  const n = nextIp++;
  const ip = `10.3.0.${n}`;
  remember(
    jar,
    await call(base, API.signup, {
      body: { loginId: `roomuser${n}`, password: "social pass", ageConfirmed: true },
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
  await call(base, API.character, { jar, body: { name, major: "math", look }, ip });
  return jar;
}

interface Seat {
  room: Room;
  inbox: { type: string; body: unknown }[];
  n: number;
}

async function join(jar: Jar): Promise<Seat> {
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
  await waitFor(() => inbox.some((m) => (m.body as SocialEvent).t === "all"));
  return { room, inbox, n: 0 };
}

/** Sends one request and waits for its one answer. */
async function ask(seat: Seat, type: string, body: Record<string, unknown> = {}) {
  const n = ++seat.n;
  seat.room.send(type, { ...body, n });
  let answer: Done | Refusal | undefined;
  await waitFor(() => {
    const found = seat.inbox.find(
      (m) =>
        (m.type === WORLD_MESSAGES.done || m.type === WORLD_MESSAGES.refused) &&
        (m.body as Done).n === n,
    );
    answer = found?.body as Done | Refusal | undefined;
    return answer !== undefined;
  });
  return answer as Done | Refusal;
}

const codeOf = (a: Done | Refusal) => ("code" in a ? a.code : "ok");
const events = (seat: Seat) =>
  seat.inbox.filter((m) => m.type === WORLD_MESSAGES.social).map((m) => m.body as SocialEvent);

beforeAll(async () => {
  db = createDb(TEST_DATABASE_URL);
  await db.pool.query("truncate accounts, login_failures, clubs, reports cascade");
  parties.reset();
  const auth = createAuthService({ db, onSessionsRevoked: evictAccount });
  const wallet = new MemoryWallet(db, { seed: 10_000_000 });
  const social = createSocial(db, { fees: wallet, jackets: () => ["navy"] });
  server = createGameServer(auth, SETTINGS, studentLooks, { social });
  const port = await freePort();
  await server.listen(port);
  base = `http://127.0.0.1:${port}`;
  await matchMaker.createRoom(WORLD_ROOM, {});
});

afterAll(async () => {
  await server.gracefullyShutdown(false);
  await db.pool.end();
});

describe("a block", () => {
  it("swallows the blocked player's whispers, requests and invites, and they look delivered", async () => {
    const blockerJar = await player("막는이");
    const pestJar = await player("막힌이");
    await db.execute(sql`update characters set level = ${CLUB_FOUND_LEVEL} where name = '막힌이'`);
    const blocker = await join(blockerJar);
    const pest = await join(pestJar);
    expect(codeOf(await ask(blocker, "block.add", { name: "막힌이" }))).toBe("ok");
    blocker.inbox.length = 0;

    // Whisper: the sender gets its own line back, the blocker nothing.
    pest.room.send(WORLD_MESSAGES.chat, { ch: "whisper", to: "막는이", text: "들려?", n: 900 });
    await waitFor(() => pest.inbox.some((m) => m.type === WORLD_MESSAGES.chat));
    // Friend request, party invite and club invite: each answered done.
    expect(codeOf(await ask(pest, "friend.request", { name: "막는이" }))).toBe("ok");
    expect(codeOf(await ask(pest, "party.invite", { name: "막는이" }))).toBe("ok");
    const founded = await ask(pest, "club.create", {
      op: "room-test-club",
      name: "차단부",
      joinRule: "invite",
      jacket: "navy",
      emblem: { shape: "shield", shapeColor: "navy", symbol: "atom", symbolColor: "gold" },
    });
    expect(codeOf(founded)).toBe("ok");
    expect(codeOf(await ask(pest, "club.invite", { name: "막는이" }))).toBe("ok");

    // Nothing reached the blocker.
    await new Promise((r) => setTimeout(r, 300));
    expect(blocker.inbox.filter((m) => m.type === WORLD_MESSAGES.chat)).toEqual([]);
    const seen = events(blocker);
    expect(seen.filter((e) => e.t === "partyInvites" || e.t === "clubInvites")).toEqual([]);
    for (const e of seen) {
      if (e.t === "requests") expect(e.in).toEqual([]);
    }
    // The sender sees its request waiting and its invite out, as for anyone who ignores one.
    const requests = events(pest)
      .filter((e) => e.t === "requests")
      .at(-1);
    expect(requests?.t === "requests" && requests.out.map((r) => r.name)).toEqual(["막는이"]);
    const party = events(pest)
      .filter((e) => e.t === "party")
      .at(-1);
    expect(party?.t === "party" && party.party?.invited.map((i) => i.name)).toEqual(["막는이"]);

    // The blocker cannot whisper the blocked.
    blocker.room.send(WORLD_MESSAGES.chat, { ch: "whisper", to: "막힌이", text: "안녕", n: 901 });
    await waitFor(() => blocker.inbox.some((m) => m.type === WORLD_MESSAGES.refused));
    const refused = blocker.inbox.find((m) => m.type === WORLD_MESSAGES.refused)?.body as Refusal;
    expect(refused.code).toBe("blocked");
    await pest.room.leave();
    await blocker.room.leave();
  });
});

describe("requests", () => {
  it("refuse past the rate limit and drop a sender whose request is malformed", async () => {
    const seat = await join(await player("급한이"));
    const codes = [];
    for (let i = 0; i < 4; i++)
      codes.push(codeOf(await ask(seat, "friend.request", { name: "없는이" })));
    expect(codes).toEqual(["no_player", "no_player", "no_player", "rate_limited"]);
    const closed = new Promise<number>((resolve) => seat.room.onLeave((code) => resolve(code)));
    seat.room.send("party.invite", { n: 99, name: "<script>" });
    expect(await closed).not.toBe(1000);
  });
});
