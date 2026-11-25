import { Client, type Room } from "@colyseus/sdk";
import {
  CLOSE_SESSION_REPLACED,
  ENTER_PATH,
  MAP_MESSAGES,
  MapState,
  ROOMS_PATH,
  type Seating,
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

type Entered = { seating: Seating } | { final: "signedOut" } | { retry: true };

/** Asks the server where this character stands and for a seat there. */
async function enter(): Promise<Entered> {
  try {
    const res = await fetch(ENTER_PATH, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
      credentials: "same-origin",
    });
    if (res.status === 401 || res.status === 403) return { final: "signedOut" };
    if (!res.ok) return { retry: true };
    return { seating: (await res.json()) as Seating };
  } catch {
    return { retry: true };
  }
}

/**
 * Keeps the player in a map room for as long as the page lives (PLAN §19). The server decides
 * which: `POST /api/enter` seats the character where it was saved, and a door hands over a seat
 * on the far side. On a door the new room is joined before the old one is left, so presence
 * never shows the player nowhere. Short drops are bridged by the SDK's own reconnection inside
 * the room's 30 second window; anything longer enters again, quietly.
 */
export function stayConnected(handlers: MapLinkHandlers): () => void {
  const client = new Client(`${location.origin}${ROOMS_PATH}`);
  let stopped = false;
  let current: Room<unknown, MapState> | undefined;

  async function run(): Promise<void> {
    let next: Transfer | undefined;
    let leaving: { room: Room<unknown, MapState>; detach: () => void } | undefined;
    let wait = 1000;
    while (!stopped) {
      let seating: Seating;
      if (next) {
        seating = next;
      } else {
        const entered = await enter();
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
        room = await client.consumeSeatReservation(seating.seat, MapState);
      } catch {
        // The seat lapsed or the server restarted; the old room, if any, is done with.
        leaving?.detach();
        void leaving?.room.leave();
        leaving = undefined;
        await sleep(300);
        continue;
      }
      if (leaving) {
        leaving.detach();
        void leaving.room.leave();
        leaving = undefined;
      }
      if (stopped) {
        void room.leave();
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
    void current?.leave();
  };
}
