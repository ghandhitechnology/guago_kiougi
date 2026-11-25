/**
 * Who sits in a room: session-cookie auth at matchmaking, one live seat per account across every
 * room (PLAN §19 single session), and the character's place loaded on join and written back
 * every 30 seconds when it moved and on leave (PLAN §19 persistence).
 */
import { type AuthContext, type Client, ClientState, Deferred, ServerError } from "@colyseus/core";
import { type Character, CLOSE_SESSION_REPLACED } from "@guago/shared";
import { readCookie, sessionCookieName } from "./auth/http.ts";
import type { AuthService } from "./auth/service.ts";

export const SAVE_INTERVAL_MS = 30_000;

export interface RoomAuth {
  accountId: string;
  characterId: string;
}

interface Services {
  auth: AuthService;
  clientOrigin: string;
  secureCookies: boolean;
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
  const me = await auth.authenticate(token);
  if (!me) throw new ServerError(401, "unauthorized");
  const character = await auth.characterOf(me.account.id);
  if (!character) throw new ServerError(403, "no_character");
  return { accountId: me.account.id, characterId: character.id };
}

// One seat per account, across rooms ---------------------------------------------------------

interface Live {
  evict: () => void;
  released: Promise<void>;
}

const live = new Map<string, Live>();

/** Closes the account's seat wherever it is, after a new login, a logout or a recovery. */
export function evictAccount(accountId: string): void {
  live.get(accountId)?.evict();
}

const EVICT_WAIT_MS = 5000;

async function claim(accountId: string, evict: () => void): Promise<() => void> {
  let release!: () => void;
  const mine: Live = { evict, released: new Promise((r) => (release = r)) };
  const previous = live.get(accountId);
  live.set(accountId, mine);
  if (previous) {
    previous.evict();
    // The old seat saves its place on the way out; load only after that write lands.
    await Promise.race([previous.released, new Promise((r) => setTimeout(r, EVICT_WAIT_MS))]);
  }
  return () => {
    if (live.get(accountId) === mine) live.delete(accountId);
    release();
  };
}

// Seats inside one room ----------------------------------------------------------------------

/** What `allowReconnection` returns: a Deferred, or a plain rejected promise when refused. */
type Reconnection = Deferred | Promise<unknown>;

interface Seat {
  characterId: string;
  saved: { x: number; y: number };
  evicted: boolean;
  release: () => void;
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

  constructor(mapId: string, place: (sessionId: string) => Place | undefined) {
    this.mapId = mapId;
    this.place = place;
  }

  /** Takes the account's seat (closing an older one) and loads the character fresh. */
  async join(client: Client): Promise<Character> {
    const { accountId } = client.auth as RoomAuth;
    const seat: Seat = {
      characterId: "",
      saved: { x: 0, y: 0 },
      evicted: false,
      release: () => {},
    };
    seat.release = await claim(accountId, () => this.evict(client, seat));
    try {
      if (seat.evicted) throw new ServerError(409, "session_replaced");
      const character = await use().auth.characterOf(accountId);
      if (!character) throw new ServerError(403, "no_character");
      const here = character.mapId === this.mapId;
      seat.characterId = character.id;
      seat.saved = here ? { x: character.x, y: character.y } : { x: -1, y: -1 };
      this.seats.set(client.sessionId, seat);
      return character;
    } catch (error) {
      seat.release();
      throw error;
    }
  }

  /** False once the seat was taken by a newer session: there is nothing to come back to. */
  mayReconnect(client: Client): boolean {
    const seat = this.seats.get(client.sessionId);
    return seat !== undefined && !seat.evicted;
  }

  hold(client: Client, reconnection: Reconnection): void {
    reconnection.catch(() => {});
    const seat = this.seats.get(client.sessionId);
    if (seat) seat.reconnection = reconnection;
  }

  reconnected(client: Client): void {
    const seat = this.seats.get(client.sessionId);
    if (seat) delete seat.reconnection;
  }

  /** Writes the place back and frees the account's seat. Call before removing the player. */
  async leave(client: Client): Promise<void> {
    const seat = this.seats.get(client.sessionId);
    if (!seat) return;
    this.seats.delete(client.sessionId);
    try {
      await this.save(client.sessionId, seat);
    } finally {
      seat.release();
    }
  }

  /** Periodic save: only seats that moved since their last write. */
  async saveAll(): Promise<void> {
    await Promise.all([...this.seats].map(([sessionId, seat]) => this.save(sessionId, seat)));
  }

  private async save(sessionId: string, seat: Seat): Promise<void> {
    const at = this.place(sessionId);
    if (!at || (at.x === seat.saved.x && at.y === seat.saved.y)) return;
    try {
      await use().auth.saveCharacterPlace(seat.characterId, this.mapId, at.x, at.y);
      seat.saved = { x: at.x, y: at.y };
    } catch (error) {
      console.error(`saving character ${seat.characterId} failed:`, (error as Error).message);
    }
  }

  private evict(client: Client, seat: Seat): void {
    seat.evicted = true;
    if (seat.reconnection instanceof Deferred) seat.reconnection.reject(false);
    else if (client.state === ClientState.JOINED) client.leave(CLOSE_SESSION_REPLACED);
    else if (client.state === ClientState.JOINING) {
      // Still finishing onJoin: close it as soon as the join completes.
      setTimeout(() => {
        if (client.state === ClientState.JOINED) client.leave(CLOSE_SESSION_REPLACED);
      }, 0);
    }
  }
}
