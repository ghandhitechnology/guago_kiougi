/**
 * Pool damage a same-level player deals each boss per second, gates open and gates shut, in
 * same-level normal monsters' health (`monsterHP(level, 1)`): what `RAID.floor.normalsPerSecond`
 * stands for. One 반자동 player of each class with its starter books stands in reach of the body
 * for a minute; the brain runs as it would, only its gate is held open or shut.
 */

import { type BossBrain, Mode, monsterHP, Rank } from "@guago/shared";
import { fmt } from "./report.ts";
import { type Arena, arena, at, heal, MAJORS, run, sum, walk } from "./sim.ts";

const SECONDS = 60;

export interface Rate {
  readonly boss: string;
  readonly major: string;
  /** Normals a second into the pool: gate open, gate shut (no shield), and open at half shield. */
  readonly open: number;
  readonly shut: number;
  readonly openHalf: number;
}

/** Holds the gate open or shut for this fight, the rest of the brain running as it does. */
function holdGate(a: Arena, open: boolean): void {
  const brain = a.b.brain;
  const held: BossBrain = { ...brain, gate: () => (open ? 1 : 0) };
  (a.b as { brain: BossBrain }).brain = held;
}

function measure(id: string, major: string, open: boolean, shield: number): number {
  const probe = arena(id, []);
  const c = probe.b.core;
  const spot = { x: c.x, y: c.y + c.radius + 36 };
  const a = arena(id, [{ ...spot, mode: Mode.Semi, major }], { seed: 3, hp: 1e12 });
  holdGate(a, open);
  a.b.shield = shield;
  a.b.regrow = 0;
  // 제논's wall would keep the player out of reach: the measurement stands past it (his brain's
  // number 1 is the tick his paradox stays broken until).
  if (id === "zeno") a.b.n[1] = Number.POSITIVE_INFINITY;
  const p = at(a.players, 0);
  run(a, SECONDS * 20, (x) => {
    heal(x);
    x.b.shield = shield;
    // Back to the spot after every knock and roll, and with the boss when it moves.
    walk(x, p, x.b.core.x, x.b.core.y + x.b.core.radius + 36);
  });
  return sum(a.dealt) / SECONDS / monsterHP(a.level, Rank.Normal);
}

export function measureRates(): Rate[] {
  const out: Rate[] = [];
  for (const id of ["pythagoreans", "zeno", "aristotle"]) {
    for (const major of MAJORS) {
      out.push({
        boss: id,
        major,
        open: measure(id, major, true, 0),
        shut: measure(id, major, false, 0),
        openHalf: measure(id, major, true, 0.5),
      });
    }
  }
  return out;
}

export function rateTable(rates: readonly Rate[]): string[] {
  const lines = ["boss          class      open   shut   open@½shield"];
  for (const r of rates) {
    lines.push(
      `${r.boss.padEnd(13)} ${r.major.padEnd(10)} ${fmt(r.open, 2).padStart(5)}  ${fmt(r.shut, 3).padStart(5)}  ${fmt(r.openHalf, 2).padStart(5)}`,
    );
  }
  return lines;
}
