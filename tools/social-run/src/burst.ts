/**
 * Does a social burst starve the database pool? 80 signed-in clients each send 10 `friend.accept`
 * at once, all for one character, so every transaction queues on that character's counter row:
 * the worst case for holding connections. Meanwhile seat saves and item operations run one after
 * another and time how long each takes. Prints and writes the numbers.
 *
 *   LOCAL_PG_PORT=54345 pnpm --filter @guago/social-run burst [--out <file>] [--label <name>]
 */
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { matchMaker } from "@colyseus/core";
import { API, WORLD_ROOM } from "@guago/shared";
import { connectWorld, type WorldLink } from "../../../apps/client/src/world-link.ts";
import { createGameServer } from "../../../apps/server/src/app.ts";
import { createAuthService } from "../../../apps/server/src/auth/service.ts";
import { createDb, migrateDb } from "../../../apps/server/src/db/index.ts";
import { createEconomy } from "../../../apps/server/src/economy/index.ts";
import { clubJackets, studentLooks } from "../../../apps/server/src/looks.ts";
import { evictAccount } from "../../../apps/server/src/seats.ts";
import { executorFees } from "../../../apps/server/src/social/fees.ts";
import { createSocial } from "../../../apps/server/src/social/index.ts";
import { call, cookieHeader, type Jar, remember } from "../../../apps/server/src/test/http.ts";
import { worldRoom } from "../../../apps/server/src/world-room.ts";

const { values: args } = parseArgs({
  args: process.argv.slice(2).filter((a) => a !== "--"),
  options: {
    out: { type: "string" },
    label: { type: "string", default: "run" },
    port: { type: "string", default: "2610" },
  },
});
const PORT = Number(args.port);
const BASE = `http://127.0.0.1:${PORT}`;
const PG = `postgres://guago:guago@127.0.0.1:${process.env.LOCAL_PG_PORT ?? 54345}`;
const DATABASE = "guago_social_burst";
const BOTS = 80;
const EACH = 10;

const admin = createDb(`${PG}/postgres`);
if (
  (await admin.pool.query("select 1 from pg_database where datname = $1", [DATABASE])).rowCount ===
  0
) {
  await admin.pool.query(`create database ${DATABASE}`);
}
await admin.pool.end();
const db = createDb(`${PG}/${DATABASE}`);
await db.pool.query("drop schema if exists drizzle cascade");
await db.pool.query("drop schema public cascade");
await db.pool.query("create schema public");
await migrateDb(db);

const economy = createEconomy(db);
const auth = createAuthService({
  db,
  onSessionsRevoked: evictAccount,
  onCharacterCreated: economy.giveKit,
  limits: { signupsPerIpPerDay: 1000 },
});
const social = createSocial(db, { fees: executorFees(db, economy.executor), jackets: clubJackets });
const server = createGameServer(
  auth,
  {
    clientOrigin: "http://localhost:5173",
    secureCookies: false,
    trustProxy: true,
    serverSecret: "burst",
  },
  studentLooks,
  { social },
  { ops: economy.ops, routes: economy.routes(auth), grants: economy.grants },
);
await server.listen(PORT);
await matchMaker.createRoom(WORLD_ROOM, {});

const LOOK = {
  body: "fair",
  hair: "bob",
  hairColor: "black",
  face: "bright",
  uniform: "blazer",
  accessories: [],
};
async function signUp(i: number): Promise<Jar> {
  const jar: Jar = {};
  const ip = `10.8.${Math.floor(i / 250)}.${(i % 250) + 1}`;
  remember(
    jar,
    await call(BASE, API.signup, {
      body: { loginId: `burst${i}`, password: "burst password", ageConfirmed: true },
      ip,
    }),
  );
  const made = await call(BASE, API.character, {
    jar,
    body: { name: `폭주${i}`, major: "math", look: LOOK },
    ip,
  });
  if (made.status !== 200) throw new Error(`character ${i}: ${JSON.stringify(made.body)}`);
  return jar;
}

const jars: Jar[] = [];
for (let i = 0; i <= BOTS; i += 4) {
  jars.push(
    ...(await Promise.all(
      Array.from({ length: Math.min(4, BOTS + 1 - i) }, (_, k) => signUp(i + k)),
    )),
  );
}
const { rows } = await db.pool.query<{ id: string; name: string }>(
  "select id, name from characters",
);
const idOf = new Map(rows.map((r) => [r.name, r.id]));
const target = idOf.get("폭주0") as string;
const links: WorldLink[] = [];
for (let i = 1; i <= BOTS; i += 10) {
  links.push(
    ...(await Promise.all(
      jars.slice(i, i + 10).map(async (jar) => {
        const link = connectWorld(BASE, { headers: { cookie: cookieHeader(jar) } });
        while (link.status !== "online" || link.social === undefined)
          await new Promise((r) => setTimeout(r, 10));
        await new Promise((r) => setTimeout(r, 50));
        return link;
      }),
    )),
  );
}
const ids = Array.from({ length: BOTS }, (_, k) => idOf.get(`폭주${k + 1}`) as string);

const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return Math.round((s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0) * 10) / 10;
};
const stats = (xs: number[]) => ({
  n: xs.length,
  p50: pct(xs, 0.5),
  p95: pct(xs, 0.95),
  max: pct(xs, 1),
});

/** Seat saves and item operations back to back until `stop`, each timed. */
async function probe(stop: () => boolean) {
  const seat: number[] = [];
  const op: number[] = [];
  let k = 0;
  while (!stop()) {
    const id = ids[k++ % ids.length] as string;
    let t = performance.now();
    await auth.saveCharacterPlace(id, "lawn", 100 + (k % 50), 100);
    seat.push(performance.now() - t);
    t = performance.now();
    const r = await economy.executor.execute(id, `burst-${randomUUID()}`, "grant", {
      exp: 0,
      drops: [
        {
          item: { kind: "coin", amount: 1 },
          source: { kind: "monster", fieldId: "p1-colonnade", monsterId: "odap", rank: "elite" },
        },
      ],
    });
    if (!r.ok) throw new Error(`grant refused: ${r.error}`);
    op.push(performance.now() - t);
  }
  return { seat, op };
}

let waitingPeak = 0;
const sampler = setInterval(() => {
  waitingPeak = Math.max(waitingPeak, db.pool.waitingCount);
}, 2);

// A quiet baseline first.
let quietEnd = Date.now() + 2000;
const quiet = await probe(() => Date.now() > quietEnd);
quietEnd = 0;
waitingPeak = 0;

let bursting = true;
const during = probe(() => !bursting);
const started = performance.now();
const answers = await Promise.all(
  links.flatMap((link) =>
    Array.from({ length: EACH }, () => link.request("friend.accept", { id: target })),
  ),
);
const burstMs = performance.now() - started;
bursting = false;
const busy = await during;
clearInterval(sampler);

const codes: Record<string, number> = {};
for (const a of answers) {
  const code = a.ok ? "ok" : a.code;
  codes[code] = (codes[code] ?? 0) + 1;
}
const hub = (worldRoom() as unknown as { social?: { gate?: { peak: number } } } | undefined)
  ?.social;
const result = {
  label: args.label,
  clients: BOTS,
  requestsEach: EACH,
  burstMs: Math.round(burstMs),
  answers: codes,
  poolSize: 10,
  poolWaitingPeak: waitingPeak,
  socialConnectionsPeak: hub?.gate?.peak ?? null,
  quiet: { seatSaveMs: stats(quiet.seat), itemOpMs: stats(quiet.op) },
  duringBurst: { seatSaveMs: stats(busy.seat), itemOpMs: stats(busy.op) },
};
console.log(JSON.stringify(result, null, 2));
if (args.out) {
  mkdirSync(path.dirname(args.out), { recursive: true });
  writeFileSync(args.out, `${JSON.stringify(result, null, 2)}\n`);
}
for (const link of links) await link.close();
await server.gracefullyShutdown(false).catch(() => {});
await db.pool.end();
process.exit(0);
