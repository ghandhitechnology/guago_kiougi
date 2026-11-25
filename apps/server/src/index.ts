import { matchMaker } from "@colyseus/core";
import { WORLD_ROOM } from "@guago/shared";
import { createGameServer } from "./app.ts";
import { createAuthService } from "./auth/service.ts";
import { ChatLog } from "./chat/log.ts";
import { assertServable, config } from "./config.ts";
import { createDb } from "./db/index.ts";
import { studentLooks } from "./looks.ts";
import { evictAccount } from "./seats.ts";

assertServable(config);
studentLooks();

const db = createDb(config.databaseUrl);
const auth = createAuthService({
  db,
  onSessionsRevoked: evictAccount,
  limits: { signupsPerIpPerDay: config.signupsPerIpPerDay },
});
const chatLog = new ChatLog(db);
const server = createGameServer(auth, config, studentLooks, { log: chatLog });

await server.listen(config.port);
// The one WorldRoom exists from the start, so two first joins can never make two.
await matchMaker.createRoom(WORLD_ROOM, {});
setInterval(() => auth.sweep().catch(() => {}), 10 * 60 * 1000).unref();
console.log(`game server on :${config.port}`);
