/**
 * The `/api` routes (contract in `@guago/shared` api.ts), as a plain Node handler. It is mounted
 * on the game server's HTTP server through the Colyseus `express` hook and runs on its own in the
 * integration tests.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  API,
  type ApiErrorCode,
  type LookOptions,
  parseCreateCharacter,
  parseLogin,
  parseRecover,
  parseSignup,
} from "@guago/shared";
import { describeError } from "../db/index.ts";
import { deviceSource, ipHash, newDeviceToken } from "./crypto.ts";
import type { AuthedAccount, AuthService, Origin, Session } from "./service.ts";

export interface HttpSettings {
  clientOrigin: string;
  secureCookies: boolean;
  trustProxy: boolean;
  serverSecret: string;
}

const DEVICE_COOKIE_DAYS = 365;

const MAX_BODY = 4 * 1024;

const STATUS: Partial<Record<ApiErrorCode, number>> = {
  bad_request: 400,
  forbidden: 403,
  unauthorized: 401,
  rate_limited: 429,
  server_error: 500,
  bad_credentials: 401,
  account_banned: 403,
  login_taken: 409,
  name_taken: 409,
  character_exists: 409,
  signup_limit: 429,
};

/** `__Host-` pins the cookie to this exact host over HTTPS; plain-http dev cannot use it. */
export function sessionCookieName(secure: boolean): string {
  return secure ? "__Host-sid" : "sid";
}

/** The device cookie is only ever read by the API, so it never leaves `/api`. */
export function deviceCookieName(secure: boolean): string {
  return secure ? "__Secure-did" : "did";
}

export function readCookie(header: string | null | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq > 0 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return undefined;
}

class BodyError extends Error {}

/**
 * The client's address: the socket's peer, or behind our own proxy (`trustProxy`) the last
 * `X-Forwarded-For` hop, the one the proxy appended; earlier hops are whatever the client sent.
 * Every path that keys on an address (limits, IP bans, room joins) reads it here.
 */
export function clientAddress(
  forwarded: string | string[] | null | undefined,
  remote: string | undefined,
  trustProxy: boolean,
): string {
  if (trustProxy) {
    const hops = String(forwarded ?? "").split(",");
    const last = hops[hops.length - 1]?.trim();
    if (last) return last;
  }
  return remote ?? "unknown";
}

/** What a route outside this file gets: the request, its session and ways to answer. */
export interface RouteContext {
  method: string;
  path: string;
  /** HMAC of the client IP, for per-address limits. */
  ip: string;
  query: URLSearchParams;
  /** The account behind the session cookie, or null. */
  account(): Promise<AuthedAccount | null>;
  readJson(): Promise<unknown>;
  send(status: number, body: unknown): void;
  error(code: ApiErrorCode): void;
}

/** Answers and returns true when the request is its own; false passes it on. */
export type ApiRoute = (ctx: RouteContext) => Promise<boolean>;

function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new BodyError("body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(size === 0 ? {} : JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new BodyError("malformed JSON"));
      }
    });
    req.on("error", reject);
  });
}

export function createApiHandler(
  auth: AuthService,
  settings: HttpSettings,
  looks: () => LookOptions,
  routes: readonly ApiRoute[] = [],
) {
  const cookieName = sessionCookieName(settings.secureCookies);
  const deviceName = deviceCookieName(settings.secureCookies);

  const clientIp = (req: IncomingMessage) =>
    clientAddress(req.headers["x-forwarded-for"], req.socket.remoteAddress, settings.trustProxy);

  function sessionCookie(session: Session | null): string {
    const parts = [
      `${cookieName}=${session?.token ?? ""}`,
      "Path=/",
      "HttpOnly",
      // Strict: the page and the API are one site, and no cross-site navigation needs a session.
      "SameSite=Strict",
      `Max-Age=${session ? Math.floor((session.expiresAt.getTime() - Date.now()) / 1000) : 0}`,
    ];
    if (settings.secureCookies) parts.push("Secure");
    return parts.join("; ");
  }

  /** Issued after every success that proves the password or recovery code for `loginId`. */
  function deviceCookie(loginId: string): string {
    const parts = [
      `${deviceName}=${newDeviceToken(loginId, settings.serverSecret)}`,
      "Path=/api",
      "HttpOnly",
      "SameSite=Strict",
      `Max-Age=${DEVICE_COOKIE_DAYS * 24 * 3600}`,
    ];
    if (settings.secureCookies) parts.push("Secure");
    return parts.join("; ");
  }

  function send(
    res: ServerResponse,
    status: number,
    body: unknown,
    ...cookies: (string | undefined)[]
  ): void {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    const set = cookies.filter((c): c is string => c !== undefined);
    if (set.length > 0) res.setHeader("Set-Cookie", set);
    res.end(JSON.stringify(body));
  }

  const error = (res: ServerResponse, code: ApiErrorCode, cookie?: string) =>
    send(res, STATUS[code] ?? 400, { error: code }, cookie);

  async function route(
    req: IncomingMessage,
    res: ServerResponse,
    path: string,
    query: URLSearchParams,
  ) {
    const method = req.method ?? "GET";
    const post = method === "POST";
    // A browser on another origin never gets to act with our cookie (SameSite already stops it;
    // this also refuses same-site pages on other ports or subdomains).
    const origin = req.headers.origin;
    if (post && origin !== undefined && origin !== settings.clientOrigin) {
      return error(res, "forbidden");
    }
    // Bodies must be JSON, which an HTML form cannot send. Logout carries no body.
    const json = String(req.headers["content-type"] ?? "").startsWith("application/json");
    if (post && path !== API.logout && !json) {
      return error(res, "bad_request");
    }
    const token = readCookie(req.headers.cookie, cookieName);
    const ip = ipHash(clientIp(req), settings.serverSecret);
    const device = readCookie(req.headers.cookie, deviceName);
    const from = (loginId: string): Origin => ({
      ip,
      source: deviceSource(device, loginId, settings.serverSecret) ?? ip,
    });

    if (post && path === API.signup) {
      const parsed = parseSignup(await readJson(req));
      if (!parsed.ok) return error(res, parsed.error);
      const result = await auth.signup(parsed.value, ip);
      if (!result.ok) return error(res, result.error);
      const { session, recoveryCode } = result.value;
      return send(
        res,
        200,
        { recoveryCode },
        sessionCookie(session),
        deviceCookie(parsed.value.loginId),
      );
    }
    if (post && path === API.login) {
      const parsed = parseLogin(await readJson(req));
      if (!parsed.ok) return error(res, parsed.error);
      const result = await auth.login(parsed.value, from(parsed.value.loginId));
      if (!result.ok && result.ban) {
        return send(res, STATUS.account_banned ?? 403, { error: result.error, ban: result.ban });
      }
      if (!result.ok) return error(res, result.error);
      const { session, account, character } = result.value;
      return send(
        res,
        200,
        { account, character },
        sessionCookie(session),
        deviceCookie(account.loginId),
      );
    }
    if (post && path === API.logout) {
      await auth.logout(token);
      return send(res, 200, { ok: true }, sessionCookie(null));
    }
    if (method === "GET" && path === API.me) {
      const me = await auth.authenticate(token);
      if (!me) return error(res, "unauthorized", token ? sessionCookie(null) : undefined);
      return send(res, 200, {
        account: me.account,
        character: await auth.characterOf(me.account.id),
      });
    }
    if (method === "GET" && path === API.nameAvailable) {
      return send(res, 200, await auth.nameAvailable(query.get("name") ?? ""));
    }
    if (post && path === API.character) {
      const me = await auth.authenticate(token);
      if (!me) return error(res, "unauthorized");
      const parsed = parseCreateCharacter(await readJson(req), looks());
      if (!parsed.ok) return error(res, parsed.error);
      const result = await auth.createCharacter(me.account.id, parsed.value);
      if (!result.ok) return error(res, result.error);
      return send(res, 200, { character: result.value });
    }
    if (post && path === API.recover) {
      const parsed = parseRecover(await readJson(req));
      if (!parsed.ok) return error(res, parsed.error);
      const result = await auth.recover(parsed.value, from(parsed.value.loginId));
      if (!result.ok) return error(res, result.error);
      const { recoveryCode } = result.value;
      return send(res, 200, { ok: true, recoveryCode }, deviceCookie(parsed.value.loginId));
    }
    const ctx: RouteContext = {
      method,
      path,
      ip,
      query,
      account: () => auth.authenticate(token),
      readJson: () => readJson(req),
      send: (status, body) => send(res, status, body),
      error: (code) => error(res, code),
    };
    for (const extra of routes) if (await extra(ctx)) return;
    res.statusCode = 404;
    res.end();
  }

  /** Answers `/api/*` and passes anything else on. */
  return (req: IncomingMessage, res: ServerResponse, next?: () => void): void => {
    const url = new URL(req.url ?? "/", "http://local");
    if (!url.pathname.startsWith("/api/")) {
      if (next) next();
      else {
        res.statusCode = 404;
        res.end();
      }
      return;
    }
    route(req, res, url.pathname, url.searchParams).catch((e: unknown) => {
      if (res.headersSent) return;
      if (e instanceof BodyError) return error(res, "bad_request");
      // Never log the body or query parameters: they can hold passwords and hashes.
      console.error(`api ${req.method} ${url.pathname} failed: ${describeError(e)}`);
      error(res, "server_error");
    });
  };
}
