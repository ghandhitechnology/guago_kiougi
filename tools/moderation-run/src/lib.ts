/** Shared by the moderation run and the screenshot seed: real processes, real HTTP, real sockets. */
import { type ChildProcess, spawn } from "node:child_process";
import path from "node:path";
import { Client } from "@colyseus/sdk";
import { API } from "@guago/shared";
import pg from "pg";

export const ROOT = path.resolve(import.meta.dirname, "../../..");
export const PG_PORT = Number(process.env.LOCAL_PG_PORT ?? 54329);
export const pgUrl = (db: string) => `postgres://guago:guago@127.0.0.1:${PG_PORT}/${db}`;

const started = Date.now();
export function say(text: string): void {
  console.log(`[${((Date.now() - started) / 1000).toFixed(2).padStart(6)}s] ${text}`);
}

/** Drops and recreates a database, then migrates it with the server's own migrate script. */
export async function freshDatabase(name: string): Promise<string> {
  const admin = new pg.Client({ connectionString: pgUrl("postgres") });
  await admin.connect();
  try {
    await admin.query(`drop database if exists ${name} with (force)`);
    await admin.query(`create database ${name}`);
  } finally {
    await admin.end();
  }
  await run("node", ["apps/server/src/db/migrate.ts", pgUrl(name)]);
  return pgUrl(name);
}

/** Runs a command to completion, with `input` on stdin; resolves with its stdout. */
export function run(cmd: string, args: string[], env: NodeJS.ProcessEnv = {}, input?: string) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: ROOT, env: { ...process.env, ...env } });
    let out = "";
    let err = "";
    child.stdout.on("data", (d: Buffer) => (out += d.toString()));
    child.stderr.on("data", (d: Buffer) => (err += d.toString()));
    child.on("exit", (code) =>
      code === 0
        ? resolve(out.trim())
        : reject(new Error(`${cmd} ${args.join(" ")}: ${err || out}`)),
    );
    child.stdin.end(input ?? "");
  });
}

export interface Ports {
  game: number;
  metrics: number;
  admin: number;
}

/** Starts `node apps/server/src/index.ts` and waits for its ready line. */
export async function startServer(
  databaseUrl: string,
  ports: Ports,
  adminOrigin: string,
): Promise<ChildProcess> {
  const child = spawn("node", ["apps/server/src/index.ts"], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: "development",
      DATABASE_URL: databaseUrl,
      PORT: String(ports.game),
      METRICS_PORT: String(ports.metrics),
      ADMIN_HOST: "127.0.0.1",
      ADMIN_PORT: String(ports.admin),
      ADMIN_ORIGIN: adminOrigin,
      CLIENT_ORIGIN: "http://localhost:5173",
      SIGNUPS_PER_IP_PER_DAY: "100",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`server did not start:\n${log}`)), 30_000);
    const read = (d: Buffer) => {
      log += d.toString();
      if (log.includes("game server on")) {
        clearTimeout(timer);
        resolve();
      }
    };
    child.stdout?.on("data", read);
    child.stderr?.on("data", read);
    child.on("exit", (code) => reject(new Error(`server exited ${code}:\n${log}`)));
  });
  return child;
}

export type Jar = Map<string, string>;

const cookieHeader = (jar: Jar) => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");

function absorb(res: Response, jar: Jar): void {
  for (const line of res.headers.getSetCookie()) {
    const [pair = ""] = line.split(";");
    const at = pair.indexOf("=");
    if (at <= 0) continue;
    const value = pair.slice(at + 1).trim();
    if (value) jar.set(pair.slice(0, at).trim(), value);
    else jar.delete(pair.slice(0, at).trim());
  }
}

export async function api(
  base: string,
  pathname: string,
  jar: Jar,
  body?: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(base + pathname, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      cookie: cookieHeader(jar),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  absorb(res, jar);
  return {
    status: res.status,
    body: (await res.json().catch(() => ({}))) as Record<string, unknown>,
  };
}

const LOOK = {
  body: "fair",
  hair: "bob",
  hairColor: "black",
  face: "bright",
  uniform: "blazer",
  accessories: [],
};

export interface Bot {
  loginId: string;
  name: string;
  jar: Jar;
  characterId: string;
  sdk: () => Client;
}

export async function signUp(base: string, loginId: string, name: string, major = "math") {
  const jar: Jar = new Map();
  const password = `${loginId} pass 1234`;
  const made = await api(base, API.signup, jar, { loginId, password, ageConfirmed: true });
  if (made.status !== 200) throw new Error(`signup ${loginId}: ${JSON.stringify(made.body)}`);
  const c = await api(base, API.character, jar, { name, major, look: LOOK });
  if (c.status !== 200) throw new Error(`character ${name}: ${JSON.stringify(c.body)}`);
  const characterId = (c.body.character as { id: string }).id;
  return {
    loginId,
    name,
    jar,
    characterId,
    password,
    sdk: () => new Client(base, { headers: { cookie: cookieHeader(jar) } }),
  };
}

/** An admin signed in on the admin port, as the admin page would be. */
export async function adminLogin(origin: string, loginId: string, password: string) {
  let cookie = "";
  let csrf = "";
  const send = async (pathname: string, body?: unknown) => {
    const res = await fetch(`${origin}/admin/api${pathname}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        origin,
        cookie,
        "x-csrf-token": csrf,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const set = res.headers.getSetCookie()[0];
    if (set) cookie = set.split(";")[0] ?? "";
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  };
  const out = await send("/login", { loginId, password });
  if (out.status !== 200) throw new Error(`admin login: ${JSON.stringify(out.body)}`);
  csrf = out.body.csrf as string;
  return send;
}
