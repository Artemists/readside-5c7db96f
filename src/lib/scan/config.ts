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
    // Unknown competition → 1/10 (lowest). We know nothing about it, so it
    // must not inherit any prestige by default.
    tierDefault: 0.1,
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
    // Edge is measured in percentage POINTS (fair% − implied%), NOT as a
    // ratio. All thresholds below consume points.
    // Full positive Value score at ~4 pts. A 4-point edge on a 50% shot
    // means fair 54% vs implied 50%.
    edgePtsForFullScore: 4,
    // Edges above ~8 points on our 2-book plan are almost certainly
    // bad/stale data or a stat error, not a real signal.
    suspiciousEdgePts: 8,
    // Long-shot pricing where de-vig math is unreliable.
    maxAllowedOdds: 6.0,
    // Minimum bookmakers that must quote the selection for a real value read.
    minBooksForValue: 2,
    // Market de-vig cannot produce positive edge on our plan: odds-api.io caps us
    // at Bet365 + Novibet, which price near-identically, so marketFair ≈ bestImplied
    // and edge ≈ −½ × overround by construction — negative on every event.
    // Polymarket (the independent prediction-market source) matched 0 of 30 of our
    // fixtures, since it only covers elite competitions. API-Football has form data
    // for nearly every league our odds provider returns, so the Poisson model is the
    // only fair source that scales to the full slate.
    // The model is NOT yet validated against settled results. Everything downstream
    // (modelConfidenceFactor, the "Model-priced · not yet validated" UI label, and
    // per-source breakdowns in getPerformanceStats) exists to keep that honest.
    singleBookPolicy: "model" as "block" | "model",
    // Which source produces the fair probability used to compute edge:
    //   "market" — always use book de-vig (old behaviour)
    //   "model"  — always use the model where available
    //   "auto"   — prefer the model when it has a probability for the selection,
    //              fall back to market de-vig otherwise. With 2 aligned books,
    //              de-vig is not a real consensus, so the model is the better
    //              reference even when both books quote.
    fairSource: "auto" as "market" | "model" | "auto",
    // Confidence multiplier applied whenever the winning selection was priced
    // against the independent model (source = "model" or "model_single_book").
    // The model is unvalidated: a model-priced pick must never show the same
    // confidence as genuine multi-book market agreement. Stacks with
    // singleBookModelConfidenceFactor when both apply.
    modelConfidenceFactor: 0.75,
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
    // Independent prediction-market fair source (Polymarket Gamma API).
    //   "off"      — do not fetch.
    //   "shadow"   — fetch, record shadow edge in signals.polymarket, no
    //                effect on verdict / value score / stake / display.
    //   "primary"  — use Polymarket probability as fairProb (not enabled yet;
    //                shadow phase must show real disagreement first).
    polymarketPolicy: "shadow" as "off" | "shadow" | "primary",
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
  // How often the home page will auto-trigger a scan on mount if the last
  // successful scan is older than this. Twice-daily cadence.
  autoScanIntervalHours: 12,
  // Minimum interval between forced (button) scans — anti-double-tap only.
  forceCooldownMinutes: 5,
  // Per-event odds re-fetch threshold. If an event was scored within this
  // window we reuse the stored row instead of calling the odds API. Sized
  // against the 12-hour auto cadence so back-to-back scans don't re-burn
  // quota, while a single scheduled run always refreshes everything.
  eventFreshMinutes: 660,
  // Near-kickoff exception: always re-price events kicking off inside this
  // window regardless of eventFreshMinutes. These are the rows where price
  // accuracy actually matters (closing line, settlement).
  nearKickoffRefreshHours: 6,
  // Hard cap on how many events we score per scan (quota control).
  maxEvents: 60,
  // How far ahead of "now" we pull fixtures for.
  windowHours: 72,
  // Rows for kickoffs beyond this horizon are marked provisional (odds/lines
  // will move a lot before kickoff).
  provisionalAfterHours: 24,
  sports: ["football"] as const,
  bookmakers: ["Bet365", "Novibet"] as const,
};
