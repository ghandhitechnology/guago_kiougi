/**
 * Player reports (PLAN §12 "Report", "Moderation"), stored for the admin queue. The server
 * attaches the reported player's last lines from `chat_log` itself; nothing the reporter's client
 * says about the messages is trusted. A report on the same player in the same category while one
 * is open is the same report; the reporter's open reports are capped by a counter CHECK. The
 * reporter learns nothing back: every outcome, an unknown player included, is the same
 * acknowledgement.
 */
import { REPORT_CONTEXT_LINES, type ReportCategory } from "@guago/shared";
import { sql } from "drizzle-orm";
import type { ChatSink } from "../chat/log.ts";
import { type Db, describeError, pgErrorCode } from "../db/index.ts";

export interface ReportContext {
  /** The reported player's last lines, newest first, as sent (before masking). */
  lines: { ch: string; target: string | null; body: string; masked: boolean; at: string }[];
  /** The chat line the report was made from, by its id in this server process, if any. */
  line?: { id: number; at: string };
}

export interface ReportRequest {
  target: string;
  category: ReportCategory;
  /** Already cleaned; empty is none. */
  note: string;
  line?: number;
}

export function createReports(db: Db, log: ChatSink | undefined, now: () => number = Date.now) {
  return {
    /** Always resolves: the reporter is told nothing either way. */
    async file(reporter: string, req: ReportRequest): Promise<void> {
      if (reporter === req.target) return;
      try {
        const known = await db.execute(sql`select 1 from characters where id = ${req.target}`);
        if (!known.rows[0]) return;
        // Lines still queued for the log go in first, so the last few seconds count.
        await log?.flush();
        const { rows } = await db.execute(sql`
          select channel, target, body, masked, at from chat_log
          where sender_id = ${req.target}
          order by at desc limit ${REPORT_CONTEXT_LINES}`);
        const context: ReportContext = {
          lines: rows.map((r) => ({
            ch: r.channel as string,
            target: (r.target as string | null) ?? null,
            body: r.body as string,
            masked: Boolean(r.masked),
            at: new Date(r.at as string).toISOString(),
          })),
          ...(req.line === undefined
            ? {}
            : { line: { id: req.line, at: new Date(now()).toISOString() } }),
        };
        await db.execute(sql`
          insert into reports (reporter_id, target_id, category, note, context)
          values (${reporter}, ${req.target}, ${req.category}, ${req.note || null},
                  ${JSON.stringify(context)}::jsonb)
          on conflict (reporter_id, target_id, category) where state = 'open' do nothing`);
      } catch (error) {
        // Over the open-report cap: dropped like a duplicate.
        if (pgErrorCode(error).constraint === "social_counts_open_reports_check") return;
        console.error(`report failed: ${describeError(error)}`);
      }
    },
  };
}

export type Reports = ReturnType<typeof createReports>;
