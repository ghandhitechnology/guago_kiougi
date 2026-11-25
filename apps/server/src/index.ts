import { matchMaker } from "@colyseus/core";
import { WORLD_ROOM } from "@guago/shared";
import { createGameServer } from "./app.ts";
import { createAuthService } from "./auth/service.ts";
import { ChatLog, maintainChatLog, startChatLogMaintenance } from "./chat/log.ts";
import { assertServable, config } from "./config.ts";
import { createDb } from "./db/index.ts";
import { createEconomy } from "./economy/index.ts";
import { LiveClock } from "./live/clock.ts";
import { createLive } from "./live/index.ts";
import { PageClock } from "./live/page.ts";
import { studentLooks } from "./looks.ts";
import { evictAccount } from "./seats.ts";
import { installShutdown, onShutdown } from "./shutdown.ts";
import { worldRoom } from "./world-room.ts";

assertServable(config);
studentLooks();

const db = createDb(config.databaseUrl);
// The server clock and the Page state come first: every operation reads time and the live Page
// from them (PLAN §10).
const clock = new LiveClock({ realMs: Date.now(), gameMs: Date.now(), rate: 1 });
const page = new PageClock(db, clock);
await page.load(config.liveClockRate);
const economy = createEconomy(db, {
  now: () => clock.date(),
  page: page.live,
  onLevel: (id, level) => worldRoom()?.setLevel(id, level),
  onChange: (id, change) => worldRoom()?.notify(id, change),
  onApplied: (id, name, result) => live.onApplied(id, name, result),
  onCredit: (id, credit) => live.credit(id, credit),
});
const live = createLive(db, {
  clock,
  page,
  economy,
  world: worldRoom,
  looks: studentLooks,
  testEvents: config.liveTestEvents,
});
const auth = createAuthService({
  db,
  onSessionsRevoked: evictAccount,
  onCharacterCreated: economy.giveKit,
  limits: { signupsPerIpPerDay: config.signupsPerIpPerDay },
});
startChatLogMaintenance(db);
const chatLog = new ChatLog(db, { onMissingPartition: () => maintainChatLog(db) });
const server = createGameServer(
  auth,
  config,
  studentLooks,
  { log: chatLog },
  { ops: economy.ops, routes: economy.routes(auth), grants: economy.grants, live },
);
// SIGTERM and SIGINT close every room (seats save places and flush grants), then these run.
installShutdown(server);
onShutdown("grants", () => economy.grants.flush());
onShutdown("quest progress", () => live.stop());
onShutdown("chat log", () => chatLog.flush());
onShutdown("database", () => db.pool.end());

await server.listen(config.port);
// The one WorldRoom exists from the start, so two first joins can never make two.
await matchMaker.createRoom(WORLD_ROOM, {});
economy.grants.start();
await live.start();
setInterval(
  () => {
    auth.sweep().catch(() => {});
    economy.prune().catch(() => {});
  },
  10 * 60 * 1000,
).unref();
console.log(`game server on :${config.port}`);
