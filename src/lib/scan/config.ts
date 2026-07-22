/**
 * All tunable knobs for the scan engine live here.
 */

export const SCORING = {
  // ------- Context (0..10) -------
  context: {
    // A tier score for the competition text (0..1). Anything not listed = 0.3.
    tierKeywords: [
      { match: /world cup|champions league|super bowl|nba finals|grand slam|wimbledon|us open|roland|australian open|premier league|la liga|serie a|bundesliga|ligue 1|europa league|wnba playoffs|nba playoffs/i, tier: 1.0 },
      { match: /nba|wnba|mlb|nhl|nfl|primeira|eredivisie|championship|liga mx|copa libertadores|copa sudamericana|euroleague|atp|wta/i, tier: 0.85 },
      { match: /brasileiro|argentina|j.?league|k.?league|mls|challenger|conference league/i, tier: 0.65 },
      { match: /liga|serie|division|premier|super|cup|coupe|copa/i, tier: 0.45 },
    ],
    // Unknown competition → low tier so it produces spread against known leagues.
    tierDefault: 0.25,
    weights: { markets: 0.30, bookmakers: 0.20, tier: 0.50 },
    marketsCap: 4,       // 4+ markets => full points
    bookmakersCap: 2,    // plan allows 2 bookmakers max
  },

  // ------- Explosion (0..100) -------
  explosion: {
    baselineTotals: {
      football: 2.5,
      soccer: 2.5,
      basketball: 220,
      tennis: 22.5,
      default: 2.5,
    } as Record<string, number>,
    weights: { totals: 0.65, tightness: 0.35 },
  },

  // ------- Value (0..100) -------
  value: {
    // Full positive score at ~8% edge. Above 15% is treated as suspicious.
    edgePctForFullScore: 8,
    // Edges above this are almost certainly bad/stale data with only 2 books.
    suspiciousEdgePct: 15,
    // Long-shot pricing where de-vig math is unreliable.
    maxAllowedOdds: 6.0,
    // Minimum bookmakers that must quote the selection for a real value read.
    minBooksForValue: 2,
  },

  // ------- Trap (0..100) -------
  trap: {
    favThreshold: 0.65,
    weights: { fav: 0.55, bigName: 0.25, spread: 0.20 },
    bigNames: /real madrid|barcelona|manchester united|manchester city|liverpool|chelsea|arsenal|bayern|psg|juventus|milan|inter|lakers|celtics|warriors|knicks|djokovic|alcaraz|sinner|nadal|federer|serena|swiatek|sabalenka|brazil|argentina|france|germany|spain|england|portugal/i,
  },
} as const;

export const VERDICT = {
  opportunityValueMin: 70,
  opportunityContextMin: 4,
  opportunityTrapMax: 60,
  trapScoreMin: 60,
} as const;

export const STAKE = {
  smallConfidenceMin: 5,
} as const;

export const SCAN = {
  // Kept for legacy reads; no longer used to auto-trigger scans on open.
  staleAfterMinutes: 30,
  // Minimum interval between forced (button) scans — anti-double-tap only.
  forceCooldownMinutes: 5,
  // Per-event odds re-fetch threshold. If an event was scored within this
  // window we reuse the stored row instead of calling the odds API.
  eventFreshMinutes: 30,
  // Hard cap on how many events we score per scan (quota control).
  maxEvents: 30,
  // How far ahead of "now" we pull fixtures for.
  windowHours: 72,
  // Rows for kickoffs beyond this horizon are marked provisional (odds/lines
  // will move a lot before kickoff).
  provisionalAfterHours: 24,
  sports: ["football"] as const,
  bookmakers: ["Bet365", "Novibet"] as const,
};
