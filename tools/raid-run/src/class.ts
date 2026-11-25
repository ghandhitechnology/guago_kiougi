/**
 * A class that plays each 논제 the way it is meant to be beaten: attackers round him, a stele
 * breaker, holders in the lit zone, pushers who lean on him in 논제 3 and slide the block in
 * 논제 4. Played in 반자동 (books and dodges by the server, movement by these inputs).
 */

import { AristotleMode, Mode, type Player } from "@guago/shared";
import { type Arena, arena, at, hold, mark, run, type Seat, walk } from "./sim.ts";

const ZONES = ["earth", "water", "air", "fire"] as const;

export interface Played {
  readonly a: Arena;
  /** Ticks each 논제 took, and whether he was freed. */
  readonly phases: number[];
  readonly freed: boolean;
  readonly ticks: number;
}

type Role = "attack" | "break" | "hold" | "push";

function roleOf(i: number, n: number, phase: number): Role {
  if (n === 1) return phase === 3 || phase === 4 ? "push" : "attack";
  const pushers = Math.max(1, Math.round(n * 0.25));
  if (i < pushers && (phase === 3 || phase === 4)) return "push";
  if (i === n - 1 && n >= 4) return "break";
  if (phase === 2 && i < Math.round(n * 0.4)) return "hold";
  return "attack";
}

/** Where pushers drive him in 논제 3: back and forth across the lawn. */
const GOALS = [
  { x: 776, y: 520 },
  { x: 776, y: 300 },
];

export function playAristotle(
  seats: readonly Seat[],
  opts: { seed: number; limit: number; hp?: number },
): Played {
  const a = arena(
    "aristotle",
    seats,
    opts.hp === undefined ? { seed: opts.seed } : { seed: opts.seed, hp: opts.hp },
  );
  const b = a.b;
  const n = a.players.length;
  const phases: number[] = [];
  let phaseStart = 0;
  let phase = b.phase;
  let goal = 0;
  const lectern = mark(a, "lectern");
  const block = () => a.w.monsters.find((m) => m.alive && m.kind.id === "aristotle-block");
  const steleAt = () => mark(a, `stele-${b.phase}`);
  const ticks = run(
    a,
    opts.limit,
    (x) => {
      const stunned = (b.mode & AristotleMode.Stunned) !== 0;
      const core = b.core;
      const g = at(GOALS, goal);
      if (Math.hypot(core.x - g.x, core.y - g.y) < 30) goal = 1 - goal;
      const dx = at(GOALS, goal).x - core.x;
      const dy = at(GOALS, goal).y - core.y;
      const d = Math.hypot(dx, dy) || 1;
      const blk = block();
      x.players.forEach((p: Player, i) => {
        const role = roleOf(i, n, b.phase);
        const t = (i / n) * Math.PI * 2;
        if (role === "attack" || (role === "push" && b.phase === 4 && stunned && n > 1)) {
          walk(x, p, core.x + Math.cos(t) * 70, core.y + Math.sin(t) * 56);
        } else if (role === "break") {
          const s = steleAt();
          walk(x, p, s.x + 24, s.y + 30);
        } else if (role === "hold") {
          const lit = (b.mode & AristotleMode.Zone) - 1;
          const z = mark(x, `zone-${ZONES[Math.max(0, lit)]}`);
          walk(x, p, z.x - 10 + (i % 3) * 10, z.y);
        } else if (b.phase === 3) {
          // Behind him from the goal, then lean on him toward it.
          const bx = core.x - (dx / d) * (core.radius + 8);
          const by = core.y - (dy / d) * (core.radius + 8);
          const behind = (p.x - core.x) * dx + (p.y - core.y) * dy < -core.radius * d * 0.6;
          if (behind) walk(x, p, core.x + (dx / d) * 20, core.y + (dy / d) * 20);
          else walk(x, p, bx + (-dy / d) * 40 * (p.x > core.x ? 1 : -1), by);
        } else if (b.phase === 4 && blk) {
          const ice = mark(x, "ice");
          const onIce = blk.y >= ice.y - 27 && blk.y <= ice.y + 11;
          if (stunned) walk(x, p, core.x + Math.cos(t) * 70, core.y + Math.sin(t) * 56);
          else if (!onIce || Math.hypot(blk.kx, blk.ky) > 0.5) hold(x, p, 0, 0);
          else if (p.x < blk.x - 10 && Math.abs(p.y - blk.y) < 8) walk(x, p, blk.x + 4, blk.y);
          else walk(x, p, blk.x - 26, blk.y);
        } else walk(x, p, lectern.x, lectern.y + 90);
      });
      // Up again where they fell: the entrance is far, so they walk back on their own.
    },
    (x) => {
      if (x.b.phase !== phase || x.b.freed) {
        phases.push(x.w.tick - phaseStart);
        phaseStart = x.w.tick;
        phase = x.b.phase;
      }
      return x.b.freed;
    },
  );
  return { a, phases, freed: b.freed, ticks };
}

export function classSeats(n: number, at: { x: number; y: number }): Seat[] {
  return Array.from({ length: n }, (_, i) => ({
    x: at.x - 60 + (i % 6) * 24,
    y: at.y + 120 + Math.floor(i / 6) * 20,
    mode: Mode.Semi,
  }));
}
