import { matchMaker } from "@colyseus/core";
import { WORLD_ROOM } from "@guago/shared";
import { createGameServer } from "./app.ts";
import { createAuthService } from "./auth/service.ts";
import { ChatLog, maintainChatLog, startChatLogMaintenance } from "./chat/log.ts";
import { assertServable, config } from "./config.ts";
import { createDb } from "./db/index.ts";
import { createEconomy } from "./economy/index.ts";
import { startLedgerMaintenance } from "./economy/ledger.ts";
import { clubJackets, studentLooks } from "./looks.ts";
import { serveMetrics } from "./metrics-server.ts";
import { evictAccount } from "./seats.ts";
import { installShutdown, onShutdown } from "./shutdown.ts";
import { executorFees } from "./social/fees.ts";
import { createSocial } from "./social/index.ts";
import { startListingSweeper } from "./trade/board.ts";
import { createTrading } from "./trade/room.ts";
import { worldRoom } from "./world-room.ts";

assertServable(config);
studentLooks();

const db = createDb(config.databaseUrl);
const economy = createEconomy(db, {
  onLevel: (id, level) => worldRoom()?.setLevel(id, level),
  onChange: (id, change) => worldRoom()?.notify(id, change),
});
const auth = createAuthService({
  db,
  onSessionsRevoked: evictAccount,
  onCharacterCreated: economy.giveKit,
  limits: { signupsPerIpPerDay: config.signupsPerIpPerDay },
});
startChatLogMaintenance(db);
const chatLog = new ChatLog(db, { onMissingPartition: () => maintainChatLog(db) });
const social = createSocial(db, {
  fees: executorFees(db, economy.executor),
  jackets: clubJackets,
  log: chatLog,
});
const trading = createTrading({ db, executor: economy.executor });
const server = createGameServer(
  auth,
  config,
  studentLooks,
  { log: chatLog, social },
  { ops: economy.ops, routes: economy.routes(auth), grants: economy.grants, trading },
);
// SIGTERM and SIGINT close every room (seats save places and flush grants), then these run.
installShutdown(server);
onShutdown("grants", () => economy.grants.flush());
onShutdown("chat log", () => chatLog.flush());
onShutdown("database", () => db.pool.end());

await server.listen(config.port);
// The one WorldRoom exists from the start, so two first joins can never make two.
await matchMaker.createRoom(WORLD_ROOM, {});
economy.grants.start();
startLedgerMaintenance(db);
startListingSweeper(db, economy.executor, (id, change) => worldRoom()?.notify(id, change));
setInterval(
  () => {
    auth.sweep().catch(() => {});
    economy.prune().catch(() => {});
    void social.sweep();
  },
  10 * 60 * 1000,
).unref();
await serveMetrics(config.metricsPort);
console.log(`game server on :${config.port}, metrics on 127.0.0.1:${config.metricsPort}`);
