/**
 * The raid's operations (PLAN §10 rewards by tier, §13 탐구 토큰, bound boss drops), run by the one
 * executor like every item and currency change: one transaction under the character lock, ledger
 * entries for every unit, and a durable row that says the reward went out, so a phase's reward is
 * paid once per character however often it is retried, whatever restarted, and from whichever
 * channel the character fought in. Operation ids are pruned after an hour; the rows are not.
 */
import { bossLoot, type Drop, ledgerKey, raidBoss } from "@guago/content";
import { earn, type LedgerEntry, Random } from "@guago/shared";
import type { Applied, Loaded, OpDef, Step } from "../economy/ops.ts";
import { type ItemRow, newToolRow } from "../economy/rows.ts";

export interface RaidRequests {
  /** One phase's reward for one character: its tier's 탐구 토큰 and loot rolls, once. */
  "raid.reward": { raid: string; phase: number; boss: string };
  /** A 복습's first clear: the boss's first-clear 탐구 토큰, once per character and boss. */
  "raid.firstClear": { boss: string };
}

type Defs = { [K in keyof RaidRequests]: OpDef<RaidRequests[K]> };

const ok = (value: Applied): Step => ({ ok: true, value });
const no = (error: string): Step => ({ ok: false, error: error as never });

/** A roll's tools as new item rows, bound to the character (origin `raid`, PLAN §13). */
function give(
  drops: readonly Drop[],
  newId: () => string,
): { tools: ItemRow[]; keys: Map<string, string> } {
  const tools: ItemRow[] = [];
  const keys = new Map<string, string>();
  for (const drop of drops) {
    if (drop.item.kind !== "tool") continue;
    const row = newToolRow({ id: newId(), def: drop.item.tool, level: 1 }, "raid");
    tools.push(row);
    keys.set(row.id, ledgerKey(drop.source));
  }
  return { tools, keys };
}

export function raidOps(): Defs {
  return {
    "raid.reward": {
      client: false,
      rows: (req) => ({ live: { raid: { raid: req.raid, phase: req.phase } } }),
      currencies: () => ["token"],
      apply(l: Loaded, req, env) {
        const def = raidBoss(req.boss);
        const row = l.live.raid;
        if (!def || !row) return no("quest_missing");
        if (row.tier === null) return no("quest_not_done");
        if (row.paid) return ok({ outcome: { paid: false } });
        const tier = row.tier;
        const tokens = def.rewards.tokens[tier] ?? 0;
        const rolls = def.rewards.rolls[tier] ?? 0;
        // Every roll is the server's (PLAN §19), seeded once per operation from its randomness.
        const random = new Random(Math.floor(env.roll() * 2 ** 32));
        const drops: Drop[] = [];
        for (let i = 0; i < rolls; i++) drops.push(...bossLoot(random, def, l.character.major));
        let purse = l.purse;
        const ledger: LedgerEntry[] = [];
        if (tokens > 0) {
          const t = earn(purse, { token: tokens }, `raid.${def.id}.phase`);
          purse = t.purse;
          ledger.push(...t.ledger);
        }
        const g = give(drops, env.newId);
        return ok({
          purse,
          ledger,
          put: g.tools,
          itemKey: (id) => g.keys.get(id) ?? `raid.${def.id}`,
          live: { raidPaid: { raid: req.raid, phase: req.phase } },
          outcome: {
            paid: true,
            tier,
            tokens,
            rolls,
            drops: drops.length,
            items: g.tools.map((t) => t.id),
          },
        });
      },
    },

    "raid.firstClear": {
      client: false,
      rows: (req) => ({ live: { cleared: req.boss } }),
      currencies: () => ["token"],
      apply(l, req) {
        const def = raidBoss(req.boss);
        if (!def) return no("unknown_def");
        if (l.live.cleared) return ok({ outcome: { paid: false } });
        const t = earn(l.purse, { token: def.firstClear.tokens }, `raid.${def.id}.first-clear`);
        return ok({
          purse: t.purse,
          ledger: t.ledger,
          live: { cleared: def.id },
          outcome: { paid: true, tokens: def.firstClear.tokens },
        });
      },
    },
  };
}
