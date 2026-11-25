/**
 * The opening's stairs (PLAN §4 beat 4) in the character's private copy of 가설관 중앙 계단:
 * red 오답 pour up the flights landing by landing, the senior of each class holds theirs, and
 * the player fights down. A wave starts when the scene waits on its `clear:` condition and the
 * player stands on its landing; its last 오답 down meets the condition.
 */
import { monsterKindIndex, OPENING_STAIRS, type OpeningWave } from "@guago/content";
import { type Monster, type Player, spawnMonster, TILE_SIZE, ticks } from "@guago/shared";
import type { Encounter, EncounterHost, EncounterKind } from "../encounter.ts";
import { meetWhile, storyHooks } from "../story-signals.ts";
import { holdSenior, seatSenior } from "./seniors.ts";

interface Running {
  readonly def: OpeningWave;
  /** Its 오답, with the entity each was spawned under (a pooled monster is reused). */
  readonly monsters: { readonly m: Monster; readonly entity: number }[];
  readonly seniors: Player[];
  nextPour: number;
}

const alive = ({ m, entity }: { m: Monster; entity: number }) => m.alive && m.entity === entity;

class Stairs implements Encounter {
  readonly noDemerit = true;
  private player: Player | undefined;
  private wave: Running | undefined;
  /** The condition the last wave met, until the scene moves past it. */
  private cleared: string | undefined;
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
    this.end(true);
  }

  afterStep(): void {
    const hooks = storyHooks();
    const owner = this.host.options.owner;
    const p = this.player;
    if (!hooks || !owner || !p?.joined) return;
    const waiting = hooks.waitingOn(owner);
    if (this.cleared !== waiting) this.cleared = undefined;
    // The scene moved on without this wave (skipped, replayed): it ends here.
    if (this.wave && this.wave.def.until !== waiting) this.end(true);
    if (!this.wave && waiting !== this.cleared) {
      const def = OPENING_STAIRS.waves.find((w) => w.until === waiting);
      if (def && this.onLanding(p, def)) this.start(def);
    }
    const run = this.wave;
    if (run) {
      for (const s of run.seniors) holdSenior(this.host.world, s);
      this.pour(run);
      if (run.monsters.length >= run.def.count && !run.monsters.some(alive)) {
        this.cleared = run.def.until;
        this.end(false);
      }
    }
    meetWhile(hooks, owner, (until) => until === this.cleared);
  }

  dispose(): void {
    this.end(true);
  }

  private onLanding(p: Player, def: OpeningWave): boolean {
    const at = this.host.def.marks[def.landing];
    if (!at) return true;
    return Math.hypot(p.x - at.x, p.y - at.y) <= OPENING_STAIRS.reach * TILE_SIZE;
  }

  private start(def: OpeningWave): void {
    const w = this.host.world;
    const seniors: Player[] = [];
    def.seniors.forEach((s, i) => {
      const body = seatSenior(w, this.host.def, s, i);
      if (body) seniors.push(body);
    });
    this.wave = { def, monsters: [], seniors, nextPour: w.tick };
  }

  /** A few more 오답 come up from below, until the wave is all out. */
  private pour(run: Running): void {
    const w = this.host.world;
    const { def } = run;
    if (w.tick < run.nextPour || run.monsters.length >= def.count) return;
    run.nextPour = w.tick + ticks(def.pour.every);
    const kind = w.rules.monsters[monsterKindIndex(def.monster)];
    if (!kind) return;
    const { from } = def;
    for (let i = 0; i < def.pour.count && run.monsters.length < def.count; i++) {
      // Tried a few times for an open tile, then left for the next pour.
      for (let tries = 0; tries < 6; tries++) {
        const x = (from.x + w.random.next() * from.w) * TILE_SIZE;
        const y = (from.y + w.random.next() * from.h) * TILE_SIZE;
        if (w.tileAt(x, y) !== 0) continue;
        const m = spawnMonster(w, kind, OPENING_STAIRS.level, false, x, y);
        if (m) run.monsters.push({ m, entity: m.entity });
        break;
      }
    }
  }

  /** The wave's seniors step out; a wave cut short takes its 오답 with it. */
  private end(cut: boolean): void {
    const run = this.wave;
    if (!run) return;
    this.wave = undefined;
    const w = this.host.world;
    if (cut) for (const one of run.monsters) if (alive(one)) one.m.gone = true;
    for (const s of run.seniors) w.removePlayer(s.id);
  }
}

/** Runs in a character's private copy of the stairs only. */
export const openingStairs: EncounterKind = {
  id: "opening-stairs",
  matches: (def, options) => def.id === OPENING_STAIRS.map && options.owner !== undefined,
  // The stairs are one safe zone for everyone else; the opening fights on them.
  map: (fightMap) => ({ ...fightMap, safe: [] }),
  create: (host) => new Stairs(host),
};
