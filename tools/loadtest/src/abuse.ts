import { Client, type Room } from "@colyseus/sdk";
import {
  ENTER_PATH,
  encodeInput,
  INPUT_MESSAGE,
  MAP_MESSAGES,
  MapState,
  MOVE_MAX,
  type Seating,
} from "@guago/shared";

/**
 * An account that tries to fill a channel without playing in it: it asks to enter again and again
 * without taking the tickets, takes one, walks west out of the field into the yard's door, keeps
 * the old connection open, never takes the seat on the far side, and starts over. Channels count
 * the accounts standing in them or holding their latest seat there, so none of this should push
 * a newcomer into another channel.
 */
export class Abuser {
  cycles = 0;
  tickets = 0;
  private stopped = false;
  private readonly kept: Room<unknown, MapState>[] = [];

  private readonly http: string;
  private readonly ws: string;
  private readonly cookie: string;
  private readonly choice: unknown;

  constructor(http: string, ws: string, cookie: string, choice: unknown) {
    this.http = http;
    this.ws = ws;
    this.cookie = cookie;
    this.choice = choice;
  }

  async run(): Promise<void> {
    while (!this.stopped) {
      try {
        for (let i = 0; i < 3; i++) await this.enter();
        const seating = await this.enter();
        const room = await new Client(this.ws, {
          headers: { cookie: this.cookie },
        }).consumeSeatReservation(seating.seat, MapState);
        room.reconnection.enabled = false;
        room.onMessage("*", () => {});
        this.kept.push(room);
        await this.walkWest(room);
        this.cycles++;
      } catch {
        // Refused or rate limited: try again shortly.
      }
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  async stop(): Promise<void> {
    this.stopped = true;
    await Promise.all(this.kept.map((r) => r.leave().catch(() => {})));
  }

  private async enter(): Promise<Seating> {
    const res = await fetch(this.http + ENTER_PATH, {
      method: "POST",
      headers: { cookie: this.cookie, "content-type": "application/json" },
      body: JSON.stringify(this.choice),
    });
    if (!res.ok) throw new Error(`enter answered ${res.status}`);
    this.tickets++;
    return (await res.json()) as Seating;
  }

  /** Walks west until the server sends the body through a door, or gives up after four seconds. */
  private walkWest(room: Room<unknown, MapState>): Promise<void> {
    let seq = 0;
    return new Promise((resolve) => {
      const timer = setInterval(() => {
        room.send(INPUT_MESSAGE, encodeInput({ seq: ++seq, mx: -MOVE_MAX, my: 0 }));
      }, 50);
      const done = () => {
        clearInterval(timer);
        clearTimeout(limit);
        resolve();
      };
      const limit = setTimeout(done, 4000);
      room.onMessage(MAP_MESSAGES.transfer, done);
    });
  }
}
