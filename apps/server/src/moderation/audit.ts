/**
 * The admin audit log (PLAN §12 "Audit log", §20 `admin_actions`). Every admin action writes one
 * row, inside the action's own transaction wherever the action is a database change. There is
 * only `record` and `listAudit`: no update or delete path exists, and the table's trigger
 * refuses both.
 */
import { sql } from "drizzle-orm";
import type { Queryable } from "../economy/executor.ts";

export type AuditAction =
  | "login"
  | "logout"
  | "ban"
  | "unban"
  | "mute"
  | "unmute"
  | "kick"
  | "strike"
  | "grant"
  | "filter.add"
  | "filter.remove"
  | "broadcast"
  | "report.resolve"
  | "chat.read"
  | "inventory.read"
  | "admin.edit"
  | "post.remove"
  | "notice.remove"
  | "posts.read"
  | "player.read"
  | "player.search"
  | "reports.read"
  | "trades.read"
  | "login.failed"
  | "cli.create"
  | "cli.password"
  | "cli.enable"
  | "cli.disable";

export interface AuditEntry {
  adminId: string;
  action: AuditAction;
  target: string;
  reason?: string | null;
  detail?: Record<string, unknown>;
  /** For economy operations: the row is written once per operation id. */
  opId?: string;
}

export const target = {
  account: (id: string) => `account:${id}`,
  character: (id: string) => `character:${id}`,
  report: (id: number) => `report:${id}`,
  admin: (id: string) => `admin:${id}`,
  filter: "filter",
  server: "server",
} as const;

/** Writes one row. Returns false only when an operation id already has its row. */
export async function record(q: Queryable, e: AuditEntry): Promise<boolean> {
  const { rowCount } = await q.execute(sql`
    insert into admin_actions (admin_id, action, target, reason, detail, op_id)
    values (${e.adminId}, ${e.action}, ${e.target}, ${e.reason ?? null},
            ${JSON.stringify(e.detail ?? {})}::jsonb, ${e.opId ?? null})
    on conflict (admin_id, op_id) where op_id is not null do nothing`);
  return (rowCount ?? 0) > 0;
}

export interface AuditRow {
  id: number;
  at: string;
  admin: string;
  action: string;
  target: string;
  reason: string | null;
  detail: Record<string, unknown>;
}

export interface AuditQuery {
  admin?: string;
  action?: string;
  /** Exact target: `account:<id>`. */
  target?: string;
  /** Rows older than this id (paging). */
  before?: number;
  limit?: number;
}

export async function listAudit(q: Queryable, query: AuditQuery = {}): Promise<AuditRow[]> {
  const limit = Math.min(Math.max(query.limit ?? 100, 1), 500);
  const { rows } = await q.execute(sql`
    select a.id, a.at, m.login_id as admin, a.action, a.target, a.reason, a.detail
    from admin_actions a join admin_accounts m on m.id = a.admin_id
    where (${query.admin ?? null}::text is null or m.login_id = ${query.admin ?? null})
      and (${query.action ?? null}::text is null or a.action = ${query.action ?? null})
      and (${query.target ?? null}::text is null or a.target = ${query.target ?? null})
      and (${query.before ?? null}::bigint is null or a.id < ${query.before ?? null})
    order by a.id desc
    limit ${limit}`);
  return rows.map((r) => ({
    id: Number(r.id),
    at: new Date(r.at as string).toISOString(),
    admin: r.admin as string,
    action: r.action as string,
    target: r.target as string,
    reason: (r.reason as string | null) ?? null,
    detail: (r.detail as Record<string, unknown>) ?? {},
  }));
}
