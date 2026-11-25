/**
 * `POST /api/enter`: seats a signed-in character in a room of the map it stands on (PLAN §10,
 * §19). The client never names a map, a channel or a room: the server reads where the character
 * was saved, makes the place valid, picks the channel and answers with a one-use seat. A client
 * holds that seat until its map room ends, then asks here again.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { type AuthContext, ServerError } from "@colyseus/core";
import { ENTER_PATH, type Seating } from "@guago/shared";
import { channels } from "./channels.ts";
import { describeError } from "./db/index.ts";
import { live } from "./live/current.ts";
import { authenticateJoin, characterAfterMoves, placeCharacter } from "./seats.ts";
import { belongsOn, builtMap, spawnPlace } from "./world-maps.ts";

type Middleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => void;

/** Entries per account: a burst of three, then one every three seconds. */
const BURST = 3;
const REFILL_MS = 3000;
const MAX_BODY = 512;

/**
 * Whether an entry may name the map, and a monster count for the channel it opens. Development
 * and load tests only (`ALLOW_MAP_OPTION=1`); anywhere else a client choosing its map would be a
 * teleport, so the body is ignored.
 */
export const mapOptionAllowed = () => process.env.ALLOW_MAP_OPTION === "1";

interface DevChoice {
  readonly map?: string;
  readonly monsters?: number;
}

function readChoice(req: IncomingMessage): Promise<DevChoice> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size <= MAX_BODY) chunks.push(c);
    });
    req.on("end", () => {
      try {
        const v = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") as Record<
          string,
          unknown
        >;
        const monsters = v.monsters;
        resolve({
          ...(typeof v.map === "string" ? { map: v.map } : {}),
          ...(Number.isInteger(monsters) && (monsters as number) >= 0 && (monsters as number) <= 300
            ? { monsters: monsters as number }
            : {}),
        });
      } catch {
        resolve({});
      }
    });
    req.on("error", () => resolve({}));
  });
}

export function enterRoute(): Middleware {
  const buckets = new Map<string, { tokens: number; at: number }>();
  const take = (accountId: string): boolean => {
    const now = Date.now();
    const b = buckets.get(accountId) ?? { tokens: BURST, at: now };
    b.tokens = Math.min(BURST, b.tokens + (now - b.at) / REFILL_MS);
    b.at = now;
    buckets.set(accountId, b);
    if (buckets.size > 10_000) {
      for (const [k, v] of buckets) if (v.tokens >= BURST) buckets.delete(k);
    }
    if (b.tokens < 1) return false;
    b.tokens -= 1;
    return true;
  };

  const send = (res: ServerResponse, status: number, body: unknown) => {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end(JSON.stringify(body));
  };

  async function enter(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // Like every other POST: JSON only, so a plain HTML form can never reach it.
    if (!String(req.headers["content-type"] ?? "").startsWith("application/json")) {
      return send(res, 400, { error: "bad_request" });
    }
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (typeof v === "string") headers.set(k, v);
    }
    // Read or drained either way, so the socket can be reused.
    const choice = mapOptionAllowed() ? await readChoice(req) : {};
    if (!mapOptionAllowed()) req.resume();
    const auth = await authenticateJoin({ headers } as AuthContext);
    // Development and load tests enter as fast as their scripts walk; players are limited.
    if (!mapOptionAllowed() && !take(auth.accountId)) {
      return send(res, 429, { error: "rate_limited" });
    }
    let character = await characterAfterMoves(auth.accountId, auth.characterId);
    if (!character) return send(res, 403, { error: "forbidden" });
    const chosen = choice.map ? builtMap(choice.map) : undefined;
    if (chosen && chosen.id !== character.mapId) {
      // Written first, so the room's join check finds the character where it chose to be.
      const at = spawnPlace(chosen, "main");
      await placeCharacter(character.id, chosen.id, at.x, at.y);
      character = { ...character, mapId: chosen.id, x: at.x, y: at.y };
    }
    // Sent home (명령퇴사) lands in the 집 until the time is up; after it, never there.
    const sentHome = (await live()?.homeUntil(character.id)) != null;
    const map = belongsOn(character, sentHome);
    const seating: Seating = await channels.enter(
      map,
      auth,
      choice.monsters ? { monsters: choice.monsters } : {},
    );
    send(res, 200, seating);
  }

  return (req, res, next) => {
    if (req.method !== "POST" || new URL(req.url ?? "/", "http://local").pathname !== ENTER_PATH) {
      return next();
    }
    enter(req, res).catch((e: unknown) => {
      if (res.headersSent) return;
      if (e instanceof ServerError) {
        const status = e.code === 401 || e.code === 403 ? e.code : 400;
        return send(res, status, { error: status === 401 ? "unauthorized" : "forbidden" });
      }
      console.error(`enter failed: ${describeError(e)}`);
      send(res, 500, { error: "server_error" });
    });
  };
}
