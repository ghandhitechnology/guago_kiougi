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
}

/** What a seat is reserved with: decided by the server, read by the room on join. */
export interface SeatOptions {
  /** Facing on arrival, for a walk through a door. */
  readonly facing?: number;
}

interface Channel {
  readonly number: number;
  readonly roomId: string;
  readonly cache: IRoomCache;
}

class Channels {
  /** Players a channel holds. Load tests raise it to fill one room past the PLAN's 60. */
  seats = CHANNEL_SEATS;
  /** Seconds an empty channel stays open, so a player stepping out and back finds it warm. */
  graceSeconds = 30;
  private readonly byMap = new Map<string, Channel[]>();
  private readonly locks = new Map<string, Promise<unknown>>();

  /**
   * Reserves a seat for `auth`'s character on `map`: in the lowest channel with room, or a new
   * channel when every one is full. Serialised per map, so two arrivals at a full map open one
   * new channel between them, not two.
   */
  seat(map: string, auth: RoomAuth, options: SeatOptions = {}): Promise<Seating> {
    return this.locked(map, async () => {
      for (let attempt = 0; attempt < 4; attempt++) {
        const channel = this.open(map) ?? (await this.create(map));
        try {
          const seat = await matchMaker.reserveSeatFor(channel.cache, options, auth);
          return { map, channel: channel.number, seat: ticket(seat) };
        } catch {
          // Closed since it was picked (a closing room counts as full, so `open` skips it).
          if (!matchMaker.getLocalRoomById(channel.roomId)) this.forget(channel.roomId);
        }
      }
      throw new Error(`no channel of ${map} would seat a player`);
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
    for (const [map, list] of this.byMap) {
      const kept = list.filter((c) => c.roomId !== roomId);
      if (kept.length === list.length) continue;
      if (kept.length > 0) this.byMap.set(map, kept);
      else this.byMap.delete(map);
    }
  }

  private open(map: string): Channel | undefined {
    for (const c of this.byMap.get(map) ?? []) {
      const room = matchMaker.getLocalRoomById(c.roomId) as Room | undefined;
      if (room && !room.hasReachedMaxClients()) return c;
    }
    return undefined;
  }

  private async create(map: string): Promise<Channel> {
    const list = this.byMap.get(map) ?? [];
    let number = 1;
    while (list.some((c) => c.number === number)) number++;
    const options: MapRoomOptions = {
      map,
      channel: number,
      seats: Math.min(this.seats, MAP_SEATS),
      grace: this.graceSeconds,
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
  // biome-ignore lint/complexity/useLiteralKeys: the field is private in the typings.
  return Object.keys(room["_reservedSeats"]).length;
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
