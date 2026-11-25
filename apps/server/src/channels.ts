/**
 * Channels (PLAN §10): every map runs in rooms of `seats` players each, opened on demand. A seat
 * always goes to the lowest-numbered channel with room, so players gather where others already
 * are and a map opens channel 2 only when channel 1 is full. Nobody is ever moved between
 * channels: a higher channel takes no newcomers while a lower one has room, so it drains as
 * its players leave and closes once it has stood empty for the room's grace period. A closed
 * channel's number is the next one handed out.
 *
 * Map rooms are never joined by matchmaking from a client: every seat is reserved here, by the
 * server, for a character it has already placed (PLAN §19, positions are never the client's).
 *
 * A channel is full when `seats` accounts stand in it or hold the seat they were last given
 * there. Sockets left behind by a door and seats an account was given before its latest one do
 * not count, so nobody can fill a channel with tickets or old connections, and each account
 * holds one outstanding entry ticket at a time.
 */
import { type IRoomCache, matchMaker, type Room } from "@colyseus/core";
import { CHANNEL_SEATS, MAP_ROOM, MAP_SEATS, type Seating, type SeatTicket } from "@guago/shared";
import type { RoomAuth } from "./seats.ts";

/** What a map room is created with. */
export interface MapRoomOptions {
  readonly map: string;
  readonly channel: number;
  readonly seats: number;
  /** Seconds an empty room stays open. */
  readonly grace: number;
  /** Wandering monsters to fill it with: load tests only, through the development map option. */
  readonly monsters?: number;
  /** A private copy of the map for this character alone (the opening, the 집, a replay). */
  readonly owner?: string;
  /** No field monsters: a private copy for a scene. */
  readonly calm?: boolean;
}

/** What a seat is reserved with: decided by the server, read by the room on join. */
export interface SeatOptions {
  /** Facing on arrival, for a walk through a door. */
  readonly facing?: number;
  /** Where the body is put, when the server moved it somewhere other than a saved place. */
  readonly at?: { readonly x: number; readonly y: number };
}

interface Channel {
  readonly number: number;
  readonly roomId: string;
  readonly cache: IRoomCache;
}

/** What a channel's room tells about who is in it. */
export interface ChannelRoom {
  /** Accounts with a body standing in the room. */
  accountsHere(): ReadonlySet<string>;
}

/** A seat an account was given. */
interface Ticket {
  readonly map: string;
  readonly roomId: string;
  readonly seating: Seating;
}

class Channels {
  /** Players a channel holds. Load tests raise it to fill one room past the PLAN's 60. */
  seats = CHANNEL_SEATS;
  /** Seconds an empty channel stays open, so a player stepping out and back finds it warm. */
  graceSeconds = 30;
  private readonly byMap = new Map<string, Channel[]>();
  private readonly locks = new Map<string, Promise<unknown>>();
  /** The seat each account was given last, by entering or by a door: the only one that counts. */
  private readonly latest = new Map<string, Ticket>();
  /** The seat each account was given last by entering, handed again while it can be taken. */
  private readonly entries = new Map<string, Ticket>();
  /** Private copies of maps, by character and map. */
  private readonly instances = new Map<string, { roomId: string; cache: IRoomCache }>();

  /**
   * Reserves a seat for `auth`'s character on `map`: in the lowest channel with room, or a new
   * channel when every one is full. Serialised per map, so two arrivals at a full map open one
   * new channel between them, not two.
   */
  seat(
    map: string,
    auth: RoomAuth,
    options: SeatOptions = {},
    fill: { monsters?: number } = {},
  ): Promise<Seating> {
    return this.locked(map, async () => {
      for (let attempt = 0; attempt < 4; attempt++) {
        const channel = this.open(map) ?? (await this.create(map, fill.monsters));
        try {
          const seat = await matchMaker.reserveSeatFor(channel.cache, options, auth);
          const seating: Seating = { map, channel: channel.number, seat: ticket(seat) };
          this.latest.set(auth.accountId, { map, roomId: channel.roomId, seating });
          return seating;
        } catch {
          // Closed since it was picked (a closing room counts as full, so `open` skips it).
          if (!matchMaker.getLocalRoomById(channel.roomId)) this.forget(channel.roomId);
        }
      }
      throw new Error(`no channel of ${map} would seat a player`);
    });
  }

  /**
   * Entering: the account's outstanding ticket for `map` again while it can still be taken,
   * else a new seat. Asking twice never holds two seats.
   */
  async enter(map: string, auth: RoomAuth, fill: { monsters?: number } = {}): Promise<Seating> {
    const held = await this.locked(map, async () => {
      const t = this.entries.get(auth.accountId);
      return t?.map === map && this.pending(t) ? t : undefined;
    });
    if (held) {
      this.latest.set(auth.accountId, held);
      return held.seating;
    }
    const seating = await this.seat(map, auth, {}, fill);
    const made = this.latest.get(auth.accountId);
    if (made?.seating === seating) this.entries.set(auth.accountId, made);
    return seating;
  }

  /**
   * A seat in the private copy of `map` made for `auth`'s character (the opening, the 집, a
   * 복습 replay), made on demand; one per character and map, closed once empty.
   */
  instance(map: string, auth: RoomAuth, options: SeatOptions = {}): Promise<Seating> {
    const key = `${auth.characterId}:${map}`;
    return this.locked(`instance:${key}`, async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        let made = this.instances.get(key);
        if (!made || !matchMaker.getLocalRoomById(made.roomId)) {
          const room: MapRoomOptions = {
            map,
            channel: 0,
            seats: 1,
            grace: this.graceSeconds,
            owner: auth.characterId,
            calm: true,
          };
          const cache = await matchMaker.createRoom(MAP_ROOM, room);
          made = { roomId: cache.roomId, cache };
          this.instances.set(key, made);
        }
        try {
          const seat = await matchMaker.reserveSeatFor(made.cache, options, auth);
          return { map, channel: 0, seat: ticket(seat) };
        } catch {
          this.instances.delete(key);
        }
      }
      throw new Error(`no private copy of ${map} would seat a player`);
    });
  }

  /**
   * Reserves a seat in one given channel of `map` (a dueling floor, or the channel a fighter came
   * from), past the seats newcomers may take; any channel when that one is gone or full.
   */
  async seatIn(
    map: string,
    roomId: string,
    auth: RoomAuth,
    options: SeatOptions = {},
  ): Promise<Seating> {
    const seating = await this.locked(map, async () => {
      const channel = (this.byMap.get(map) ?? []).find((c) => c.roomId === roomId);
      const room = channel && (matchMaker.getLocalRoomById(roomId) as Room | undefined);
      if (!channel || !room || room.hasReachedMaxClients()) return null;
      try {
        const seat = await matchMaker.reserveSeatFor(channel.cache, options, auth);
        const made: Seating = { map, channel: channel.number, seat: ticket(seat) };
        this.latest.set(auth.accountId, { map, roomId: channel.roomId, seating: made });
        return made;
      } catch {
        return null;
      }
    });
    return seating ?? this.seat(map, auth, options);
  }

  /** Opens one more channel of `map` whatever the others hold: a dueling floor for a match. */
  openExtra(map: string): Promise<void> {
    return this.locked(map, async () => {
      await this.create(map);
    });
  }

  /** The channels of a map with their players and reserved seats, lowest first. */
  list(map: string): { channel: number; roomId: string; clients: number }[] {
    return (this.byMap.get(map) ?? []).map((c) => ({
      channel: c.number,
      roomId: c.roomId,
      clients: matchMaker.getLocalRoomById(c.roomId)?.clients.length ?? 0,
    }));
  }

  /**
   * Whether an empty room may close now: nobody in it and no seat reserved there that could
   * still be taken. Decided under the map's lock, so no seat is reserved in a room that closes.
   * A room that may close is forgotten at once.
   */
  retire(map: string, roomId: string): Promise<boolean> {
    return this.locked(map, async () => {
      const room = matchMaker.getLocalRoomById(roomId) as Room | undefined;
      if (room && (room.clients.length > 0 || pendingSeats(room) > 0)) return false;
      this.forget(roomId);
      return true;
    });
  }

  /** Called by a map room when it closes. */
  forget(roomId: string): void {
    for (const [key, made] of this.instances)
      if (made.roomId === roomId) this.instances.delete(key);
    for (const tickets of [this.latest, this.entries]) {
      for (const [account, t] of tickets) if (t.roomId === roomId) tickets.delete(account);
    }
    for (const [map, list] of this.byMap) {
      const kept = list.filter((c) => c.roomId !== roomId);
      if (kept.length === list.length) continue;
      if (kept.length > 0) this.byMap.set(map, kept);
      else this.byMap.delete(map);
    }
  }

  private open(map: string): Channel | undefined {
    for (const c of this.byMap.get(map) ?? []) {
      const room = matchMaker.getLocalRoomById(c.roomId) as (Room & ChannelRoom) | undefined;
      if (room && !room.hasReachedMaxClients() && this.occupancy(room) < this.seats) return c;
    }
    return undefined;
  }

  /**
   * Accounts a room holds a place for: those standing in it, and those whose latest ticket is a
   * seat in it not taken yet. A dropped player keeps their body, so their held reconnection is
   * already counted; sockets that walked out through a door and superseded tickets are not.
   */
  occupancy(room: Room & ChannelRoom): number {
    const accounts = new Set(room.accountsHere());
    for (const [sessionId, reserved] of Object.entries(reservedSeats(room))) {
      const auth = reserved[1] as RoomAuth | undefined;
      if (!auth || reserved[3]) continue;
      const latest = this.latest.get(auth.accountId);
      if (latest?.roomId === room.roomId && latest.seating.seat.sessionId === sessionId) {
        accounts.add(auth.accountId);
      }
    }
    return accounts.size;
  }

  /** Whether a ticket's seat can still be taken. */
  private pending(t: Ticket): boolean {
    const room = matchMaker.getLocalRoomById(t.roomId) as Room | undefined;
    const reserved = room && reservedSeats(room)[t.seating.seat.sessionId];
    return reserved !== undefined && !reserved[2];
  }

  private async create(map: string, monsters?: number): Promise<Channel> {
    const list = this.byMap.get(map) ?? [];
    let number = 1;
    while (list.some((c) => c.number === number)) number++;
    const options: MapRoomOptions = {
      map,
      channel: number,
      seats: Math.min(this.seats, MAP_SEATS),
      grace: this.graceSeconds,
      ...(monsters ? { monsters } : {}),
    };
    const cache = await matchMaker.createRoom(MAP_ROOM, options);
    const channel: Channel = { number, roomId: cache.roomId, cache };
    this.byMap.set(
      map,
      [...(this.byMap.get(map) ?? []), channel].sort((a, b) => a.number - b.number),
    );
    return channel;
  }

  private async locked<T>(key: string, run: () => Promise<T>): Promise<T> {
    const before = this.locks.get(key) ?? Promise.resolve();
    const mine = before.then(run, run);
    const tail = mine.catch(() => {});
    this.locks.set(key, tail);
    try {
      return await mine;
    } finally {
      if (this.locks.get(key) === tail) this.locks.delete(key);
    }
  }
}

/**
 * Seats reserved in a room and not taken yet: arrivals on the way and dropped players inside
 * their reconnection window. Colyseus keeps them in a private table; its own auto-dispose reads
 * the same one.
 */
function pendingSeats(room: Room): number {
  return Object.keys(reservedSeats(room)).length;
}

/**
 * Colyseus's table of reserved seats by session id: `[options, auth, consumed, reconnection]`.
 * A seat being joined is hidden from its keys.
 */
function reservedSeats(room: Room): Record<string, [unknown, unknown, boolean, boolean]> {
  // biome-ignore lint/complexity/useLiteralKeys: the field is private in the typings.
  return room["_reservedSeats"];
}

function ticket(seat: Awaited<ReturnType<typeof matchMaker.reserveSeatFor>>): SeatTicket {
  return {
    name: seat.name,
    sessionId: seat.sessionId,
    roomId: seat.roomId,
    ...(seat.processId ? { processId: seat.processId } : {}),
    ...(seat.publicAddress ? { publicAddress: seat.publicAddress } : {}),
    ...(seat.devMode ? { devMode: seat.devMode } : {}),
  };
}

/** The process's channels (PLAN §19: one Node process). */
export const channels = new Channels();
