/**
 * Runs the balance simulation and prints it against the PLAN §9 targets.
 *
 *   pnpm balance                     seed 1
 *   pnpm balance -- --seed 7
 *   pnpm balance -- --sweep          pool share against the casual and hardcore gaps
 *   pnpm balance -- --exp-scale 0.5 --pool-share 0.1   try values without editing constants
 */
import { CLASS_IDS, type ClassId } from "@guago/content";
import { POOL } from "@guago/shared";
import { NEWCOMER_WEEKS_PER_PAGE, newcomer, profiles, TARGETS } from "./profiles.ts";
import { ASSUME, type RunResult, type SimOptions, simulate } from "./sim.ts";

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? Number(process.argv[i + 1]) : undefined;
};
const seed = arg("--seed") ?? 1;
const base: SimOptions = {
  ...(arg("--exp-scale") === undefined ? {} : { expScale: arg("--exp-scale") as number }),
  ...(arg("--pool-share") === undefined ? {} : { poolShare: arg("--pool-share") as number }),
};
const PAGE_WEEKS = 13;
const LONG_WEEKS = 26;
const BAND_TOP = 100;

const pad = (v: string | number, n: number) => String(v).padStart(n);
const pct = (v: number) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(0)}%`;
const money = (v: number) => Math.round(v).toLocaleString("en");

/** Gap to a range: 0 inside it, else the distance to the nearer end as a share of it. */
export function gap(value: number, [lo, hi]: readonly [number, number]): number {
  if (value >= lo && value <= hi) return 0;
  const edge = value < lo ? lo : hi;
  return (value - edge) / edge;
}

function weeksTo(run: RunResult, level: number): number {
  const day = run.days.find((d) => d.level >= level);
  return day ? (day.day + 1) / 7 : Number.POSITIVE_INFINITY;
}

function levelAt(run: RunResult, week: number): number {
  return run.days[Math.min(run.days.length, week * 7) - 1]?.level ?? 0;
}

const sum = (m: ReadonlyMap<string, number>, f: (v: number) => boolean) =>
  [...m.values()].filter(f).reduce((a, b) => a + b, 0);

/** Worst gap of casual and hardcore against their four targets. */
function finishLine(options: SimOptions): { worst: number; row: string } {
  const [casual, , hardcore] = profiles();
  const parts: string[] = [];
  const gaps: number[] = [];
  for (const p of [casual, hardcore]) {
    if (!p) continue;
    const run = simulate(p, PAGE_WEEKS * 7, seed, options);
    const t = TARGETS[p.id as keyof typeof TARGETS];
    const w = weeksTo(run, BAND_TOP);
    const l = levelAt(run, PAGE_WEEKS);
    gaps.push(gap(w, t.weeks), gap(l, [t.endLevel, t.endLevel]));
    parts.push(
      `${p.id} ${w.toFixed(1)}w (${pct(gaps.at(-2) ?? 0)}) L${l} (${pct(gaps.at(-1) ?? 0)})`,
    );
  }
  return { worst: Math.max(...gaps.map(Math.abs)), row: parts.join("   ") };
}

function sweep() {
  console.log("Pool share against the finish line (with the K scale that fits best at each share)");
  console.log("  share  자습실   K scale  worst gap   casual and hardcore");
  for (const share of [0.03, 0.05, 0.08, 0.09, 0.1, 0.12, 0.15, 0.2, 0.25]) {
    let best = { worst: Number.POSITIVE_INFINITY, scale: 1, row: "" };
    for (let k = 0.5; k <= 2.5; k += 0.05) {
      const r = finishLine({ ...base, poolShare: share, expScale: 1 / k });
      if (r.worst < best.worst) best = { ...r, scale: k };
    }
    const hall = (share * POOL.studyHallShare) / POOL.share;
    console.log(
      `  ${pad(`${(share * 100).toFixed(0)}%`, 5)} ${pad(`${(hall * 100).toFixed(1)}%`, 6)} ${pad(`×${best.scale.toFixed(2)}`, 8)} ${pad(pct(best.worst), 9)}   ${best.row}`,
    );
  }
}

function report() {
  console.log(`Balance simulation, Page 1 live, seed ${seed}\n`);
  const runs = profiles().map((p) => simulate(p, LONG_WEEKS * 7, seed, base));

  console.log("Against PLAN §9 (gap 0 inside the target range; the finish line is within 20%)");
  console.log("  profile    weeks to 100   target   gap    level @13   target   gap");
  for (const run of runs) {
    const t = TARGETS[run.profile.id as keyof typeof TARGETS];
    const w = weeksTo(run, BAND_TOP);
    const l = levelAt(run, PAGE_WEEKS);
    console.log(
      `  ${run.profile.id.padEnd(10)} ${pad(w.toFixed(1), 12)}   ${pad(`${t.weeks[0]}-${t.weeks[1]}`, 6)} ${pad(pct(gap(w, t.weeks)), 5)}   ${pad(l, 9)}   ${pad(t.endLevel, 6)} ${pad(pct(gap(l, [t.endLevel, t.endLevel])), 5)}`,
    );
  }
  for (const frontier of [4, 12]) {
    const run = simulate(newcomer(frontier), 52 * 7, seed, base);
    const pages: number[] = [];
    let last = 0;
    for (let page = 1; page < frontier; page++) {
      const w = weeksTo(run, page * 100 + 1);
      pages.push(w - last);
      last = w;
    }
    const worst = Math.max(...pages);
    console.log(
      `  newcomer P${frontier}: ${pages.map((w) => w.toFixed(1)).join(" ")} weeks a Page (target ${NEWCOMER_WEEKS_PER_PAGE[0]}-${NEWCOMER_WEEKS_PER_PAGE[1]}, slowest ${pct(gap(worst, NEWCOMER_WEEKS_PER_PAGE))}); frontier in ${last.toFixed(1)} weeks (${(last / 4.35).toFixed(1)} months)`,
    );
  }

  console.log(
    "\nWell built against neglected (never 제본, 제련, feeds or writes 필기), same play time",
  );
  for (const p of profiles()) {
    const built = simulate(p, PAGE_WEEKS * 7, seed, base);
    const lazy = simulate(p, PAGE_WEEKS * 7, seed, { ...base, policy: "neglected" });
    const wb = weeksTo(built, BAND_TOP);
    const wl = weeksTo(lazy, BAND_TOP);
    console.log(
      `  ${p.id.padEnd(9)} weeks to 100: built ${wb.toFixed(1)}, neglected ${wl.toFixed(1)} (built is ${pct(wl / wb - 1)} faster)   level @13: ${levelAt(built, PAGE_WEEKS)} vs ${levelAt(lazy, PAGE_WEEKS)}`,
    );
  }

  console.log("\nHunting up: average monster level above the player's, casual and hardcore");
  for (const run of [runs[0], runs[2]]) {
    if (!run) continue;
    const at = [5, 20, 40, 60, 80, 95].map((lv) => run.days.find((d) => d.level >= lv));
    console.log(
      `  ${run.profile.id.padEnd(9)} ${at.map((d) => (d ? `L${d.level} ${pct((d.monsterLevel - d.level) / 100).replace("%", "")} (${d.kpm.toFixed(0)}/min)` : "-")).join("  ")}`,
    );
  }

  console.log("\nPast the band (no Page 2): level at weeks 13, 20 and 26");
  for (const run of runs)
    console.log(
      `  ${run.profile.id.padEnd(9)} ${[13, 20, 26].map((w) => pad(levelAt(run, w), 5)).join(" ")}   drift at 13: +${levelAt(run, 13) - BAND_TOP}`,
    );

  console.log("\nClasses on the regular profile");
  const classRuns = (CLASS_IDS as readonly ClassId[]).map((cls) => {
    const p = profiles(cls)[1];
    return p ? simulate(p, PAGE_WEEKS * 7, seed, base) : undefined;
  });
  const weeks = classRuns.map((r) => (r ? weeksTo(r, BAND_TOP) : 0));
  for (const run of classRuns) {
    if (!run) continue;
    console.log(
      `  ${run.profile.cls.padEnd(9)} ${pad(weeksTo(run, BAND_TOP).toFixed(1), 5)} weeks to 100  L${levelAt(run, PAGE_WEEKS)} at week 13`,
    );
  }
  console.log(
    `  spread: slowest is ${pct(Math.max(...weeks) / Math.min(...weeks) - 1)} slower than fastest`,
  );

  console.log("\nEXP by source over the Page, share of total");
  for (const p of profiles()) {
    const run = simulate(p, PAGE_WEEKS * 7, seed, base);
    const total = sum(run.expBySource, () => true);
    const parts = [...run.expBySource].map(([k, v]) => `${k} ${((100 * v) / total).toFixed(0)}%`);
    console.log(`  ${p.id.padEnd(9)} ${parts.join("  ")}`);
  }

  console.log("\nEconomy over one Page (13 weeks)");
  for (const p of profiles()) {
    const run = simulate(p, PAGE_WEEKS * 7, seed, base);
    const earned = sum(run.pinecones, (v) => v > 0);
    const spent = -sum(run.pinecones, (v) => v < 0);
    const rows = [...run.pinecones].sort((a, b) => b[1] - a[1]);
    console.log(
      `  ${p.id.padEnd(9)} 솔방울 earned ${pad(money(earned), 12)}, spent ${pad(money(spent), 12)} (${((100 * spent) / earned).toFixed(0)}%), held ${money(run.purse.pinecone ?? 0)}`,
    );
    console.log(`            ${rows.map(([k, v]) => `${k} ${money(v)}`).join(", ")}`);
    console.log(
      `            잉크 earned ${money(run.ink.earned)}, spent ${money(run.ink.spent)} (${((100 * run.ink.spent) / Math.max(1, run.ink.earned)).toFixed(0)}%), held ${money(run.purse.ink ?? 0)}`,
    );
    const books = run.books
      .filter((b, i, all) => all.findIndex((x) => x.def === b.def) === i)
      .map((b) => `${b.def} g${b.grade} L${b.level} +${b.pilgi}`);
    console.log(`            books: ${books.join(", ")}`);
  }

  console.log("\nAssumptions (not game constants)");
  console.log(`  ${JSON.stringify(ASSUME)}`);
}

if (process.argv.includes("--sweep")) sweep();
else report();
