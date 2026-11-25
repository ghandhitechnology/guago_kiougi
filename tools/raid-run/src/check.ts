/**
 * Page 1's boss fights, headless: each gimmick checked by players who do and do not play it,
 * full auto under the tells, 복습 alone, the step's time with a full arena, and the pool damage
 * a same-level player deals that `RAID.floor` is sized from. One line a check; exits non-zero on
 * any failure. `node src/check.ts zeno` runs one group.
 */

import { RAID } from "@guago/shared";
import { aristotleChecks } from "./aristotle.ts";
import { pythagoreansChecks } from "./pythagoreans.ts";
import { measureRates, rateTable } from "./rates.ts";
import { type Check, fmt, print } from "./report.ts";
import { at } from "./sim.ts";
import { solo } from "./solo.ts";
import { tellHits } from "./tells.ts";
import { budget, dodging, fourTheses } from "./whole.ts";
import { zenoChecks } from "./zeno.ts";

function whole(): Check[] {
  const checks: Check[] = [];
  fourTheses(checks);
  tellHits(checks);
  dodging(checks);
  solo(checks);
  budget(checks);
  return checks;
}

/**
 * The floor's "same-level player's pool damage a second, gates and the shield included": half the
 * time with the gate open and half shut, the era boss at half its shield; the middle boss of three.
 */
function floor(lines: string[]): Check[] {
  const rates = measureRates();
  lines.push(...rateTable(rates));
  const mixes: [string, number][] = [];
  for (const id of ["pythagoreans", "zeno", "aristotle"]) {
    const of = rates.filter((r) => r.boss === id);
    const mix =
      of.reduce((s, r) => {
        const shield = id === "aristotle" ? r.openHalf / r.open : 1;
        return s + (r.open * shield + r.shut * shield) / 2;
      }, 0) / of.length;
    mixes.push([id, mix]);
  }
  const measured = at(
    [...mixes].sort((a, b) => a[1] - b[1]),
    1,
  )[1];
  const set = RAID.floor.normalsPerSecond;
  return [
    {
      name: "RAID.floor.normalsPerSecond matches a same-level player's measured pool damage",
      pass: Math.abs(set - measured) / measured < 0.25,
      detail: `${mixes.map(([id, m]) => `${id} ${fmt(m, 2)}`).join(", ")} normals a second (gates half open, era shield half); middle ${fmt(measured, 2)}, set ${set}`,
    },
  ];
}

const only = process.argv[2];
const groups: Record<string, (lines: string[]) => Check[]> = {
  pythagoreans: pythagoreansChecks,
  zeno: zenoChecks,
  aristotle: aristotleChecks,
  whole,
  floor,
};
const lines: string[] = [];
const checks = Object.entries(groups).flatMap(([k, f]) => (!only || only === k ? f(lines) : []));
const failed = print(checks);
if (lines.length > 0) {
  console.log("\nPool damage a second, in same-level normal monsters' health:");
  for (const l of lines) console.log(l);
}
console.log(`\n${checks.length - failed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
