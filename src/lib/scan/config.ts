/**
 * All tunable knobs for the scan engine live here.
 * Bump the weights/thresholds without editing scoring code.
 */

export const SCORING = {
  // ------- Context (0..10) -------
  context: {
    // A tier score for the competition text (0..1). Anything not listed = 0.5.
    tierKeywords: [
      { match: /world cup|champions league|super bowl|nba finals|grand slam|wimbledon|us open|roland|australian open|premier league|la liga|serie a|bundesliga|ligue 1|europa league|wnba playoffs|nba playoffs/i, tier: 1.0 },
      { match: /nba|wnba|mlb|nhl|nfl|primeira|eredivisie|championship|liga mx|copa|euroleague|atp|wta/i, tier: 0.8 },
      { match: /brasileiro|argentina|j.?league|k.?league|mls|challenger|itf/i, tier: 0.6 },
    ],
    weights: { markets: 0.35, bookmakers: 0.35, tier: 0.30 },
    marketsCap: 6,       // 6+ markets => full points
    bookmakersCap: 8,    // 8+ bookmakers => full points
  },

  // ------- Explosion (0..100) -------
  explosion: {
    // Sport baseline totals lines (approx.)
    baselineTotals: {
      football: 2.5,
      soccer: 2.5,
      basketball: 220,
      tennis: 22.5,
      default: 2.5,
    } as Record<string, number>,
    // How much the totals line drives the score vs match tightness.
    weights: { totals: 0.65, tightness: 0.35 },
  },

  // ------- Value (0..100) -------
  value: {
    // 50 = neutral. edgePercent of +10% -> 75, +20% -> 100. Symmetric downward.
    edgePctForFullScore: 20,
  },

  // ------- Trap (0..100) -------
  trap: {
    // Short favourite: implied prob >= 0.65 contributes strongly.
    favThreshold: 0.65,
    weights: { fav: 0.55, bigName: 0.25, spread: 0.20 },
    // Named heavyweight brands that draw public money.
    bigNames: /real madrid|barcelona|manchester united|manchester city|liverpool|chelsea|arsenal|bayern|psg|juventus|milan|inter|lakers|celtics|warriors|knicks|djokovic|alcaraz|sinner|nadal|federer|serena|swiatek|sabalenka|brazil|argentina|france|germany|spain|england|portugal/i,
  },
} as const;

export const VERDICT = {
  opportunityValueMin: 60,
  opportunityContextMin: 5,
  opportunityTrapMax: 60,
  trapScoreMin: 60,
} as const;

export const STAKE = {
  smallConfidenceMin: 5,
} as const;

export const SCAN = {
  // Auto-rescan if last scan for today is older than this many minutes.
  staleAfterMinutes: 30,
  // Hard cap on how many events we score per scan (quota control).
  maxEvents: 30,
  // Which sports to include.
  sports: ["football", "basketball", "tennis"] as const,
};
