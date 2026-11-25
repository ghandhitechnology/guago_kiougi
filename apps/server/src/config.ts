import { SERVER_PORT } from "@guago/shared";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function isLocalOrigin(origin: string): boolean {
  try {
    return LOCAL_HOSTS.has(new URL(origin).hostname);
  } catch {
    return false;
  }
}

function positiveInt(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined || value === "") return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw new Error(`${name} must be a positive integer`);
  return n;
}

/** Server settings from the environment; `.env.example` lists each with its default. */
export function readConfig(env: Record<string, string | undefined> = process.env) {
  const mode = env.NODE_ENV ?? "production";
  const clientOrigin = env.CLIENT_ORIGIN ?? "http://localhost:5173";
  const localPgPort = Number(env.LOCAL_PG_PORT ?? 54329);
  return {
    port: Number(env.PORT ?? SERVER_PORT),
    databaseUrl: env.DATABASE_URL ?? `postgres://guago:guago@127.0.0.1:${localPgPort}/guago_dev`,
    clientOrigin,
    /** Plain-http local development: `NODE_ENV` development or test, served to a localhost origin. */
    local: (mode === "development" || mode === "test") && isLocalOrigin(clientOrigin),
    /** Secure cookies everywhere but plain-http local development (PLAN §22 "HTTPS and WSS only"). */
    secureCookies:
      !(mode === "development" || mode === "test") || clientOrigin.startsWith("https:"),
    trustProxy: env.TRUST_PROXY === "1",
    /** Keys the IP hashes and device cookies. The fallback is public and only good on localhost. */
    serverSecret: env.SERVER_SECRET || "local-development-only",
    serverSecretSet: Boolean(env.SERVER_SECRET),
    /** PLAN §12: 3. A dormitory behind one address may need more. */
    signupsPerIpPerDay: positiveInt(env.SIGNUPS_PER_IP_PER_DAY, 3, "SIGNUPS_PER_IP_PER_DAY"),
    /** Server clock rate on a fresh database (PLAN §25 M4: a time-compressed test server). */
    liveClockRate: positiveInt(env.LIVE_CLOCK_RATE, 1, "LIVE_CLOCK_RATE"),
    /** Lets `POST /admin/live` inject combat and navigation events and restart the Page. */
    liveTestEvents: env.LIVE_TEST_EVENTS === "1",
  };
}

export type Config = ReturnType<typeof readConfig>;

export const config = readConfig();

/** Refuses settings a reachable server must not run with. Called once at server start. */
export function assertServable(c: Config): void {
  if (!c.serverSecretSet && !c.local) {
    throw new Error(
      "SERVER_SECRET must be set unless NODE_ENV=development serves a localhost origin",
    );
  }
}
