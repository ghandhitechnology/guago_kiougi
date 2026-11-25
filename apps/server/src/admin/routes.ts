/**
 * The admin API's routes. The listener (server.ts) has already checked the session, the origin
 * and the CSRF token; here each route checks its input and its role. Reading a player's chat or
 * inventory writes an audit row before the rows are returned (PLAN §12 privacy).
 */
import { sql } from "drizzle-orm";
import type { Db } from "../db/index.ts";
import { listAudit, record, target } from "../moderation/audit.ts";
import { checkEntry, type FilterList, type FilterMode } from "../moderation/filter-list.ts";
import {
  checkAdjust,
  checkMinutes,
  cleanNotice,
  cleanReason,
  IP_SCOPES,
  type IpScope,
  isUuid,
  type ModError,
  type Moderation,
  OP_ID,
  type ReportAction,
} from "../moderation/service.ts";
import { ADMIN_ROLES, type AdminAuth, type AdminRole } from "./auth.ts";
import type { Reads } from "./reads.ts";
import { type AdminRequest, type AdminRoutes, HttpError } from "./server.ts";

export interface RouteDeps {
  db: Db;
  auth: AdminAuth;
  moderation: Moderation;
  filters: FilterList;
  reads: Reads;
  /** Whether the account holds a seat in a room right now (seats.ts `isSeated`). */
  online(accountId: string): boolean;
}

const bad = () => new HttpError(400, "bad_request");

const STATUS: Partial<Record<ModError, number>> = {
  not_found: 404,
  bad_request: 400,
  offline: 503,
};

function done<T extends { ok: boolean }>(out: T | { ok: false; error: ModError }): T {
  if (!out.ok) {
    const error = (out as { error: ModError }).error;
    throw new HttpError(STATUS[error] ?? 409, error);
  }
  return out as T;
}

const obj = (body: unknown): Record<string, unknown> =>
  typeof body === "object" && body !== null && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {};

function reason(body: Record<string, unknown>): string {
  const r = cleanReason(body.reason);
  if (!r) throw bad();
  return r;
}

function minutes(body: Record<string, unknown>): number | null {
  const m = checkMinutes(body.minutes ?? null);
  if (m === undefined) throw bad();
  return m;
}

function date(raw: string | null): Date | undefined {
  if (raw === null || raw === "") return undefined;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) throw bad();
  return d;
}

/** `none` unless the form named a scope; anything else is refused. */
function ipScope(raw: unknown): IpScope {
  if (raw === undefined || raw === false) return "none";
  if (IP_SCOPES.includes(raw as IpScope)) return raw as IpScope;
  throw bad();
}

function owner(req: AdminRequest): void {
  if (req.admin.role !== "owner") throw new HttpError(403, "role");
}

export function adminRoutes(deps: RouteDeps): AdminRoutes {
  const { db, moderation, filters, reads } = deps;

  async function characterOf(accountId: string): Promise<string> {
    const { rows } = await db.execute(
      sql`select id from characters where account_id = ${accountId}`,
    );
    const id = rows[0]?.id as string | undefined;
    if (!id) throw new HttpError(404, "no_character");
    return id;
  }

  /** A character by id or by name. */
  async function findCharacter(raw: string): Promise<string> {
    if (isUuid(raw as unknown)) return raw;
    const { rows } = await db.execute(
      sql`select id from characters where lower(name) = lower(${raw.trim()})`,
    );
    const id = rows[0]?.id as string | undefined;
    if (!id) throw new HttpError(404, "not_found");
    return id;
  }

  type Handler = (req: AdminRequest, m: string[]) => Promise<unknown>;
  const table: [string, RegExp, Handler][] = [];
  const route = (method: string, pattern: string, h: Handler) =>
    table.push([method, new RegExp(`^${pattern.replace(/:\w+/g, "([^/]+)")}$`), h]);

  // Players ------------------------------------------------------------------------------------

  route("GET", "/players", async (req) => ({
    players: await reads.search(req.query.get("q") ?? ""),
  }));

  route("GET", "/players/:id", async (_req, [id]) => {
    if (!isUuid(id)) throw bad();
    const player = await reads.player(id);
    if (!player) throw new HttpError(404, "not_found");
    return { player: { ...player, online: deps.online(id) } };
  });

  route("GET", "/players/:id/chat", async (req, [id]) => {
    if (!isUuid(id)) throw bad();
    const characterId = await characterOf(id);
    const before = date(req.query.get("before"));
    await record(db, {
      adminId: req.admin.id,
      action: "chat.read",
      target: target.character(characterId),
      detail: before ? { before: before.toISOString() } : {},
    });
    return {
      lines: await reads.chat({
        character: characterId,
        limit: 100,
        ...(before ? { before } : {}),
      }),
    };
  });

  route("GET", "/players/:id/inventory", async (req, [id]) => {
    if (!isUuid(id)) throw bad();
    const characterId = await characterOf(id);
    await record(db, {
      adminId: req.admin.id,
      action: "inventory.read",
      target: target.character(characterId),
    });
    const inventory = await reads.inventory(characterId);
    if (!inventory) throw new HttpError(404, "not_found");
    return { inventory };
  });

  route("POST", "/players/:id/ban", async (req, [id]) => {
    const b = obj(req.body);
    if (!isUuid(id)) throw bad();
    done(
      await moderation.ban(req.admin.id, id, {
        reason: reason(b),
        minutes: minutes(b),
        ip: ipScope(b.ip),
      }),
    );
    return { ok: true };
  });

  route("GET", "/players/:id/ip-preview", async (_req, [id]) => {
    if (!isUuid(id)) throw bad();
    return { preview: await moderation.ipPreview(id) };
  });

  route("POST", "/players/:id/unban", async (req, [id]) => {
    if (!isUuid(id)) throw bad();
    done(await moderation.unban(req.admin.id, id, reason(obj(req.body))));
    return { ok: true };
  });

  route("POST", "/players/:id/mute", async (req, [id]) => {
    if (!isUuid(id)) throw bad();
    const b = obj(req.body);
    const o = { reason: reason(b), minutes: minutes(b) };
    done(await moderation.mute(req.admin.id, await characterOf(id), o));
    return { ok: true };
  });

  route("POST", "/players/:id/unmute", async (req, [id]) => {
    if (!isUuid(id)) throw bad();
    const r = reason(obj(req.body));
    done(await moderation.unmute(req.admin.id, await characterOf(id), r));
    return { ok: true };
  });

  route("POST", "/players/:id/kick", async (req, [id]) => {
    if (!isUuid(id)) throw bad();
    done(await moderation.kick(req.admin.id, id, reason(obj(req.body))));
    return { ok: true };
  });

  route("POST", "/players/:id/grant", async (req, [id]) => {
    owner(req);
    const b = obj(req.body);
    const input = checkAdjust(b);
    if (!isUuid(id) || !input || typeof b.opId !== "string" || !OP_ID.test(b.opId)) throw bad();
    const out = done(await moderation.adjust(req.admin.id, await characterOf(id), b.opId, input));
    return { ok: true, replayed: out.replayed, items: out.items };
  });

  // Chat ---------------------------------------------------------------------------------------

  route("GET", "/chat", async (req) => {
    const q = req.query;
    const who = q.get("character");
    const character = who ? await findCharacter(who) : undefined;
    const channel = q.get("channel") || undefined;
    if (channel && !["world", "near", "whisper", "party", "club", "system"].includes(channel)) {
      throw bad();
    }
    const from = date(q.get("from"));
    const to = date(q.get("to"));
    const before = date(q.get("before"));
    const query = {
      ...(character ? { character } : {}),
      ...(channel ? { channel } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      ...(before ? { before } : {}),
    };
    await record(db, {
      adminId: req.admin.id,
      action: "chat.read",
      target: character ? target.character(character) : "chat",
      // Dates serialise as ISO strings.
      detail: query,
    });
    return { lines: await reads.chat({ ...query, limit: 300 }) };
  });

  route("POST", "/chat/strike", async (req) => {
    const b = obj(req.body);
    if (!Number.isSafeInteger(b.id) || typeof b.at !== "string") throw bad();
    const at = date(b.at as string) as Date;
    done(await moderation.strike(req.admin.id, { id: b.id as number, at }, reason(b)));
    return { ok: true };
  });

  // Reports ------------------------------------------------------------------------------------

  route("GET", "/reports", async (req) => {
    const state = req.query.get("state") ?? "open";
    if (!["open", "resolved", "dismissed"].includes(state)) throw bad();
    return { reports: await reads.reports(state) };
  });

  route("GET", "/reports/:id", async (req, [id]) => {
    const n = Number(id);
    if (!Number.isSafeInteger(n) || n < 1) throw bad();
    const report = await reads.report(n);
    if (!report) throw new HttpError(404, "not_found");
    await record(db, {
      adminId: req.admin.id,
      action: "chat.read",
      target: target.character(report.targetId),
      detail: { report: n },
    });
    return { report };
  });

  route("POST", "/reports/:id/resolve", async (req, [id]) => {
    const n = Number(id);
    const b = obj(req.body);
    const actions: ReportAction[] = ["none", "mute", "kick", "ban"];
    if (!Number.isSafeInteger(n) || n < 1) throw bad();
    if (b.state !== "resolved" && b.state !== "dismissed") throw bad();
    if (!actions.includes(b.action as ReportAction)) throw bad();
    const note = b.note === undefined || b.note === "" ? "" : cleanReason(b.note);
    const told = b.told === undefined || b.told === "" ? "" : cleanReason(b.told);
    if (note === null || told === null) throw bad();
    done(
      await moderation.resolveReport(req.admin.id, n, {
        state: b.state,
        action: b.action as ReportAction,
        minutes: minutes(b),
        ip: ipScope(b.ip),
        note,
        told,
      }),
    );
    return { ok: true };
  });

  // Filter -------------------------------------------------------------------------------------

  route("GET", "/filter", async () => ({ list: await filters.view() }));

  for (const verb of ["add", "remove"] as const) {
    route("POST", `/filter/${verb}`, async (req) => {
      const b = obj(req.body);
      if (checkEntry(b.mode, b.text)) throw bad();
      await filters[verb](req.admin.id, b.mode as FilterMode, b.text as string, reason(b));
      return { list: await filters.view() };
    });
  }

  route("POST", "/filter/test", async (req) => {
    const b = obj(req.body);
    if (typeof b.text !== "string" || b.text.length === 0 || b.text.length > 500) throw bad();
    return { result: filters.test(b.text) };
  });

  // 대자보 posts and club notices ------------------------------------------------------------

  route("GET", "/posts", async (req) => {
    await record(db, { adminId: req.admin.id, action: "posts.read", target: "posts" });
    return await reads.posts();
  });

  route("POST", "/posts/board/:id/remove", async (req, [id]) => {
    const n = Number(id);
    if (!Number.isSafeInteger(n) || n < 1) throw bad();
    done(await moderation.removePost(req.admin.id, n, reason(obj(req.body))));
    return { ok: true };
  });

  route("POST", "/posts/notice/:id/remove", async (req, [id]) => {
    const n = Number(id);
    if (!Number.isSafeInteger(n) || n < 1) throw bad();
    done(await moderation.removeClubNotice(req.admin.id, n, reason(obj(req.body))));
    return { ok: true };
  });

  // Server -------------------------------------------------------------------------------------

  route("POST", "/broadcast", async (req) => {
    const text = cleanNotice(obj(req.body).text);
    if (!text) throw bad();
    done(await moderation.broadcast(req.admin.id, text));
    return { ok: true };
  });

  route("GET", "/economy", async (req) => {
    const days = Number(req.query.get("days") ?? 14);
    if (!Number.isInteger(days) || days < 1 || days > 90) throw bad();
    return await reads.economy(days);
  });

  route("GET", "/economy/check", async (req) => ({
    check: await reads.invariants(req.query.get("fresh") === "1"),
  }));

  route("GET", "/trades", async (req) => {
    const q = req.query;
    const who = q.get("character");
    const other = q.get("with");
    const item = q.get("item");
    const def = q.get("def");
    const kind = q.get("kind");
    const from = date(q.get("from"));
    const to = date(q.get("to"));
    const before = Number(q.get("before") ?? Number.NaN);
    if (item && !isUuid(item)) throw bad();
    if (def && !/^[a-z0-9:-]{1,48}$/.test(def)) throw bad();
    if (kind && kind !== "board" && kind !== "direct") throw bad();
    const player = who ? await findCharacter(who) : undefined;
    const counterpart = other ? await findCharacter(other) : undefined;
    if (counterpart && !player) throw bad();
    return {
      trades: await reads.trades({
        ...(player ? { player } : {}),
        ...(counterpart ? { counterpart } : {}),
        ...(item ? { item } : {}),
        ...(def ? { def } : {}),
        ...(kind ? { kind: kind as "board" | "direct" } : {}),
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
        ...(Number.isSafeInteger(before) ? { before } : {}),
      }),
    };
  });

  route("GET", "/players/:id/partners", async (_req, [id]) => {
    if (!isUuid(id)) throw bad();
    return { partners: await reads.partners(await characterOf(id)) };
  });

  route("GET", "/audit", async (req) => {
    const q = req.query;
    const before = Number(q.get("before") ?? Number.NaN);
    return {
      rows: await listAudit(db, {
        ...(q.get("admin") ? { admin: q.get("admin") as string } : {}),
        ...(q.get("action") ? { action: q.get("action") as string } : {}),
        ...(q.get("target") ? { target: q.get("target") as string } : {}),
        ...(Number.isSafeInteger(before) ? { before } : {}),
        limit: 200,
      }),
    };
  });

  // Admins (owners) ----------------------------------------------------------------------------

  route("GET", "/admins", async (req) => {
    owner(req);
    return { admins: await deps.auth.list() };
  });

  route("POST", "/admins/:id", async (req, [id]) => {
    owner(req);
    const b = obj(req.body);
    if (!isUuid(id)) throw bad();
    const role = b.role === undefined ? undefined : (b.role as AdminRole);
    const status = b.status === undefined ? undefined : b.status;
    if (role !== undefined && !ADMIN_ROLES.includes(role)) throw bad();
    if (status !== undefined && status !== "active" && status !== "disabled") throw bad();
    if (role === undefined && status === undefined) throw bad();
    const out = await deps.auth.edit(
      req.admin,
      id,
      { ...(role ? { role } : {}), ...(status ? { status } : {}) },
      reason(b),
    );
    if (out === "not_found") throw new HttpError(404, "not_found");
    if (out === "self") throw new HttpError(409, "self");
    return { admins: await deps.auth.list() };
  });

  return async (req) => {
    for (const [method, pattern, handler] of table) {
      if (method !== req.method) continue;
      const m = pattern.exec(req.path);
      if (!m) continue;
      let params: string[];
      try {
        params = m.slice(1).map((s) => decodeURIComponent(s));
      } catch {
        throw bad();
      }
      return handler(req, params);
    }
    return null;
  };
}
