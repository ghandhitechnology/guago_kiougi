import { SERVER_PORT } from "@guago/shared";

const env = process.env;
const mode = env.NODE_ENV ?? "production";
const local = mode === "development" || mode === "test";

export const LOCAL_PG_PORT = Number(env.LOCAL_PG_PORT ?? 54329);

/** Server settings from the environment; `.env.example` lists each with its default. */
export const config = {
  port: Number(env.PORT ?? SERVER_PORT),
  databaseUrl: env.DATABASE_URL ?? `postgres://guago:guago@127.0.0.1:${LOCAL_PG_PORT}/guago_dev`,
  clientOrigin: env.CLIENT_ORIGIN ?? "http://localhost:5173",
  /** Secure cookies everywhere but plain-http local development (PLAN §22 "HTTPS and WSS only"). */
  secureCookies: !local,
  trustProxy: env.TRUST_PROXY === "1",
  ipHashSecret: env.IP_HASH_SECRET || "local-development-only",
};

export type Config = typeof config;

/** Settings a public server cannot run without. Called once at server start. */
export function assertDeployConfig(): void {
  if (!local && !env.IP_HASH_SECRET)
    throw new Error("IP_HASH_SECRET must be set outside development");
}
