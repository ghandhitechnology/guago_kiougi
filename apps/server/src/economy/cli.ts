/**
 * Economy tools against DATABASE_URL (or the local dev database):
 *
 *   pnpm economy check                 every invariant; exits 1 on any violation
 *   pnpm economy daily [days] [cur]    daily totals by source and sink, default 7 days of 솔방울
 *   pnpm economy grant <name> [coin=N] [ink=N] [binding=N] [sheet:<book>=N] [exp=N]
 *                                      a combat grant through the executor, for local testing
 */
import { config } from "../config.ts";
import { createDb } from "../db/index.ts";
import { checkInvariants, dailyTotals } from "./audit.ts";
import { createEconomy } from "./index.ts";
import type { GrantRequest } from "./ops.ts";

const url = process.env.DATABASE_URL ?? config.databaseUrl;
const db = createDb(url);
const [command, ...args] = process.argv.slice(2);

async function check(): Promise<number> {
  const report = await checkInvariants(db);
  const c = report.counts;
  console.log(
    `characters ${c.characters}, items ${c.items}, material stacks ${c.materials}, ledger rows ${c.ledger}, operations ${c.operations}`,
  );
  for (const v of report.violations)
    console.log(`VIOLATION ${v.check} ${v.characterId ?? "-"} ${v.detail}`);
  console.log(report.ok ? "all invariants hold" : `${report.violations.length} violations`);
  return report.ok ? 0 : 1;
}

async function daily(): Promise<number> {
  const days = Number(args[0] ?? 7);
  const currency = args[1] ?? "pinecone";
  const to = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
  const from = new Date(Date.now() + 9 * 3600_000 - (days - 1) * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const rows = await dailyTotals(db, { from, to, currency });
  for (const r of rows) {
    console.log(
      `${r.day}  ${r.currency.padEnd(10)} ${r.sourceOrSink.padEnd(40)} ${r.amount.padStart(16)}  (${r.entries})`,
    );
  }
  if (rows.length === 0) console.log(`no ${currency} moved from ${from} to ${to}`);
  return 0;
}

async function grant(): Promise<number> {
  const [name, ...amounts] = args;
  const { rows } = await db.pool.query("select id from characters where lower(name) = lower($1)", [
    name ?? "",
  ]);
  const id = rows[0]?.id as string | undefined;
  if (!id) {
    console.error(`no character named ${name}`);
    return 1;
  }
  const source = { kind: "monster", fieldId: "dev", monsterId: "dev", rank: "normal" } as const;
  const request: GrantRequest = { exp: 0, drops: [] };
  for (const a of amounts) {
    const [key, value] = a.split("=");
    const n = Number(value);
    if (key === "exp") request.exp = n;
    else if (key === "coin") request.drops.push({ item: { kind: "coin", amount: n }, source });
    else if (key === "ink" || key === "binding")
      request.drops.push({ item: { kind: key, qty: n }, source });
    else if (key?.startsWith("sheet:")) {
      request.drops.push({ item: { kind: "page", book: key.slice(6), qty: n }, source });
    } else {
      console.error(`unknown amount ${a}`);
      return 1;
    }
  }
  const economy = createEconomy(db);
  const result = await economy.executor.execute(id, `dev-grant:${Date.now()}`, "grant", request);
  console.log(JSON.stringify(result, null, 2));
  return result.ok ? 0 : 1;
}

const commands: Record<string, () => Promise<number>> = { check, daily, grant };
try {
  const run = commands[command ?? ""];
  if (!run) {
    console.error("usage: economy check | daily [days] [currency] | grant <name> [coin=N] ...");
    process.exitCode = 2;
  } else {
    process.exitCode = await run();
  }
} finally {
  await db.pool.end();
}
