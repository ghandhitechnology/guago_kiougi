/**
 * The fight as a whole: all four 논제 to freed, full auto against standing still under the tells,
 * and the step's time with a full arena.
 */

import { Ev, type FightInput, HurtFlag, Mode, stepFight } from "@guago/shared";
import { thesis } from "./aristotle.ts";
import { classSeats, playAristotle } from "./class.ts";
import { type Check, fmt } from "./report.ts";
import { arena, at, eachEvent, heal, MAJORS, run, type Seat } from "./sim.ts";

/** All four 논제 run to freed in a local fight, at the solo size, for a class and for one player. */
export function fourTheses(checks: Check[]): void {
  const lectern = { x: 776, y: 264 };
  const out: string[] = [];
  let ok = true;
  for (const n of [8, 1]) {
    const r = playAristotle(
      n === 1 ? [{ x: 776, y: 400, mode: Mode.Semi, major: "physics" }] : classSeats(n, lectern),
      { seed: 7, limit: 40_000 },
    );
    if (!r.freed || r.phases.length !== 4) ok = false;
    out.push(
      `${n === 1 ? "one physics student" : `${n} students`}: ${r.freed ? "freed" : `stuck in 논제 ${r.a.b.phase}`} after ${fmt(r.ticks / 20 / 60, 1)} min (논제 ${r.phases.map((t) => fmt(t / 20, 0)).join(" / ")} s), ${r.a.b.strips} objectives`,
    );
  }
  checks.push({
    name: "aristotle: all four 논제 run to freed in a local fight",
    pass: ok,
    detail: out.join("; "),
  });
}

/** Tell hits taken per player in full auto and standing still, under the same boss. */
export function dodging(checks: Check[]): void {
  const out: string[] = [];
  let ok = true;
  for (const [id, phase, debate] of [
    ["pythagoreans", 1, false],
    ["aristotle", 1, false],
    ["aristotle", 4, true],
  ] as const) {
    const probe = arena(id, []);
    const c = probe.b.core;
    const seats: Seat[] = Array.from({ length: 20 }, (_, i) => ({
      x: c.x - 150 + (i % 10) * 32,
      y: c.y + (i < 10 ? 70 : 120),
      // Alternate: one played by the server, one standing still with its books off.
      mode: i % 2 === 0 ? Mode.Auto : Mode.Manual,
      major: MAJORS[Math.floor(i / 2) % MAJORS.length] as string,
    }));
    const a = arena(id, seats, { seed: 13, hp: 1e12 });
    if (phase > 1) thesis(a, phase);
    a.b.debate = debate;
    const hits = [0, 0];
    const core = a.b.core.entity;
    run(a, 2400, heal, (x) => {
      eachEvent(x.w, Ev.Hurt, (e) => {
        if (e.c !== core || e.e & HurtFlag.Contact) return;
        const p = x.players[e.a];
        if (!p) return;
        const k = p.mode === Mode.Auto ? 0 : 1;
        hits[k] = at(hits, k) + 1;
      });
    });
    const auto = at(hits, 0) / 10;
    const still = at(hits, 1) / 10;
    if (!(still > 4 && auto < still * 0.35)) ok = false;
    const what = id === "aristotle" ? `${id} 논제 ${phase}${debate ? " in 토론 시간" : ""}` : id;
    out.push(`${what} ${fmt(auto, 1)} vs ${fmt(still, 1)}`);
  }
  checks.push({
    name: "full auto takes far fewer tell hits than standing still (per player, 2 min)",
    pass: ok,
    detail: out.join("; "),
  });
}

/** The step's time with 80 same-level full-auto players on the Lyceum, every mechanic running. */
export function budget(checks: Check[]): void {
  const seats: Seat[] = Array.from({ length: 80 }, (_, i) => ({
    x: 420 + (i % 20) * 36,
    y: 330 + Math.floor(i / 20) * 110,
    mode: Mode.Auto,
  }));
  const a = arena("aristotle", seats, { seed: 17, hp: 1e12 });
  thesis(a, 4);
  a.b.debate = true;
  // Full auto needs no inputs: the step alone is timed. CPU time is what the step costs; wall
  // time also counts whatever else the machine was doing.
  const none = new Map<string, FightInput[]>();
  const cpu: number[] = [];
  const wall: number[] = [];
  let monsters = 0;
  let dangers = 0;
  for (let t = 0; t < 1600; t++) {
    heal(a);
    const c0 = process.cpuUsage();
    const t0 = performance.now();
    stepFight(a.w, none);
    const dt = performance.now() - t0;
    const dc = process.cpuUsage(c0);
    if (t < 400) continue;
    wall.push(dt);
    cpu.push((dc.user + dc.system) / 1000);
    let alive = 0;
    for (const m of a.w.monsters) if (m.alive) alive++;
    monsters = Math.max(monsters, alive);
    dangers = Math.max(dangers, a.w.dangers.length);
  }
  const q = (xs: number[], k: number) => {
    const s = [...xs].sort((x, y) => x - y);
    return at(s, Math.min(s.length - 1, Math.floor(s.length * k)));
  };
  const p95 = q(cpu, 0.95);
  checks.push({
    name: "step time with 80 full-auto players on the Lyceum (논제 4 in 토론 시간)",
    pass: p95 < 5,
    detail: `CPU p50 ${fmt(q(cpu, 0.5), 2)} ms, p95 ${fmt(p95, 2)} ms, max ${fmt(q(cpu, 1), 2)} ms; wall p50 ${fmt(q(wall, 0.5), 2)} ms, p95 ${fmt(q(wall, 0.95), 2)} ms; ${cpu.length} ticks, up to ${monsters} monsters and ${dangers} live dangers (budget: the whole server tick under 10 ms p95)`,
  });
}
