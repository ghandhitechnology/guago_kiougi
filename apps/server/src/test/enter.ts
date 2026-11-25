/** Taking a map seat the way the browser does: ask `POST /api/enter`, then consume the seat. */
import { Client, type Room } from "@colyseus/sdk";
import { ENTER_PATH, MapState, type Seating } from "@guago/shared";
import { cookieHeader, type Jar } from "./http.ts";

export async function enter(
  base: string,
  jar: Jar,
): Promise<{ status: number; seating?: Seating }> {
  const res = await fetch(base + ENTER_PATH, {
    method: "POST",
    headers: { cookie: cookieHeader(jar), "content-type": "application/json" },
    body: "{}",
  });
  const body = (await res.json()) as Seating;
  return res.ok ? { status: res.status, seating: body } : { status: res.status };
}

export function sdk(base: string, jar: Jar): Client {
  return new Client(base, { headers: { cookie: cookieHeader(jar) } });
}

/** Enters and joins; resolves once the room's first state has arrived. */
export async function joinMap(
  base: string,
  jar: Jar,
): Promise<{ room: Room<unknown, MapState>; seating: Seating }> {
  const { status, seating } = await enter(base, jar);
  if (!seating) throw new Error(`enter answered ${status}`);
  const room = await sdk(base, jar).consumeSeatReservation(seating.seat, MapState);
  await new Promise((resolve) => room.onStateChange.once(resolve));
  return { room, seating };
}
