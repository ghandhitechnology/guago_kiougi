/**
 * Runs the balance simulation and prints it against the PLAN §9 targets.
 *
 *   pnpm balance              seed 1
 *   pnpm balance --seed 7
 */
import { CLASS_IDS, type ClassId } from "@guago/content";
import { NEWCOMER_WEEKS_PER_PAGE, newcomer, profiles, TARGETS } from "./profiles.ts";
import { ASSUME, type RunResult, simulate } from "./sim.ts";

const seedArg = process.argv.indexOf("--seed");
const seed = seedArg > 0 ? Number(process.argv[seedArg + 1]) : 1;
const PAGE_WEEKS = 13;
const LONG_WEEKS = 26;
const BAND_TOP = 100;

const pad = (v: string | number, n: number) => String(v).padStart(n);
const pct = (v: number) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(0)}%`;

/** Gap to a range: 0 inside it, else the distance to the nearer end as a share of it. */
function gap(value: number, [lo, hi]: readonly [number, number]): number {
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

function report() {
  console.log(`Balance simulation, Page 1 live, seed ${seed}\n`);
  const runs = profiles().map((p) => simulate(p, LONG_WEEKS * 7, seed));

  console.log("Against PLAN §9 (gap 0 inside the target range; the finish line is within 20%)");
  console.log("  profile   weeks to 100   target   gap    level @13   target   gap");
  for (const run of runs) {
    const t = TARGETS[run.profile.id as keyof typeof TARGETS];
    const w = weeksTo(run, BAND_TOP);
    const l = levelAt(run, PAGE_WEEKS);
    console.log(
      `  ${run.profile.id.padEnd(9)} ${pad(w.toFixed(1), 12)}   ${pad(`${t.weeks[0]}-${t.weeks[1]}`, 6)} ${pad(pct(gap(w, t.weeks)), 5)}   ${pad(l, 9)}   ${pad(t.endLevel, 6)} ${pad(pct(gap(l, [t.endLevel, t.endLevel])), 5)}`,
    );
  }

  console.log("\nPast the band (no Page 2): level at weeks 13, 20 and 26");
  for (const run of runs)
    console.log(
      `  ${run.profile.id.padEnd(9)} ${[13, 20, 26].map((w) => pad(levelAt(run, w), 5)).join(" ")}   drift at 13: +${levelAt(run, 13) - BAND_TOP}`,
    );

  console.log(
    "\nKills per minute credited (and what damage alone would allow), casual and hardcore",
  );
  for (const run of [runs[0], runs[2]]) {
    if (!run) continue;
    const at = [1, 10, 30, 60, 90, 100].map((lv) => run.days.find((d) => d.level >= lv));
    console.log(
      `  ${run.profile.id.padEnd(9)} ${at.map((d) => (d ? `L${d.level} ${d.kpm.toFixed(0)} (${d.dpsKpm.toFixed(0)})` : "-")).join("  ")}`,
    );
  }

  console.log("\nEXP by source over the Page, share of total");
  for (const run of runs) {
    const total = sum(run.expBySource, () => true);
    const parts = [...run.expBySource].map(([k, v]) => `${k} ${((100 * v) / total).toFixed(0)}%`);
    console.log(`  ${run.profile.id.padEnd(9)} ${parts.join("  ")}`);
  }

  console.log("\n솔방울 over the Page (13 weeks)");
  for (const p of profiles()) {
    const run = simulate(p, PAGE_WEEKS * 7, seed);
    const earned = sum(run.pinecones, (v) => v > 0);
    const spent = -sum(run.pinecones, (v) => v < 0);
    console.log(
      `  ${p.id.padEnd(9)} earned ${pad(Math.round(earned).toLocaleString("en"), 12)}  spent ${pad(Math.round(spent).toLocaleString("en"), 12)} (${((100 * spent) / earned).toFixed(0)}%)  held ${pad(Math.round(run.purse.pinecone ?? 0).toLocaleString("en"), 12)}`,
    );
    const rows = [...run.pinecones].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
    console.log(
      `            ${rows.map(([k, v]) => `${k} ${Math.round(v).toLocaleString("en")}`).join(", ")}`,
    );
    const books = run.books
      .filter((b, i, all) => all.findIndex((x) => x.def === b.def) === i)
      .map((b) => `${b.def} g${b.grade} L${b.level} +${b.pilgi}`);
    console.log(`            books: ${books.join(", ")}`);
    console.log(
      `            tools: ${run.tools.map((t) => `${t.def} ${t.level}`).join(", ") || "none"}`,
    );
  }

  console.log("\nClasses on the regular profile: weeks to 100 and level at week 13");
  for (const cls of CLASS_IDS as readonly ClassId[]) {
    const p = profiles(cls)[1];
    if (!p) continue;
    const run = simulate(p, PAGE_WEEKS * 7, seed);
    const early = run.days.find((d) => d.level >= 20);
    console.log(
      `  ${cls.padEnd(9)} ${pad(weeksTo(run, BAND_TOP).toFixed(1), 5)} weeks  L${levelAt(run, PAGE_WEEKS)}  damage-limited kills/min at L20: ${early?.dpsKpm.toFixed(0) ?? "-"}`,
    );
  }

  console.log("\nNewcomer, 20 minutes plus pool, in sealed Pages with catch-up");
  for (const frontier of [4, 12]) {
    const run = simulate(newcomer(frontier), 52 * 7, seed);
    const pages: string[] = [];
    let last = 0;
    for (let page = 1; page < frontier; page++) {
      const w = weeksTo(run, page * 100);
      pages.push(`P${page} ${(w - last).toFixed(1)}w`);
      last = w;
    }
    const total = weeksTo(run, (frontier - 1) * 100);
    console.log(
      `  frontier Page ${frontier}: ${pages.join(" ")}  → frontier in ${total.toFixed(1)} weeks (${(total / 4.35).toFixed(1)} months); target ${NEWCOMER_WEEKS_PER_PAGE[0]}-${NEWCOMER_WEEKS_PER_PAGE[1]} weeks a Page`,
    );
  }

  console.log("\nAssumptions (not game constants)");
  console.log(`  ${JSON.stringify(ASSUME)}`);
}

report();
