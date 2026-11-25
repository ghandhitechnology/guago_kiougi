/**
 * How hard a missed tell lands, as a share of a same-level student's health: one hurts and is
 * survivable, two kill (`RaidBossDef.tellDamage`).
 */

import { BOSS_TELL, Ev, FxKind, HurtFlag, Mode, TellKind } from "@guago/shared";
import { thesis } from "./aristotle.ts";
import { type Check, fmt } from "./report.ts";
import { arena, eachEvent, run, type Seat } from "./sim.ts";

export function tellHits(checks: Check[]): void {
  const out: string[] = [];
  let ok = true;
  for (const id of ["pythagoreans", "zeno", "aristotle"] as const) {
    const probe = arena(id, []);
    const c = probe.b.core;
    const ring = probe.w.map.marks?.["ring-96"] ?? c;
    // Standing still with books off, so every tell they are under lands. At 제논's, one holds
    // the first circle (too few to fill it) and the rest stand on the track; at 아리스토텔레스's
    // they stand apart, out of his slam, so each fall lands on its own.
    const seats: Seat[] = Array.from({ length: 10 }, (_, i) =>
      id === "zeno"
        ? { x: i === 0 ? ring.x : ring.x - 300 + i * 20, y: ring.y, mode: Mode.Manual }
        : id === "aristotle"
          ? {
              x: c.x - 220 + (i % 5) * 110,
              y: c.y + 150 + Math.floor(i / 5) * 120,
              mode: Mode.Manual,
            }
          : { x: c.x - 90 + (i % 5) * 45, y: c.y + 70 + Math.floor(i / 5) * 40, mode: Mode.Manual },
    );
    const a = arena(id, seats, { seed: 19, hp: 1e12 });
    if (id === "aristotle") thesis(a, 1);
    let biggest = 0;
    let total = 0;
    let n = 0;
    let fall = 0;
    const core = a.b.core.entity;
    let falling = false;
    run(
      a,
      1200,
      (x) => {
        for (const p of x.players) p.hp = p.kit.maxHp;
        // Whether only falls land on the coming tick: a boulder and its feather, nothing else.
        let feathers = 0;
        let others = 0;
        for (const e of x.w.effects) {
          if (!e.alive || e.kind !== FxKind.Danger || e.fireAt !== x.w.tick + 1) continue;
          if (e.count === BOSS_TELL + TellKind.Feather) feathers++;
          else if (e.count !== BOSS_TELL + TellKind.Boulder) others++;
        }
        falling = feathers > 0 && others === 0;
      },
      (x) => {
        const tick = new Map<number, number>();
        eachEvent(x.w, Ev.Hurt, (e) => {
          if (e.c !== core || e.e & HurtFlag.Contact) return;
          const p = x.players[e.a];
          if (!p) return;
          const share = e.d / p.kit.maxHp;
          biggest = Math.max(biggest, share);
          total += share;
          n++;
          tick.set(e.a, (tick.get(e.a) ?? 0) + share);
        });
        // A fall is one tell in two marks: the boulder and the feather hit the same tick.
        if (falling) for (const v of tick.values()) fall = Math.max(fall, v);
      },
    );
    const mean = total / Math.max(1, n);
    if (!(n > 0 && biggest < 0.75 && mean >= 0.25 && fall < 1)) ok = false;
    out.push(
      `${id} ${n} hits, ${fmt(mean * 100, 0)}% on average, the hardest ${fmt(biggest * 100, 0)}%${id === "aristotle" ? `, a boulder with its feather ${fmt(fall * 100, 0)}%` : ""}`,
    );
  }
  checks.push({
    name: "a missed tell hurts and one is survivable (share of a same-level student's health)",
    pass: ok,
    detail: out.join("; "),
  });
}
