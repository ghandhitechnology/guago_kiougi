import { CLOCK_MAX_RATE, SERVER_PORT } from "@guago/shared";

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

function clockRate(value: string | undefined): number {
  const rate = positiveInt(value, 1, "LIVE_CLOCK_RATE");
  if (rate > CLOCK_MAX_RATE) throw new Error(`LIVE_CLOCK_RATE must be at most ${CLOCK_MAX_RATE}`);
  return rate;
}

/** Server settings from the environment; `.env.example` lists each with its default. */
export function readConfig(env: Record<string, string | undefined> = process.env) {
  const mode = env.NODE_ENV ?? "production";
  const clientOrigin = env.CLIENT_ORIGIN ?? "http://localhost:5173";
  const localPgPort = Number(env.LOCAL_PG_PORT ?? 54329);
  const port = Number(env.PORT ?? SERVER_PORT);
  const adminHost = env.ADMIN_HOST || "127.0.0.1";
  const adminPort = Number(env.ADMIN_PORT ?? port + 200);
  return {
    port: Number(env.PORT ?? SERVER_PORT),
    /** Room metrics as JSON, on the loopback address only (default: the game port + 100). */
    metricsPort: Number(env.METRICS_PORT ?? Number(env.PORT ?? SERVER_PORT) + 100),
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
    liveClockRate: clockRate(env.LIVE_CLOCK_RATE),
    /** Lets `POST /admin/live` inject combat and navigation events and restart the Page. */
    liveTestEvents: env.LIVE_TEST_EVENTS === "1",
    /** The admin API and page: their own listener, never the game port (PLAN §22). */
    adminHost,
    adminPort,
    /** The origin the admin page is loaded from; state-changing requests must come from it. */
    adminOrigin:
      env.ADMIN_ORIGIN ||
      `http://${adminHost.includes(":") ? `[${adminHost}]` : adminHost}:${adminPort}`,
  };
}

/**
 * Where the admin listener may bind: loopback, or an address on the Tailscale network
 * (100.64.0.0/10, fd7a:115c:a1e0::/48). Never a wildcard or a public address (PLAN §22 "reachable
 * only over Tailscale").
 */
export function isAdminBindable(host: string): boolean {
  if (host === "127.0.0.1" || host === "::1" || host === "localhost") return true;
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return a === 100 && b >= 64 && b <= 127 && v4.slice(1).every((n) => Number(n) <= 255);
  }
  return /^fd7a:115c:a1e0:/i.test(host);
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
  if (!isAdminBindable(c.adminHost)) {
    throw new Error("ADMIN_HOST must be a loopback or Tailscale address");
  }
  if (c.adminPort === c.port || c.adminPort === c.metricsPort) {
    throw new Error("ADMIN_PORT must differ from PORT and METRICS_PORT");
  }
}
