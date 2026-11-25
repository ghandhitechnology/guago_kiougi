import { matchMaker } from "@colyseus/core";
import { WORLD_ROOM } from "@guago/shared";
import { createGameServer } from "./app.ts";
import { createAuthService } from "./auth/service.ts";
import { ChatLog, maintainChatLog, startChatLogMaintenance } from "./chat/log.ts";
import { assertServable, config } from "./config.ts";
import { createDb } from "./db/index.ts";
import { createEconomy } from "./economy/index.ts";
import { studentLooks } from "./looks.ts";
import { evictAccount } from "./seats.ts";
import { worldRoom } from "./world-room.ts";

assertServable(config);
studentLooks();

const db = createDb(config.databaseUrl);
const economy = createEconomy(db, { onLevel: (id, level) => worldRoom()?.setLevel(id, level) });
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
  { ops: economy.ops, routes: economy.routes(auth) },
);

await server.listen(config.port);
// The one WorldRoom exists from the start, so two first joins can never make two.
await matchMaker.createRoom(WORLD_ROOM, {});
economy.grants.start();
setInterval(
  () => {
    auth.sweep().catch(() => {});
    economy.prune().catch(() => {});
  },
  10 * 60 * 1000,
).unref();
console.log(`game server on :${config.port}`);
