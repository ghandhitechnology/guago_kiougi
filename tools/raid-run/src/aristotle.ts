/** 아리스토텔레스: the four 논제, the steles and the shield, and 토론 시간. */

import {
  AristotleMode,
  BOSS_TELL,
  type Boss,
  Ev,
  FxKind,
  Mode,
  ObjectiveKind,
  RAID,
  TellKind,
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
  type Seat,
  sum,
  walk,
} from "./sim.ts";

const ID = "aristotle";

/**
 * Starts 논제 `phase` with a pool too deep to empty. `bare`: no shield and none growing back, so
 * what gets through is the gate alone.
 */
export function thesis(a: Arena, phase: number, bare = false): void {
  a.b.setPhase(a.w, phase, 1e12, bare ? 0 : 1);
  if (bare) a.b.regrow = 0;
}

function bossOnly(): Boss {
  return arena(ID, []).b;
}

/** 논제 1: every boulder has its feather, and they land on the same tick. */
function falls(checks: Check[]): void {
  const b0 = bossOnly();
  const seats: Seat[] = Array.from({ length: 12 }, (_, i) => ({
    x: b0.core.x - 220 + (i % 6) * 80,
    y: b0.core.y + 120 + Math.floor(i / 6) * 90,
    mode: i % 3 === 0 ? Mode.Auto : Mode.Semi,
  }));
  const a = arena(ID, seats, { seed: 21, hp: 1e12 });
  let pairs = 0;
  let lonely = 0;
  let together = 0;
  let boulderR = 0;
  let featherR = 0;
  run(a, 1200, heal, (x) => {
    const boulders: number[] = [];
    const feathers: number[] = [];
    for (const e of x.w.effects) {
      if (!e.alive || e.kind !== FxKind.Danger || e.born !== x.w.tick) continue;
      if (e.count === BOSS_TELL + TellKind.Boulder) {
        boulders.push(e.fireAt);
        boulderR = e.radius;
      } else if (e.count === BOSS_TELL + TellKind.Feather) {
        feathers.push(e.fireAt);
        featherR = e.radius;
      }
    }
    boulders.sort();
    feathers.sort();
    if (boulders.length !== feathers.length) lonely += Math.abs(boulders.length - feathers.length);
    for (let i = 0; i < Math.min(boulders.length, feathers.length); i++) {
      pairs++;
      if (boulders[i] === feathers[i]) together++;
    }
  });
  checks.push({
    name: "aristotle 논제 1: boulder and feather tells land on the same tick",
    pass: pairs > 20 && together === pairs && lonely === 0 && featherR > boulderR,
    detail: `${pairs} pairs, ${together} landing together, ${lonely} without a partner; marks ${boulderR} px (boulder) and ${featherR} px (feather)`,
  });
}

/** 논제 2: only the lit zone drags, each toward its own place; holding it together counts. */
function zones(checks: Check[]): void {
  const names = ["earth", "water", "air", "fire"] as const;
  const dir = { earth: 1, water: 1, air: -1, fire: -1 } as const;
  const probe = arena(ID, []);
  const seats: Seat[] = names.map((n) => ({ ...mark(probe, `zone-${n}`), mode: Mode.Manual }));
  const a = arena(ID, seats, { seed: 2, hp: 1e12 });
  thesis(a, 2);
  const moved = names.map(() => ({ lit: 0, dark: 0 }));
  const seenLit = new Set<number>();
  const was: number[] = [];
  run(
    a,
    1700,
    (x) => {
      heal(x);
      for (const p of x.players) hold(x, p, 0, 0);
      // Back on its mark before its own zone lights, so every zone has an occupant to drag.
      const lit = (x.b.mode & AristotleMode.Zone) - 1;
      x.players.forEach((p, i) => {
        if (i !== lit) {
          const m = mark(x, `zone-${names[i]}`);
          p.x = m.x;
          p.y = m.y;
        }
        was[i] = p.y;
      });
    },
    (x) => {
      const lit = (x.b.mode & AristotleMode.Zone) - 1;
      if (lit >= 0) seenLit.add(lit);
      x.players.forEach((p, i) => {
        const dy = p.y - at(was, i);
        if (i === lit) at(moved, i).lit += dy * dir[at(names, i)];
        else at(moved, i).dark += Math.abs(dy);
      });
    },
  );
  const ok = seenLit.size === 4 && moved.every((m) => m.lit > 10 && m.dark === 0);
  checks.push({
    name: "aristotle 논제 2: only the lit zone drags its occupants, toward its natural place",
    pass: ok,
    detail: names
      .map(
        (n, i) =>
          `${n} ${fmt(at(moved, i).lit, 0)} px ${dir[n] > 0 ? "down" : "up"} lit, ${fmt(at(moved, i).dark, 0)} dark`,
      )
      .join("; "),
  });
  // A class standing in the lit zone against the drag holds it.
  const crew: Seat[] = Array.from({ length: 4 }, (_, i) => ({
    x: mark(probe, "zone-earth").x - 12 + i * 8,
    y: mark(probe, "zone-earth").y,
    mode: Mode.Manual,
  }));
  const h = arena(ID, crew, { seed: 2, hp: 1e12 });
  thesis(h, 2);
  let litAt = -1;
  let heldAt = -1;
  let holders = 0;
  let next = -1;
  run(
    h,
    800,
    (x) => {
      heal(x);
      const lit = (x.b.mode & AristotleMode.Zone) - 1;
      const z = mark(x, `zone-${names[Math.max(0, lit)]}`);
      x.players.forEach((p, i) => {
        walk(x, p, z.x - 12 + i * 8, z.y);
      });
    },
    (x) => {
      const lit = (x.b.mode & AristotleMode.Zone) - 1;
      if (lit === 0 && litAt < 0) litAt = x.w.tick;
      if (heldAt > 0 && next < 0 && lit !== 0) next = lit;
      eachEvent(x.w, Ev.Objective, (e) => {
        if (e.d === ObjectiveKind.Hold) {
          if (heldAt < 0) heldAt = x.w.tick;
          if (heldAt === x.w.tick) holders++;
        }
      });
      return next >= 0;
    },
  );
  checks.push({
    name: "aristotle 논제 2: holding the lit zone together completes an objective and lights the next",
    pass: heldAt > 0 && holders === 4 && next === 1,
    detail: `earth lit at tick ${litAt}, held by ${holders} at tick ${heldAt} (${fmt((heldAt - litAt) / 20, 1)} s against the drag), then ${names[next] ?? "none"} lit; cue element-zone ${h.cues.get("element-zone") ?? 0}`,
  });
}

/** 논제 3: hits get through only while a push moves him, and he stops at once when it ends. */
function push(checks: Check[]): void {
  const b0 = bossOnly();
  const seats: Seat[] = [
    { x: b0.core.x, y: b0.core.y - 70, mode: Mode.Manual, major: "math" },
    ...["math", "physics", "chemistry", "biology", "earth"].map((major, i) => ({
      x: b0.core.x - 130 + i * 65,
      y: b0.core.y + 110,
      mode: Mode.Manual,
      cast: true,
      major,
    })),
  ];
  const a = arena(ID, seats, { seed: 8, hp: 1e12 });
  thesis(a, 3, true);
  const pusher = at(a.players, 0);
  const moving = { raw: 0, dealt: 0, ticks: 0 };
  const still = { raw: 0, dealt: 0, ticks: 0 };
  let last = { raw: 0, dealt: 0 };
  let stopAt = -1;
  let stillAt = -1;
  let coast = 0;
  let stopPos = { x: 0, y: 0 };
  let travelled = 0;
  const from = { x: a.b.core.x, y: a.b.core.y };
  run(
    a,
    700,
    (x) => {
      heal(x);
      const t = x.w.tick;
      last = { raw: sum(x.raw), dealt: sum(x.dealt) };
      // Leans on him from the north for ten seconds, then lets go and steps back.
      if (t >= 100 && t < 300) walk(x, pusher, x.b.core.x, x.b.core.y + 10);
      else if (t >= 300 && t < 320) walk(x, pusher, x.b.core.x, x.b.core.y - 90);
      else hold(x, pusher, 0, 0);
    },
    (x) => {
      const isMoving = (x.b.mode & AristotleMode.Moving) !== 0;
      const s = isMoving ? moving : still;
      s.raw += sum(x.raw) - last.raw;
      s.dealt += sum(x.dealt) - last.dealt;
      s.ticks++;
      if (x.w.tick === 299) {
        stopAt = 299;
        stopPos = { x: x.b.core.x, y: x.b.core.y };
        travelled = Math.hypot(x.b.core.x - from.x, x.b.core.y - from.y);
      }
      if (stopAt > 0 && stillAt < 0 && !isMoving) {
        stillAt = x.w.tick;
        coast = Math.hypot(x.b.core.x - stopPos.x, x.b.core.y - stopPos.y);
      }
    },
  );
  const leak = a.b.rule.gateLeak;
  const rm = moving.dealt / moving.raw;
  const rs = still.dealt / still.raw;
  checks.push({
    name: "aristotle 논제 3: hits get through only while a push moves him",
    pass:
      Math.abs(rm - 1) < 1e-9 && Math.abs(rs - leak) < 1e-9 && moving.ticks > 50 && travelled > 40,
    detail: `pushed ${fmt(travelled, 0)} px in 10 s; moving ${moving.ticks} ticks, through ${fmt(rm, 3)} of ${fmt(moving.raw, 0)} raw; still ${still.ticks} ticks, through ${fmt(rs, 3)} of ${fmt(still.raw, 0)} raw`,
  });
  // Alone with him, so nothing else knocks him about: lean, let go, and watch him stop.
  const solo = arena(ID, seats.slice(0, 1), { seed: 8, hp: 1e12 });
  thesis(solo, 3, true);
  const lone = at(solo.players, 0);
  stillAt = -1;
  run(
    solo,
    400,
    (x) => {
      heal(x);
      const t = x.w.tick;
      if (t >= 100 && t < 300) walk(x, lone, x.b.core.x, x.b.core.y + 10);
      else if (t >= 300 && t < 320) walk(x, lone, x.b.core.x, x.b.core.y - 90);
      else hold(x, lone, 0, 0);
    },
    (x) => {
      const isMoving = (x.b.mode & AristotleMode.Moving) !== 0;
      if (x.w.tick === 299) stopPos = { x: x.b.core.x, y: x.b.core.y };
      if (x.w.tick >= 300 && stillAt < 0 && !isMoving) {
        stillAt = x.w.tick;
        coast = Math.hypot(x.b.core.x - stopPos.x, x.b.core.y - stopPos.y);
      }
    },
  );
  checks.push({
    name: "aristotle 논제 3: he stops the moment the pushing stops",
    pass: stillAt > 0 && stillAt - stopAt <= 3 && coast < 4,
    detail: `last push at tick ${stopAt}, still at tick ${stillAt}, coasted ${fmt(coast, 1)} px; cues push ${a.cues.get("push") ?? 0}, unpushed ${a.cues.get("unpushed") ?? 0}`,
  });
}

/** 논제 4: the block keeps sliding over the ice with nobody pushing, and the stun opens him. */
function ice(checks: Check[]): void {
  const probe = arena(ID, []);
  const start = mark(probe, "block-start");
  const far = mark(probe, "far-edge");
  const seats: Seat[] = [
    { x: start.x - 30, y: start.y, mode: Mode.Manual, major: "math" },
    ...["math", "physics", "chemistry", "biology", "earth"].map((major, i) => ({
      x: probe.b.core.x - 130 + i * 65,
      y: probe.b.core.y + 110,
      mode: Mode.Manual,
      cast: true,
      major,
    })),
  ];
  const a = arena(ID, seats, { seed: 6, hp: 1e12 });
  thesis(a, 4, true);
  const pusher = at(a.players, 0);
  const block = () => a.w.monsters.find((m) => m.alive && m.kind.id === "aristotle-block");
  let letGo = -1;
  const speeds: number[] = [];
  let lastX = 0;
  let stunAt = -1;
  let carried = 0;
  let before = Number.NaN;
  let beforeRaw = 0;
  let openAll = true;
  let snap = { raw: 0, dealt: 0 };
  run(
    a,
    1200,
    (x) => {
      heal(x);
      const blk = block();
      snap = { raw: sum(x.raw), dealt: sum(x.dealt) };
      // A shove from the west until it moves, then the pusher walks away and nobody touches it.
      if (blk && letGo < 0) {
        walk(x, pusher, blk.x, blk.y);
        if (blk.x > start.x + 12) letGo = x.w.tick;
      } else hold(x, pusher, letGo > 0 ? -127 : 0, 0);
      lastX = blk?.x ?? 0;
    },
    (x) => {
      const blk = block();
      eachEvent(x.w, Ev.Objective, (e) => {
        if (e.d === ObjectiveKind.Carry) carried++;
      });
      if (letGo > 0 && carried === 0 && blk && x.w.tick > letGo + 2) speeds.push(blk.x - lastX);
      if (stunAt < 0 && (x.b.mode & AristotleMode.Stunned) !== 0) {
        stunAt = x.w.tick;
        beforeRaw = snap.raw;
        before = snap.dealt / snap.raw;
        resetTally(x);
      }
      if (stunAt > 0) for (const p of x.players) if (!x.b.open[p.index]) openAll = false;
      return stunAt > 0 && x.w.tick > stunAt + 200;
    },
  );
  const lo = Math.min(...speeds);
  const hi = Math.max(...speeds);
  const after = sum(a.dealt) / sum(a.raw);
  checks.push({
    name: "aristotle 논제 4: the block keeps sliding across the ice with nobody pushing",
    pass: speeds.length > 20 && hi - lo < 0.05 && lo > 0.3 && stunAt > 0 && carried === 1,
    detail: `let go at tick ${letGo}, then ${speeds.length} ticks unpushed at ${fmt(lo, 2)} to ${fmt(hi, 2)} px a tick over ${fmt(far.x - start.x, 0)} px of ice; across at tick ${stunAt}, objective ${carried}, cue ice ${a.cues.get("ice") ?? 0}`,
  });
  checks.push({
    name: "aristotle 논제 4: the stun opens him to everyone",
    pass:
      Math.abs(before - a.b.rule.gateLeak) < 1e-9 &&
      Math.abs(after - 1) < 1e-9 &&
      openAll &&
      beforeRaw > 0,
    detail: `through ${fmt(before, 3)} of ${fmt(beforeRaw, 0)} raw before, ${fmt(after, 3)} of ${fmt(sum(a.raw), 0)} raw stunned, open to all ${openAll}`,
  });
}

/** A stele broken strips the shield by the fixed share. */
function steles(checks: Check[]): void {
  const probe = arena(ID, []);
  const at = mark(probe, "stele-1");
  const seats: Seat[] = ["math", "physics", "chemistry", "biology", "earth"].map((major, i) => ({
    x: at.x - 40 + i * 20,
    y: at.y + 40,
    mode: Mode.Semi,
    major,
  }));
  const a = arena(ID, seats, { seed: 12, hp: 1e12 });
  let broke = -1;
  let shieldBefore = 0;
  let shieldAfter = 0;
  let prev = 1;
  run(
    a,
    2400,
    (x) => {
      heal(x);
      prev = x.b.shield;
    },
    (x) => {
      eachEvent(x.w, Ev.Objective, (e) => {
        if (e.d === ObjectiveKind.Break && broke < 0) {
          broke = x.w.tick;
          shieldBefore = prev;
          shieldAfter = x.b.shield;
        }
      });
      return broke > 0;
    },
  );
  const strip = shieldBefore - shieldAfter;
  checks.push({
    name: "aristotle: breaking a stele strips the fixed share of the shield",
    pass: broke > 0 && Math.abs(strip - RAID.shieldPerObjective) < 1e-4,
    detail: `stele broken at tick ${broke} by five same-level players; shield ${fmt(shieldBefore, 4)} → ${fmt(shieldAfter, 4)} (−${fmt(strip, 4)}, rule ${RAID.shieldPerObjective})`,
  });
}

/** 토론 시간 brings the falls and the zones into the later 논제. */
function debate(checks: Check[]): void {
  const b0 = bossOnly();
  const seats: Seat[] = Array.from({ length: 6 }, (_, i) => ({
    x: b0.core.x - 200 + i * 80,
    y: b0.core.y + 200,
    mode: Mode.Semi,
  }));
  const out: string[] = [];
  let ok = true;
  for (const phase of [3, 4]) {
    const a = arena(ID, seats, { seed: 30 + phase, hp: 1e12 });
    thesis(a, phase);
    a.b.debate = true;
    let falls = 0;
    let zoneTicks = 0;
    run(a, 900, heal, (x) => {
      for (const e of x.w.effects)
        if (e.alive && e.born === x.w.tick && e.count === BOSS_TELL + TellKind.Boulder) falls++;
      if ((x.b.mode & AristotleMode.Zone) !== 0) zoneTicks++;
    });
    const quiet = arena(ID, seats, { seed: 30 + phase, hp: 1e12 });
    thesis(quiet, phase);
    let quietFalls = 0;
    let quietZones = 0;
    run(quiet, 900, heal, (x) => {
      for (const e of x.w.effects)
        if (e.alive && e.born === x.w.tick && e.count === BOSS_TELL + TellKind.Boulder)
          quietFalls++;
      if ((x.b.mode & AristotleMode.Zone) !== 0) quietZones++;
    });
    if (!(falls > 0 && zoneTicks > 0 && quietFalls === 0 && quietZones === 0)) ok = false;
    out.push(
      `논제 ${phase}: ${falls} falls and ${zoneTicks} zone ticks in 토론 시간, ${quietFalls} and ${quietZones} outside it (cue debate-hour ${a.cues.get("debate-hour") ?? 0})`,
    );
  }
  checks.push({
    name: "aristotle: 토론 시간 brings drops and zones into 논제 3 and 4",
    pass: ok,
    detail: out.join("; "),
  });
}

export function aristotleChecks(): Check[] {
  const checks: Check[] = [];
  falls(checks);
  zones(checks);
  push(checks);
  ice(checks);
  steles(checks);
  debate(checks);
  return checks;
}
