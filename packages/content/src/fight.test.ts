import {
  applyStatus,
  ByteReader,
  cast,
  castFlag,
  createFight,
  damageMonster,
  Ev,
  type FightInput,
  FightNet,
  type FightWorld,
  gridOf,
  InputFlag,
  knockbackDistance,
  MOVE_MAX,
  Mode,
  type Monster,
  NO_STATS,
  NULL_SINK,
  newViewer,
  overlapsSolid,
  type Player,
  Q,
  rebuildHash,
  SnapshotReader,
  settleKills,
  spawnMonster,
  stepFight,
  TILE_SIZE,
} from "@guago/shared";
import { describe, expect, it } from "vitest";
import { STARTER_BOOKS } from "./books.ts";
import { fieldOf, fightMapOf, mapById } from "./fight-map.ts";
import { compileKit, monsterKindIndex, simRules } from "./sim-rules.ts";
import { STATUS_IDS, type StatusId } from "./statuses.ts";

const rules = simRules();
const status = (id: StatusId) => STATUS_IDS.indexOf(id);

function kitFor(major: string, books: readonly string[], level = 10) {
  return compileKit({
    major,
    minor: null,
    level,
    stats: NO_STATS,
    books: books.map((def) => ({ def, level, grade: 0, pilgi: 0, evolved: false })),
    tools: [],
  });
}

/** The fight state that matters, as one string: two worlds agree exactly or they differ. */
function digest(w: FightWorld): string {
  const parts: (string | number)[] = [w.tick, w.random.state, w.director.kills, w.spawned];
  for (const p of w.players) {
    if (!p.joined) continue;
    parts.push(p.x, p.y, p.hp, p.level, p.exp, p.seq, p.downAt, p.shield, p.rollLeft);
  }
  for (const m of w.monsters) {
    if (!m.alive) continue;
    parts.push(m.entity, m.kind.index, m.x, m.y, m.hp, m.state, m.statusMask, m.kx, m.ky);
  }
  for (const e of w.effects) if (e.alive) parts.push(e.fx, e.kind, e.x, e.y, e.until);
  for (const n of w.minions) if (n.alive) parts.push(n.entity, n.x, n.y);
  for (const k of w.pickups) if (k.alive) parts.push(k.id, k.owner, k.x, k.y);
  return parts.map((v) => (typeof v === "number" ? v.toPrecision(17) : v)).join(",");
}

const MODES = [Mode.Auto, Mode.Semi, Mode.Skill, Mode.Manual] as const;

/** A recorded session on the first Page 1 field: ten players of every class and mode. */
function session(seed: number, ticks: number): FightInput[][][] {
  let s = seed >>> 0;
  const roll = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
  const plan: FightInput[][][] = [];
  const dirs = Array.from({ length: 10 }, () => [0, 0] as [number, number]);
  const seqs = new Array<number>(10).fill(0);
  for (let t = 0; t < ticks; t++) {
    const tick: FightInput[][] = [];
    for (let i = 0; i < 10; i++) {
      if (roll() < 0.05) {
        const a = roll() * Math.PI * 2;
        dirs[i] = [Math.round(Math.cos(a) * MOVE_MAX), Math.round(Math.sin(a) * MOVE_MAX)];
      }
      const [mx, my] = dirs[i] as [number, number];
      let flags = 0;
      if (roll() < 0.01) flags |= InputFlag.Dodge;
      if (roll() < 0.08) flags |= castFlag(Math.floor(roll() * 2));
      // Now and then an input arrives late and two are spent in one tick.
      const n = roll() < 0.1 ? 0 : roll() < 0.1 ? 2 : 1;
      const list: FightInput[] = [];
      for (let k = 0; k < n; k++) list.push({ seq: ++(seqs[i] as number), mx, my, flags });
      tick.push(list);
    }
    plan.push(tick);
  }
  return plan;
}

function fight(seed: number, plan: FightInput[][][], check?: (w: FightWorld) => void) {
  const map = fightMapOf(mapById("p1-colonnade") as never);
  const w = createFight(map, rules, fieldOf("p1-colonnade"), seed);
  const majors = Object.keys(STARTER_BOOKS);
  for (let i = 0; i < 10; i++) {
    const major = majors[i % majors.length] as string;
    const books = STARTER_BOOKS[major as keyof typeof STARTER_BOOKS];
    const level = 3 + i * 2;
    const p = w.addPlayer(
      `p${i}`,
      i,
      map.spawn.x + 200 + i * 24,
      map.spawn.y,
      kitFor(major, books, level),
      level,
    );
    p.mode = MODES[i % 4] as Mode;
    p.rebuild = (lv) => kitFor(major, books, lv);
    if (i === 7) p.expMult = 1.5;
  }
  const digests: string[] = [];
  plan.forEach((tick, t) => {
    const inputs = new Map<string, FightInput[]>();
    tick.forEach((list, i) => {
      inputs.set(`p${i}`, list);
    });
    stepFight(w, inputs);
    check?.(w);
    if (t % 100 === 99) digests.push(digest(w));
  });
  return { w, digests };
}

describe("combat replay", () => {
  // 1300 ticks: a whole 50 s surge, the start of 쉬는 시간, kills, elites, knock-outs.
  const plan = session(17, 1300);
  const first = fight(4242, plan);

  it("rebuilds the same fight from the seed and the recorded inputs", () => {
    const again = fight(4242, plan);
    expect(again.digests).toEqual(first.digests);
    expect(first.w.director.kills).toBeGreaterThan(50);
  });

  it("differs with another seed or other inputs", () => {
    expect(fight(4243, plan).digests.at(-1)).not.toEqual(first.digests.at(-1));
    expect(fight(4242, session(18, 1300)).digests.at(-1)).not.toEqual(first.digests.at(-1));
  });

  it("decodes on every client to within the dead-reckoning bound, with nothing unresolved", () => {
    let net: FightNet | undefined;
    const viewers: { v: ReturnType<typeof newViewer>; r: SnapshotReader }[] = [];
    let worst = 0;
    let checked = 0;
    fight(99, session(5, 600), (w) => {
      if (!net) {
        net = new FightNet(w);
        for (const p of w.players.slice(0, 4)) {
          const v = newViewer();
          v.player = p;
          net.viewers.add(v);
          const r = new SnapshotReader();
          r.cols = net.cols;
          r.rows = net.rows;
          viewers.push({ v, r });
        }
      }
      net.update();
      for (const { v, r } of viewers) {
        r.read(net.message(v).slice(), NULL_SINK);
        for (const m of w.monsters) {
          if (!m.alive) continue;
          const seen = r.members.get(m.entity);
          if (!seen) continue;
          worst = Math.max(worst, Math.abs(seen.qx / Q - m.x), Math.abs(seen.qy / Q - m.y));
          checked++;
        }
      }
    });
    expect(checked).toBeGreaterThan(10_000);
    // A pixel and a half, plus the quarter-pixel rounding.
    expect(worst).toBeLessThanOrEqual(1.5 + 0.25);
    expect(viewers.reduce((a, x) => a + x.r.broken, 0)).toBe(0);
  });
});

// ── Rules ───────────────────────────────────────────────────────────────────

/** An open 60×40 field with nobody in it, for placing things exactly. */
function arena(): FightWorld {
  const open = gridOf(60, 40);
  return createFight(
    {
      id: "arena",
      collision: open.collision,
      spawn: { x: 32, y: 32 },
      safe: [],
      spawnZones: [],
      eliteZones: [],
    },
    rules,
    null,
    1,
  );
}

/** A monster that neither walks nor yields: a target for counting hits. */
function post(w: FightWorld, x: number, y: number, id = "odap"): Monster {
  const m = spawnMonster(
    w,
    rules.monsters[monsterKindIndex(id)] as never,
    1,
    false,
    x,
    y,
  ) as Monster;
  m.speed = 0;
  m.mass = 1e9;
  m.maxHp = 1e12;
  m.hp = 1e12;
  return m;
}

function hitsOn(w: FightWorld, ticks: number, me: Player): Set<number> {
  const struck = new Set<number>();
  const take = () => {
    for (let i = 0; i < w.eventCount; i++) {
      const e = w.events[i];
      if (e?.type === Ev.Hit && e.a === me.index) struck.add(e.c);
    }
  };
  // What landed at the cast itself (a chain is instant), then each tick after.
  take();
  for (let t = 0; t < ticks; t++) {
    stepFight(w, new Map());
    take();
  }
  return struck;
}

function armed(w: FightWorld, book: string, x: number, y: number): Player {
  const def = rules.books.indexOf(book);
  expect(def).toBeGreaterThanOrEqual(0);
  const major = rules.books.indexOf(book) < 6 ? "math" : "physics";
  const p = w.addPlayer("me", 0, x, y, kitFor(major, [book], 1), 1);
  p.mode = Mode.Manual;
  p.ready.fill(1e9);
  return p;
}

/** Casts at once, as the step would after rebuilding the spatial hash. */
function castNow(w: FightWorld, p: Player, aim: Parameters<typeof cast>[4]): void {
  rebuildHash(w);
  cast(w, p, 0, p.kit.weapons[0] as never, aim);
}

const aimAt = (p: Player, x: number, y: number) => {
  const dx = x - p.x;
  const dy = y - p.y;
  const d = Math.hypot(dx, dy) || 1;
  return { x, y, dx: dx / d, dy: dy / d, target: null };
};

describe("attack behaviours hit what their shape covers", () => {
  const X = 480;
  const Y = 320;
  const ring = (w: FightWorld, r: number) =>
    Array.from({ length: 8 }, (_, i) =>
      post(w, X + Math.cos((i * Math.PI) / 4) * r, Y + Math.sin((i * Math.PI) / 4) * r),
    );

  it("orbit: bodies sweep a ring around the owner, not beyond it", () => {
    const w = arena();
    const p = armed(w, "wangdo", X, Y);
    const near = ring(w, 28);
    const far = ring(w, 90);
    castNow(w, p, aimAt(p, X + 10, Y));
    const struck = hitsOn(w, 40, p);
    for (const m of near) expect(struck.has(m.entity)).toBe(true);
    for (const m of far) expect(struck.has(m.entity)).toBe(false);
  });

  it("beam: everything along the sine path, nothing off it", () => {
    const w = arena();
    const p = armed(w, "graph-note", X, Y);
    const on = [40, 80, 120].map((d) => post(w, X + d, Y));
    const off = [post(w, X + 60, Y + 60), post(w, X - 60, Y), post(w, X + 250, Y)];
    castNow(w, p, aimAt(p, X + 100, Y));
    const struck = hitsOn(w, 12, p);
    for (const m of on) expect(struck.has(m.entity)).toBe(true);
    for (const m of off) expect(struck.has(m.entity)).toBe(false);
  });

  it("chain: the aimed target, then jumps within reach, never twice", () => {
    const w = arena();
    const p = armed(w, "em-lab", X, Y);
    const links = [60, 110, 160, 210].map((d) => post(w, X + d, Y));
    const lonely = post(w, X + 60, Y + 140);
    castNow(w, p, { ...aimAt(p, X + 60, Y), target: links[0] as Monster });
    const struck = hitsOn(w, 4, p);
    for (const m of links) expect(struck.has(m.entity)).toBe(true);
    expect(struck.has(lonely.entity)).toBe(false);
  });

  it("lobbed shot: only where it lands, over everything on the way", () => {
    const w = arena();
    const p = armed(w, "holiday-physics", X, Y);
    const under = post(w, X + 50, Y);
    const landing = post(w, X + 120, Y);
    castNow(w, p, aimAt(p, X + 120, Y));
    const struck = hitsOn(w, 40, p);
    expect(struck.has(landing.entity)).toBe(true);
    expect(struck.has(under.entity)).toBe(false);
  });

  it("telegraph: the mark strikes once it lands, and only inside it", () => {
    const w = arena();
    const p = armed(w, "round-earth", X, Y);
    const inside = [post(w, X + 50, Y), post(w, X + 100, Y)];
    const outside = post(w, X + 60, Y + 40);
    castNow(w, p, aimAt(p, X + 80, Y));
    expect(hitsOn(w, 10, p).size).toBe(0);
    const struck = hitsOn(w, 30, p);
    for (const m of inside) expect(struck.has(m.entity)).toBe(true);
    expect(struck.has(outside.entity)).toBe(false);
  });
});

describe("the other behaviours hit what their shape covers", () => {
  const X = 480;
  const Y = 320;

  it("straight shot: pierces as many as its data says, then stops", () => {
    const w = arena();
    const p = armed(w, "rock-box", X, Y);
    const line = [30, 60, 90].map((d) => post(w, X + d, Y));
    castNow(w, p, aimAt(p, X + 100, Y));
    const struck = hitsOn(w, 30, p);
    expect(struck.has((line[0] as Monster).entity)).toBe(true);
    expect(struck.has((line[1] as Monster).entity)).toBe(true);
    expect(struck.has((line[2] as Monster).entity)).toBe(false);
  });

  it("cone: inside the angle and the range only", () => {
    const w = arena();
    const p = armed(w, "dissection", X, Y);
    const inside = [post(w, X + 30, Y), post(w, X + 30, Y + 8)];
    const outside = [post(w, X - 30, Y), post(w, X + 30, Y + 40), post(w, X + 90, Y)];
    castNow(w, p, aimAt(p, X + 40, Y));
    const struck = hitsOn(w, 10, p);
    for (const m of inside) expect(struck.has(m.entity)).toBe(true);
    for (const m of outside) expect(struck.has(m.entity)).toBe(false);
  });

  it("wave: the ring reaches its radius and no further", () => {
    const w = arena();
    const p = armed(w, "tide-table", X, Y);
    const inside = [post(w, X + 40, Y), post(w, X, Y - 85)];
    const outside = post(w, X + 140, Y);
    castNow(w, p, aimAt(p, X + 10, Y));
    const struck = hitsOn(w, 40, p);
    for (const m of inside) expect(struck.has(m.entity)).toBe(true);
    expect(struck.has(outside.entity)).toBe(false);
  });

  it("zone: placed at the aim within its range, pulsing inside its radius", () => {
    const w = arena();
    const p = armed(w, "gravity-report", X, Y);
    const inside = post(w, X + 80, Y + 20);
    const outside = post(w, X - 80, Y);
    castNow(w, p, aimAt(p, X + 80, Y));
    const struck = hitsOn(w, 20, p);
    expect(struck.has(inside.entity)).toBe(true);
    expect(struck.has(outside.entity)).toBe(false);
  });

  it("dash: the owner moves and strikes what lies along its path", () => {
    const w = arena();
    const p = armed(w, "momentum-book", X, Y);
    const on = post(w, X + 40, Y + 4);
    const off = post(w, X + 40, Y + 60);
    castNow(w, p, aimAt(p, X + 100, Y));
    const struck = hitsOn(w, 10, p);
    expect(struck.has(on.entity)).toBe(true);
    expect(struck.has(off.entity)).toBe(false);
    expect(p.x).toBeGreaterThan(X + 60);
  });

  it("summon: minions bite near their owner, never beyond the leash", () => {
    const w = arena();
    const p = armed(w, "camping-bio", X, Y);
    const near = post(w, X + 40, Y);
    const far = post(w, X + 300, Y);
    castNow(w, p, aimAt(p, X + 40, Y));
    const struck = hitsOn(w, 80, p);
    expect(struck.has(near.entity)).toBe(true);
    expect(struck.has(far.entity)).toBe(false);
  });
});

describe("tagging", () => {
  function credited(shareA: number): Set<number> {
    const w = arena();
    const a = w.addPlayer("a", 0, 100, 100, kitFor("math", ["wangdo"]), 10);
    const b = w.addPlayer("b", 1, 120, 100, kitFor("math", ["wangdo"]), 10);
    const m = spawnMonster(w, rules.monsters[0] as never, 10, false, 300, 300) as Monster;
    damageMonster(w, a, null, m, m.maxHp * shareA, m.x, m.y, 0, 0, 0, -1, true);
    damageMonster(w, b, null, m, m.maxHp, m.x, m.y, 0, 0, 0, -1, true);
    w.eventCount = 0;
    settleKills(w, () => {});
    const out = new Set<number>();
    for (let i = 0; i < w.eventCount; i++) {
      const e = w.events[i];
      if (e?.type === Ev.Credit) out.add(e.a);
    }
    return out;
  }

  it("credits a player who dealt 5% of the health, and not one who dealt less", () => {
    expect([...credited(0.05)].sort()).toEqual([0, 1]);
    expect([...credited(0.049)]).toEqual([1]);
  });
});

describe("the 반응 표", () => {
  function setup(major: string) {
    const w = arena();
    const p = w.addPlayer("c", 0, 100, 100, kitFor(major, ["titration"]), 10);
    const m = post(w, 400, 300);
    const n = post(w, 420, 300);
    return { w, p, m, n };
  }

  it("reacts every pair for 화학 and consumes both halves", () => {
    const cases: [StatusId, StatusId][] = [
      ["acid", "base"],
      ["flammable", "burn"],
      ["metal", "acid"],
      ["wet", "sodium"],
    ];
    for (const [a, b] of cases) {
      const { w, p, m } = setup("chemistry");
      w.eventCount = 0;
      applyStatus(w, m, status(a), 1, 100, p, null);
      applyStatus(w, m, status(b), 1, 100, p, null);
      const reacted = w.events.slice(0, w.eventCount).some((e) => e.type === Ev.Reaction);
      expect(reacted, `${a} + ${b}`).toBe(true);
      expect(m.stacks[status(a)], a).toBe(0);
    }
  });

  it("gives 중화's shield and 부식's armour break", () => {
    const one = setup("chemistry");
    applyStatus(one.w, one.m, status("acid"), 1, 100, one.p, null);
    applyStatus(one.w, one.m, status("base"), 1, 100, one.p, null);
    expect(one.p.shield).toBeGreaterThan(0);
    const two = setup("chemistry");
    applyStatus(two.w, two.m, status("metal"), 1, 100, two.p, null);
    applyStatus(two.w, two.m, status("acid"), 1, 100, two.p, null);
    expect(two.m.stacks[status("armorBreak")]).toBe(3);
  });

  it("leaves other classes' statuses side by side", () => {
    const { w, p, m } = setup("physics");
    applyStatus(w, m, status("acid"), 1, 100, p, null);
    applyStatus(w, m, status("base"), 1, 100, p, null);
    expect(m.stacks[status("acid")]).toBe(1);
    expect(m.stacks[status("base")]).toBe(1);
    expect(p.shield).toBe(0);
  });
});

describe("knockback", () => {
  it("is knock ÷ mass and decays 15% a tick, travelling about v·dt ÷ 0.15", () => {
    const w = arena();
    const p = w.addPlayer("k", 0, 100, 100, kitFor("physics", ["holiday-physics"]), 1);
    p.joined = false;
    const m = spawnMonster(w, rules.monsters[0] as never, 1, false, 300, 300) as Monster;
    m.speed = 0;
    m.hp = m.maxHp = 1e9;
    damageMonster(w, null, null, m, 1, 280, 300, 180, 0, 0, -1, true);
    const v0 = 180 / m.mass / 20;
    expect(m.kx).toBeCloseTo(v0, 6);
    const x0 = m.x;
    stepFight(w, new Map());
    expect(m.kx).toBeCloseTo(v0 * 0.85, 6);
    for (let t = 0; t < 80; t++) stepFight(w, new Map());
    expect(m.kx).toBe(0);
    expect(m.x - x0).toBeCloseTo(knockbackDistance(180 / m.mass), -1);
  });

  it("never carries a knocked or charging body through a wall", () => {
    // One-tile walls with joints and rooms; monsters flung at them hard and often.
    for (let seed = 1; seed <= 12; seed++) {
      const solid: [number, number][] = [];
      let s = seed;
      const r = () => {
        s = (s * 1103515245 + 12345) >>> 0;
        return s / 2 ** 32;
      };
      for (let k = 0; k < 10; k++) {
        const x = Math.floor(r() * 36) + 2;
        const y = Math.floor(r() * 22) + 2;
        const n = 3 + Math.floor(r() * 6);
        for (let i = 0; i < n; i++) solid.push([x + i, y], [x, y + i]);
      }
      const grid = gridOf(40, 26, solid);
      const w = createFight(
        {
          id: "walls",
          collision: grid.collision,
          spawn: { x: 8, y: 8 },
          safe: [],
          spawnZones: [],
          eliteZones: [],
        },
        rules,
        null,
        seed,
      );
      const charger = rules.monsters[monsterKindIndex("element-air")] as never;
      const ms: Monster[] = [];
      for (let k = 0; k < 30; k++) {
        const x = 16 + r() * (40 * TILE_SIZE - 32);
        const y = 16 + r() * (26 * TILE_SIZE - 32);
        if (overlapsSolid(w.monsterMap, x, y, 14)) continue;
        const m = spawnMonster(
          w,
          k % 3 === 0 ? charger : (rules.monsters[0] as never),
          1,
          k % 7 === 0,
          x,
          y,
        );
        if (m) ms.push(m);
      }
      const p = w.addPlayer("bait", 0, 320, 200, kitFor("physics", ["holiday-physics"]), 1);
      p.invulnerableUntil = 1e9;
      for (let t = 0; t < 400; t++) {
        if (t % 10 === 0) {
          for (const m of ms) {
            if (!m.alive) continue;
            const a = r() * Math.PI * 2;
            damageMonster(
              w,
              null,
              null,
              m,
              0,
              m.x - Math.cos(a),
              m.y - Math.sin(a),
              900,
              0,
              0,
              -1,
              true,
            );
          }
        }
        stepFight(w, new Map());
        for (const m of ms) {
          if (!m.alive) continue;
          expect(overlapsSolid(w.monsterMap, m.x, m.y, m.radius), `seed ${seed} tick ${t}`).toBe(
            false,
          );
        }
      }
    }
  });
});

describe("the wire", () => {
  it("round-trips a full record and a reader starts from any keyframe", () => {
    const w = arena();
    const p = w.addPlayer("v", 0, 300, 300, kitFor("math", ["wangdo"]), 1);
    const m = post(w, 340, 300);
    const net = new FightNet(w);
    const v = newViewer();
    v.player = p;
    net.viewers.add(v);
    stepFight(w, new Map());
    net.update();
    const bytes = net.message(v).slice();
    const r = new SnapshotReader();
    r.cols = net.cols;
    r.rows = net.rows;
    r.read(bytes, NULL_SINK);
    const seen = r.members.get(m.entity);
    expect(seen?.kind).toBe(m.kind.index);
    expect(Math.abs((seen?.qx ?? 0) / Q - m.x)).toBeLessThanOrEqual(0.25);
    expect(new ByteReader(bytes).u8() & 1).toBe(1);
  });
});
