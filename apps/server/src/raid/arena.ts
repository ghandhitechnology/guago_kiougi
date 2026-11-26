/**
 * One channel of a boss arena (PLAN §10: open world, shared, the era boss's "holds the whole
 * server"). The channel runs its own body, tells, adds and objectives in its own fight, with the
 * pool switched to `external`: after each tick it hands the raid what its players dealt, which
 * objectives they did and who helped, and takes back the pool, phase and shield every channel
 * left. Knock-outs wake at the arena's entrance with no 벌점.
 */
import { raidBossOn } from "@guago/content";
import {
  BOSS_PLAYERS,
  type Boss,
  Ev,
  type FightWorld,
  isActive,
  MODE_AUTO,
  type Player,
  RAID,
  startBoss,
  TICK_MS,
} from "@guago/shared";
import type { Encounter, EncounterHost, EncounterKind } from "../encounter.ts";
import { raids } from "./current.ts";
import type { Raid } from "./hub.ts";

class Arena implements Encounter {
  readonly noDemerit = true;
  private readonly host: EncounterHost;
  private readonly bossId: string;
  private readonly level: number;
  private boss: Boss | null = null;
  private raid: Raid | null = null;
  /** Kind indices whose kills count as support: the boss's adds. */
  private readonly addKind: number;
  /** Per player index: the last tick its own hit landed on the boss, and the last it moved. */
  private readonly hitAt = new Int32Array(BOSS_PLAYERS);
  private readonly movedAt = new Int32Array(BOSS_PLAYERS);
  private readonly objectives = new Int32Array(BOSS_PLAYERS);
  private readonly support = new Int32Array(BOSS_PLAYERS);

  constructor(host: EncounterHost) {
    this.host = host;
    const def = raidBossOn(host.def.id);
    if (!def) throw new Error(`no boss on ${host.def.id}`);
    this.bossId = def.id;
    this.level = def.level;
    const rule = host.world.rules.bosses.find((b) => b.id === def.id);
    this.addKind = rule?.add ?? -1;
  }

  afterStep(): void {
    const w = this.host.world;
    const raid = raids()?.raidFor(this.bossId) ?? null;
    // The raid this body belonged to is over (freed), or another run of the Page put up a new one.
    if (this.boss && raid !== this.raid) {
      if (!this.boss.freed) this.boss.free(w);
      this.boss = null;
    }
    this.raid = raid;
    if (!raid) return;
    if (!this.boss) {
      const b = startBoss(w, this.bossId, this.level, { hp: raid.max, external: true });
      if (raid.phase > 1) b.setPhase(w, raid.phase, raid.max, raid.shield);
      b.sync(raid.hp, raid.max, raid.shield, raid.emptied);
      b.debate = raid.debate;
      this.boss = b;
      return;
    }
    const b = this.boss;
    this.report(w, b, raid);
    if (raid.freed) {
      b.free(w);
      return;
    }
    if (raid.phase !== b.phase) b.setPhase(w, raid.phase, raid.max, raid.shield);
    b.sync(raid.hp, raid.max, raid.shield, raid.emptied);
    b.debate = raid.debate;
  }

  /** This tick's damage, objectives, help and active time, to the shared raid. */
  private report(w: FightWorld, b: Boss, raid: Raid): void {
    const tick = w.tick;
    this.objectives.fill(0);
    this.support.fill(0);
    for (let i = 0; i < w.eventCount; i++) {
      const e = w.events[i];
      if (!e) continue;
      switch (e.type) {
        case Ev.Objective:
          if (e.a >= 0 && e.a < BOSS_PLAYERS)
            this.objectives[e.a] = (this.objectives[e.a] as number) + 1;
          break;
        case Ev.Revive:
          if (e.b >= 0 && e.b < BOSS_PLAYERS)
            this.support[e.b] = (this.support[e.b] as number) + RAID.support.revive;
          break;
        case Ev.Credit:
          if (e.d === this.addKind && e.a >= 0 && e.a < BOSS_PLAYERS)
            this.support[e.a] = (this.support[e.a] as number) + RAID.support.add;
          break;
      }
    }
    const activeMs = TICK_MS * raid.rate;
    let top: Player | null = null;
    let topDealt = 0;
    for (const p of w.players) {
      if (!p.joined || p.index >= BOSS_PLAYERS) continue;
      const i = p.index;
      const dealt = b.dealtBy[i] as number;
      if (dealt > 0) {
        this.hitAt[i] = tick;
        if (dealt > topDealt) {
          topDealt = dealt;
          top = p;
        }
      }
      if (p.movedX !== 0 || p.movedY !== 0) this.movedAt[i] = tick;
      const active = isActive(
        {
          away: p.away,
          serverMoves: MODE_AUTO[p.mode].move,
          inputAt: this.host.inputAt(p),
          movedAt: this.movedAt[i] as number,
          hitAt: this.hitAt[i] as number,
        },
        tick,
      );
      // A dropped client's body earns no objectives or help for its character.
      const objectives = p.away ? 0 : (this.objectives[i] as number);
      const support = p.away ? 0 : (this.support[i] as number);
      if (!active && dealt <= 0 && objectives === 0 && support === 0) continue;
      const id = this.host.characterOf(p);
      if (!id) continue;
      raid.credit(id, this.host.nameOf(p) ?? "", dealt, active ? activeMs : 0, objectives, support);
    }
    const finisher = b.emptiedBy >= 0 ? w.players[b.emptiedBy] : top;
    const id = finisher ? this.host.characterOf(finisher) : undefined;
    const by = finisher && id ? { id, name: this.host.nameOf(finisher) ?? "" } : null;
    raid.hit(b.dealt, b.strips, by);
    b.drain();
  }

  leaving(p: Player): void {
    if (p.index >= BOSS_PLAYERS) return;
    this.hitAt[p.index] = 0;
    this.movedAt[p.index] = 0;
  }

  dispose(): void {
    this.boss = null;
    this.raid = null;
  }
}

/** Every channel of a boss's arena runs the shared raid; a private copy runs 복습 instead. */
export const raidArena: EncounterKind = {
  id: "raid",
  matches: (def, options) => options.owner === undefined && raidBossOn(def.id) !== undefined,
  create: (host) => new Arena(host),
};
