/**
 * The opening's field (PLAN §4 beat 5) in the character's private copy of the 운동장: the
 * 오답노트 골렘 rises at its mark when the scene waits on its first telegraph, and the fight meets
 * the beat's conditions in order: the first slam's tell, the player's first roll out of one, its
 * defeat, and the player picking up a drop after it. Until the player has dodged once it holds
 * at a share of its health, so the beat that teaches the dodge cannot be skipped by damage.
 */
import { monsterKindIndex, ODAP_GOLEM, OPENING_GOLEM } from "@guago/content";
import {
  Dirty,
  Ev,
  FxKind,
  HurtFlag,
  type Monster,
  MState,
  type Player,
  spawnMonster,
  ticks,
} from "@guago/shared";
import type { Encounter, EncounterHost, EncounterKind } from "../encounter.ts";
import { meetWhile, storyHooks } from "../story-signals.ts";

/** Drops of the golem a player has not picked up are kept this long past each tick. */
const KEEP_DROPS = ticks(10);

class Golem implements Encounter {
  readonly noDemerit = true;
  private player: Player | undefined;
  private golem: { readonly m: Monster; readonly entity: number } | undefined;
  /** Slams told and not landed yet: when the tell appeared and when it lands. */
  private readonly tells: { readonly born: number; readonly fireAt: number }[] = [];
  private lastRoll = -1;
  private told = false;
  private dodged = false;
  private defeated = false;
  private picked = false;
  private readonly host: EncounterHost;

  constructor(host: EncounterHost) {
    this.host = host;
  }

  joined(p: Player, characterId: string): void {
    if (characterId === this.host.options.owner) this.player = p;
  }

  leaving(p: Player): void {
    if (p !== this.player) return;
    this.player = undefined;
    // Its summons and the golem itself go; coming back raises it again where the scene stands.
    for (const m of this.host.world.monsters) if (m.alive) m.gone = true;
    this.golem = undefined;
    this.tells.length = 0;
  }

  afterStep(): void {
    const hooks = storyHooks();
    const owner = this.host.options.owner;
    const p = this.player;
    if (!hooks || !owner || !p?.joined) return;
    const w = this.host.world;
    const S = OPENING_GOLEM.signals;
    const g = this.golem;
    let slammed = false;
    for (let i = 0; i < w.eventCount; i++) {
      const e = w.events[i];
      if (!e) continue;
      if (e.type === Ev.Roll && e.a === p.index) this.lastRoll = w.tick;
      else if (e.type === Ev.Hurt && e.a === p.index && e.e & HurtFlag.Slam) slammed = true;
      else if (e.type === Ev.Kill && g && e.c === g.entity) this.defeated = true;
      else if (e.type === Ev.Collect && e.a === p.index && this.defeated) this.picked = true;
    }
    if (this.defeated) {
      this.golem = undefined;
      // A golem down meets everything before it, so the scene can never wait on a dead one.
      this.told = true;
      this.dodged = true;
    } else if (g?.m.alive && g.m.entity === g.entity) {
      this.watch(g.m, slammed);
    } else {
      const waiting = hooks.waitingOn(owner);
      if (waiting === S.telegraph || waiting === S.dodged || waiting === S.defeat) this.rise();
    }
    if (this.defeated && !this.picked && hooks.waitingOn(owner) === S.pickup) {
      for (const k of w.pickups) {
        if (k.alive && k.owner === p.index) k.until = Math.max(k.until, w.tick + KEEP_DROPS);
      }
    }
    meetWhile(hooks, owner, (until) => {
      if (until === S.telegraph) return this.told;
      if (until === S.dodged) return this.dodged;
      if (until === S.defeat) return this.defeated;
      if (until === S.pickup) return this.picked;
      return false;
    });
  }

  dispose(): void {}

  /** Comes up out of the ground at its mark, harmless until it has risen. */
  private rise(): void {
    const w = this.host.world;
    const at = this.host.def.marks[OPENING_GOLEM.mark] ?? w.map.spawn;
    const kind = w.rules.monsters[monsterKindIndex(ODAP_GOLEM.id)];
    if (!kind) return;
    const m = spawnMonster(w, kind, ODAP_GOLEM.level, false, at.x, at.y);
    if (!m) return;
    m.state = MState.Arrive;
    m.stateUntil = w.tick + ticks(OPENING_GOLEM.rise);
    this.golem = { m, entity: m.entity };
    this.tells.length = 0;
  }

  /** Its tells this tick, the ones that landed, and its hold until the first dodge. */
  private watch(m: Monster, slammed: boolean): void {
    const w = this.host.world;
    for (const e of w.effects) {
      if (!e.alive || e.kind !== FxKind.Danger || e.born !== w.tick) continue;
      if (e.source !== m.index || e.slot !== m.entity) continue;
      this.tells.push({ born: e.born, fireAt: e.fireAt });
      this.told = true;
    }
    for (let i = this.tells.length - 1; i >= 0; i--) {
      const t = this.tells[i];
      if (!t || t.fireAt > w.tick) continue;
      this.tells.splice(i, 1);
      // Landed with the player clear of it after a roll since its tell: the first dodge.
      if (!slammed && this.lastRoll >= t.born) this.dodged = true;
    }
    const floor = m.maxHp * OPENING_GOLEM.holdHp;
    if (!this.dodged && m.hp < floor) {
      m.hp = floor;
      m.dirty |= Dirty.Hp;
    }
  }
}

/** Runs in a character's private copy of the field only. */
export const openingGolem: EncounterKind = {
  id: "opening-golem",
  matches: (def, options) => def.id === OPENING_GOLEM.map && options.owner !== undefined,
  create: (host) => new Golem(host),
};
