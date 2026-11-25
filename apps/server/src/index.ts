import { matchMaker } from "@colyseus/core";
import { WORLD_ROOM } from "@guago/shared";
import { createGameServer } from "./app.ts";
import { createAuthService } from "./auth/service.ts";
import { ChatLog, maintainChatLog, startChatLogMaintenance } from "./chat/log.ts";
import { assertServable, config } from "./config.ts";
import { createDb } from "./db/index.ts";
import { clubJackets, studentLooks } from "./looks.ts";
import { evictAccount } from "./seats.ts";
import { closedFees, MemoryWallet } from "./social/fees.ts";
import { createSocial } from "./social/index.ts";

assertServable(config);
studentLooks();

const db = createDb(config.databaseUrl);
const auth = createAuthService({
  db,
  onSessionsRevoked: evictAccount,
  limits: { signupsPerIpPerDay: config.signupsPerIpPerDay },
});
startChatLogMaintenance(db);
const chatLog = new ChatLog(db, { onMissingPartition: () => maintainChatLog(db) });
const social = createSocial(db, {
  // Until the item executor is wired (social/fees.ts), founding a club costs real 솔방울 only in
  // local development, from a play wallet; elsewhere nobody can found one yet.
  fees: config.local ? new MemoryWallet(db, { seed: 10_000_000 }) : closedFees,
  jackets: clubJackets,
  log: chatLog,
});
const server = createGameServer(auth, config, studentLooks, { log: chatLog, social });

await server.listen(config.port);
// The one WorldRoom exists from the start, so two first joins can never make two.
await matchMaker.createRoom(WORLD_ROOM, {});
setInterval(
  () => {
    auth.sweep().catch(() => {});
    void social.sweep();
  },
  10 * 60 * 1000,
).unref();
console.log(`game server on :${config.port}`);
