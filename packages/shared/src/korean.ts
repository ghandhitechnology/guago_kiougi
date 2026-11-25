const UNITS: readonly [number, string][] = [
  [1e12, "조"],
  [1e8, "억"],
  [1e4, "만"],
];

/**
 * Damage numbers in Korean units (PLAN §6): 9999, 1.234만, 12.34만, 1234만, 1.234억.
 * Four significant digits, truncated so a number never reads higher than it is. Past 9999조 the
 * digits grow in 조, because the damage font draws only 만, 억 and 조.
 */
export function formatKorean(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const sign = value < 0 ? "-" : "";
  const n = Math.floor(Math.abs(value));
  if (n < 1e4) return sign + String(n);
  const [unit, name] = UNITS.find(([u]) => n >= u) as [number, string];
  const whole = Math.floor(n / unit);
  if (whole >= 1000) return `${sign}${whole}${name}`;
  const decimals = whole >= 100 ? 1 : whole >= 10 ? 2 : 3;
  const scaled = String(Math.floor(n / (unit / 10 ** decimals)));
  const int = scaled.slice(0, -decimals);
  const frac = scaled.slice(-decimals).replace(/0+$/, "");
  return `${sign}${int}${frac ? `.${frac}` : ""}${name}`;
}
