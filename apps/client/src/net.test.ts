import type { Room } from "@colyseus/sdk";
import { CLOSE_SESSION_REPLACED, type MapState } from "@guago/shared";
import { describe, expect, it } from "vitest";
import { type MapChoice, stayConnected } from "./net.ts";

const CONSENTED = 4000;

/** A room that closes with `code` when told to, as the server would. */
function fakeRoom(log: string[], name: string) {
  let close: (code: number) => void = () => {};
  const room = {
    onLeave(cb: (code: number) => void) {
      close = cb;
    },
    async leave() {
      log.push(`leave ${name}`);
      close(CONSENTED);
    },
  };
  return { room: room as unknown as Room<unknown, MapState>, close: (code: number) => close(code) };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("map link", () => {
  it("gives the seat up when another tab takes it, instead of taking it back", async () => {
    const log: string[] = [];
    const rooms: ReturnType<typeof fakeRoom>[] = [];
    const link = stayConnected(
      () => () => {},
      async () => {
        const r = fakeRoom(log, `room${rooms.length}`);
        rooms.push(r);
        return r.room;
      },
    );
    await tick();
    rooms[0]?.close(CLOSE_SESSION_REPLACED);
    expect(await link.ended).toBe("replaced");
    await new Promise((r) => setTimeout(r, 1200));
    expect(rooms).toHaveLength(1);
  });

  it("leaves the old map room before it joins the next one", async () => {
    const log: string[] = [];
    let n = 0;
    const link = stayConnected(
      () => () => {},
      async (choice: MapChoice) => {
        const name = `${choice.map ?? "lawn"}${n++}`;
        log.push(`join ${name}`);
        return fakeRoom(log, name).room;
      },
    );
    await tick();
    await link.moveTo({ map: "campus-yard" });
    await tick();
    expect(log).toEqual(["join lawn0", "leave lawn0", "join campus-yard1"]);
  });
});
