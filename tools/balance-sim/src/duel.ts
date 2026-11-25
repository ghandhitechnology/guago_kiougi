/**
 * Time to kill on the 콜로세움 floor, from the real fight step (PLAN §14): every class against
 * every class at the duel's normalised kit, in 반자동, on the 새벽관 floor with its rail shut.
 *
 * `solo`: the attacker fights, the target has no books and only walks: seconds until it is down.
 * `duel`: both fight; the winner and seconds to the first knock-out, over several seeds.
 *
 *   node tools/balance-sim/src/duel.ts [--seeds 6]
 */
import {
  type BuiltMap,
  booksOf,
  type ClassId,
  DUEL_NORMS,
  DUEL_TIMING,
  duelMarks,
  fightMapOf,
  mapById,
  simRules,
} from "@guago/content";
import {
  createFight,
  DuelFloor,
  DuelPhase,
  duelBuild,
  duelKit,
  type FightInput,
  type FightWorld,
  fenceFloor,
  MAJORS,
  MOVE_MAX,
  Mode,
  type Player,
  stepFight,
  TICK_RATE_HZ,
} from "@guago/shared";

const rules = simRules();
const built = mapById("saebyeok") as BuiltMap;
const found = built.arenas.find((a) => a.modes.length > 0);
if (!found) throw new Error("saebyeok has no dueling floor");
const arena = found;

/** A class's first four books with their linked tools, as a 2학년 would wear them. */
export function gearOf(major: ClassId) {
  const books = booksOf(major).slice(0, 4);
  return {
    books: books.map((b) => ({ def: b.id, evolved: false })),
    tools: books.map((b) => ({ def: b.tool })),
  };
}

function world(seed: number): { w: FightWorld; floor: DuelFloor } {
  const map = fightMapOf(built);
  const fenced = { ...map, collision: fenceFloor(map.collision, arena.rect) };
  const w = createFight(fenced, rules, null, seed);
  const floor = new DuelFloor(w, arena.rect, DUEL_NORMS, DUEL_TIMING);
  return { w, floor };
}

function fighter(w: FightWorld, id: string, slot: number, major: ClassId, armed: boolean): Player {
  const build = duelBuild(
    major,
    null,
    armed ? gearOf(major) : { books: [], tools: [] },
    DUEL_NORMS,
  );
  const kit = duelKit(rules, build, DUEL_NORMS, Mode.Semi);
  const p = w.addPlayer(id, slot, 0, 0, kit, DUEL_NORMS.level);
  p.mode = Mode.Semi;
  return p;
}

/** Walks toward the other fighter to a preferred range, circling a little once there. */
function steer(p: Player, q: Player, range: number, t: number, seq: number): FightInput {
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const d = Math.hypot(dx, dy) || 1;
  let mx = 0;
  let my = 0;
  if (d > range + 12) {
    mx = dx / d;
    my = dy / d;
  } else if (d < range - 12) {
    mx = -dx / d;
    my = -dy / d;
  } else {
    const side = Math.floor(t / 40) % 2 === 0 ? 1 : -1;
    mx = (-dy / d) * side;
    my = (dx / d) * side;
  }
  return { seq, mx: Math.round(mx * MOVE_MAX), my: Math.round(my * MOVE_MAX) };
}

/** One round: seconds until someone is down (or the clock runs out) and who stood. */
export function round(a: ClassId, b: ClassId, seed: number, bArmed: boolean) {
  const { w, floor } = world(seed);
  // Odd seeds swap the sides and the order the two act in, so neither mark nor turn order decides.
  const swap = seed % 2 === 1;
  const pb0 = swap ? fighter(w, "b", 1, b, bArmed) : null;
  const pa = fighter(w, "a", 0, a, true);
  const pb = pb0 ?? fighter(w, "b", 1, b, bArmed);
  const marks = duelMarks(arena, "1v1");
  const [ma, mb] = swap ? [marks[1], marks[0]] : [marks[0], marks[1]];
  floor.start(w, [
    { player: pa, team: 1, mark: ma as { x: number; y: number } },
    { player: pb, team: 2, mark: mb as { x: number; y: number } },
  ]);
  let seq = 0;
  const limit = DUEL_TIMING.countdown + DUEL_TIMING.round + 2;
  for (let t = 0; t < limit; t++) {
    seq++;
    const inputs = new Map<string, FightInput[]>([
      ["a", [steer(pa, pb, 64, t, seq)]],
      ["b", [steer(pb, pa, bArmed ? 64 : 140, t + 20, seq)]],
    ]);
    stepFight(w, inputs);
    if (floor.phase !== DuelPhase.Countdown && floor.phase !== DuelPhase.Fight) break;
  }
  const r = floor.rounds[0];
  return {
    seconds: (r?.ticks ?? DUEL_TIMING.round) / TICK_RATE_HZ,
    winner: r?.winner ?? 0,
    end: r?.end ?? 1,
  };
}

function main(): void {
  const seedsArg = process.argv.indexOf("--seeds");
  const seeds = seedsArg >= 0 ? Number(process.argv[seedsArg + 1]) : 6;
  const classes = MAJORS as readonly ClassId[];
  const pad = (s: string, n = 9) => s.padStart(n);
  console.log(`Duel norms: ${JSON.stringify(DUEL_NORMS)}`);
  console.log(
    `\nSolo time to kill, seconds (attacker ↓, target only walks →), median of ${seeds} seeds`,
  );
  console.log(pad("") + classes.map((c) => pad(c)).join(""));
  for (const a of classes) {
    const row = classes.map((b) => {
      const times = Array.from(
        { length: seeds },
        (_, s) => round(a, b, 100 + s, false).seconds,
      ).sort((x, y) => x - y);
      return pad((times[Math.floor(times.length / 2)] as number).toFixed(1));
    });
    console.log(pad(a) + row.join(""));
  }
  console.log(
    `\nBoth fighting: row's wins of ${seeds} rounds / median seconds to the first knock-out`,
  );
  console.log(pad("") + classes.map((c) => pad(c, 11)).join(""));
  for (const a of classes) {
    const row = classes.map((b) => {
      const rs = Array.from({ length: seeds }, (_, s) => round(a, b, 200 + s, true));
      const wins = rs.filter((r) => r.winner === 1).length;
      const times = rs.map((r) => r.seconds).sort((x, y) => x - y);
      return pad(
        `${wins}/${seeds} ${(times[Math.floor(times.length / 2)] as number).toFixed(1)}`,
        11,
      );
    });
    console.log(pad(a) + row.join(""));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
