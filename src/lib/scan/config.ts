/**
 * All tunable knobs for the scan engine live here.
 */

export const SCORING = {
  // ------- Context (0..10) -------
  context: {
    // A tier score for the competition text (0..1). Anything not listed = default.
    // Odds-api.io tends to prefix competitions with a country ("Italy - Serie A",
    // "Ecuador - Serie A"), so tier-1 rules REQUIRE the correct country prefix.
    // Generic name-only matches (e.g. bare "serie a", "premier") are intentionally
    // NOT tier 1 — a league called "Serie A" outside Italy is not the Italian top flight.
    tierKeywords: [
      // Hard downgrades — regional, youth, reserve, semi-pro. Match FIRST so
      // they beat any generic "premier"/"liga" fallback below.
      { match: /\b(reserves?|youth|u-?15|u-?17|u-?19|u-?20|u-?21|u-?23|academy|primavera|regional|provincial|state league|northern territory|tasmania|capital territory|queensland|victoria(n)? premier|western australia|south australia|new south wales|npl\b|amateur|semi[- ]?pro|third division|3\. liga|serie c|serie d|national league north|national league south|isthmian|conference (north|south)|oberliga|regionalliga|liga 3|segunda b|primera federaci[oó]n|tercera|friendl(y|ies))\b/i, tier: 0.15 },
      // Women's football: only top-tier competitions are tier 1; other women's leagues stay mid.
      { match: /\bwomen('s)?\b.*\b(world cup|champions league|euro)\b|\b(w-?league|wsl|nwsl|frauen-bundesliga)\b/i, tier: 0.8 },
      { match: /\bwomen('s)?\b/i, tier: 0.35 },
      // Global / continental elite
      { match: /\b(fifa\s+)?world cup\b|uefa champions league|uefa europa league|copa america|euro(pean)? championship|super bowl|nba finals|nba playoffs|wnba finals|wnba playoffs|wimbledon|us open|roland[- ]?garros|australian open|the masters|the open championship/i, tier: 1.0 },
      // Top-5 European football leagues, country-qualified.
      // "premier league" is tier-1 ONLY when qualified as England/English.
      { match: /(^|[^a-z])(england|english)[^a-z].*premier league|(^|[^a-z])spain[^a-z].*(la\s*liga|primera divisi[oó]n)|(^|[^a-z])italy[^a-z].*serie a\b|(^|[^a-z])germany[^a-z].*bundesliga\b|(^|[^a-z])france[^a-z].*ligue 1\b/i, tier: 1.0 },
      // Strong second tier — major North American / South American / European cups
      { match: /\bnba\b|\bwnba\b|\bmlb\b|\bnhl\b|\bnfl\b|(^|[^a-z])portugal[^a-z].*primeira|(^|[^a-z])netherlands[^a-z].*eredivisie|(^|[^a-z])england[^a-z].*championship|liga mx|copa libertadores|copa sudamericana|euroleague|\batp\b|\bwta\b|uefa conference league|fa cup|coupe de france|copa del rey|dfb[- ]pokal|coppa italia/i, tier: 0.7 },
      // Mid tier known leagues
      { match: /brasileir(o|ao|ão)\s*serie a|(^|[^a-z])argentin(a|e)[^a-z].*(primera|liga profesional)|j1[- ]?league|k[- ]?league\s*1|\bmls\b|challenger tour|(^|[^a-z])scotland[^a-z].*premiership|(^|[^a-z])belgium[^a-z].*(pro league|jupiler)|(^|[^a-z])turkey[^a-z].*s(ü|u)per lig|(^|[^a-z])portugal[^a-z].*primeira liga|(^|[^a-z])switzerland[^a-z].*super league/i, tier: 0.5 },
      // Weak keyword fallback — deliberately low so obscure/regional leagues
      // matching only "premier" or "liga" never reach a high tier.
      { match: /\b(liga|serie|division|premier|super|cup|coupe|copa)\b/i, tier: 0.25 },
    ],
    // Unknown competition → low tier so it produces spread against known leagues.
    tierDefault: 0.15,
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
    // "block" = disqualify single-book selections (safe until the shadow model
    // is validated). "model" = allow single-book selections to be valued
    // against the independent model's fair probability instead of market
    // de-vig. Do NOT set this to "model" until the shadow model has passed
    // calibration on a few hundred matches.
    singleBookPolicy: "block" as "block" | "model",
    // Confidence multiplier applied when the winning selection was priced via
    // the independent model against a single book (source = "model_single_book"),
    // or when a single-book selection was valued against the market
    // (source = "single_book_market"). Keeps thin reads from ever showing the
    // same confidence as multi-book market agreement.
    singleBookModelConfidenceFactor: 0.7,
    // How far the Value score is allowed to move from neutral (50) when the
    // winning selection is priced by a single bookmaker. 0.5 means a raw
    // Value of 78 becomes 50 + (78-50)*0.5 = 64. Single-book edges are
    // structurally noisier, so we surface the read but damp its magnitude.
    singleBookValuePenalty: 0.5,
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
