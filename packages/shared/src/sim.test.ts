import { describe, expect, it } from "vitest";
import { type Collidable, gridOf, overlapsSolid } from "./collision.ts";
import { INPUT_BURST, InputQueue } from "./input-queue.ts";
import { MOVE_MAX, type MoveInput, PLAYER_RADIUS, PLAYER_SPEED } from "./movement.ts";
import { Predictor } from "./prediction.ts";
import { nextRandom } from "./rng.ts";
import {
  addPlayer,
  createWorld,
  removePlayer,
  type SimWorld,
  step,
  type TickInputs,
} from "./sim.ts";

/** 36×22 tiles with a wall, a block and two shrubs touching at a corner. */
function testMap(): Collidable {
  const wall = Array.from({ length: 15 }, (_, i) => [6 + i, 5] as [number, number]);
  return gridOf(36, 22, [...wall, [12, 12], [13, 12], [25, 15], [26, 16]]);
}

/** What the server saw: per tick, which players joined or left and which inputs arrived. */
interface Tick {
  readonly join: readonly { id: string; x: number; y: number }[];
  readonly leave: readonly string[];
  readonly arrive: readonly { id: string; input: MoveInput }[];
}

/**
 * A session over a rough network: an honest player on a jittery link, one that sends duplicates
 * and stale inputs, one flooding three inputs a tick, and one who joins late and leaves.
 */
function session(seed: number, ticks: number): Tick[] {
  let rng = seed;
  const roll = () => {
    const [v, n] = nextRandom(rng);
    rng = n;
    return v;
  };
  const axis = () => [-MOVE_MAX, 0, MOVE_MAX][Math.floor(roll() * 3)] as number;
  const seqs = new Map<string, number>();
  const make = (id: string): MoveInput => {
    const seq = (seqs.get(id) ?? 0) + 1;
    seqs.set(id, seq);
    let mx = axis();
    const my = axis();
    if (mx === 0 && my === 0) mx = MOVE_MAX;
    return { seq, mx, my };
  };
  const late: { id: string; input: MoveInput; at: number }[] = [];
  const out: Tick[] = [];
  for (let t = 0; t < ticks; t++) {
    const join = t === 0 ? ["a", "b", "c"].map((id, i) => ({ id, x: 40 + i * 30, y: 120 })) : [];
    if (t === 80) join.push({ id: "d", x: 300, y: 200 });
    const leave = t === 400 ? ["d"] : [];
    const arrive: { id: string; input: MoveInput }[] = [];
    // a: one input a tick, delayed 0 to 3 ticks, in order as TCP keeps it.
    const lastAt = late.length > 0 ? (late.at(-1) as { at: number }).at : 0;
    late.push({ id: "a", input: make("a"), at: Math.max(lastAt, t + Math.floor(roll() * 4)) });
    while (late.length > 0 && (late[0] as { at: number }).at <= t) {
      const next = late.shift() as { id: string; input: MoveInput };
      arrive.push({ id: next.id, input: next.input });
    }
    // b: every input twice, and now and then an old one again.
    const b = make("b");
    arrive.push({ id: "b", input: b }, { id: "b", input: b });
    if (roll() < 0.1) arrive.push({ id: "b", input: { ...b, seq: Math.max(1, b.seq - 5) } });
    // c: three a tick.
    for (let i = 0; i < 3; i++) arrive.push({ id: "c", input: make("c") });
    if (t >= 80 && t < 400 && roll() < 0.7) arrive.push({ id: "d", input: make("d") });
    out.push({ join, leave, arrive });
  }
  return out;
}

interface ServerRun {
  readonly world: SimWorld;
  /** The inputs each tick actually spent: the recording a replay needs. */
  readonly spent: TickInputs[];
  readonly applied: Map<string, number>;
}

/** The server's side: queues fill as inputs arrive, each tick spends from them, then steps. */
function serve(map: Collidable, ticks: readonly Tick[]): ServerRun {
  let world = createWorld(map, [{ kind: "odap", count: 12 }], 7);
  const queues = new Map<string, InputQueue>();
  const applied = new Map<string, number>();
  const spent: TickInputs[] = [];
  for (const tick of ticks) {
    for (const j of tick.join) {
      world = addPlayer(world, j.id, j.x, j.y);
      queues.set(j.id, new InputQueue());
    }
    for (const id of tick.leave) {
      world = removePlayer(world, id);
      queues.delete(id);
    }
    for (const { id, input } of tick.arrive) queues.get(id)?.push(input);
    const inputs = new Map<string, MoveInput[]>();
    for (const [id, q] of queues) {
      const taken = q.take();
      inputs.set(id, taken);
      applied.set(id, (applied.get(id) ?? 0) + taken.length);
    }
    spent.push(inputs);
    world = step(world, map, inputs);
  }
  return { world, spent, applied };
}

function replay(map: Collidable, ticks: readonly Tick[], spent: readonly TickInputs[]): SimWorld {
  let world = createWorld(map, [{ kind: "odap", count: 12 }], 7);
  ticks.forEach((tick, i) => {
    for (const j of tick.join) world = addPlayer(world, j.id, j.x, j.y);
    for (const id of tick.leave) world = removePlayer(world, id);
    world = step(world, map, spent[i]);
  });
  return world;
}

describe("world replay", () => {
  const map = testMap();
  const ticks = session(99, 600);
  const run = serve(map, ticks);

  it("rebuilds the same world from the recorded inputs", () => {
    expect(replay(map, ticks, run.spent)).toEqual(run.world);
    expect(serve(map, ticks).world).toEqual(run.world);
  });

  it("differs when the inputs differ", () => {
    expect(serve(map, session(100, 600)).world).not.toEqual(run.world);
  });

  it("never lets a flood or a burst buy more than the tick budget", () => {
    for (const [, count] of run.applied) expect(count).toBeLessThanOrEqual(600 + INPUT_BURST);
    // The flooding player spends one input a tick once its bank is gone.
    expect(run.applied.get("c")).toBeLessThanOrEqual(600 + INPUT_BURST);
    expect(run.applied.get("c")).toBeGreaterThanOrEqual(600);
  });

  it("applies every input of an honest player once, in order, on a jittery link", () => {
    const seqs = run.spent.flatMap((t) => (t.get("a") ?? []).map((i) => i.seq));
    expect(seqs).toEqual(seqs.map((_, i) => i + 1));
  });

  it("keeps every player out of the walls along the recorded session", () => {
    let world = createWorld(map, [{ kind: "odap", count: 12 }], 7);
    ticks.forEach((tick, i) => {
      for (const j of tick.join) world = addPlayer(world, j.id, j.x, j.y);
      for (const id of tick.leave) world = removePlayer(world, id);
      world = step(world, map, run.spent[i]);
      for (const p of world.players)
        expect(overlapsSolid(map, p.x, p.y, PLAYER_RADIUS)).toBe(false);
    });
  });

  it("predicts the honest player exactly, so reconciling never corrects it", () => {
    const start = ticks[0]?.join[0] as { x: number; y: number };
    const predictor = new Predictor(map, { x: start.x, y: start.y, facing: 0 }, PLAYER_SPEED);
    // The client sends the same inputs in order; the server's word arrives every tick.
    const sent = ticks.flatMap((t) => t.arrive.filter((a) => a.id === "a").map((a) => a.input));
    let world = createWorld(map, [{ kind: "odap", count: 12 }], 7);
    let next = 0;
    let worst = 0;
    ticks.forEach((tick, i) => {
      for (const j of tick.join) world = addPlayer(world, j.id, j.x, j.y);
      for (const id of tick.leave) world = removePlayer(world, id);
      const input = sent[next++];
      if (input) predictor.tick(input.mx, input.my);
      world = step(world, map, run.spent[i]);
      const a = world.players.find((p) => p.id === "a");
      if (a) worst = Math.max(worst, predictor.reconcile(a, a.seq));
    });
    expect(worst).toBe(0);
  });
});

describe("monsters", () => {
  it("does not mutate the world it is given", () => {
    const map = testMap();
    const world = createWorld(map, [{ kind: "odap", count: 4 }], 1);
    const copy = JSON.parse(JSON.stringify(world));
    step(world, map);
    expect(world).toEqual(copy);
  });

  it("wander inside the map bounds", () => {
    const map = testMap();
    let world = createWorld(map, [{ kind: "odap", count: 12 }], 3);
    for (let i = 0; i < 2400; i++) world = step(world, map);
    for (const m of world.monsters) {
      expect(m.x).toBeGreaterThan(0);
      expect(m.x).toBeLessThan(world.width);
      expect(m.y).toBeGreaterThan(0);
      expect(m.y).toBeLessThan(world.height);
    }
  });
});
