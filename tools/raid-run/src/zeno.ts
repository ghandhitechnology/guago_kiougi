/** 제논: the wall of the circle being filled, the halved dash, the hanging arrows, the tortoise. */

import {
  BOSS_TELL,
  Ev,
  FxKind,
  HurtFlag,
  InputFlag,
  MOVE_MAX,
  Mode,
  ObjectiveKind,
  type Player,
  TellKind,
  ZenoMode,
} from "@guago/shared";
import { type Check, fmt } from "./report.ts";
import {
  type Arena,
  arena,
  at,
  eachEvent,
  heal,
  hold,
  mark,
  resetTally,
  run,
  sum,
  walk,
} from "./sim.ts";

const ID = "zeno";
const RINGS = [
  ["ring-96", 96],
  ["ring-48", 48],
  ["ring-24", 24],
] as const;

const filled = (a: Arena) => a.b.mode & ZenoMode.Filled;
const isBroken = (a: Arena) => (a.b.mode & ZenoMode.Broken) !== 0;
/** The wall of the circle being filled. */
const wallOf = (a: Arena) => {
  const [name, r] = at(RINGS, Math.min(filled(a), 2));
  return mark(a, name).x + r;
};

/** Nobody walks past the wall; a dash toward it covers half of what is left. */
function race(checks: Check[]): void {
  const wall = (() => {
    const a = arena(ID, []);
    return wallOf(a);
  })();
  const seats = [
    { x: wall - 160, y: 250, mode: Mode.Manual },
    { x: wall - 30, y: 300, mode: Mode.Manual },
    { x: wall - 12, y: 340, mode: Mode.Manual },
    { x: wall - 240, y: 200, mode: Mode.Manual },
    { x: wall - 120, y: 220, mode: Mode.Semi },
  ];
  const a = arena(ID, seats, { seed: 3, hp: 1e12 });
  const [walker, near30, near12, far, semi] = [0, 1, 2, 3, 4].map((i) => at(a.players, i)) as [
    Player,
    Player,
    Player,
    Player,
    Player,
  ];
  let over = Number.NEGATIVE_INFINITY;
  const ends: number[] = [];
  const starts = [near30.x, near12.x, far.x];
  // Hold still a moment, then three dash east at once; the walker and the 반자동 body walk into
  // the wall the whole time.
  run(
    a,
    300,
    (x) => {
      const t = x.w.tick;
      hold(x, walker, MOVE_MAX, 0);
      hold(x, semi, MOVE_MAX, 0);
      for (const p of [near30, near12, far])
        hold(x, p, t === 10 ? MOVE_MAX : 0, 0, t === 10 ? InputFlag.Dodge : 0);
      heal(x);
    },
    (x) => {
      if (x.w.tick === 30) for (const p of [near30, near12, far]) ends.push(p.x);
      if (!isBroken(x)) for (const p of x.players) over = Math.max(over, p.x - wallOf(x));
    },
  );
  const half = (s: number) => s + (wall - s) / 2;
  const ok =
    over <= 1e-9 &&
    Math.abs(at(ends, 0) - half(at(starts, 0))) < 0.6 &&
    Math.abs(at(ends, 1) - half(at(starts, 1))) < 0.6 &&
    Math.abs(at(ends, 2) - at(starts, 2) - 40) < 0.6 &&
    !isBroken(a);
  dashes = a.cues.get("dash") ?? 0;
  checks.push({
    name: "zeno: nobody gets past the circle's wall, a dash toward it ends half-way",
    pass: ok,
    detail: `wall x ${wall}, nearest anyone stood to the wall of the circle being filled ${fmt(-over, 1)} px; dashes from ${fmt(wall - at(starts, 0), 0)} and ${fmt(wall - at(starts, 1), 0)} px short ended ${fmt(wall - at(ends, 0), 1)} and ${fmt(wall - at(ends, 1), 1)} short, from ${fmt(wall - at(starts, 2), 0)} short the full ${fmt(at(ends, 2) - at(starts, 2), 1)} px`,
  });
}

/** Arrows hang until the third circle fills, then all arrive; damage is gated until then. */
function limit(checks: Check[]): void {
  const zeno = arena(ID, []).b.core;
  const seats = [
    // Arrow marks: two standing still on the track, in 완전 수동 (no rolls of their own).
    { x: 1000, y: 230, mode: Mode.Manual },
    { x: 1150, y: 330, mode: Mode.Manual },
    // The class: fills the circles, then closes in and hits.
    ...["math", "physics", "chemistry", "biology", "earth"].map((major, i) => ({
      x: 1240 + i * 6,
      y: 260 + i * 10,
      mode: Mode.Manual,
      cast: true,
      major,
    })),
  ];
  const a = arena(ID, seats, { seed: 9, hp: 1e12 });
  const crew = a.players.slice(2);
  const core = a.b.core.entity;
  let longestHang = 0;
  let arrowHits = 0;
  let filledAt = -1;
  let hanging = 0;
  let arrivedAt = -1;
  let arrived = 0;
  let hitOnArrival = 0;
  let gated = Number.NaN;
  let gatedRaw = 0;
  let landing = { arrows: 0, others: 0 };
  let before = { raw: 0, dealt: 0 };
  run(
    a,
    1400,
    (x) => {
      const w = x.w;
      landing = { arrows: 0, others: 0 };
      before = { raw: sum(x.raw), dealt: sum(x.dealt) };
      for (const e of w.effects) {
        if (!e.alive || e.kind !== FxKind.Danger || e.source !== x.b.core.index) continue;
        if (e.count === BOSS_TELL + TellKind.Arrow && filledAt < 0)
          longestHang = Math.max(longestHang, e.fireAt - w.tick);
        if (e.fireAt !== w.tick + 1) continue;
        if (e.count === BOSS_TELL + TellKind.Arrow) landing.arrows++;
        else landing.others++;
      }
      // The class waits in the first circle until arrows have stacked up, then fills them all.
      const k = filled(x);
      const go = w.tick > 700;
      crew.forEach((p, i) => {
        if (isBroken(x)) walk(x, p, zeno.x - 34 - i * 5, zeno.y - 10 + i * 5);
        else {
          const [name] = at(RINGS, go ? Math.min(k, 2) : 0);
          const c = mark(x, name);
          walk(x, p, c.x - 6 + i * 3, c.y - 6 + i * 3);
        }
      });
      heal(x);
    },
    (x) => {
      const w = x.w;
      let hurts = 0;
      eachEvent(w, Ev.Hurt, (e) => {
        if (e.c === core && !(e.e & HurtFlag.Contact)) hurts++;
      });
      if (landing.arrows > 0 && landing.others === 0) {
        if (filledAt < 0) arrowHits += hurts;
        else if (arrivedAt < 0) {
          arrivedAt = w.tick;
          arrived = landing.arrows;
          hitOnArrival = hurts;
        }
      }
      if (filledAt < 0 && isBroken(x)) {
        filledAt = w.tick;
        // Hits on the tick it broke already got through: the gated share is from the ticks before.
        gatedRaw = before.raw;
        gated = before.dealt / before.raw;
        resetTally(x);
        for (const e of w.effects) {
          if (e.alive && e.kind === FxKind.Danger && e.count === BOSS_TELL + TellKind.Arrow)
            hanging++;
        }
      }
      return filledAt > 0 && w.tick > filledAt + 300;
    },
  );
  checks.push({
    name: "zeno: arrows hang and hit nobody until the third circle fills, then all arrive within a second",
    pass:
      filledAt > 0 &&
      arrowHits === 0 &&
      longestHang > 10_000 &&
      hanging > 3 &&
      arrived === hanging &&
      arrivedAt - filledAt <= 20 &&
      hitOnArrival > 0,
    detail: `${hanging} arrows hung (longest still ${fmt(longestHang / 20 / 60, 0)} min from landing), ${arrowHits} hits before tick ${filledAt}; ${arrived} arrived ${arrivedAt - filledAt} ticks after and hit ${hitOnArrival} times`,
  });
  const open = sum(a.dealt) / sum(a.raw);
  checks.push({
    name: "zeno: damage is gated while the paradox holds and whole once it breaks",
    pass: Math.abs(gated - a.b.rule.gateLeak) < 1e-9 && Math.abs(open - 1) < 1e-9 && gatedRaw > 0,
    detail: `through ${fmt(gated, 3)} of ${fmt(gatedRaw, 0)} raw before, ${fmt(open, 3)} of ${fmt(sum(a.raw), 0)} raw after`,
  });
  checks.push({
    name: "zeno: cues dash, ring-filled and arrow fire",
    pass: (a.cues.get("ring-filled") ?? 0) >= 3 && (a.cues.get("arrow") ?? 0) > 0,
    detail: `ring-filled ${a.cues.get("ring-filled") ?? 0}, arrow ${a.cues.get("arrow") ?? 0}, dash in the race ${dashes}`,
  });
}

let dashes = 0;

/** The tortoise starts ahead of the leader and runs; catching it counts as an objective. */
function tortoise(checks: Check[]): void {
  const seats = ["math", "physics", "chemistry", "biology", "earth"].map((major, i) => ({
    x: 700 + i * 8,
    y: 250 + i * 12,
    mode: Mode.Manual,
    cast: true,
    major,
  }));
  const a = arena(ID, seats, { seed: 4, hp: 1e12 });
  let spawned = -1;
  let entity = -1;
  let from = { x: 0, y: 0 };
  let ran = 0;
  let caught = 0;
  let leaderAt = 0;
  run(
    a,
    1600,
    (x) => {
      const t = x.w.monsters.find((m) => m.alive && m.entity === entity);
      for (const p of x.players) {
        if (t) walk(x, p, t.x, t.y);
        else hold(x, p, 0, 0);
      }
      heal(x);
    },
    (x) => {
      if (spawned < 0 && (x.cues.get("tortoise") ?? 0) > 0) {
        const t = x.w.monsters.find((m) => m.alive && m.kind.id === "tortoise");
        if (t) {
          spawned = x.w.tick;
          entity = t.entity;
          from = { x: t.x, y: t.y };
          leaderAt = Math.max(...x.players.map((p) => p.x));
        }
      }
      const t = x.w.monsters.find((m) => m.alive && m.entity === entity);
      if (t) ran = Math.max(ran, Math.hypot(t.x - from.x, t.y - from.y));
      eachEvent(x.w, Ev.Objective, (e) => {
        if (e.c === entity && e.d === ObjectiveKind.Break) caught++;
      });
      return caught > 0;
    },
  );
  checks.push({
    name: "zeno: the tortoise runs ahead of the leader and catching it counts",
    pass: spawned > 0 && from.x > leaderAt && ran > 20 && caught === 1,
    detail: `started ${fmt(from.x - leaderAt, 0)} px ahead of the leader at tick ${spawned}, ran ${fmt(ran, 0)} px, caught ${caught} (cue tortoise ${a.cues.get("tortoise") ?? 0}) at tick ${a.w.tick}`,
  });
}

export function zenoChecks(): Check[] {
  const checks: Check[] = [];
  race(checks);
  limit(checks);
  tortoise(checks);
  return checks;
}
