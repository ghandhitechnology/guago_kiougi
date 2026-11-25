import {
  castFlag,
  createFight,
  DuelFloor,
  DuelPhase,
  duelBuild,
  duelKit,
  Ev,
  type FightInput,
  type FightWorld,
  fenceFloor,
  InputFlag,
  MOVE_MAX,
  Mode,
  type Player,
  stepFight,
} from "@guago/shared";
import { describe, expect, it } from "vitest";
import { booksOf } from "./books.ts";
import { DUEL_NORMS, DUEL_TIMING, duelMarks } from "./duel.ts";
import { fieldOf, fightMapOf, mapById } from "./fight-map.ts";
import type { BuiltMap } from "./maps/format.ts";
import { simRules } from "./sim-rules.ts";

const rules = simRules();

describe("duel normalisation", () => {
  const gear = {
    books: [
      { def: "wangdo", evolved: true },
      { def: "graph-note", evolved: false },
      { def: "sequence", evolved: false },
      { def: "probability", evolved: false },
      { def: "coordinate", evolved: false },
    ],
    tools: [
      { def: "compass" },
      { def: "grid-ruler" },
      { def: "calculator" },
      { def: "dice" },
      { def: "set-square" },
    ],
  };

  it("keeps the class, the minor, which books and tools are worn and evolutions, and flattens the rest", () => {
    const b = duelBuild("math", "physics", gear, DUEL_NORMS);
    expect(b.major).toBe("math");
    expect(b.minor).toBe("physics");
    expect(b.level).toBe(DUEL_NORMS.level);
    expect(Object.values(b.stats).every((v) => v === 0)).toBe(true);
    expect(b.books.map((x) => x.def)).toEqual(["wangdo", "graph-note", "sequence", "probability"]);
    expect(b.books[0]?.evolved).toBe(true);
    for (const book of b.books) {
      expect(book).toMatchObject({
        level: DUEL_NORMS.level,
        grade: DUEL_NORMS.grade,
        pilgi: DUEL_NORMS.pilgi,
      });
    }
    expect(b.tools).toHaveLength(DUEL_NORMS.tools);
    expect(b.tools.every((t) => t.level === DUEL_NORMS.toolLevel)).toBe(true);
  });

  it("gives a veteran and a newcomer of one class and kit the same numbers", () => {
    const a = duelKit(rules, duelBuild("math", null, gear, DUEL_NORMS), DUEL_NORMS, Mode.Semi);
    const b = duelKit(rules, duelBuild("math", null, gear, DUEL_NORMS), DUEL_NORMS, Mode.Semi);
    expect(a.maxHp).toBe(b.maxHp);
    expect(a.weapons.map((w) => w.hit)).toEqual(b.weapons.map((w) => w.hit));
    expect(a.maxHp).toBe(
      rules.kit(duelBuild("math", null, gear, DUEL_NORMS)).maxHp * DUEL_NORMS.hp,
    );
  });

  it("takes the control mode's damage bonus back out and drops nothing", () => {
    const build = duelBuild(
      "physics",
      null,
      { books: [{ def: "holiday-physics", evolved: false }], tools: [] },
      DUEL_NORMS,
    );
    for (const mode of [Mode.Semi, Mode.Skill, Mode.Manual]) {
      const kit = duelKit(rules, build, DUEL_NORMS, mode);
      expect(kit.damage * (rules.modeBonus[mode] ?? 1)).toBeCloseTo(
        DUEL_NORMS.damage * (DUEL_NORMS.classDamage.physics ?? 1),
        12,
      );
      expect(kit.dropMult).toBe(0);
      expect(kit.coinMult).toBe(0);
    }
  });
});

// ── Replay ──────────────────────────────────────────────────────────────────

const built = mapById("saebyeok") as BuiltMap;
const arena = built.arenas.find((a) => a.modes.includes("3v3"));
const MAJORS = ["math", "physics", "chemistry", "biology", "earth", "math"] as const;
const MODES = [Mode.Semi, Mode.Manual, Mode.Semi, Mode.Manual, Mode.Semi, Mode.Manual] as const;

function gearOf(major: (typeof MAJORS)[number]) {
  const books = booksOf(major).slice(0, 4);
  return {
    books: books.map((b) => ({ def: b.id, evolved: false })),
    tools: books.map((b) => ({ def: b.tool })),
  };
}

/** A 3v3 on the 새벽관 floor with a spectator standing on it whose books are all ready. */
function duel(seed: number, ticks: number, inputSeed: number) {
  if (!arena) throw new Error("no 3v3 floor");
  const map = fightMapOf(built);
  const w = createFight(
    { ...map, collision: fenceFloor(map.collision, arena.rect) },
    rules,
    null,
    seed,
  );
  const floor = new DuelFloor(w, arena.rect, DUEL_NORMS, DUEL_TIMING);
  const marks = duelMarks(arena, "3v3");
  const fighters: Player[] = [];
  MAJORS.forEach((major, i) => {
    const mode = MODES[i] as Mode;
    const kit = duelKit(rules, duelBuild(major, null, gearOf(major), DUEL_NORMS), DUEL_NORMS, mode);
    const p = w.addPlayer(`f${i}`, i, 0, 0, kit, DUEL_NORMS.level);
    p.mode = mode;
    fighters.push(p);
  });
  // A spectator who got onto the floor: semi-auto, every book of its class, standing in the middle.
  const cx = (arena.rect.x + arena.rect.w / 2) * 16;
  const cy = (arena.rect.y + arena.rect.h / 2) * 16;
  const watcher = w.addPlayer(
    "watcher",
    9,
    cx,
    cy,
    rules.kit({ ...duelBuild("earth", null, gearOf("earth"), DUEL_NORMS), level: 100 }),
    100,
  );
  watcher.mode = Mode.Semi;
  floor.start(
    w,
    fighters.map((player, i) => ({
      player,
      team: marks[i]?.team ?? 1,
      mark: marks[i] as { x: number; y: number },
    })),
  );
  let s = inputSeed >>> 0;
  const roll = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
  const seqs = new Array<number>(6).fill(0);
  const digests: string[] = [];
  const watcherHits: number[] = [];
  const hurtByWatcher: number[] = [];
  for (let t = 0; t < ticks; t++) {
    const inputs = new Map<string, FightInput[]>();
    fighters.forEach((p, i) => {
      const foe = fighters.find((q) => q.team !== p.team && !q.down) ?? p;
      const dx = foe.x - p.x;
      const dy = foe.y - p.y;
      const d = Math.hypot(dx, dy) || 1;
      const away = d < 50 ? -1 : 1;
      const jitter = roll() - 0.5;
      let flags = 0;
      if (roll() < 0.02) flags |= InputFlag.Dodge;
      if (roll() < 0.15) flags |= castFlag(Math.floor(roll() * 4));
      const n = roll() < 0.08 ? 0 : roll() < 0.08 ? 2 : 1;
      const list: FightInput[] = [];
      for (let k = 0; k < n; k++) {
        list.push({
          seq: ++(seqs[i] as number),
          mx: Math.round(((dx / d) * away + jitter * (dy / d)) * MOVE_MAX * 0.9),
          my: Math.round(((dy / d) * away - jitter * (dx / d)) * MOVE_MAX * 0.9),
          flags,
        });
      }
      inputs.set(p.id, list);
    });
    stepFight(w, inputs);
    for (let i = 0; i < w.eventCount; i++) {
      const e = w.events[i];
      if (e?.type === Ev.Hit && e.a === watcher.index) watcherHits.push(t);
      if (e?.type === Ev.Hurt && e.c === watcher.entity) hurtByWatcher.push(t);
    }
    if (t % 50 === 49) digests.push(digest(w, floor));
    if (floor.phase === DuelPhase.Over) break;
  }
  return { w, floor, digests, watcherHits, hurtByWatcher, watcher };
}

function digest(w: FightWorld, floor: DuelFloor): string {
  const parts: (string | number)[] = [
    w.tick,
    w.random.state,
    floor.phase,
    floor.round,
    ...floor.score,
  ];
  for (const p of w.players) {
    if (!p.joined) continue;
    parts.push(p.x, p.y, p.hp, p.shield, p.downAt, p.statusMask, p.forceTicks, p.seq);
  }
  for (const f of floor.fighters) parts.push(f.damage, f.hits, f.downs);
  for (const e of w.effects) if (e.alive) parts.push(e.fx, e.kind, e.x, e.y, e.until);
  for (const n of w.minions) if (n.alive) parts.push(n.entity, n.x, n.y);
  return parts.map((v) => (typeof v === "number" ? v.toPrecision(17) : v)).join(",");
}

describe("duel replay", () => {
  const first = duel(31, 20 * 260, 7);

  it("rebuilds the same match from the seed and the recorded inputs, to a result", () => {
    const again = duel(31, 20 * 260, 7);
    expect(again.digests).toEqual(first.digests);
    expect(first.floor.result).not.toBeNull();
    expect(first.floor.rounds.length).toBeGreaterThanOrEqual(2);
    const dealt = first.floor.fighters.reduce((a, f) => a + f.damage, 0);
    expect(dealt).toBeGreaterThan(0);
    expect(duel(31, 20 * 260, 8).digests.at(-1)).not.toEqual(first.digests.at(-1));
  });

  it("lets nobody but the other side's fighters touch a fighter", () => {
    expect(first.watcherHits).toEqual([]);
    expect(first.hurtByWatcher).toEqual([]);
    expect(first.watcher.hp).toBe(first.watcher.kit.maxHp);
  });

  it("finds player-on-player hits when a floor is on, and none on a field", () => {
    const onFloor = floorWith(
      [
        { major: "physics", team: 1 },
        { major: "chemistry", team: 2 },
      ],
      3,
    );
    const floorHits = playerHits(onFloor.w, 20 * 30, onFloor.players);
    expect(floorHits).toBeGreaterThan(0);

    const map = fightMapOf(mapById("p1-colonnade") as never);
    const w = createFight(map, rules, fieldOf("p1-colonnade"), 3);
    const players = MAJORS.map((major, i) => {
      const p = w.addPlayer(
        `p${i}`,
        i,
        map.spawn.x + 200 + i * 4,
        map.spawn.y,
        rules.kit(duelBuild(major, null, gearOf(major), DUEL_NORMS)),
        100,
      );
      p.mode = Mode.Semi;
      return p;
    });
    expect(playerHits(w, 600, players)).toBe(0);
    expect(w.pvp).toBeNull();
    expect(w.monsters.some((m) => m.fighter >= 0)).toBe(false);
  });
});

// ── The floor's rules ──────────────────────────────────────────────────────────

type Entry = { major: (typeof MAJORS)[number]; team: number };

/** A floor with fighters at their marks (team 1 or 2) and spectators (team 0) in the middle. */
function floorWith(entries: readonly Entry[], seed: number, timing = DUEL_TIMING) {
  if (!arena) throw new Error("no floor");
  const map = fightMapOf(built);
  const w = createFight(
    { ...map, collision: fenceFloor(map.collision, arena.rect) },
    rules,
    null,
    seed,
  );
  const floor = new DuelFloor(w, arena.rect, DUEL_NORMS, timing);
  const cx = (arena.rect.x + arena.rect.w / 2) * 16;
  const cy = (arena.rect.y + arena.rect.h / 2) * 16;
  const mode = entries.filter((e) => e.team > 0).length > 2 ? "3v3" : "1v1";
  const marks = duelMarks(arena, mode);
  const used = [0, 0, 0];
  const players: Player[] = [];
  const start: Parameters<DuelFloor["start"]>[1][number][] = [];
  entries.forEach((e, i) => {
    const kit = duelKit(
      rules,
      duelBuild(e.major, null, gearOf(e.major), DUEL_NORMS),
      DUEL_NORMS,
      Mode.Semi,
    );
    const p = w.addPlayer(`f${i}`, i, cx, cy, kit, DUEL_NORMS.level);
    p.mode = Mode.Semi;
    players.push(p);
    if (e.team === 0) return;
    const mark = marks.filter((m) => m.team === e.team)[used[e.team] ?? 0] as {
      x: number;
      y: number;
    };
    used[e.team] = (used[e.team] ?? 0) + 1;
    start.push({ player: p, team: e.team, mark });
  });
  floor.start(w, start);
  return { w, floor, players };
}

/** Every fighter walks at the nearest player of another side; spectators stand. */
function walk(w: FightWorld, players: readonly Player[], seq: number) {
  const inputs = new Map<string, FightInput[]>();
  for (const p of players) {
    const foe = players
      .filter((q) => q !== p && q.joined && !q.down && (p.team === 0 || q.team !== p.team))
      .sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
    if (!foe || p.team === 0) continue;
    const dx = foe.x - p.x;
    const dy = foe.y - p.y;
    const d = Math.hypot(dx, dy) || 1;
    const go = d > 40 ? 1 : 0;
    inputs.set(p.id, [
      { seq, mx: Math.round((dx / d) * MOVE_MAX * go), my: Math.round((dy / d) * MOVE_MAX * go) },
    ]);
  }
  return inputs;
}

/** Hits and hurts between players over `ticks` ticks of walking at each other. */
function playerHits(w: FightWorld, ticks: number, players: readonly Player[]): number {
  let n = 0;
  for (let t = 0; t < ticks; t++) {
    stepFight(w, walk(w, players, t + 1));
    const entities = new Set(players.filter((p) => p.joined).map((p) => p.entity));
    for (let i = 0; i < w.eventCount; i++) {
      const e = w.events[i];
      if ((e?.type === Ev.Hit || e?.type === Ev.Hurt) && entities.has(e.c)) n++;
    }
  }
  return n;
}

/** Runs until `stop` or `ticks`, calling `each` after every step. */
function run(
  w: FightWorld,
  players: readonly Player[],
  ticks: number,
  each: (t: number) => void,
  stop: () => boolean = () => false,
) {
  for (let t = 0; t < ticks && !stop(); t++) {
    stepFight(w, walk(w, players, t + 1));
    each(t);
  }
}

describe("a duel floor", () => {
  it("never lets a fighter hurt its own side", () => {
    const { w, floor, players } = floorWith(
      [
        { major: "physics", team: 1 },
        { major: "chemistry", team: 1 },
        { major: "earth", team: 1 },
        { major: "biology", team: 2 },
        { major: "math", team: 2 },
        { major: "physics", team: 2 },
      ],
      11,
    );
    const teamOf = new Map(players.map((p) => [p.entity, p.team]));
    let hurts = 0;
    run(
      w,
      players,
      20 * 200,
      () => {
        for (let i = 0; i < w.eventCount; i++) {
          const e = w.events[i];
          if (e?.type !== Ev.Hurt) continue;
          const victim = w.players[e.a];
          if (!victim) continue;
          hurts++;
          expect(teamOf.get(e.c)).not.toBe(victim.team);
        }
      },
      () => floor.phase === DuelPhase.Over,
    );
    expect(hurts).toBeGreaterThan(50);
  });

  it("takes a forfeited fighter out of every hit, both ways", () => {
    const { w, floor, players } = floorWith(
      [
        { major: "physics", team: 1 },
        { major: "math", team: 1 },
        { major: "biology", team: 2 },
        { major: "earth", team: 2 },
      ],
      12,
    );
    const quitter = players[1] as Player;
    run(w, players, DUEL_TIMING.countdown + 60, () => {});
    expect(floor.forfeit(w, quitter.id)).toBe(true);
    expect(quitter.team).toBe(0);
    run(
      w,
      players,
      20 * 60,
      () => {
        for (let i = 0; i < w.eventCount; i++) {
          const e = w.events[i];
          if (e?.type === Ev.Hit) {
            expect(e.a).not.toBe(quitter.index);
            expect(e.c).not.toBe(quitter.entity);
          }
          if (e?.type === Ev.Hurt) expect(e.a).not.toBe(quitter.index);
        }
      },
      () => floor.phase === DuelPhase.Over,
    );
  });

  it("holds everyone still with no hits through the countdown, the pause and the result", () => {
    const { w, floor, players } = floorWith(
      [
        { major: "math", team: 1 },
        { major: "chemistry", team: 2 },
      ],
      13,
    );
    const seen = new Set<number>();
    let last = players.map((p) => [p.x, p.y]);
    let phase: number = floor.phase;
    run(
      w,
      players,
      20 * 400,
      () => {
        // The phase this step ran in, not the one its end turned to.
        const was = phase;
        phase = floor.phase;
        const still = was !== DuelPhase.Fight && floor.phase === was;
        if (still) {
          seen.add(floor.phase);
          for (let i = 0; i < w.eventCount; i++) expect(w.events[i]?.type).not.toBe(Ev.Hit);
          // A round starts by putting everyone at their mark; within a phase nobody moves.
          players.forEach((p, i) => {
            const [x, y] = last[i] as number[];
            if (was === DuelPhase.Pause || was === DuelPhase.Over || was === DuelPhase.Countdown) {
              expect([p.x, p.y]).toEqual([x, y]);
            }
          });
        }
        last = players.map((p) => [p.x, p.y]);
      },
      () => floor.phase === DuelPhase.Over && seen.has(DuelPhase.Over),
    );
    expect(seen.has(DuelPhase.Countdown)).toBe(true);
    expect(seen.has(DuelPhase.Pause)).toBe(true);
  });

  it("leaves nothing of the match in the world after it is cleared", () => {
    const { w, floor, players } = floorWith(
      [
        { major: "physics", team: 1 },
        { major: "chemistry", team: 2 },
      ],
      14,
    );
    run(w, players, DUEL_TIMING.countdown + 100, () => {});
    floor.clear(w);
    for (const p of players) {
      expect(p.team).toBe(0);
      expect(p.frozen).toBe(false);
      expect(p.statusMask).toBe(0);
    }
    expect(playerHits(w, 20 * 20, players)).toBe(0);
    expect(w.monsters.some((m) => m.alive && m.fighter >= 0)).toBe(false);
  });

  it("calls a round with no blows a draw, and ends a match at its time cap", () => {
    const quiet = floorWith(
      [
        { major: "math", team: 1 },
        { major: "math", team: 2 },
      ],
      15,
    );
    // No books on either side: the round is a draw once it has been idle long enough.
    for (const p of quiet.players) quiet.w.setKit(p, { ...p.kit, weapons: [] });
    for (let t = 0; t < DUEL_TIMING.countdown + DUEL_TIMING.idle + 5; t++)
      stepFight(quiet.w, new Map());
    expect(quiet.floor.rounds[0]).toMatchObject({ winner: 0 });
    expect(quiet.floor.rounds[0]?.ticks).toBeLessThanOrEqual(DUEL_TIMING.idle + 1);

    const capped = floorWith(
      [
        { major: "physics", team: 1 },
        { major: "earth", team: 2 },
      ],
      16,
      { ...DUEL_TIMING, matchCap: 20 * 6 },
    );
    run(
      capped.w,
      capped.players,
      20 * 30,
      () => {},
      () => capped.floor.phase === DuelPhase.Over,
    );
    expect(capped.floor.phase).toBe(DuelPhase.Over);
    expect(capped.floor.result?.ticks).toBeLessThanOrEqual(20 * 6 + 1);
  });
});
