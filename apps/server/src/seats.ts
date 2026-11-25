/**
 * Who sits in a room: session-cookie auth at matchmaking, one live seat per account across every
 * room (PLAN §19 single session), and the character's place loaded on join and written back
 * every 30 seconds when it moved and on leave (PLAN §19 persistence).
 */
import { type AuthContext, type Client, ClientState, Deferred, ServerError } from "@colyseus/core";
import { type Character, CLOSE_SESSION_REPLACED } from "@guago/shared";
import { sessionTokenHash } from "./auth/crypto.ts";
import { readCookie, sessionCookieName } from "./auth/http.ts";
import type { AuthService } from "./auth/service.ts";
import { describeError } from "./db/index.ts";

export const SAVE_INTERVAL_MS = 30_000;

export interface RoomAuth {
  accountId: string;
  characterId: string;
  /** Re-checked when the socket arrives: a logout in between voids the reservation. */
  tokenHash: string;
}

interface Services {
  auth: AuthService;
  clientOrigin: string;
  secureCookies: boolean;
  /**
   * Runs when a character leaves a room, before its seat is freed: pending grants land.
   * `replaced` is true when a newer session of the account already holds this slot.
   */
  onLeave?: (
    characterId: string,
    slot: SeatSlot,
    sessionId: string,
    replaced: boolean,
  ) => Promise<void>;
  /** Runs once a character holds its seat (the living world starts its session on the world seat). */
  onJoin?: (character: Character, slot: SeatSlot, sessionId: string) => Promise<void>;
}

let services: Services | undefined;

/** Called once at server start, before any room is created. */
export function provideSeatServices(s: Services): void {
  services = s;
}

function use(): Services {
  if (!services) throw new Error("seat services were not provided");
  return services;
}

/** Static `onAuth` body: the matchmaking request must carry a live session with a character. */
export async function authenticateJoin(ctx: AuthContext): Promise<RoomAuth> {
  const { auth, clientOrigin, secureCookies } = use();
  const origin = ctx.headers.get("origin");
  if (origin && origin !== clientOrigin) throw new ServerError(403, "forbidden");
  const token = readCookie(ctx.headers.get("cookie"), sessionCookieName(secureCookies));
  if (!token || token.length > 128) throw new ServerError(401, "unauthorized");
  const tokenHash = sessionTokenHash(token);
  const me = await auth.authenticateHash(tokenHash);
  if (!me) throw new ServerError(401, "unauthorized");
  const character = await auth.characterOf(me.account.id);
  if (!character) throw new ServerError(403, "no_character");
  return { accountId: me.account.id, characterId: character.id, tokenHash };
}

/** Writes of a character's new place after a door, in flight, by character id. */
const moves = new Map<string, Promise<unknown>>();

/**
 * The character as saved, read only after any walk through a door it is making has been
 * written, so an entry right after a drop mid-transfer lands on the far side of the door.
 */
export async function characterAfterMoves(
  accountId: string,
  characterId: string,
): Promise<Character | null> {
  await moves.get(characterId)?.catch(() => {});
  return use().auth.characterOf(accountId);
}

/** Development entries only (`ALLOW_MAP_OPTION`): puts the character on a map it chose. */
export function placeCharacter(characterId: string, mapId: string, x: number, y: number) {
  return use().auth.saveCharacterPlace(characterId, mapId, x, y);
}

// One seat per account and slot, across rooms ------------------------------------------------

/** A client holds one map seat and one world seat at a time (PLAN §19 runtime topology). */
export type SeatSlot = "map" | "world";

interface Live {
  evict: (code?: number) => void;
  released: Promise<void>;
  tokenHash: string;
}

const live = new Map<string, Map<SeatSlot, Live>>();

/**
 * Closes every seat of the account, after a new login, a logout or a recovery, or with
 * moderation's own close code (`CLOSE_KICKED`, `CLOSE_BANNED`) so the client can tell them apart.
 */
export function evictAccount(accountId: string, code: number = CLOSE_SESSION_REPLACED): void {
  for (const seat of live.get(accountId)?.values() ?? []) seat.evict(code);
}

/** Whether the account holds any seat in this process. */
export function isSeated(accountId: string): boolean {
  return live.has(accountId);
}

const EVICT_WAIT_MS = 5000;

/**
 * Takes the account's seat in `slot`, closing the one there before it. A seat held by another
 * session in any slot is closed too, so a second login never shares the account with the first.
 */
async function claim(
  accountId: string,
  slot: SeatSlot,
  tokenHash: string,
  evict: (code?: number) => void,
): Promise<{ release: () => void; current: () => boolean }> {
  let release!: () => void;
  const mine: Live = { evict, released: new Promise((r) => (release = r)), tokenHash };
  const seats = live.get(accountId) ?? new Map<SeatSlot, Live>();
  live.set(accountId, seats);
  const previous = [...seats].filter(([s, l]) => s === slot || l.tokenHash !== tokenHash);
  seats.set(slot, mine);
  for (const [, seat] of previous) seat.evict();
  if (previous.length > 0) {
    // The old seat saves its place on the way out; load only after that write lands.
    await Promise.race([
      Promise.all(previous.map(([, seat]) => seat.released)),
      new Promise((r) => setTimeout(r, EVICT_WAIT_MS)),
    ]);
  }
  const mySeats = seats;
  return {
    release: () => {
      if (mySeats.get(slot) === mine) mySeats.delete(slot);
      if (mySeats.size === 0 && live.get(accountId) === mySeats) live.delete(accountId);
      release();
    },
    current: () => live.get(accountId)?.get(slot) === mine,
  };
}

// Seats inside one room ----------------------------------------------------------------------

/** What `allowReconnection` returns: a Deferred, or a plain rejected promise when refused. */
type Reconnection = Deferred | Promise<unknown>;

interface Seat {
  /** The live connection; replaced when the player reconnects. */
  client: Client;
  characterId: string;
  saved: { x: number; y: number };
  evicted: boolean;
  /** Walking out to another map: its place is written there, never here again. */
  moving: boolean;
  /** The last write of its place; writes run one after another, never two at once. */
  writes: Promise<void>;
  /** The code the seat was closed with once evicted. */
  closeCode: number;
  release: () => void;
  /** False once a newer session of the account holds the slot. */
  current: () => boolean;
  reconnection?: Reconnection | undefined;
}

export interface Place {
  x: number;
  y: number;
}

/**
 * Per-room bookkeeping. `place` reads a session's current position from room state; the room
 * calls `join`, `mayReconnect`/`hold`, `reconnected` and `leave` from its lifecycle hooks.
 */
export class RoomSeats {
  private seats = new Map<string, Seat>();

  private mapId: string;
  private place: (sessionId: string) => Place | undefined;
  private slot: SeatSlot;

  /** The WorldRoom passes no map and a `place` that finds nothing, so it never saves. */
  constructor(
    mapId: string,
    place: (sessionId: string) => Place | undefined,
    slot: SeatSlot = "map",
  ) {
    this.mapId = mapId;
    this.place = place;
    this.slot = slot;
  }

  /** Takes the account's seat (closing an older one) and loads the character fresh. */
  async join(client: Client): Promise<Character> {
    const { accountId, characterId, tokenHash } = client.auth as RoomAuth;
    const seat: Seat = {
      client,
      characterId: "",
      saved: { x: 0, y: 0 },
      evicted: false,
      moving: false,
      writes: Promise.resolve(),
      closeCode: CLOSE_SESSION_REPLACED,
      release: () => {},
      current: () => true,
    };
    ({ release: seat.release, current: seat.current } = await claim(
      accountId,
      this.slot,
      tokenHash,
      (code) => this.evict(seat, code),
    ));
    try {
      const { auth } = use();
      // The session was checked at matchmaking; a logout or recovery since then voids the seat.
      const me = await auth.authenticateHash(tokenHash);
      if (me?.account.id !== accountId) throw new ServerError(401, "unauthorized");
      // A door this character is walking through, written meanwhile, decides where it stands.
      const character = await characterAfterMoves(accountId, characterId);
      if (!character) throw new ServerError(403, "no_character");
      // A newer session may have taken the account while this one was loading.
      if (seat.evicted) throw new ServerError(409, "session_replaced");
      const here = character.mapId === this.mapId;
      seat.characterId = character.id;
      seat.saved = here ? { x: character.x, y: character.y } : { x: -1, y: -1 };
      this.seats.set(client.sessionId, seat);
      await use()
        .onJoin?.(character, this.slot, client.sessionId)
        .catch((error) => console.error(`join hook failed: ${describeError(error)}`));
      return character;
    } catch (error) {
      seat.release();
      throw error;
    }
  }

  /**
   * False once the seat was taken by a newer session, or while it walks out to another map:
   * there is nothing to come back to here.
   */
  mayReconnect(client: Client): boolean {
    const seat = this.seats.get(client.sessionId);
    return seat !== undefined && !seat.evicted && !seat.moving;
  }

  hold(client: Client, reconnection: Reconnection): void {
    reconnection.catch(() => {});
    const seat = this.seats.get(client.sessionId);
    if (seat) seat.reconnection = reconnection;
  }

  /** `client` is the new connection; the dropped one stays behind, marked reconnected. */
  reconnected(client: Client): void {
    const seat = this.seats.get(client.sessionId);
    if (!seat) return;
    delete seat.reconnection;
    seat.client = client;
    // Taken by a newer session while the socket was coming back.
    if (seat.evicted) client.leave(seat.closeCode);
  }

  /** Writes the place back and frees the account's seat. Call before removing the player. */
  async leave(client: Client): Promise<void> {
    const seat = this.seats.get(client.sessionId);
    if (!seat) return;
    this.seats.delete(client.sessionId);
    try {
      await this.save(client.sessionId, seat);
      await use()
        .onLeave?.(seat.characterId, this.slot, client.sessionId, !seat.current())
        .catch((error) => console.error(`leave hook failed: ${describeError(error)}`));
    } finally {
      seat.release();
    }
  }

  /**
   * Moves the seat's character to (x, y) on another map, for a walk through a door. The place is
   * written there first, after any write of this room still in flight, so a reconnect or a new
   * login from then on loads the character on the other side. Then the account's map seat is
   * freed and the seat forgotten here; its socket stays open until the client leaves. Returns
   * the auth to reserve the seat on the other side with.
   *
   * Throws when the write fails, with the seat left as it was, or when a newer session took the
   * account meanwhile.
   */
  async moveOut(client: Client, mapId: string, x: number, y: number): Promise<RoomAuth> {
    const seat = this.seats.get(client.sessionId);
    if (!seat || seat.evicted) throw new ServerError(409, "session_replaced");
    seat.moving = true;
    const write = seat.writes.then(() =>
      use().auth.saveCharacterPlace(seat.characterId, mapId, x, y),
    );
    seat.writes = write.catch(() => {});
    moves.set(seat.characterId, write);
    try {
      await write;
    } catch (error) {
      seat.moving = false;
      throw error;
    } finally {
      if (moves.get(seat.characterId) === write) moves.delete(seat.characterId);
    }
    if (seat.evicted || this.seats.get(client.sessionId) !== seat) {
      throw new ServerError(409, "session_replaced");
    }
    this.seats.delete(client.sessionId);
    seat.release();
    return client.auth as RoomAuth;
  }

  /** Periodic save: only seats that moved since their last write. */
  async saveAll(): Promise<void> {
    await Promise.all([...this.seats].map(([sessionId, seat]) => this.save(sessionId, seat)));
  }

  /** Queues a write of the place, unless the seat is walking out; resolves when written. */
  private save(sessionId: string, seat: Seat): Promise<void> {
    seat.writes = seat.writes.then(async () => {
      if (seat.moving) return;
      const at = this.place(sessionId);
      if (!at || (at.x === seat.saved.x && at.y === seat.saved.y)) return;
      try {
        await use().auth.saveCharacterPlace(seat.characterId, this.mapId, at.x, at.y);
        seat.saved = { x: at.x, y: at.y };
      } catch (error) {
        console.error(`saving character ${seat.characterId} failed: ${describeError(error)}`);
      }
    });
    return seat.writes;
  }

  private evict(seat: Seat, code = CLOSE_SESSION_REPLACED): void {
    if (seat.evicted) return;
    seat.evicted = true;
    seat.closeCode = code;
    const { client } = seat;
    if (seat.reconnection instanceof Deferred) seat.reconnection.reject(false);
    // A joining client is closed too: its onJoin then fails, or ends at once if already past.
    else if (client.state === ClientState.JOINED || client.state === ClientState.JOINING) {
      client.leave(code);
    }
  }
}
