/**
 * The single-seat rule against the real game server: rooms, API and database in-process, joined
 * by the Colyseus SDK the way a browser joins.
 */
import { createServer } from "node:net";
import { ClientState, matchMaker } from "@colyseus/core";
import type { Room, SeatReservation } from "@colyseus/sdk";
import { API, CLOSE_SESSION_REPLACED, MAP_ROOM } from "@guago/shared";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createGameServer } from "./app.ts";
import { type AuthService, createAuthService } from "./auth/service.ts";
import { createDb, type Db } from "./db/index.ts";
import { invariants } from "./invariants.ts";
import { studentLooks } from "./looks.ts";
import { checkMapRooms, type MapRoom } from "./map-room.ts";
import { evictAccount, provideSeatServices } from "./seats.ts";
import { TEST_DATABASE_URL } from "./test/db-setup.ts";
import { enter, joinMap, sdk } from "./test/enter.ts";
import { call, type Jar, remember, waitFor, within } from "./test/http.ts";

const SETTINGS = {
  clientOrigin: "http://localhost:5173",
  secureCookies: false,
  trustProxy: true,
  serverSecret: "test",
};

let db: Db;
let auth: AuthService;
let server: ReturnType<typeof createGameServer>;
let base: string;
let nextIp = 1;

/** Holds the room's next character load until `open` is called. */
const gate = { armedAt: -1, calls: 0, reached: false, open: () => {} };

async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const { port } = probe.address() as { port: number };
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

/** An account with a character, signed in; returns its cookie jar. */
async function player(loginId: string): Promise<Jar> {
  const jar: Jar = {};
  const ip = `10.1.0.${nextIp++}`;
  remember(
    jar,
    await call(base, API.signup, {
      body: { loginId, password: "seat pass", ageConfirmed: true },
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

const loginAgain = (loginId: string) =>
  call(base, API.login, { body: { loginId, password: "seat pass" }, ip: "10.1.9.9" });

async function seated(): Promise<number> {
  const rooms = await matchMaker.query({ name: MAP_ROOM });
  return rooms.reduce(
    (n, r) =>
      n + ((matchMaker.getLocalRoomById(r.roomId) as MapRoom | undefined)?.playerCount ?? 0),
    0,
  );
}

const closed = (room: Room) =>
  new Promise<number>((resolve) => room.onLeave((code) => resolve(code)));

beforeAll(async () => {
  db = createDb(TEST_DATABASE_URL);
  auth = createAuthService({ db, onSessionsRevoked: evictAccount });
  server = createGameServer(auth, SETTINGS, studentLooks);
  // The rooms read through a wrapper whose character loads can be held at the gate.
  provideSeatServices({
    ...SETTINGS,
    auth: {
      ...auth,
      characterOf: async (accountId: string) => {
        gate.calls++;
        if (gate.calls === gate.armedAt) {
          gate.reached = true;
          await new Promise<void>((resolve) => (gate.open = resolve));
        }
        return auth.characterOf(accountId);
      },
    },
  });
  const port = await freePort();
  await server.listen(port);
  base = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await server.gracefullyShutdown(false);
  await db.pool.end();
});

afterEach(() => {
  checkMapRooms();
  expect(invariants.broken.splice(0)).toEqual([]);
});

beforeEach(async () => {
  await waitFor(async () => (await seated()) === 0);
  await db.pool.query("truncate accounts, login_failures cascade");
});

describe("one seat per account", () => {
  it("evicts a player who reconnected, so a new login joins at once", async () => {
    const jar = await player("blip");
    const { room } = await joinMap(base, jar);
    room.reconnection.minUptime = 0;
    // Fully joined (the client acknowledged): only then does the server hold a dropped seat.
    const joined = matchMaker.getLocalRoomById(room.roomId);
    await waitFor(() => joined?.clients[0]?.state === ClientState.JOINED);
    const back = new Promise<void>((resolve) => room.onReconnect(() => resolve()));
    // A network drop: the server sees the socket die, holds the seat, the SDK comes back.
    const dropped = matchMaker.getLocalRoomById(room.roomId)?.clients[0]?.ref as
      | { terminate(): void }
      | undefined;
    dropped?.terminate();
    await within(back, 5000, "reconnect");

    const kicked = closed(room);
    const fresh: Jar = {};
    remember(fresh, await loginAgain("blip"));
    expect(await within(kicked, 2000, "eviction of the reconnected seat")).toBe(
      CLOSE_SESSION_REPLACED,
    );

    const started = Date.now();
    const { room: next } = await joinMap(base, fresh);
    expect(Date.now() - started).toBeLessThan(2000);
    expect(await seated()).toBe(1);
    await next.leave();
  });

  it("evicts a player still joining when the account logs in elsewhere", async () => {
    const jar = await player("joiner");
    const { seating } = await enter(base, jar);
    if (!seating) throw new Error("no seat");
    // Character loads: the room's own load is the next call.
    gate.calls = 0;
    gate.armedAt = 1;
    gate.reached = false;
    const joining = sdk(base, jar)
      .consumeSeatReservation(seating.seat)
      .then(
        (room) => closed(room).then((code) => `closed ${code}`),
        () => "refused",
      );
    await waitFor(() => gate.reached);
    await loginAgain("joiner");
    gate.open();
    gate.armedAt = -1;
    expect(await within(joining, 5000, "the joining seat to end")).toMatch(
      new RegExp(`refused|closed ${CLOSE_SESSION_REPLACED}`),
    );
    await waitFor(async () => (await seated()) === 0);
  });

  it("voids a seat reserved before the session was logged out", async () => {
    const jar = await player("stale");
    const { status, seating } = await enter(base, jar);
    expect(status).toBe(200);
    const reservation = seating?.seat as SeatReservation;
    await call(base, API.logout, { jar, body: {} });
    await expect(sdk(base, {}).consumeSeatReservation(reservation)).rejects.toBeDefined();
    expect(await seated()).toBe(0);
  });
});
