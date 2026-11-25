/**
 * 복습 alone: one same-level student of each class beats each boss at its solo size, playing the
 * way through (diagonals, the circles, each 논제's correction) in 반자동.
 */

import { CROTON_GRID as G, Mode, ZenoMode } from "@guago/shared";
import { playAristotle } from "./class.ts";
import { type Check, fmt } from "./report.ts";
import { arena, at, MAJORS, mark, run, walk } from "./sim.ts";

const LIMIT = 20 * 60 * 20;

/** Back and forth along one diagonal of three squares beside the formation. */
function pythagoreans(major: string): number {
  const corner = (c: number, r: number) => ({ x: G.x + c * G.cell, y: G.y + r * G.cell });
  const ends = [corner(4, 6), corner(7, 3)];
  const a = arena("pythagoreans", [{ ...at(ends, 0), mode: Mode.Semi, major }], { seed: 5 });
  const p = at(a.players, 0);
  let leg = 1;
  return run(
    a,
    LIMIT,
    (x) => {
      const to = at(ends, leg);
      if (Math.hypot(p.x - to.x, p.y - to.y) < 1) leg = 1 - leg;
      // Off the line (a roll), back to the nearer end first.
      walk(x, p, at(ends, leg).x, at(ends, leg).y);
    },
    (x) => x.b.freed,
  );
}

/** The three circles in turn, then at him while the paradox is broken. */
function zeno(major: string): number {
  const a = arena("zeno", [{ x: 1100, y: 280, mode: Mode.Semi, major }], { seed: 5 });
  const p = at(a.players, 0);
  const rings = ["ring-96", "ring-48", "ring-24"];
  return run(
    a,
    LIMIT,
    (x) => {
      if (x.b.mode & ZenoMode.Broken) walk(x, p, x.b.core.x - 40, x.b.core.y);
      else {
        const m = mark(x, at(rings, Math.min(2, x.b.mode & ZenoMode.Filled)));
        walk(x, p, m.x, m.y);
      }
    },
    (x) => x.b.freed,
  );
}

function aristotle(major: string): { ticks: number; phases: number[] } {
  const r = playAristotle([{ x: 776, y: 400, mode: Mode.Semi, major }], {
    seed: 7,
    limit: LIMIT * 4,
  });
  return { ticks: r.freed ? r.ticks : Number.POSITIVE_INFINITY, phases: r.phases };
}

const minutes = (ticks: number) => ticks / 20 / 60;

export function solo(checks: Check[]): void {
  for (const id of ["pythagoreans", "zeno", "aristotle"] as const) {
    const times: number[] = [];
    const parts: string[] = [];
    for (const major of MAJORS) {
      if (id === "aristotle") {
        const r = aristotle(major);
        const per = r.phases.length === 4 ? minutes(r.ticks) / 4 : Number.POSITIVE_INFINITY;
        times.push(per);
        parts.push(`${major} ${fmt(per, 1)}`);
      } else {
        const t = id === "pythagoreans" ? pythagoreans(major) : zeno(major);
        const m = t >= LIMIT ? Number.POSITIVE_INFINITY : minutes(t);
        times.push(m);
        parts.push(`${major} ${fmt(m, 1)}`);
      }
    }
    const sorted = [...times].sort((x, y) => x - y);
    const median = at(sorted, 2);
    checks.push({
      name: `${id}: one same-level student clears a 복습 ${id === "aristotle" ? "논제" : "fight"} in a few minutes`,
      pass: median >= 1.5 && median <= 4.5 && at(sorted, 4) <= 10,
      detail: `minutes${id === "aristotle" ? " a 논제" : ""}: ${parts.join(", ")}; median ${fmt(median, 1)}`,
    });
  }
}
