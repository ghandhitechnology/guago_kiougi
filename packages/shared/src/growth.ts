/** Growth constant G(L) = 10^(L/100): ×10 per 100 levels (PLAN §9). */
export function growth(level: number): number {
  return 10 ** (level / 100);
}
