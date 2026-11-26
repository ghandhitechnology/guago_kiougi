/**
 * How long a new student lasts on the first field (PLAN §6, §9): the `p1-colonnade` fight built
 * as the server builds it, students of level 1, 3 and 5 with their class's starter books in
 * 반자동, either standing just outside the arrival or wandering lazily near it. Prints the median
 * time to the first knock-out over several seeds, capped, alone and in groups of 2, 4 and 8.
 *
 *   pnpm --filter @guago/loadtest solo-field [--seeds 5] [--minutes 10]
 */
import { parseArgs } from "node:util";
import {
  type ClassId,
  compileKit,
  fieldOf,
  fightMapOf,
  mapById,
  STARTER_BOOKS,
  simRules,
} from "@guago/content";
import {
  createFight,
  type FightInput,
  MOVE_MAX,
  Mode,
  NO_STATS,
  stepFight,
  TICK_RATE_HZ,
} from "@guago/shared";

const { values } = parseArgs({
  args: process.argv.slice(2).filter((a) => a !== "--"),
  options: {
    seeds: { type: "string", default: "5" },
    minutes: { type: "string", default: "10" },
  },
});
const SEEDS = Number(values.seeds);
const CAP = Number(values.minutes) * 60 * TICK_RATE_HZ;
const FIELD = "p1-colonnade";
const LEVELS = [1, 3, 5] as const;
const CLASSES = Object.keys(STARTER_BOOKS) as ClassId[];
type Walk = "still" | "wander";
const WALKS: readonly Walk[] = ["still", "wander"];
/** A wanderer heads home once this far from where it started. */
const LEASH = 320;

const rules = simRules();
const map = fightMapOf(mapById(FIELD) as never);

function kit(major: ClassId, level: number) {
  return compileKit({
    major,
    minor: null,
    level,
    stats: NO_STATS,
    books: STARTER_BOOKS[major].map((def) => ({ def, level, grade: 0, pilgi: 0, evolved: false })),
    tools: [],
  });
}

/** Ticks until the first student is knocked out, or `CAP`. */
function run(majors: readonly ClassId[], level: number, walk: Walk, seed: number): number {
  const w = createFight(map, rules, fieldOf(FIELD), seed);
  let s = (seed * 2654435761) >>> 0;
  const roll = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
  const homes = majors.map((_, i) => ({
    x: map.spawn.x + 200 + (i % 4) * 24,
    y: map.spawn.y + Math.floor(i / 4) * 24,
  }));
  const players = majors.map((major, i) => {
    const home = homes[i] as { x: number; y: number };
    const p = w.addPlayer(`s${i}`, i, home.x, home.y, kit(major, level), level);
    p.mode = Mode.Semi;
    p.rebuild = (lv) => kit(major, lv);
    return p;
  });
  const dirs = majors.map(() => [0, 0] as [number, number]);
  const seqs = majors.map(() => 0);
  const inputs = new Map<string, FightInput[]>();
  const half = Math.round(MOVE_MAX / 2);
  for (let t = 0; t < CAP; t++) {
    players.forEach((p, i) => {
      const dir = dirs[i] as [number, number];
      if (walk === "wander") {
        const home = homes[i] as { x: number; y: number };
        const dx = home.x - p.x;
        const dy = home.y - p.y;
        const far = Math.hypot(dx, dy);
        if (far > LEASH) {
          dir[0] = Math.round((dx / far) * half);
          dir[1] = Math.round((dy / far) * half);
        } else if (roll() < 0.025) {
          const a = roll() * Math.PI * 2;
          const idle = roll() < 0.4;
          dir[0] = idle ? 0 : Math.round(Math.cos(a) * half);
          dir[1] = idle ? 0 : Math.round(Math.sin(a) * half);
        }
      }
      seqs[i] = (seqs[i] as number) + 1;
      inputs.set(p.id, [{ seq: seqs[i] as number, mx: dir[0], my: dir[1] }]);
    });
    stepFight(w, inputs);
    if (players.some((p) => p.down)) return t + 1;
  }
  return CAP;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
}

function clock(ticks: number): string {
  if (ticks >= CAP) return `>${Math.round(CAP / TICK_RATE_HZ / 60)}m`;
  const sec = Math.round(ticks / TICK_RATE_HZ);
  return `${Math.floor(sec / 60)}m${String(sec % 60).padStart(2, "0")}`;
}

function timeOf(majors: readonly ClassId[], level: number, walk: Walk): string {
  const times: number[] = [];
  for (let k = 0; k < SEEDS; k++) times.push(run(majors, level, walk, 1000 + k * 7919));
  return clock(median(times));
}

const cell = (v: string) => v.padStart(10);
console.log(`${FIELD}, ${SEEDS} seeds, median time to the first knock-out (cap ${clock(CAP)})`);
console.log(`\nalone         ${CLASSES.map(cell).join("")}`);
for (const level of LEVELS) {
  for (const walk of WALKS) {
    const row = CLASSES.map((c) => cell(timeOf([c], level, walk)));
    console.log(`Lv${level} ${walk.padEnd(9)}${row.join("")}`);
  }
}
const GROUPS = [2, 4, 8] as const;
console.log(
  `\ngroup, any one down ${GROUPS.map((n) => cell(`${n} still`) + cell(`${n} wander`)).join("")}`,
);
for (const level of LEVELS) {
  const row = GROUPS.flatMap((n) => {
    const majors = Array.from({ length: n }, (_, i) => CLASSES[i % CLASSES.length] as ClassId);
    return WALKS.map((walk) => cell(timeOf(majors, level, walk)));
  });
  console.log(`Lv${level}${" ".repeat(18)}${row.join("")}`);
}
