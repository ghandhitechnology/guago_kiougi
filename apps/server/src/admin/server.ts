/**
 * The admin listener (PLAN §19 "admin (IP-restricted)", §22 "reachable only over Tailscale"): its
 * own HTTP server on its own port, bound to a loopback or Tailscale address (config.ts refuses
 * anything else), serving the admin API under `/admin/api/` and the built admin page. Nothing of
 * it is mounted on the game server, so the public proxy in front of the game port cannot reach it.
 *
 * Every request must name this server in `Host` (no DNS rebinding). API requests from a browser
 * must be same-origin; every state-changing one must carry `Origin` equal to the admin origin,
 * a JSON body, and the session's CSRF token in `x-csrf-token`, which reads need too.
 */
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import path from "node:path";
import { ipHash } from "../auth/crypto.ts";
import { readCookie } from "../auth/http.ts";
import { describeError } from "../db/index.ts";
import { Buckets } from "../economy/buckets.ts";
import type { Admin, AdminAuth } from "./auth.ts";

const MAX_BODY = 16 * 1024;
export const ADMIN_API = "/admin/api";
/** Requests per address a second, past which the admin API answers 429. */
const FLOOD = { burst: 60, perSecond: 20 };
const LOGIN_FLOOD = { burst: 5, perSecond: 0.2 };

export interface AdminSettings {
  host: string;
  port: number;
  origin: string;
  secret: string;
  /** Built admin page (`apps/admin/dist`); not served when missing. */
  staticDir?: string;
}

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

export interface AdminRequest {
  method: string;
  /** Path below `/admin/api`, e.g. `/players/<id>`. */
  path: string;
  query: URLSearchParams;
  admin: Admin;
  body: unknown;
}

/** Answers with a JSON body, or throws an `HttpError`. Null: no such route. */
export type AdminRoutes = (req: AdminRequest) => Promise<unknown | null>;

export function adminCookieName(origin: string): string {
  return origin.startsWith("https:") ? "__Host-gk_admin" : "gk_admin";
}

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; " +
  "font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new HttpError(413, "too_large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(size === 0 ? {} : JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new HttpError(400, "bad_request"));
      }
    });
    req.on("error", reject);
  });
}

export function createAdminHandler(settings: AdminSettings, auth: AdminAuth, routes: AdminRoutes) {
  const origin = new URL(settings.origin);
  const secure = origin.protocol === "https:";
  const cookieName = adminCookieName(settings.origin);
  const bound = settings.host.includes(":") ? `[${settings.host}]` : settings.host;
  const hosts = new Set([origin.host, `${bound}:${settings.port}`]);
  const flood = new Buckets();
  const staticRoot = settings.staticDir ? path.resolve(settings.staticDir) : undefined;

  function headers(res: ServerResponse): void {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    res.setHeader("Content-Security-Policy", CSP);
  }

  function json(res: ServerResponse, status: number, body: unknown, cookie?: string): void {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    if (cookie) res.setHeader("Set-Cookie", cookie);
    res.end(JSON.stringify(body));
  }

  function sessionCookie(token: string | null, expiresAt?: Date): string {
    const age = token && expiresAt ? Math.floor((expiresAt.getTime() - Date.now()) / 1000) : 0;
    const parts = [`${cookieName}=${token ?? ""}`, "Path=/", "HttpOnly", "SameSite=Strict"];
    parts.push(`Max-Age=${age}`);
    if (secure) parts.push("Secure");
    return parts.join("; ");
  }

  function serveStatic(req: IncomingMessage, res: ServerResponse, pathname: string): void {
    if (!staticRoot || (req.method !== "GET" && req.method !== "HEAD")) {
      res.statusCode = 404;
      res.end();
      return;
    }
    let file = path.resolve(staticRoot, `.${decodeURIComponent(pathname)}`);
    if (!file.startsWith(staticRoot + path.sep) && file !== staticRoot) {
      res.statusCode = 404;
      res.end();
      return;
    }
    if (!existsSync(file) || statSync(file).isDirectory())
      file = path.join(staticRoot, "index.html");
    if (!existsSync(file)) {
      res.statusCode = 404;
      res.end();
      return;
    }
    res.statusCode = 200;
    res.setHeader("Content-Type", TYPES[path.extname(file)] ?? "application/octet-stream");
    res.setHeader(
      "Cache-Control",
      file.includes(`${path.sep}assets${path.sep}`) ? "max-age=31536000, immutable" : "no-cache",
    );
    createReadStream(file)
      .on("error", () => res.destroy())
      .pipe(res);
  }

  async function api(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
    const method = req.method ?? "GET";
    const ip = ipHash(req.socket.remoteAddress ?? "unknown", settings.secret);
    if (flood.take(ip, FLOOD, Date.now()) > 0) throw new HttpError(429, "rate_limited");
    // A browser says where a request comes from; only this page may call the API.
    const site = req.headers["sec-fetch-site"];
    if (site !== undefined && site !== "same-origin") throw new HttpError(403, "forbidden");
    const from = req.headers.origin;
    if (from !== undefined && from !== origin.origin) throw new HttpError(403, "forbidden");
    const post = method === "POST";
    if (post) {
      if (from === undefined) throw new HttpError(403, "forbidden");
      if (!String(req.headers["content-type"] ?? "").startsWith("application/json")) {
        throw new HttpError(415, "bad_request");
      }
    } else if (method !== "GET") {
      throw new HttpError(405, "bad_request");
    }
    const sub = url.pathname.slice(ADMIN_API.length) || "/";

    if (sub === "/login" && post) {
      if (flood.take(`login:${ip}`, LOGIN_FLOOD, Date.now()) > 0) {
        throw new HttpError(429, "rate_limited");
      }
      const body = (await readBody(req)) as { loginId?: unknown; password?: unknown };
      if (typeof body.loginId !== "string" || typeof body.password !== "string") {
        throw new HttpError(400, "bad_request");
      }
      const out = await auth.login(body.loginId, body.password, ip);
      if (!out.ok) throw new HttpError(out.error === "rate_limited" ? 429 : 401, out.error);
      return json(
        res,
        200,
        { admin: view(out.admin), csrf: auth.csrfToken(out.admin) },
        sessionCookie(out.token, out.expiresAt),
      );
    }

    const admin = await auth.authenticate(readCookie(req.headers.cookie, cookieName));
    if (!admin) {
      return json(res, 401, { error: "unauthorized" }, sessionCookie(null));
    }
    if (sub === "/me" && method === "GET") {
      return json(res, 200, { admin: view(admin), csrf: auth.csrfToken(admin) });
    }
    const csrf = req.headers["x-csrf-token"];
    if (!auth.csrfMatches(admin, typeof csrf === "string" ? csrf : undefined)) {
      throw new HttpError(403, "csrf");
    }
    if (sub === "/logout" && post) {
      await auth.logout(admin);
      return json(res, 200, { ok: true }, sessionCookie(null));
    }
    const body = post ? await readBody(req) : undefined;
    const answer = await routes({ method, path: sub, query: url.searchParams, admin, body });
    if (answer === null) throw new HttpError(404, "not_found");
    json(res, 200, answer);
  }

  return (req: IncomingMessage, res: ServerResponse): void => {
    headers(res);
    if (!hosts.has(String(req.headers.host ?? ""))) {
      res.statusCode = 421;
      res.end();
      return;
    }
    let url: URL;
    try {
      url = new URL(req.url ?? "/", origin.origin);
      if (url.pathname !== ADMIN_API && !url.pathname.startsWith(`${ADMIN_API}/`)) {
        serveStatic(req, res, url.pathname);
        return;
      }
    } catch {
      res.statusCode = 400;
      res.end();
      return;
    }
    api(req, res, url).catch((e: unknown) => {
      if (res.headersSent) return;
      if (e instanceof HttpError) return json(res, e.status, { error: e.code });
      // Never log bodies: they can hold passwords.
      console.error(`admin ${req.method} ${url.pathname} failed: ${describeError(e)}`);
      json(res, 500, { error: "server_error" });
    });
  };
}

const view = (a: Admin) => ({ id: a.id, loginId: a.loginId, role: a.role });

/** Listens on the configured address only. */
export function serveAdmin(
  settings: AdminSettings,
  auth: AdminAuth,
  routes: AdminRoutes,
): Promise<Server> {
  const server = createServer(createAdminHandler(settings, auth, routes));
  server.requestTimeout = 30_000;
  server.headersTimeout = 10_000;
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(settings.port, settings.host, () => resolve(server));
  });
}
