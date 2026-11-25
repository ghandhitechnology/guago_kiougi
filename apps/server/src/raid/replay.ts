/**
 * 복습 (PLAN §10 shared progress): any boss the server has freed, fought again alone at the
 * player's own level in a private copy of its arena, its 논제 one after another on the fight's
 * own pool. The first clear pays the boss's first-clear 탐구 토큰 once (`raid.firstClear`, kept by
 * its `boss_clears` row) and counts for the story (`bossCleared`); a moment later the player is
 * walked back to where they asked for it.
 */
import { LIFECYCLES, lifecycleOf, type RaidBossDef, raidBoss } from "@guago/content";
import { type Boss, type Player, startBoss, TICK_RATE_HZ } from "@guago/shared";
import type { Encounter, EncounterHost, EncounterKind } from "../encounter.ts";
import { live } from "../live/current.ts";
import { raids } from "./current.ts";

/** Seconds between the boss falling and the walk back. */
const BACK_AFTER_S = 6;

/** Where each character asked for its 복습, to be walked back there after. */
const origins = new Map<string, string>();

/** Whether `boss` may be fought again: freed on the live Page, or on one before it. */
export function mayReplay(def: RaidBossDef): boolean {
  const l = live();
  if (!l) return false;
  const page = LIFECYCLES.find((x) => x.bosses.includes(def.id))?.page ?? 0;
  return page < l.page.live() || l.page.freedBosses()[def.id] !== undefined;
}

/** The map a character left for its 복습. */
export function noteReplay(characterId: string, from: string): void {
  origins.set(characterId, from);
  if (origins.size > 10_000) origins.delete(origins.keys().next().value as string);
}

class Replay implements Encounter {
  readonly noDemerit = true;
  private readonly host: EncounterHost;
  private readonly def: RaidBossDef;
  private readonly owner: string;
  private boss: Boss | null = null;
  /** Ticks until the walk back, once cleared; -1 before. */
  private back = -1;

  constructor(host: EncounterHost, def: RaidBossDef, owner: string) {
    this.host = host;
    this.def = def;
    this.owner = owner;
  }

  joined(p: Player, characterId: string): void {
    if (characterId !== this.owner || this.boss) return;
    this.boss = startBoss(this.host.world, this.def.id, p.level);
  }

  afterStep(): void {
    const b = this.boss;
    if (!b?.freed) return;
    if (this.back < 0) {
      this.back = BACK_AFTER_S * TICK_RATE_HZ;
      raids()?.firstClear(this.owner, this.def.id);
      return;
    }
    if (this.back > 0 && --this.back === 0) {
      const to = origins.get(this.owner) ?? lifecycleOf(1)?.town ?? this.host.def.id;
      origins.delete(this.owner);
      this.host.relocate(this.owner, to, "main", "replay");
    }
  }

  dispose(): void {
    this.boss = null;
  }
}

/** A private copy made for a 복습 (`channels.instance(..., { boss })`) of that boss's arena. */
export const raidReplay: EncounterKind = {
  id: "replay",
  matches: (def, options) =>
    options.owner !== undefined &&
    options.boss !== undefined &&
    raidBoss(options.boss)?.map === def.id,
  create: (host) => {
    const def = raidBoss(host.options.boss ?? "");
    if (!def || !host.options.owner) throw new Error("a 복습 room needs a boss and an owner");
    return new Replay(host, def, host.options.owner);
  },
};
