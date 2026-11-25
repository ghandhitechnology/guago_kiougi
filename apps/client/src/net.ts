import { Client, type Room } from "@colyseus/sdk";
import {
  CLOSE_SESSION_REPLACED,
  ENTER_PATH,
  MAP_MESSAGES,
  MapState,
  ROOMS_PATH,
  type Seating,
  type SeatTicket,
  type Transfer,
} from "@guago/shared";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A map room the client sits in, with where the server seated it. */
export interface MapSeat {
  readonly room: Room<unknown, MapState>;
  readonly seating: Seating;
  /** The door the player came through, when they did. */
  readonly via: string | undefined;
}

export interface MapLinkHandlers {
  /** A new room is joined: register its callbacks now. Returns the teardown. */
  arrive(seat: MapSeat): () => void;
  /** The server is sending the player through a door; the next `arrive` is the far side. */
  depart(transfer: Transfer): void;
  /** The account joined somewhere else, or the session ended. Final. */
  ended(why: "replaced" | "signedOut"): void;
}

export type Entered = { seating: Seating } | { final: "signedOut" } | { retry: true };

/** How the link reaches the server; the page's own, unless a test hands in another. */
export interface MapLinkTransport {
  enter(): Promise<Entered>;
  consume(seat: SeatTicket): Promise<Room<unknown, MapState>>;
}

/**
 * In development, `?map=<id>` asks to be seated on that map; the server honours it only when it
 * runs with ALLOW_MAP_OPTION=1, and ignores it everywhere else.
 */
const devChoice = (): Record<string, unknown> => {
  if (!import.meta.env?.DEV) return {};
  const map = new URLSearchParams(location.search).get("map");
  return map ? { map } : {};
};

/** Asks the server where this character stands and for a seat there. */
async function enterOnPage(): Promise<Entered> {
  try {
    const res = await fetch(ENTER_PATH, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(devChoice()),
      credentials: "same-origin",
    });
    if (res.status === 401 || res.status === 403) return { final: "signedOut" };
    if (!res.ok) return { retry: true };
    return { seating: (await res.json()) as Seating };
  } catch {
    return { retry: true };
  }
}

function pageTransport(): MapLinkTransport {
  let client: Client | undefined;
  return {
    enter: enterOnPage,
    consume: (seat) => {
      client ??= new Client(`${location.origin}${ROOMS_PATH}`);
      return client.consumeSeatReservation(seat, MapState);
    },
  };
}

/**
 * Keeps the player in a map room for as long as the page lives (PLAN §19). The server decides
 * which: `POST /api/enter` seats the character where it was saved, and a door hands over a seat
 * on the far side. A door's seat is taken before the old room is left (consented): the server
 * let go of the account's old map seat before it handed the new one out, so the new room never
 * evicts the old one and nothing reads as a replaced session, and presence never shows the
 * player nowhere. Short drops are bridged by the SDK's own reconnection inside the room's
 * 30 second window; anything longer enters again, quietly. A seat taken over by another tab or
 * device ends the link: entering again would only take it back.
 */
export function stayConnected(
  handlers: MapLinkHandlers,
  transport: MapLinkTransport = pageTransport(),
): () => void {
  let stopped = false;
  let current: Room<unknown, MapState> | undefined;

  async function run(): Promise<void> {
    let next: Transfer | undefined;
    let leaving: { room: Room<unknown, MapState>; detach: () => void } | undefined;
    const letGo = () => {
      leaving?.detach();
      void leaving?.room.leave(true);
      leaving = undefined;
    };
    let wait = 1000;
    while (!stopped) {
      let seating: Seating;
      if (next) {
        seating = next;
      } else {
        const entered = await transport.enter();
        if ("final" in entered) return handlers.ended(entered.final);
        if ("retry" in entered) {
          await sleep(wait);
          wait = Math.min(wait * 2, 8000);
          continue;
        }
        seating = entered.seating;
      }
      const via = next?.via;
      next = undefined;
      let room: Room<unknown, MapState>;
      try {
        room = await transport.consume(seating.seat);
      } catch {
        // The seat lapsed or the server restarted: the far side is saved, so entering lands there.
        letGo();
        await sleep(300);
        continue;
      }
      letGo();
      if (stopped) {
        void room.leave(true);
        return;
      }
      wait = 1000;
      current = room;
      const detach = handlers.arrive({ room, seating, via });
      const outcome = await new Promise<{ transfer: Transfer } | { code: number }>((resolve) => {
        room.onMessage(MAP_MESSAGES.transfer, (transfer: Transfer) => resolve({ transfer }));
        room.onLeave((code) => resolve({ code }));
      });
      if ("transfer" in outcome) {
        // The far side is saved already; a drop of this room no longer matters.
        room.reconnection.enabled = false;
        handlers.depart(outcome.transfer);
        next = outcome.transfer;
        leaving = { room, detach };
        continue;
      }
      detach();
      current = undefined;
      if (outcome.code === CLOSE_SESSION_REPLACED) return handlers.ended("replaced");
      if (!stopped) await sleep(200);
    }
  }

  void run();
  return () => {
    stopped = true;
    void current?.leave(true);
  };
}
