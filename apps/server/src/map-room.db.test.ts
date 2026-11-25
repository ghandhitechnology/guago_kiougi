/**
 * The map room against the real game server: rooms, API and database in-process, joined by the
 * Colyseus SDK the way a browser joins.
 */
import { createServer } from "node:net";
import { ClientState, matchMaker } from "@colyseus/core";
import { StateView } from "@colyseus/schema";
import type { Room } from "@colyseus/sdk";
import {
  API,
  type Character,
  encodeInput,
  INPUT_MESSAGE,
  MAP_SEATS,
  MOVE_MAX,
  NEAR_CHAT_TILES,
  OWNER_TAG,
  TILE_SIZE,
  WORLD_MESSAGES,
  WORLD_ROOM,
} from "@guago/shared";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createGameServer } from "./app.ts";
import { type AuthService, createAuthService } from "./auth/service.ts";
import { createDb, type Db } from "./db/index.ts";
import { invariants } from "./invariants.ts";
import { studentLooks } from "./looks.ts";
import { checkMapRooms, type MapRoom } from "./map-room.ts";
import { allRooms } from "./metrics.ts";
import { serveMetrics } from "./metrics-server.ts";
import { places } from "./places.ts";
import { evictAccount } from "./seats.ts";
import { TEST_DATABASE_URL } from "./test/db-setup.ts";
import { sdk as client, joinMap } from "./test/enter.ts";
import { call, type Jar, remember, waitFor, within } from "./test/http.ts";
import { worldRoom } from "./world-room.ts";

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

async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const { port } = probe.address() as { port: number };
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

/** An account with a character, signed in. */
async function player(loginId: string): Promise<{ jar: Jar; character: Character }> {
  const jar: Jar = {};
  const ip = `10.3.0.${nextIp++}`;
  remember(
    jar,
    await call(base, API.signup, {
      body: { loginId, password: "room pass", ageConfirmed: true },
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
  return { jar, character: (made.body as { character: Character }).character };
}

const sdk = (jar: Jar) => client(base, jar);
const joinMapRoom = async (jar: Jar) => (await joinMap(base, jar)).room;

const mapRoom = (room: Room) => matchMaker.getLocalRoomById(room.roomId) as MapRoom;

beforeAll(async () => {
  db = createDb(TEST_DATABASE_URL);
  await db.pool.query("truncate accounts, login_failures cascade");
  auth = createAuthService({ db, onSessionsRevoked: evictAccount });
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

afterEach(() => {
  checkMapRooms();
  expect(invariants.broken.splice(0)).toEqual([]);
});

describe("map room", () => {
  it("frees the body slot and the account seat when a join fails half way", async () => {
    const { jar } = await player("halfway");
    // Someone already in the room keeps it open, so the second try lands in the same one.
    const anchor = await joinMapRoom((await player("anchor")).jar);
    // Fails the join where the owner's fields are given to its view, before the room's own
    // bookkeeping has the player.
    const add = StateView.prototype.add;
    StateView.prototype.add = function (this: StateView, obj, tag, ...rest) {
      if (tag === OWNER_TAG) throw new Error("view refused");
      return add.call(this, obj, tag, ...rest);
    };
    try {
      await expect(joinMapRoom(jar)).rejects.toBeTruthy();
    } finally {
      StateView.prototype.add = add;
    }
    const room = await within(joinMapRoom(jar), 3000, "join again at once");
    expect(room.roomId).toBe(anchor.roomId);
    await waitFor(() => mapRoom(room)?.playerCount === 2);
    const free = [...mapRoom(room).state.players.values()].filter((p) => !p.sid).length;
    expect(free).toBe(MAP_SEATS - 2);
    await Promise.all([room.leave(), anchor.leave()]);
  });

  it("keeps a client whose stalled link delivers hundreds of inputs at once, and counts what overflowed", async () => {
    const { jar } = await player("stalled");
    const room = await joinMapRoom(jar);
    room.reconnection.enabled = false;
    await waitFor(() => mapRoom(room)?.clients[0]?.state === ClientState.JOINED);
    const left = new Promise<number>((resolve) => room.onLeave((code) => resolve(code)));
    for (let seq = 1; seq <= 300; seq++)
      room.send(INPUT_MESSAGE, encodeInput({ seq, mx: MOVE_MAX, my: 0 }));
    const outcome = await Promise.race([
      left,
      new Promise((r) => setTimeout(() => r("open"), 1500)),
    ]);
    expect(outcome).toBe("open");
    const dropped = allRooms().find((r) => r.room === room.roomId)?.inputsDropped ?? 0;
    expect(dropped).toBeGreaterThanOrEqual(280);
    await room.leave();
  });

  it("serves room metrics only on their own loopback port, never on the game port", async () => {
    const onGame = await fetch(`${base}/metrics`);
    expect(onGame.status).toBe(404);
    const metrics = await serveMetrics(0);
    try {
      const address = metrics.address() as { address: string; port: number };
      expect(address.address).toBe("127.0.0.1");
      const res = await fetch(`http://127.0.0.1:${address.port}/metrics`);
      expect(Array.isArray(((await res.json()) as { rooms: unknown }).rooms)).toBe(true);
    } finally {
      await new Promise((resolve) => metrics.close(resolve));
    }
  });

  it("delivers a nearby line to a player eleven tiles away and not to one thirteen tiles away", async () => {
    // An open stretch of the yard: row 5 from tile 33 walks clear for fifteen tiles.
    const x0 = 33 * TILE_SIZE + 8;
    const y = 5 * TILE_SIZE + 8;
    const speaker = await player("speaker");
    const near = await player("nearby");
    const far = await player("faraway");
    const at = (c: Character, tiles: number) =>
      auth.saveCharacterPlace(c.id, "campus-yard", x0 + tiles * TILE_SIZE, y);
    await at(speaker.character, 0);
    await at(near.character, NEAR_CHAT_TILES - 1);
    await at(far.character, NEAR_CHAT_TILES + 1);
    const people = [speaker, near, far];
    const maps = await Promise.all(people.map((p) => joinMapRoom(p.jar)));
    await waitFor(() => people.every((p) => places.get(p.character.id) !== undefined));
    expect(places.get(near.character.id)?.at()).toEqual({ x: x0 + 11 * TILE_SIZE, y });
    const worlds = await Promise.all(people.map((p) => sdk(p.jar).joinOrCreate(WORLD_ROOM)));
    const heard = worlds.map(() => [] as string[]);
    worlds.forEach((w, i) => {
      w.onMessage("*", (type, body) => {
        if (type === WORLD_MESSAGES.chat) heard[i]?.push((body as { text: string }).text);
      });
    });
    await waitFor(() =>
      worlds.every(
        (w) =>
          worldRoom()?.clients.find((c) => c.sessionId === w.sessionId)?.state ===
          ClientState.JOINED,
      ),
    );
    worlds[0]?.send(WORLD_MESSAGES.chat, { ch: "near", text: "여기 누구 있어?", n: 1 });
    await waitFor(() => (heard[1]?.length ?? 0) > 0);
    await new Promise((r) => setTimeout(r, 300));
    expect(heard[1]).toEqual(["여기 누구 있어?"]);
    expect(heard[2]).toEqual([]);
    await Promise.all([...worlds, ...maps].map((r) => r.leave()));
  });
});
