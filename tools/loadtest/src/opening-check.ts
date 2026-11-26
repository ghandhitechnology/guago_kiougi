/**
 * The opening's two fights played headless (PLAN §4 beats 4 and 5): the map room's encounters
 * driven as a private copy runs them, with a stand-in for the story director that walks the
 * beats' `play` conditions in order. The fights' own conditions are met only by the fights; the
 * rest (walking to a mark, cycling a mode) are met by the script. A full-auto player fights every
 * wave of the stairs and the golem, and walks between landings. Prints each signal with its tick
 * and exits non-zero when one is missing or out of order.
 *
 *   pnpm --filter @guago/loadtest opening-check [--seed 7] [--major math]
 */
import { parseArgs } from "node:util";
import {
  type BuiltMap,
  fightMapOf,
  narrative,
  OPENING_GOLEM,
  OPENING_STAIRS,
  STARTER_BOOKS,
  simRules,
} from "@guago/content";
import {
  createFight,
  Ev,
  expToNext,
  type FightInput,
  type FightWorld,
  MOVE_MAX,
  Mode,
  NO_STATS,
  type Player,
  stepFight,
  TICK_RATE_HZ,
} from "@guago/shared";
import type { MapRoomOptions } from "../../../apps/server/src/channels.ts";
import type { EncounterKind } from "../../../apps/server/src/encounter.ts";
import { encounterFor } from "../../../apps/server/src/encounters.ts";
import { provideStoryHooks } from "../../../apps/server/src/story-signals.ts";
import { builtMap, roomCollision } from "../../../apps/server/src/world-maps.ts";

const { values } = parseArgs({
  args: process.argv.slice(2).filter((a) => a !== "--"),
  options: {
    seed: { type: "string", default: "7" },
    major: { type: "string", default: "math" },
  },
});
const seed = Number(values.seed) >>> 0;
const major = values.major as keyof typeof STARTER_BOOKS;
if (!STARTER_BOOKS[major]) throw new Error(`no class ${major}`);

const CHARACTER = "opening-check";
const SESSION = "s1";
/** The longest any one condition may take before the run fails. */
const LIMIT = 4 * 60 * TICK_RATE_HZ;
/** A `near:` mark counts this close, as the director's. */
const NEAR_PX = 28;

const OWNED = new Set([
  ...OPENING_STAIRS.waves.map((w) => w.until),
  ...Object.values(OPENING_GOLEM.signals),
]);

/** Beat 4 and 5's conditions in order, with the map each is played on. */
function beat(id: string): { map: string; untils: string[] } {
  const b = narrative.NARRATIVE.opening.find((x) => x.id === id);
  if (!b) throw new Error(`no beat ${id}`);
  const untils = b.scene.steps.flatMap((s) => (s.do === "play" ? [s.until] : []));
  return { map: b.scene.map === "field-night" ? OPENING_GOLEM.map : b.scene.map, untils };
}

// The stand-in director: one scene at a time, a condition met only when it is next.
let scene: string[] = [];
let met = 0;
let tick = 0;
let total = 0;
const heard: { until: string; tick: number }[] = [];
let failed = false;

provideStoryHooks({
  waitingOn: (c) => (c === CHARACTER ? scene[met] : undefined),
  signal(c, until) {
    if (c !== CHARACTER || scene[met] !== until) return;
    met++;
    if (OWNED.has(until)) heard.push({ until, tick: total });
    console.log(
      `${String(total).padStart(6)}  ${(total / TICK_RATE_HZ).toFixed(1).padStart(6)}s  ${until}`,
    );
  },
});

/** A new character's body with the class's two starter books, at its level. */
function seat(w: FightWorld, x: number, y: number, level: number, exp: number): Player {
  const build = (lv: number) => ({
    major,
    minor: null,
    level: lv,
    stats: NO_STATS,
    books: STARTER_BOOKS[major].map((def) => ({
      def,
      level: lv,
      grade: 0,
      pilgi: 0,
      evolved: false,
    })),
    tools: [],
  });
  const p = w.addPlayer(SESSION, 0, x, y, w.rules.kit(build(level)), level);
  p.rebuild = (lv) => w.rules.kit(build(lv));
  p.exp = exp;
  p.mode = Mode.Auto;
  return p;
}

/** The room's world for `map` as a private copy makes it, with its encounter. */
function room(map: string): {
  def: BuiltMap;
  w: FightWorld;
  kind: EncounterKind;
  options: MapRoomOptions;
} {
  const def = builtMap(map);
  if (!def) throw new Error(`no map ${map}`);
  const options: MapRoomOptions = {
    map,
    channel: 0,
    seats: 1,
    grace: 30,
    owner: CHARACTER,
    calm: true,
  };
  const kind = encounterFor(def, options);
  if (!kind) throw new Error(`no encounter on ${map}`);
  const base = { ...fightMapOf(def), collision: roomCollision(def).collision };
  const w = createFight(kind.map?.(base, options) ?? base, simRules(), null, seed);
  return { def, w, kind, options };
}

/** Walking input toward (x, y): to the flights' column first on the stairs, then straight. */
function toward(p: Player, x: number, y: number, column: number | undefined): FightInput {
  let dx = x - p.x;
  let dy = y - p.y;
  if (column !== undefined && Math.abs(p.x - column) > 4 && Math.abs(dy) > 48) {
    dx = column - p.x;
    dy = 0;
  }
  const d = Math.hypot(dx, dy) || 1;
  return {
    seq: tick + 1,
    mx: Math.round((dx / d) * MOVE_MAX),
    my: Math.round((dy / d) * MOVE_MAX),
  };
}

interface Tally {
  kills: number;
  bySeniors: number;
  downs: number;
  seniorDrops: number;
}

/** Plays one beat on its map until every condition is met, or fails. */
function play(id: string, start: string, carry: { level: number; exp: number }): void {
  const b = beat(id);
  const { def, w, kind, options } = room(b.map);
  const at = def.marks[start] ?? w.map.spawn;
  const p = seat(w, at.x, at.y, carry.level, carry.exp);
  const enc = kind.create({
    world: w,
    def,
    options,
    characterOf: (q) => (q === p ? CHARACTER : undefined),
    nameOf: () => undefined,
    relocate: () => false,
    inputAt: () => 0,
    sendTo: () => false,
  });
  enc.joined?.(p, CHARACTER);
  scene = b.untils;
  met = 0;
  tick = 0;
  console.log(`-- ${id} on ${b.map} (${kind.id}), level ${p.level}`);
  const tally: Tally = { kills: 0, bySeniors: 0, downs: 0, seniorDrops: 0 };
  let since = 0;
  let last = -1;
  let stuck = 0;
  const column =
    b.map === OPENING_STAIRS.map ? (def.marks["landing-4f"]?.x ?? undefined) : undefined;
  while (met < scene.length) {
    const until = scene[met] as string;
    if (met !== last) {
      last = met;
      since = 0;
      stuck = 0;
    }
    if (++since > LIMIT) {
      console.log(`FAIL  ${until} not met within ${LIMIT / TICK_RATE_HZ}s`);
      failed = true;
      break;
    }
    // Where the script walks: a mark the scene waits at, or the landing of the next wave.
    const wave = OPENING_STAIRS.waves.find((x) => x.until === until);
    const goal = until.startsWith("near:")
      ? def.marks[until.slice(5)]
      : wave
        ? def.marks[wave.landing]
        : undefined;
    const inputs = new Map<string, FightInput[]>();
    const far = goal ? Math.hypot(goal.x - p.x, goal.y - p.y) : 0;
    const walking =
      goal &&
      !p.down &&
      (until.startsWith("near:") ? far > NEAR_PX - 4 : far > (OPENING_STAIRS.reach - 2) * 16);
    p.mode = walking ? Mode.Semi : Mode.Auto;
    if (walking && goal) {
      inputs.set(SESSION, [toward(p, goal.x, goal.y, column)]);
      // The script checks fights, not paths: a walk that stalls is put at its mark.
      if (stuck > 40) {
        console.log(
          `        (stuck at ${Math.round(p.x)},${Math.round(p.y)}: placed at the mark for ${until})`,
        );
        p.x = goal.x;
        p.y = goal.y;
        stuck = 0;
      }
    }
    tick++;
    total++;
    const bx = p.x;
    const by0 = p.y;
    stepFight(w, inputs);
    if (walking) stuck = Math.hypot(p.x - bx, p.y - by0) < 0.3 ? stuck + 1 : 0;
    for (let i = 0; i < w.eventCount; i++) {
      const e = w.events[i];
      if (e?.type === Ev.Kill) {
        tally.kills++;
        const by = e.a >= 0 ? w.players[e.a] : undefined;
        if (by && by !== p) tally.bySeniors++;
      } else if (e?.type === Ev.Down && e.a === p.index) tally.downs++;
    }
    // The room books a drop only for a pawn: a senior's are counted to show they stay unbooked.
    for (const g of w.grants) if (g.player !== p) tally.seniorDrops++;
    enc.afterStep();
    if (until.startsWith("near:") && goal && Math.hypot(goal.x - p.x, goal.y - p.y) <= NEAR_PX)
      met++;
    else if (!OWNED.has(until) && !until.startsWith("near:")) met++;
  }
  for (const q of w.players) {
    if (q.joined && q !== p) {
      console.log(`FAIL  ${q.id} still in the fight after the beat`);
      failed = true;
    }
  }
  console.log(
    `   kills ${tally.kills} (seniors ${tally.bySeniors}, their drops left unbooked ${tally.seniorDrops}), knocked out ${tally.downs}, level ${p.level} (${Math.floor(p.exp)}/${Math.floor(expToNext(p.level))} EXP)`,
  );
  carry.level = p.level;
  carry.exp = p.exp;
  enc.dispose();
}

const carry = { level: 1, exp: 0 };
play("b4-stairs", "landing-4f", carry);
if (!failed) play("b5-field", "field-edge", carry);

const expected = [...beat("b4-stairs").untils, ...beat("b5-field").untils].filter((u) =>
  OWNED.has(u),
);
const got = heard.map((h) => h.until);
for (const u of expected) if (!got.includes(u)) console.log(`FAIL  ${u} never signalled`);
const inOrder = expected.length === got.length && expected.every((u, i) => got[i] === u);
if (!inOrder) console.log(`FAIL  signals out of order: ${got.join(", ")}`);
const ok = !failed && inOrder;
console.log(ok ? `ok  ${got.length} signals in order` : "FAILED");
process.exit(ok ? 0 : 1);
