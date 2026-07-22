import { SCORING, STAKE, VERDICT } from "./config";
import type { OddsEvent, ScoredMatch, Verdict } from "./types";

function num(v: string | number | undefined | null): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

/** Remove overround from a set of decimal odds; returns fair probabilities. */
function devig(odds: Array<number>): Array<number> {
  const raws = odds.map((o) => (o > 1 ? 1 / o : 0));
  const sum = raws.reduce((a, b) => a + b, 0);
  if (sum <= 0) return odds.map(() => 0);
  return raws.map((r) => r / sum);
}

type MLQuote = { home: number; draw: number | null; away: number; book: string };

function extractMoneylines(event: OddsEvent): MLQuote[] {
  const out: MLQuote[] = [];
  const books = event.bookmakers ?? {};
  for (const [bookName, markets] of Object.entries(books)) {
    const ml = markets.find((m) => m.name === "ML" || m.name === "Moneyline" || m.name === "h2h");
    const row = ml?.odds?.[0];
    if (!row) continue;
    const h = num(row.home);
    const a = num(row.away);
    const d = num(row.draw);
    if (h == null || a == null) continue;
    out.push({ home: h, draw: d, away: a, book: bookName });
  }
  return out;
}

function extractTotalsLine(event: OddsEvent): number | null {
  const books = Object.values(event.bookmakers ?? {});
  for (const markets of books) {
    const ou = markets.find(
      (m) => m.name === "Totals" || m.name === "Over/Under" || m.name === "O/U",
    );
    const row = ou?.odds?.[0];
    if (!row) continue;
    const line = row.hdp ?? row.max;
    if (typeof line === "number") return line;
  }
  return null;
}

// -------------------- Context (0..10) --------------------
export function competitionTier(competition: string | null | undefined): number {
  const comp = competition ?? "";
  for (const rule of SCORING.context.tierKeywords) {
    if (rule.match.test(comp)) return rule.tier;
  }
  return SCORING.context.tierDefault;
}

function contextScore(event: OddsEvent): { score: number; note: string; tier: number } {
  const books = event.bookmakers ?? {};
  const bookCount = Object.keys(books).length;
  const marketCount = Math.max(
    0,
    ...Object.values(books).map((m) => m.length),
    0,
  );
  const tier = competitionTier(event.league);
  const w = SCORING.context.weights;
  const marketsN = Math.min(1, marketCount / SCORING.context.marketsCap);
  const booksN = Math.min(1, bookCount / SCORING.context.bookmakersCap);
  const raw = marketsN * w.markets + booksN * w.bookmakers + tier * w.tier;
  const score = Math.round(raw * 10 * 10) / 10;
  return {
    score,
    tier,
    note: `${bookCount} book(s), ${marketCount} markets, tier ${(tier * 10).toFixed(0)}/10`,
  };
}


// -------------------- Explosion (0..100) --------------------
function explosionScore(
  event: OddsEvent,
  quotes: MLQuote[],
): { score: number; note: string } {
  const sport = (event.sport ?? "").toLowerCase();
  const baseline =
    SCORING.explosion.baselineTotals[sport] ??
    SCORING.explosion.baselineTotals.default;
  const totals = extractTotalsLine(event);
  const totalsRatio =
    totals != null && baseline > 0 ? clamp(totals / baseline, 0.4, 1.6) : 1.0;
  // 0.4 -> 0, 1.0 -> 0.5, 1.6 -> 1.0
  const totalsN = (totalsRatio - 0.4) / 1.2;

  // Tightness from best ML: 1.0 - abs difference of fair probs.
  let tightness = 0.5;
  if (quotes.length) {
    const best = quotes.reduce((a, b) => (a.home + a.away < b.home + b.away ? a : b));
    const probs = devig(best.draw ? [best.home, best.draw, best.away] : [best.home, best.away]);
    const home = probs[0];
    const away = probs[probs.length - 1];
    tightness = 1 - Math.abs(home - away);
  }

  const w = SCORING.explosion.weights;
  const raw = totalsN * w.totals + tightness * w.tightness;
  const score = Math.round(raw * 100);
  return {
    score: clamp(score, 0, 100),
    note: totals != null
      ? `line ${totals} vs baseline ${baseline}, tightness ${(tightness * 100).toFixed(0)}%`
      : `no totals line, tightness ${(tightness * 100).toFixed(0)}%`,
  };
}

// -------------------- Value (0..100) --------------------
type ValueResult = {
  score: number;
  edgePercent: number | null;
  bestOdds: number | null;
  bestSelection: string | null;
  fairProb: number | null;
  impliedProb: number | null;
  evPercent: number | null;
  note: string;
};

function valueScore(quotes: MLQuote[]): ValueResult {
  if (quotes.length === 0) {
    return {
      score: 50, edgePercent: null, bestOdds: null, bestSelection: null,
      fairProb: null, impliedProb: null, evPercent: null,
      note: "no moneyline available",
    };
  }
  // Consensus fair probs = average of de-vigged probs across books.
  const hasDraw = quotes.every((q) => q.draw != null);
  const selections = hasDraw ? ["home", "draw", "away"] as const : ["home", "away"] as const;
  const perBookFair = quotes.map((q) =>
    devig(hasDraw ? [q.home, q.draw!, q.away] : [q.home, q.away]),
  );
  const fair = selections.map((_, i) => {
    const vals = perBookFair.map((row) => row[i]);
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  });

  // For each selection, find best (highest) available decimal odds across books.
  const bestPerSelection = selections.map((sel, i) => {
    const priced = quotes.map((q) => {
      const o = sel === "home" ? q.home : sel === "away" ? q.away : q.draw!;
      return { odds: o, book: q.book };
    });
    const best = priced.reduce((a, b) => (a.odds > b.odds ? a : b));
    const implied = 1 / best.odds;
    const edgePct = ((fair[i] - implied) / implied) * 100;
    const ev = fair[i] * (best.odds - 1) - (1 - fair[i]);
    return { sel, ...best, implied, fair: fair[i], edgePct, ev };
  });

  // Pick selection with highest EV.
  const winner = bestPerSelection.reduce((a, b) => (a.ev > b.ev ? a : b));
  const cap = SCORING.value.edgePctForFullScore;
  const clamped = clamp(winner.edgePct, -cap, cap);
  const score = clamp(50 + (clamped / cap) * 50, 0, 100);

  return {
    score: Math.round(score * 10) / 10,
    edgePercent: Math.round(winner.edgePct * 100) / 100,
    bestOdds: Math.round(winner.odds * 1000) / 1000,
    bestSelection: winner.sel,
    fairProb: Math.round(winner.fair * 10000) / 10000,
    impliedProb: Math.round(winner.implied * 10000) / 10000,
    evPercent: Math.round(winner.ev * 100 * 100) / 100,
    note: `best ${winner.sel} @ ${winner.odds.toFixed(2)} (${winner.book}), fair ${(winner.fair * 100).toFixed(1)}%, edge ${winner.edgePct.toFixed(1)}%`,
  };
}

// -------------------- Trap (0..100) --------------------
function trapScore(
  event: OddsEvent,
  quotes: MLQuote[],
): { score: number; note: string } {
  if (quotes.length === 0) {
    return { score: 0, note: "no odds to evaluate" };
  }
  // Use the shortest fav across books.
  const favImplieds = quotes.map((q) => Math.max(1 / q.home, 1 / q.away));
  const shortestFav = Math.max(...favImplieds);

  const favN =
    shortestFav >= SCORING.trap.favThreshold
      ? clamp((shortestFav - SCORING.trap.favThreshold) / (0.95 - SCORING.trap.favThreshold), 0, 1)
      : 0;

  const bigName = SCORING.trap.bigNames.test(`${event.home} ${event.away}`) ? 1 : 0;

  // Spread across books: gap between shortest and longest fav odds.
  const homeOdds = quotes.map((q) => q.home);
  const spread =
    homeOdds.length > 1
      ? clamp((Math.max(...homeOdds) - Math.min(...homeOdds)) / Math.min(...homeOdds), 0, 0.2) / 0.2
      : 0;

  const w = SCORING.trap.weights;
  const raw = favN * w.fav + bigName * w.bigName + spread * w.spread;
  const score = Math.round(raw * 100);
  return {
    score: clamp(score, 0, 100),
    note: `fav implied ${(shortestFav * 100).toFixed(0)}%${bigName ? ", high-profile side" : ""}${spread > 0 ? `, book spread ${(spread * 20).toFixed(0)}%` : ""}`,
  };
}

// -------------------- Verdict / stake / reasoning --------------------
function decideVerdict(
  ctx: number, val: number, trap: number,
): Verdict {
  if (trap >= VERDICT.trapScoreMin) return "trap";
  if (
    val >= VERDICT.opportunityValueMin &&
    ctx >= VERDICT.opportunityContextMin &&
    trap < VERDICT.opportunityTrapMax
  ) {
    return "opportunity";
  }
  return "ignore";
}

function buildReasoning(
  verdict: Verdict,
  parts: { ctx: string; exp: string; val: string; trap: string },
  edgePercent: number | null,
): string {
  const prefix =
    verdict === "opportunity"
      ? "Model reads positive edge with acceptable context and low public pressure."
      : verdict === "trap"
        ? "Public pressure and short favourite pricing outweigh any perceived edge."
        : "Insufficient edge or thin information — no bet.";
  const edge =
    edgePercent != null ? ` Best-line edge ${edgePercent.toFixed(1)}%.` : "";
  return `${prefix}${edge} Context: ${parts.ctx}. Explosion: ${parts.exp}. Value: ${parts.val}. Trap: ${parts.trap}.`;
}

export function scoreEvent(event: OddsEvent): ScoredMatch {
  const quotes = extractMoneylines(event);
  const ctx = contextScore(event);
  const val = valueScore(quotes);
  const exp = explosionScore(event, quotes);
  const trap = trapScore(event, quotes);

  const verdict = decideVerdict(ctx.score, val.score, trap.score);
  // Confidence: bounded 1..10 from a blend of context and value.
  const confidenceRaw = ctx.score * 0.4 + (val.score / 10) * 0.6;
  const confidence = Math.round(clamp(confidenceRaw, 1, 10) * 10) / 10;

  const stake =
    verdict === "opportunity" && confidence >= STAKE.smallConfidenceMin
      ? "Small"
      : "Pass";

  const reasoning = buildReasoning(
    verdict,
    { ctx: ctx.note, exp: exp.note, val: val.note, trap: trap.note },
    val.edgePercent,
  );

  return {
    event: {
      id: String(event.id),
      sport: event.sport ?? "",
      competition: event.league ?? null,
      home: event.home,
      away: event.away,
      kickoff: event.date ?? null,
    },
    contextScore: ctx.score,
    explosionScore: exp.score,
    valueScore: val.score,
    trapScore: trap.score,
    confidence,
    verdict,
    stake,
    recommendedMarket: val.bestSelection ? "Moneyline" : null,
    recommendedSelection: val.bestSelection,
    bestOdds: val.bestOdds,
    fairProbability: val.fairProb,
    impliedProbability: val.impliedProb,
    edgePercent: val.edgePercent,
    evPercent: val.evPercent,
    reasoning,
    signals: {
      context: { score: ctx.score, note: ctx.note },
      explosion: { score: exp.score, note: exp.note },
      value: { score: val.score, note: val.note },
      trap: { score: trap.score, note: trap.note },
    },
  };
}
