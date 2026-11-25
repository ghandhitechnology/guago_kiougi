import type { Room } from "@colyseus/sdk";
import {
  CLOSE_SESSION_REPLACED,
  MAP_MESSAGES,
  type MapState,
  type Seating,
  type Transfer,
} from "@guago/shared";
import { describe, expect, it } from "vitest";
import { type MapLinkTransport, stayConnected } from "./net.ts";

const CONSENTED = 4000;

/** A room that closes with `code` when told to, and can send a transfer, as the server would. */
function fakeRoom(log: string[], name: string) {
  let close: (code: number) => void = () => {};
  const handlers = new Map<string, (m: unknown) => void>();
  const room = {
    reconnection: { enabled: true },
    onMessage(type: string, cb: (m: unknown) => void) {
      handlers.set(type, cb);
    },
    onLeave(cb: (code: number) => void) {
      close = cb;
    },
    async leave(consented: boolean) {
      log.push(`leave ${name}${consented ? "" : " (dropped)"}`);
      close(CONSENTED);
    },
  };
  return {
    room: room as unknown as Room<unknown, MapState>,
    close: (code: number) => close(code),
    transfer: (t: Transfer) => handlers.get(MAP_MESSAGES.transfer)?.(t),
  };
}

const seating = (map: string): Seating => ({
  map,
  channel: 1,
  seat: { name: "map", sessionId: `s-${map}`, roomId: map },
});

const tick = () => new Promise((r) => setTimeout(r, 0));

function harness(fail: (map: string) => boolean = () => false) {
  const log: string[] = [];
  const rooms = new Map<string, ReturnType<typeof fakeRoom>>();
  const ended: string[] = [];
  let entries = 0;
  const transport: MapLinkTransport = {
    async enter() {
      entries++;
      log.push("enter");
      return { seating: seating("campus-yard") };
    },
    async consume(seat) {
      if (fail(seat.roomId)) {
        log.push(`seat ${seat.roomId} lapsed`);
        throw new Error("lapsed");
      }
      log.push(`join ${seat.roomId}`);
      const r = fakeRoom(log, seat.roomId);
      rooms.set(seat.roomId, r);
      return r.room;
    },
  };
  const stop = stayConnected(
    {
      arrive: () => () => {},
      depart: (t) => log.push(`depart to ${t.map}`),
      ended: (why) => ended.push(why),
    },
    transport,
  );
  return { log, rooms, ended, stop, entries: () => entries };
}

describe("map link", () => {
  it("gives the seat up when another tab takes it, instead of taking it back", async () => {
    const h = harness();
    await tick();
    h.rooms.get("campus-yard")?.close(CLOSE_SESSION_REPLACED);
    await tick();
    expect(h.ended).toEqual(["replaced"]);
    await new Promise((r) => setTimeout(r, 300));
    expect(h.entries()).toBe(1);
  });

  it("takes the far side's seat from a door, then leaves the old room with consent", async () => {
    const h = harness();
    await tick();
    h.rooms.get("campus-yard")?.transfer({ ...seating("gaseolgwan-stairs"), via: "gaseol-front" });
    await tick();
    await tick();
    expect(h.log).toEqual([
      "enter",
      "join campus-yard",
      "depart to gaseolgwan-stairs",
      "join gaseolgwan-stairs",
      "leave campus-yard",
    ]);
    h.stop();
  });

  it("enters again when a door's seat lapsed, landing where the server saved the player", async () => {
    const h = harness((map) => map === "gaseolgwan-stairs");
    await tick();
    h.rooms.get("campus-yard")?.transfer({ ...seating("gaseolgwan-stairs"), via: "gaseol-front" });
    await new Promise((r) => setTimeout(r, 400));
    expect(h.log.slice(0, 6)).toEqual([
      "enter",
      "join campus-yard",
      "depart to gaseolgwan-stairs",
      "seat gaseolgwan-stairs lapsed",
      "leave campus-yard",
      "enter",
    ]);
    h.stop();
  });
});
