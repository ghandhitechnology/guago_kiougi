import { createGameServer } from "./app.ts";
import { createAuthService } from "./auth/service.ts";
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
const server = createGameServer(auth, config, studentLooks);

await server.listen(config.port);
setInterval(() => auth.sweep().catch(() => {}), 10 * 60 * 1000).unref();
console.log(`game server on :${config.port}`);
