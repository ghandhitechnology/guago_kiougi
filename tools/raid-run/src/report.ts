/** One line per check: PASS or FAIL, what was checked and the numbers behind it. */

export interface Check {
  readonly name: string;
  readonly pass: boolean;
  readonly detail: string;
}

export function fmt(v: number, digits = 2): string {
  return Number.isFinite(v) ? v.toFixed(digits) : String(v);
}

export function print(checks: readonly Check[]): number {
  let failed = 0;
  for (const c of checks) {
    if (!c.pass) failed++;
    console.log(`${c.pass ? "PASS" : "FAIL"}  ${c.name} — ${c.detail}`);
  }
  return failed;
}
