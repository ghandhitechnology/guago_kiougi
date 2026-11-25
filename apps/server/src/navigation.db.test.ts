/**
 * Doors and channels against the real game server: rooms, API and database in-process, joined
 * by the Colyseus SDK the way a browser joins. Channels hold two players here, so a third
 * opens the next, and an empty one closes a second later.
 */
import { createServer } from "node:net";
import { matchMaker } from "@colyseus/core";
import type { Room } from "@colyseus/sdk";
import { mapById } from "@guago/content";
import {
  API,
  CLOSE_SESSION_REPLACED,
  encodeInput,
  INPUT_MESSAGE,
  MAP_MESSAGES,
  MAP_ROOM,
  MapState,
  MOVE_MAX,
  NULL_SINK,
  POS_SCALE,
  type PresenceMessage,
  SNAP_CELL_TILES,
  SNAPSHOT_MESSAGE,
  SnapshotReader,
  TILE_SIZE,
  type Transfer,
  WORLD_MESSAGES,
  WORLD_ROOM,
} from "@guago/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createGameServer } from "./app.ts";
import { type AuthService, createAuthService } from "./auth/service.ts";
import { channels } from "./channels.ts";
import { createDb, type Db } from "./db/index.ts";
import { studentLooks } from "./looks.ts";
import type { MapRoom } from "./map-room.ts";
import { places } from "./places.ts";
import { evictAccount, provideSeatServices } from "./seats.ts";
import { TEST_DATABASE_URL } from "./test/db-setup.ts";
import { joinMap, sdk } from "./test/enter.ts";
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

/** Holds the next write of a character's place until `open` is called. */
const gate = { armed: false, reached: false, open: () => {} };

async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const { port } = probe.address() as { port: number };
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

/** An account with a character, signed in: its cookie jar and character id. */
async function player(loginId: string): Promise<{ jar: Jar; id: string }> {
  const jar: Jar = {};
  const ip = `10.3.0.${nextIp++}`;
  remember(
    jar,
    await call(base, API.signup, {
      body: { loginId, password: "door pass", ageConfirmed: true },
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

/** The maps whose rooms hold the character's body right now. */
async function whereIs(characterId: string): Promise<string[]> {
  const rooms = await matchMaker.query({ name: MAP_ROOM });
  return rooms.flatMap((r) => {
    const room = matchMaker.getLocalRoomById(r.roomId) as MapRoom | undefined;
    return room?.characterIds.includes(characterId) ? [room.mapId] : [];
  });
}

/** Samples where a character is every millisecond, remembering the most rooms seen at once. */
function watch(characterId: string) {
  const seen = { most: 0, stop: () => {} };
  let running = true;
  const tick = async () => {
    while (running) {
      seen.most = Math.max(seen.most, (await whereIs(characterId)).length);
      await new Promise((r) => setTimeout(r, 1));
    }
  };
  void tick();
  seen.stop = () => {
    running = false;
  };
  return seen;
}

/** Walks the player up until the server sends it through a door. */
function walkUpToDoor(room: Room<unknown, MapState>): Promise<Transfer> {
  let seq = 0;
  const timer = setInterval(
    () => room.send(INPUT_MESSAGE, encodeInput({ seq: ++seq, mx: 0, my: -MOVE_MAX })),
    50,
  );
  return within(
    new Promise<Transfer>((resolve) =>
      room.onMessage(MAP_MESSAGES.transfer, (t: Transfer) => {
        clearInterval(timer);
        resolve(t);
      }),
    ),
    5000,
    "a transfer",
  ).finally(() => clearInterval(timer));
}

const readers = new WeakMap<Room<unknown, MapState>, SnapshotReader>();

/** Reads a room's fight snapshots, where the client's own body comes (its Self record). */
function follow(room: Room<unknown, MapState>): void {
  const reader = new SnapshotReader();
  readers.set(room, reader);
  room.onMessage(SNAPSHOT_MESSAGE, (bytes: Uint8Array) => {
    if (reader.cols === 0) {
      const map = mapById(room.state.map);
      const cell = SNAP_CELL_TILES * TILE_SIZE;
      reader.cols = Math.ceil(((map?.collision.w ?? 0) * TILE_SIZE) / cell);
      reader.rows = Math.ceil(((map?.collision.h ?? 0) * TILE_SIZE) / cell);
    }
    reader.read(bytes, NULL_SINK);
  });
}

/** The client's own body as the server last sent it, once it has. */
function ownBody(room: Room<unknown, MapState>) {
  const reader = readers.get(room);
  return reader?.hasSelf ? reader.me : undefined;
}

async function savedPlace(characterId: string) {
  const r = await db.pool.query("select map_id, x, y from characters where id = $1", [characterId]);
  return r.rows[0] as { map_id: string; x: number; y: number };
}

const closed = (room: Room) =>
  new Promise<number>((resolve) => room.onLeave((code) => resolve(code)));

beforeAll(async () => {
  db = createDb(TEST_DATABASE_URL);
  auth = createAuthService({ db, onSessionsRevoked: evictAccount });
  server = createGameServer(
    auth,
    SETTINGS,
    studentLooks,
    {},
    {},
    { channelSeats: 2, emptyGraceSeconds: 1 },
  );
  provideSeatServices({
    ...SETTINGS,
    auth: {
      ...auth,
      saveCharacterPlace: async (...args: Parameters<AuthService["saveCharacterPlace"]>) => {
        if (gate.armed) {
          gate.armed = false;
          gate.reached = true;
          await new Promise<void>((resolve) => (gate.open = resolve));
        }
        return auth.saveCharacterPlace(...args);
      },
    },
  });
  const port = await freePort();
  await server.listen(port);
  base = `http://127.0.0.1:${port}`;
  await matchMaker.createRoom(WORLD_ROOM, {});
});

afterAll(async () => {
  await server.gracefullyShutdown(false);
  await db.pool.end();
});

beforeEach(async () => {
  gate.armed = false;
  gate.reached = false;
  // Every map room of the last test has closed after its grace.
  await waitFor(async () => (await matchMaker.query({ name: MAP_ROOM })).length === 0, 8000);
  await db.pool.query("truncate accounts, login_failures cascade");
});

describe("walking through a door", () => {
  it("is in one room before and after, never two, and saved on the far side in between", async () => {
    const { jar, id } = await player("walker");
    // The walker holds the WorldRoom beside the map room, as a browser does; a friend online
    // sees their presence move with them.
    const own = await sdk(base, jar).joinOrCreate(WORLD_ROOM);
    const friend = await player("friend");
    const world = await sdk(base, friend.jar).joinOrCreate(WORLD_ROOM);
    const moves: string[] = [];
    world.onMessage(WORLD_MESSAGES.presence, (m: PresenceMessage) => {
      if (m.t === "map" && m.id === id) moves.push(`${m.map}#${m.ch}`);
    });
    const { room, seating } = await joinMap(base, jar);
    room.onMessage("*", () => {});
    expect(seating.map).toBe("campus-yard");
    expect(await whereIs(id)).toEqual(["campus-yard"]);

    const seen = watch(id);
    const transfer = await walkUpToDoor(room);
    expect(transfer).toMatchObject({ map: "gaseolgwan-stairs", channel: 1, via: "gaseol-front" });
    // Between the rooms: written on the far side, its body in neither room.
    expect(await savedPlace(id)).toMatchObject({ map_id: "gaseolgwan-stairs", x: 200, y: 716 });
    expect(await whereIs(id)).toEqual([]);

    const left = closed(room);
    const next = await sdk(base, jar).consumeSeatReservation(transfer.seat, MapState);
    follow(next);
    next.onMessage("*", () => {});
    await room.leave();
    await new Promise((resolve) => next.onStateChange.once(resolve));
    expect(await within(left, 2000, "the old room to close")).toBe(4000);
    await waitFor(() => ownBody(next) !== undefined);
    seen.stop();

    expect(seen.most).toBe(1);
    expect(await whereIs(id)).toEqual(["gaseolgwan-stairs"]);
    const body = ownBody(next);
    expect({
      x: (body?.x ?? 0) / POS_SCALE,
      y: (body?.y ?? 0) / POS_SCALE,
      facing: body?.facing,
    }).toEqual({
      x: 200,
      y: 716,
      facing: 1,
    });
    expect(next.state.map).toBe("gaseolgwan-stairs");
    expect(places.get(id)).toMatchObject({ mapId: "gaseolgwan-stairs", channel: 1 });
    // From the yard straight to the stairs: never on no map in between.
    await waitFor(() => moves.length >= 2);
    expect(moves).toEqual(["campus-yard#1", "gaseolgwan-stairs#1"]);
    await next.leave();
    await world.leave();
    await own.leave();
  });

  it("lands on the far side when the connection drops in the middle of it", async () => {
    const { jar, id } = await player("dropper");
    const { room } = await joinMap(base, jar);
    room.onMessage("*", () => {});
    room.reconnection.enabled = false;
    gate.armed = true;
    let seq = 0;
    const timer = setInterval(
      () => room.send(INPUT_MESSAGE, encodeInput({ seq: ++seq, mx: 0, my: -MOVE_MAX })),
      50,
    );
    await waitFor(() => gate.reached);
    clearInterval(timer);
    // The socket dies while the far side is being written.
    const yard = matchMaker.getLocalRoomById(room.roomId);
    (yard?.clients[0]?.ref as { terminate(): void } | undefined)?.terminate();
    // The page comes back and enters before the write has landed.
    const back = joinMap(base, jar);
    await new Promise((r) => setTimeout(r, 100));
    gate.open();
    const { room: there, seating } = await within(back, 5000, "entering again");
    follow(there);
    there.onMessage("*", () => {});
    expect(seating.map).toBe("gaseolgwan-stairs");
    await waitFor(() => ownBody(there) !== undefined);
    const body = ownBody(there);
    expect([(body?.x ?? 0) / POS_SCALE, (body?.y ?? 0) / POS_SCALE]).toEqual([200, 716]);
    expect(await whereIs(id)).toEqual(["gaseolgwan-stairs"]);
    await there.leave();
  });

  it("does not duplicate when a second page enters while the first walks through", async () => {
    const { jar, id } = await player("racer");
    const { room } = await joinMap(base, jar);
    room.onMessage("*", () => {});
    const seen = watch(id);
    gate.armed = true;
    const moving = walkUpToDoor(room);
    await waitFor(() => gate.reached);
    // A second page of the same session enters while the door's write is held.
    const second = joinMap(base, jar);
    await new Promise((r) => setTimeout(r, 100));
    gate.open();
    const transfer = await moving;
    const { room: other, seating } = await within(second, 5000, "the second page");
    other.onMessage("*", () => {});
    expect(seating.map).toBe("gaseolgwan-stairs");
    const otherEnd = closed(other);
    // The first page takes its seat from the door too: the newer seat wins, the other is told.
    const first = await sdk(base, jar).consumeSeatReservation(transfer.seat, MapState);
    first.onMessage("*", () => {});
    await room.leave();
    expect(await within(otherEnd, 5000, "the older seat to end")).toBe(CLOSE_SESSION_REPLACED);
    // The same seat cannot be taken twice.
    await expect(sdk(base, jar).consumeSeatReservation(transfer.seat)).rejects.toBeDefined();
    await waitFor(async () => (await whereIs(id)).length === 1);
    await new Promise((r) => setTimeout(r, 200));
    seen.stop();
    expect(seen.most).toBe(1);
    expect(await whereIs(id)).toEqual(["gaseolgwan-stairs"]);
    await first.leave();
  });
});

describe("channels", () => {
  it("open the next channel when one is full, fill the lowest first and close when empty", async () => {
    const a = await player("chana");
    const b = await player("chanb");
    const c = await player("chanc");
    const d = await player("chand");
    const ra = await joinMap(base, a.jar);
    const rb = await joinMap(base, b.jar);
    const rc = await joinMap(base, c.jar);
    for (const r of [ra, rb, rc]) r.room.onMessage("*", () => {});
    expect([ra.seating.channel, rb.seating.channel, rc.seating.channel]).toEqual([1, 1, 2]);
    expect(rc.room.state.channel).toBe(2);
    expect(channels.list("campus-yard").map((x) => [x.channel, x.clients])).toEqual([
      [1, 2],
      [2, 1],
    ]);

    // Presence says which channel each player is in.
    const world = await sdk(base, c.jar).joinOrCreate(WORLD_ROOM);
    const all = await new Promise<PresenceMessage>((resolve) =>
      world.onMessage(WORLD_MESSAGES.presence, (m: PresenceMessage) => {
        if (m.t === "all") resolve(m);
      }),
    );
    if (all.t !== "all") throw new Error("no presence list");
    expect(all.list.find((e) => e.id === c.id)).toMatchObject({ map: "campus-yard", ch: 2 });
    await world.leave();

    // A seat frees up in channel 1: the next player goes there, not to channel 2.
    await ra.room.leave();
    await waitFor(() => channels.list("campus-yard")[0]?.clients === 1);
    const rd = await joinMap(base, d.jar);
    rd.room.onMessage("*", () => {});
    expect(rd.seating.channel).toBe(1);

    // Channel 2 empties and closes after its grace; channel 1 stays.
    await rc.room.leave();
    await waitFor(() => channels.list("campus-yard").length === 1, 5000);
    expect(channels.list("campus-yard").map((x) => x.channel)).toEqual([1]);
    await rb.room.leave();
    await rd.room.leave();
  });
});
