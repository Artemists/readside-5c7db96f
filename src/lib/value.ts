/**
 * Pure value-scanner math. Kept isolated so the odds source can change
 * without touching these formulas.
 */

export function impliedProbability(decimalOdds: number): number {
  if (!decimalOdds || decimalOdds <= 1) return 0;
  return 1 / decimalOdds;
}

/**
 * Edge in percentage POINTS: fair% − implied%.
 * Not a ratio — do NOT divide by implied probability. Format as "pts".
 */
export function edgePercent(fairProb: number, decimalOdds: number): number {
  const implied = impliedProbability(decimalOdds);
  return (fairProb - implied) * 100;
}

/** Expected value per 1 unit staked. */
export function expectedValue(fairProb: number, decimalOdds: number): number {
  return fairProb * (decimalOdds - 1) - (1 - fairProb);
}

export function formatPct(n: number, digits = 1): string {
  return `${n.toFixed(digits)}%`;
}

export function formatOdds(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toFixed(2);
}
