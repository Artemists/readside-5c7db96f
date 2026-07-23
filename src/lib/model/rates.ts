// Pure, I/O-free math for the independent match model.
// Tunables live at the top so they're easy to sweep later.

export const MODEL_CONFIG = {
  /** Exponential decay: weight of match k games ago = decay^k. */
  formDecay: 0.85,
  /** Multiplier applied to home side's attack rate. */
  homeAdvantage: 1.15,
  /** Cap of goals summed in the Poisson matrix (0..maxGoals inclusive). */
  maxGoals: 10,
  /** League-average goals per team per match — Poisson prior fallback. */
  leagueAverageGoals: 1.35,
};

export function homeAdvantageAdjustment(): number {
  return MODEL_CONFIG.homeAdvantage;
}

export type FormMatch = {
  goalsFor: number;
  goalsAgainst: number;
  isHome: boolean;
  /** Older matches later in the array (index 0 = most recent). */
};

export type AttackDefence = {
  attack: number;   // goals scored per match (weighted)
  defence: number;  // goals conceded per match (weighted)
  sample: number;   // number of matches used
};

/** Weighted per-match attack/defence rates using exponential decay. */
export function attackDefenceRates(form: FormMatch[]): AttackDefence | null {
  if (!form.length) return null;
  const decay = MODEL_CONFIG.formDecay;
  let wSum = 0;
  let gf = 0;
  let ga = 0;
  form.forEach((m, i) => {
    const w = Math.pow(decay, i);
    wSum += w;
    gf += w * m.goalsFor;
    ga += w * m.goalsAgainst;
  });
  if (wSum <= 0) return null;
  return {
    attack: gf / wSum,
    defence: ga / wSum,
    sample: form.length,
  };
}

function poissonPmf(lambda: number, k: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  // log-space for numeric safety
  let logP = -lambda + k * Math.log(lambda);
  for (let i = 2; i <= k; i++) logP -= Math.log(i);
  return Math.exp(logP);
}

export type MatchProbabilities = {
  homeWin: number;
  draw: number;
  awayWin: number;
  expectedHomeGoals: number;
  expectedAwayGoals: number;
  over: Record<string, number>;   // keys "1.5" | "2.5" | "3.5"
  under: Record<string, number>;
};

/**
 * Bivariate independent-Poisson goal model. Expected goals combine each side's
 * attack against the opponent's defence, normalised by league average.
 */
export function poissonMatchProbabilities(
  homeAttack: number,
  homeDefence: number,
  awayAttack: number,
  awayDefence: number,
  avgOverride?: number | null,
): MatchProbabilities {
  const avg =
    avgOverride != null && Number.isFinite(avgOverride) && avgOverride > 0
      ? avgOverride
      : MODEL_CONFIG.leagueAverageGoals;
  const ha = MODEL_CONFIG.homeAdvantage;
  const lambdaHome = Math.max(0.05, (homeAttack * ha) * (awayDefence / avg));
  const lambdaAway = Math.max(0.05, awayAttack * (homeDefence / avg));

  const max = MODEL_CONFIG.maxGoals;
  const homePmf: number[] = [];
  const awayPmf: number[] = [];
  for (let i = 0; i <= max; i++) {
    homePmf.push(poissonPmf(lambdaHome, i));
    awayPmf.push(poissonPmf(lambdaAway, i));
  }

  let pHome = 0, pDraw = 0, pAway = 0;
  const totals: Record<number, number> = {};
  for (let h = 0; h <= max; h++) {
    for (let a = 0; a <= max; a++) {
      const p = homePmf[h] * awayPmf[a];
      if (h > a) pHome += p;
      else if (h < a) pAway += p;
      else pDraw += p;
      const t = h + a;
      totals[t] = (totals[t] ?? 0) + p;
    }
  }

  // Normalise 1x2 (truncation loss when maxGoals is finite).
  const sum1x2 = pHome + pDraw + pAway;
  if (sum1x2 > 0) {
    pHome /= sum1x2; pDraw /= sum1x2; pAway /= sum1x2;
  }

  const cum: number[] = [];
  let running = 0;
  for (let t = 0; t <= 2 * max; t++) {
    running += totals[t] ?? 0;
    cum.push(running);
  }
  const totalMass = cum[cum.length - 1] || 1;

  const over: Record<string, number> = {};
  const under: Record<string, number> = {};
  for (const line of [1.5, 2.5, 3.5]) {
    // P(total > line) = 1 - P(total <= floor(line)) since line is .5
    const k = Math.floor(line);
    const underP = (cum[k] ?? 0) / totalMass;
    const overP = 1 - underP;
    const key = line.toString();
    over[key] = overP;
    under[key] = underP;
  }

  return {
    homeWin: pHome,
    draw: pDraw,
    awayWin: pAway,
    expectedHomeGoals: lambdaHome,
    expectedAwayGoals: lambdaAway,
    over,
    under,
  };
}
