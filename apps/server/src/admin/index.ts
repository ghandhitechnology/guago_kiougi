/**
 * Moderation and the admin tool, put together once for the server (index.ts), the integration
 * tests and the scripted run. `createModerationStack` is built before the auth service (which
 * takes its gate) and before the rooms (which take its filter); `listen` opens the admin port.
 */
import type { Server } from "node:http";
import path from "node:path";
import { ChatFilter } from "../chat/filter.ts";
import type { Db } from "../db/index.ts";
import type { Executor } from "../economy/executor.ts";
import { createFilterList } from "../moderation/filter-list.ts";
import { adminMutes } from "../moderation/mutes.ts";
import { createModeration, type ModerationDeps } from "../moderation/service.ts";
import { evictAccount, isSeated } from "../seats.ts";
import { worldRoom } from "../world-room.ts";
import { createAdminAuth } from "./auth.ts";
import { createReads, type TradeLogSource } from "./reads.ts";
import { adminRoutes } from "./routes.ts";
import { serveAdmin } from "./server.ts";

export const ADMIN_DIST = path.resolve(import.meta.dirname, "../../../admin/dist");

export interface StackOptions {
  db: Db;
  executor: Executor;
  secret: string;
  /** The trading lane's trade log, once it lands (PLAN §13 "Trade logs are kept and searchable"). */
  trades?: TradeLogSource;
  /** Seams for tests; the defaults reach the live rooms. */
  evict?: ModerationDeps["evict"];
  system?: ModerationDeps["system"];
}

export async function createModerationStack(o: StackOptions) {
  const filter = new ChatFilter({});
  const filters = createFilterList(o.db, filter);
  await filters.apply();
  await adminMutes.load(o.db);
  const moderation = createModeration({
    db: o.db,
    executor: o.executor,
    evict: o.evict ?? evictAccount,
    system:
      o.system ??
      ((line, to) => {
        const world = worldRoom();
        world?.system(line, to);
        return world !== undefined;
      }),
    notify: (id, change) => worldRoom()?.notify(id, change),
  });
  const auth = createAdminAuth(o.db, o.secret);
  const reads = createReads(o.db, o.trades ?? null);
  const routes = adminRoutes({
    db: o.db,
    auth,
    moderation,
    filters,
    reads,
    online: isSeated,
  });
  return {
    filter,
    filters,
    moderation,
    auth,
    reads,
    routes,
    /** Opens the admin port. `staticDir` serves the built admin page when it exists. */
    listen(s: { host: string; port: number; origin: string; staticDir?: string }): Promise<Server> {
      return serveAdmin(
        { ...s, secret: o.secret, staticDir: s.staticDir ?? ADMIN_DIST },
        auth,
        routes,
      );
    },
    /** Lifts ended bans, drops ended admin sessions. Run every minute. */
    async sweep(): Promise<void> {
      await moderation.sweep();
      await auth.sweep();
    },
  };
}

export type ModerationStack = Awaited<ReturnType<typeof createModerationStack>>;
