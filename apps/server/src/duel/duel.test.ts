/**
 * The hub and the floor host against rooms that hold real fight worlds (no sockets, no database):
 * the bracket rule (a character after its match equals itself before, whichever way and in
 * whichever phase it leaves), the hub's invariants, and the griefing rules of the queue.
 */
import {
  type BuiltMap,
  DUEL_NORMS,
  fightMapOf,
  mapById,
  STARTER_BOOKS,
  simRules,
} from "@guago/content";
import {
  createFight,
  duelBuild,
  duelKit,
  type FightWorld,
  fenceFloor,
  Mode,
  NO_STATS,
  type Player,
  stepFight,
  type WorldMessageSchema,
} from "@guago/shared";
import { afterEach, describe, expect, it } from "vitest";
import { places } from "../places.ts";
import { applyBefore, type Before, bracketView, takeBefore } from "./bracket.ts";
import { FloorHost, type FloorRoom } from "./floor.ts";
import { createDueling, type DuelHost, type DuelReadiness, type DuelRoom } from "./hub.ts";
import { memoryOrigins } from "./origins.ts";
import { memoryRecords } from "./records.ts";

const rules = simRules();
const MAJORS = ["math", "physics", "chemistry", "biology", "earth"] as const;
type Major = (typeof MAJORS)[number];

function ownKit(major: Major, level: number) {
  return rules.kit({
    major,
    minor: null,
    level,
    stats: NO_STATS,
    books: (STARTER_BOOKS[major] ?? []).map((def) => ({
      def,
      level,
      grade: 0,
      pilgi: 0,
      evolved: false,
    })),
    tools: [],
  });
}

interface Character {
  readonly id: string;
  readonly major: Major;
  readonly level: number;
  party: string | null;
  sid: number;
}

/** A move between rooms: the body leaves at once and sits down `delay` ticks later. */
interface Move {
  readonly c: Character;
  readonly to: FakeRoom;
  readonly x: number;
  readonly y: number;
  due: number;
}

class World {
  tick = 0;
  readonly rooms = new Map<string, FakeRoom>();
  readonly moves: Move[] = [];
  readonly characters = new Map<string, Character>();
  /** Ticks a trip between rooms takes. */
  delay = 4;

  character(id: string, major: Major, level = 40): Character {
    const c: Character = { id, major, level, party: null, sid: 0 };
    this.characters.set(id, c);
    return c;
  }

  step(): void {
    this.tick++;
    for (const r of this.rooms.values()) r.step();
    for (const m of [...this.moves]) {
      if (m.due > this.tick) continue;
      this.moves.splice(this.moves.indexOf(m), 1);
      m.to.seat(m.c, m.x, m.y);
    }
  }
}

let nextSid = 1;

class FakeRoom implements DuelRoom {
  readonly roomId: string;
  readonly mapId: string;
  readonly channel = 1;
  readonly fight: FightWorld;
  readonly bodies = new Map<string, Player>();
  floor: FloorHost | undefined;
  /** Called after every restore with the body's state as the bracket sees it. */
  onRestore: ((id: string, after: Before) => void) | undefined;
  private readonly world: World;
  private readonly hub: () => ReturnType<typeof createDueling>;

  constructor(
    world: World,
    roomId: string,
    mapId: string,
    hub: () => ReturnType<typeof createDueling>,
  ) {
    this.world = world;
    this.roomId = roomId;
    this.mapId = mapId;
    this.hub = hub;
    const built = mapById(mapId) as BuiltMap;
    const map = fightMapOf(built);
    const arena = built.arenas.find((a) => a.modes.length > 0);
    this.fight = createFight(
      arena ? { ...map, collision: fenceFloor(map.collision, arena.rect) } : map,
      rules,
      null,
      7,
    );
    world.rooms.set(roomId, this);
  }

  /** A character sits down here with a fresh body, as on entering. */
  seat(c: Character, x: number, y: number): Player {
    const sid = `s${nextSid++}`;
    c.sid = Number(sid.slice(1));
    const p = this.fight.addPlayer(sid, this.bodies.size, x, y, ownKit(c.major, c.level), c.level);
    p.party = c.party;
    this.bodies.set(c.id, p);
    places.enter(c.id, {
      mapId: this.mapId,
      channel: this.channel,
      roomId: this.roomId,
      sessionId: sid,
      at: () => (p.joined ? { x: p.x, y: p.y } : undefined),
      zones: () => [],
    });
    this.floor?.seatedHere(c.id);
    this.hub().arrived(c.id, this);
    return p;
  }

  /** The body goes (a logout, a door): what the map room does in `removeBody`. */
  unseat(id: string): void {
    const p = this.bodies.get(id);
    if (!p) return;
    this.bodies.delete(id);
    places.leave(p.id);
    this.fight.removePlayer(p.id);
  }

  step(): void {
    const inputs = new Map();
    stepFight(this.fight, inputs);
    this.floor?.tick();
  }

  body(id: string): Player | undefined {
    return this.bodies.get(id);
  }

  duelReady(id: string): DuelReadiness {
    const p = this.bodies.get(id);
    return p && !p.down && p.team === 0 ? "ok" : "duel_not_here";
  }

  seatsFor(): boolean {
    return true;
  }

  snapshot(id: string): Before | undefined {
    const p = this.bodies.get(id);
    return p && takeBefore(p, this.fight.tick, { map: this.mapId, roomId: this.roomId });
  }

  restoreFromDuel(id: string, before: Before): boolean {
    const p = this.bodies.get(id);
    const c = this.world.characters.get(id);
    if (!p || !c) return false;
    p.team = 0;
    p.level = before.level;
    p.mode = before.mode;
    p.party = c.party;
    this.fight.setKit(p, ownKit(c.major, p.level));
    applyBefore(p, before, this.fight.tick);
    this.onRestore?.(id, takeBefore(p, this.fight.tick, { map: this.mapId, roomId: this.roomId }));
    return true;
  }

  sendTo(id: string, to: { map: string; x: number; y: number; roomId?: string }): boolean {
    const c = this.world.characters.get(id);
    if (!c || !this.bodies.has(id)) return false;
    const target =
      (to.roomId && this.world.rooms.get(to.roomId)) ||
      [...this.world.rooms.values()].find((r) => r.mapId === to.map);
    if (!target) return false;
    this.unseat(id);
    this.world.moves.push({
      c,
      to: target,
      x: to.x,
      y: to.y,
      due: this.world.tick + this.world.delay,
    });
    return true;
  }

  teleport(id: string, x: number, y: number): boolean {
    const p = this.bodies.get(id);
    if (!p) return false;
    p.x = x;
    p.y = y;
    this.onRestore?.(id, takeBefore(p, this.fight.tick, { map: this.mapId, roomId: this.roomId }));
    return true;
  }

  asFloorRoom(): FloorRoom {
    return {
      roomId: this.roomId,
      mapId: this.mapId,
      channel: this.channel,
      world: this.fight,
      bodyOf: (id) => {
        const p = this.bodies.get(id);
        return p ? { player: p, sid: p.id } : undefined;
      },
      seated: () => [...this.bodies].map(([characterId, player]) => ({ characterId, player })),
      broadcast: () => {},
      send: () => {},
      fence: () => {},
      duelKit: (id, mode) => {
        const c = this.world.characters.get(id) as Character;
        const books = (STARTER_BOOKS[c.major] ?? []).map((def) => ({ def, evolved: false }));
        return duelKit(
          rules,
          duelBuild(c.major, null, { books, tools: [] }, DUEL_NORMS),
          DUEL_NORMS,
          mode,
        );
      },
      modeChanged: () => {},
      gallery: { x: 600, y: 360 },
    };
  }
}

type Run = (me: string, m: Record<string, unknown>) => Promise<{ type: string; body: unknown }>;

function setup() {
  const world = new World();
  const handlers = new Map<string, Run>();
  const pushes: { to: string; e: { t: string; [k: string]: unknown } }[] = [];
  const blocks = new Set<string>();
  const online = new Set<string>();
  const host: DuelHost = {
    on: <T>(
      type: string,
      _schema: WorldMessageSchema<T>,
      run: (id: string, m: T) => Promise<{ type: string; body: unknown }>,
    ) => {
      handlers.set(type, run as unknown as Run);
    },
    member: (id) => (online.has(id) ? { name: id, level: 40 } : undefined),
    send: (to, _type, e) => pushes.push({ to, e: e as { t: string } }),
    blocked: (owner, other) => blocks.has(`${owner}>${other}`),
  };
  const origins = memoryOrigins();
  let hub!: ReturnType<typeof createDueling>;
  hub = createDueling({
    records: memoryRecords(),
    origins,
    everyMs: 1_000_000,
    rooms: {
      openChannel: async () => {},
      room: (roomId) => world.rooms.get(roomId),
    },
  });
  hub.attach(host);
  const origin = new FakeRoom(world, "yard-1", "campus-yard", () => hub);
  const floorRoom = new FakeRoom(world, "dorm-1", "saebyeok", () => hub);
  const arena = (mapById("saebyeok") as BuiltMap).arenas.find((a) => a.modes.length > 0);
  if (!arena) throw new Error("no floor");
  floorRoom.floor = hub.addFloor(
    "dorm-1",
    (events) => new FloorHost(floorRoom.asFloorRoom(), arena, events),
  );
  let n = 0;
  const call = async (type: string, me: string, body: Record<string, unknown> = {}) => {
    const run = handlers.get(type);
    if (!run) throw new Error(`no handler ${type}`);
    const a = await run(me, { ...body, n: ++n });
    return a.body as { code?: string; data?: unknown };
  };
  const join = (room: FakeRoom, id: string, major: Major, x: number, y: number) => {
    const c = world.characters.get(id) ?? world.character(id, major);
    online.add(id);
    everyone.add(id);
    return { c, p: room.seat(c, x, y) };
  };
  const steps = (n: number, stop: () => boolean = () => false) => {
    for (let i = 0; i < n && !stop(); i++) world.step();
  };
  return {
    world,
    hub,
    host,
    pushes,
    blocks,
    online,
    origin,
    floorRoom,
    call,
    join,
    steps,
    origins,
  };
}

/** A character in a state worth keeping: hurt, shielded, books and dodge mid-cooldown, buffed. */
function dress(p: Player, tick: number, mode: Mode): void {
  p.hp = p.kit.maxHp * 0.37;
  p.shield = 55;
  p.shieldUntil = tick + 400;
  for (let i = 0; i < p.kit.weapons.length; i++) p.ready[i] = 120 + i * 40;
  p.dodgeReadyAt = tick + 50;
  p.attackSpeed = 0.3;
  p.cooldownBuff = 0.1;
  p.buffUntil = tick + 300;
  p.mode = mode;
}

/** Lets the hub's awaited steps (choosing a floor, saving origins) run. */
const settle = () => new Promise((r) => setTimeout(r, 0));

const close = (a: Before, b: Before) => {
  const x = bracketView(a);
  const y = bracketView(b);
  expect(y.map).toBe(x.map);
  expect(y.x).toBeCloseTo(x.x, 6);
  expect(y.y).toBeCloseTo(x.y, 6);
  expect(y.level).toBe(x.level);
  expect(y.mode).toBe(x.mode);
  expect(y.hpShare).toBeCloseTo(x.hpShare, 9);
  expect(y.shield).toBe(x.shield);
  expect(y.shieldLeft).toBe(x.shieldLeft);
  expect(y.ready).toEqual(x.ready);
  expect(y.dodgeLeft).toBe(x.dodgeLeft);
  expect(y.attackSpeed).toBe(x.attackSpeed);
  expect(y.cooldownBuff).toBe(x.cooldownBuff);
  expect(y.buffLeft).toBe(x.buffLeft);
};

const everyone = new Set<string>();
afterEach(() => {
  for (const id of everyone) places.leave(places.get(id)?.sessionId ?? "");
  everyone.clear();
});

type Phase = "arriving" | "countdown" | "fight" | "pause" | "over";
type Way = "concede" | "drop" | "gone" | "door";

describe("a duel is a closed bracket", () => {
  /** A and B challenge from the yard, reach `phase`, then A leaves by `way`. */
  async function bracket(phase: Phase, way: Way) {
    const t = setup();
    const a = t.join(t.origin, "a", "physics", 300, 300);
    const b = t.join(t.origin, "b", "chemistry", 340, 300);
    a.c.party = "77";
    a.p.party = "77";
    dress(a.p, t.origin.fight.tick, Mode.Manual);
    const before = takeBefore(a.p, t.origin.fight.tick, { map: "campus-yard", roomId: "yard-1" });
    const restores: Before[] = [];
    t.origin.onRestore = (id, after) => id === "a" && restores.push(after);
    const leftWith: Before[] = [];
    t.floorRoom.onRestore = (id, after) => id === "a" && leftWith.push(after);
    const sent = await t.call("duel.challenge", "b", { id: "a" });
    const challenge = (sent.data as { challenge: number }).challenge;
    await t.call("duel.accept", "a", { id: challenge });
    await settle();
    const floor = t.floorRoom.floor as FloorHost;
    const view = () => floor.view().phase;
    if (phase !== "arriving") t.steps(5000, () => view() === phase);
    expect(view()).toBe(phase);
    if (phase !== "arriving") expect(t.floorRoom.body("a")?.team).toBeGreaterThan(0);
    switch (way) {
      case "concede":
        expect((await t.call("duel.forfeit", "a")).code).toBeUndefined();
        break;
      case "drop":
        if (phase === "arriving") return t; // no seat on the floor yet to drop
        floor.leaving("a", "drop");
        break;
      case "gone": {
        if (phase === "arriving") return t;
        floor.leaving("a", "gone");
        t.floorRoom.unseat("a");
        // Back on later: it sits down where its record says, the floor's map.
        t.steps(10);
        t.floorRoom.seat(a.c, 600, 300);
        break;
      }
      case "door":
        if (phase === "arriving") return t;
        floor.leaving("a", "moving");
        t.floorRoom.unseat("a");
        break;
    }
    t.steps(40);
    expect(t.hub.check()).toEqual([]);
    if (way === "door") {
      // The door decides where it goes; the numbers it leaves with are the ones from before.
      expect(t.origin.body("a")).toBeUndefined();
      const out = leftWith.at(-1) as Before;
      close({ ...before, map: out.map, x: out.x, y: out.y }, out);
      return t;
    }
    const home = t.origin.body("a");
    expect(home).toBeDefined();
    expect(restores.length).toBeGreaterThan(0);
    close(before, restores.at(-1) as Before);
    expect(home?.party).toBe("77");
    expect(home?.team).toBe(0);
    expect(home?.frozen).toBe(false);
    expect(home?.down).toBe(false);
    expect(t.origins.rows.has("a")).toBe(false);
    return t;
  }

  for (const phase of ["arriving", "countdown", "fight", "pause", "over"] as const) {
    for (const way of ["concede", "drop", "gone", "door"] as const) {
      it(`${way} in ${phase}`, async () => {
        await bracket(phase, way);
      });
    }
  }

  it("at the end of a match, and when the floor's room closes", async () => {
    for (const ending of ["end", "close"] as const) {
      const t = setup();
      const a = t.join(t.origin, "a", "math", 300, 300);
      t.join(t.origin, "b", "earth", 340, 300);
      dress(a.p, t.origin.fight.tick, Mode.Auto);
      const before = takeBefore(a.p, t.origin.fight.tick, { map: "campus-yard", roomId: "yard-1" });
      const restores: Before[] = [];
      t.origin.onRestore = (id, after) => id === "a" && restores.push(after);
      const sent = await t.call("duel.challenge", "b", { id: "a" });
      await t.call("duel.accept", "a", { id: (sent.data as { challenge: number }).challenge });
      await settle();
      const floor = t.floorRoom.floor as FloorHost;
      if (ending === "end")
        t.steps(20 * 60 * 6, () => !floor.busy && t.origin.body("a") !== undefined);
      else {
        t.steps(200, () => floor.view().phase === "fight");
        t.hub.removeFloor("dorm-1");
        t.steps(20);
      }
      expect(floor.busy).toBe(false);
      expect(t.hub.check()).toEqual([]);
      close(before, restores.at(-1) as Before);
      expect(t.origin.body("a")?.mode).toBe(Mode.Auto);
    }
  });
});

describe("the hub", () => {
  it("locks only whoever broke a ready check", async () => {
    const t = setup();
    const ids = ["q1", "q2"];
    for (const [i, id] of ids.entries())
      t.join(t.origin, id, MAJORS[i] as Major, 300 + i * 30, 300);
    await t.call("duel.queue", "q1", { mode: "1v1" });
    await t.call("duel.queue", "q2", { mode: "1v1" });
    const found = t.pushes.find((p) => p.to === "q1" && p.e.t === "found");
    expect(found).toBeDefined();
    await t.call("duel.ready", "q1", { id: found?.e.id });
    // q1 accepted at once and drops; q2 had not answered yet.
    t.online.delete("q1");
    t.hub.left("q1");
    // q2 is back at the front of the queue, unlocked; q1 is locked.
    expect(t.pushes.filter((p) => p.to === "q2" && p.e.t === "queued").length).toBe(2);
    expect((await t.call("duel.unqueue", "q2")).code).toBeUndefined();
    expect((await t.call("duel.queue", "q2", { mode: "1v1" })).code).toBeUndefined();
    t.online.add("q1");
    expect((await t.call("duel.queue", "q1", { mode: "1v1" })).code).toBe("duel_queue_locked");
  });

  it("keeps a blocked player's challenges out of the target's inbox and tells them nothing", async () => {
    const t = setup();
    t.join(t.origin, "t", "math", 300, 300);
    for (let i = 0; i < 6; i++) {
      t.join(t.origin, `g${i}`, "physics", 320 + i * 4, 300);
      t.blocks.add(`t>g${i}`);
      const r = await t.call("duel.challenge", `g${i}`, { id: "t" });
      expect(r.code).toBeUndefined();
    }
    expect(t.pushes.filter((p) => p.to === "t")).toEqual([]);
    t.join(t.origin, "friend", "earth", 360, 300);
    const real = await t.call("duel.challenge", "friend", { id: "t" });
    expect(real.code).toBeUndefined();
    expect(t.pushes.some((p) => p.to === "t" && p.e.t === "challenged")).toBe(true);
    // Busy or not, the blocked one hears the same thing.
    t.join(t.origin, "busy", "biology", 380, 300);
    const other = await t.call("duel.challenge", "busy", { id: "friend" });
    expect(other.code).toBeUndefined();
    await t.call("duel.accept", "friend", { id: (other.data as { challenge: number }).challenge });
    await settle();
    t.join(t.origin, "g9", "math", 400, 300);
    t.blocks.add("friend>g9");
    const hidden = await t.call("duel.challenge", "g9", { id: "friend" });
    expect(hidden.code).toBeUndefined();
    const plain = await t.call("duel.challenge", "g9x", { id: "friend" });
    expect(plain.code).not.toBeUndefined();
  });

  it("puts a queued match nobody can host back at the front of the queue", async () => {
    const t = setup();
    t.hub.removeFloor("dorm-1");
    t.join(t.origin, "x1", "math", 300, 300);
    t.join(t.origin, "x2", "earth", 330, 300);
    await t.call("duel.queue", "x1", { mode: "1v1" });
    await t.call("duel.queue", "x2", { mode: "1v1" });
    const found = t.pushes.find((p) => p.to === "x1" && p.e.t === "found");
    await t.call("duel.ready", "x1", { id: found?.e.id });
    await t.call("duel.ready", "x2", { id: found?.e.id });
    await settle();
    expect(
      t.pushes.some((p) => p.to === "x1" && p.e.t === "cancelled" && p.e.why === "no_floor"),
    ).toBe(true);
    expect(t.pushes.filter((p) => p.to === "x2" && p.e.t === "queued").length).toBe(2);
    expect(t.hub.check()).toEqual([]);
  });
});
