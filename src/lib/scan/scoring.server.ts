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

type TotalsQuote = { line: number; over: number; under: number; book: string };

function extractOverUnderBy(
  event: OddsEvent,
  matcher: (name: string) => boolean,
  debugLabel?: string,
): TotalsQuote[] {
  const out: TotalsQuote[] = [];
  const books = event.bookmakers ?? {};
  for (const [bookName, markets] of Object.entries(books)) {
    const ou = markets.find((m) => matcher((m.name ?? "").toLowerCase()));
    const row = ou?.odds?.[0];
    if (!row) continue;
    // Providers occasionally return the line as a string; num() copes with both.
    // Prefer `max` (odds-api.io's over/under line field), fall back to `hdp`.
    const line = num(row.max) ?? num(row.hdp);
    const over = num(row.over);
    const under = num(row.under);
    if (debugLabel) {
      console.log("scoring:ou-raw", {
        event: event.id,
        label: debugLabel,
        market: ou?.name,
        book: bookName,
        rawMax: row.max,
        rawHdp: row.hdp,
        parsedLine: line,
        over,
        under,
      });
    }
    if (line == null || over == null || under == null) continue;
    out.push({ line, over, under, book: bookName });
  }
  return out;
}

function extractTotals(event: OddsEvent): TotalsQuote[] {
  return extractOverUnderBy(event, (n) =>
    n === "totals" || n === "over/under" || n === "o/u",
  );
}

export function extractCorners(event: OddsEvent): TotalsQuote[] {
  return extractOverUnderBy(event, (n) => n.includes("corner"));
}

export function extractCards(event: OddsEvent): TotalsQuote[] {
  return extractOverUnderBy(event, (n) => n.includes("card") || n.includes("booking"));
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
type BookQuote = { book: string; odds: number; implied: number };
type SelectionAudit = {
  selection: string;
  quotes: BookQuote[];
  fairProb: number;
  bestOdds: number;
  bestBook: string;
  bestImplied: number;
  edgePct: number;
  evPct: number;
  eligible: boolean;
  disqualifier: string | null;
};

type ValueResult = {
  score: number;
  edgePercent: number | null;
  bestOdds: number | null;
  bestSelection: string | null;
  fairProb: number | null;
  impliedProb: number | null;
  evPercent: number | null;
  note: string;
  audit: {
    booksSeen: string[];
    hasDraw: boolean;
    selections: SelectionAudit[];
    winner: string | null;
    disqualifier: string | null;
  };
};

type MarketName = "Moneyline" | "Total goals" | "Total corners" | "Total cards";

type EvaluatedMarket = {
  market: MarketName;
  selections: SelectionAudit[];
  eligibleWinner: SelectionAudit | null;
  fallbackByEv: SelectionAudit | null;
  booksSeen: string[];
  hasDraw: boolean;
  extra?: { line?: number };
};

function evaluateSelections(
  selections: readonly string[],
  perBookOdds: number[][],
  books: string[],
): { audits: SelectionAudit[]; eligibleWinner: SelectionAudit | null; fallbackByEv: SelectionAudit | null } {
  const cfg = SCORING.value;
  if (perBookOdds.length === 0) {
    return { audits: [], eligibleWinner: null, fallbackByEv: null };
  }
  const perBookFair = perBookOdds.map((row) => devig(row));
  const fair = selections.map((_, i) => {
    const vals = perBookFair.map((row) => row[i]);
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  });
  const audits: SelectionAudit[] = selections.map((sel, i) => {
    const priced: BookQuote[] = perBookOdds.map((row, bi) => ({
      book: books[bi],
      odds: row[i],
      implied: 1 / row[i],
    }));
    const best = priced.reduce((a, b) => (a.odds > b.odds ? a : b));
    const edgePct = ((fair[i] - best.implied) / best.implied) * 100;
    const evPct = (fair[i] * (best.odds - 1) - (1 - fair[i])) * 100;
    let disqualifier: string | null = null;
    if (priced.length < cfg.minBooksForValue) disqualifier = "single_book";
    else if (best.odds > cfg.maxAllowedOdds) disqualifier = "long_shot";
    else if (edgePct > cfg.suspiciousEdgePct) disqualifier = "suspicious_edge";
    return {
      selection: sel as SelectionAudit["selection"],
      quotes: priced,
      fairProb: fair[i],
      bestOdds: best.odds,
      bestBook: best.book,
      bestImplied: best.implied,
      edgePct,
      evPct,
      eligible: disqualifier === null,
      disqualifier,
    };
  });
  const eligible = audits.filter((a) => a.eligible);
  const eligibleWinner = eligible.length ? eligible.reduce((a, b) => (a.evPct > b.evPct ? a : b)) : null;
  const fallbackByEv = audits.length ? audits.reduce((a, b) => (a.evPct > b.evPct ? a : b)) : null;
  return { audits, eligibleWinner, fallbackByEv };
}

function evaluateMoneyline(quotes: MLQuote[]): EvaluatedMarket {
  const hasDraw = quotes.length > 0 && quotes.every((q) => q.draw != null);
  const selections = hasDraw ? (["home", "draw", "away"] as const) : (["home", "away"] as const);
  const perBookOdds = quotes.map((q) => (hasDraw ? [q.home, q.draw!, q.away] : [q.home, q.away]));
  const { audits, eligibleWinner, fallbackByEv } = evaluateSelections(
    selections,
    perBookOdds,
    quotes.map((q) => q.book),
  );
  return {
    market: "Moneyline",
    selections: audits,
    eligibleWinner,
    fallbackByEv,
    booksSeen: quotes.map((q) => q.book),
    hasDraw,
  };
}

function evaluateOverUnder(
  quotes: TotalsQuote[],
  market: MarketName,
  unitLabel: string,
): EvaluatedMarket | null {
  if (quotes.length === 0) return null;
  const byLine = new Map<number, TotalsQuote[]>();
  for (const t of quotes) {
    const arr = byLine.get(t.line) ?? [];
    arr.push(t);
    byLine.set(t.line, arr);
  }
  const [line, group] = [...byLine.entries()].sort((a, b) => b[1].length - a[1].length)[0];
  const perBookOdds = group.map((t) => [t.over, t.under]);
  const rawAudits = evaluateSelections(["over", "under"] as const, perBookOdds, group.map((t) => t.book));
  const audits = rawAudits.audits.map((a) => ({
    ...a,
    selection: (a.selection === "over"
      ? `Over ${line} ${unitLabel}`
      : `Under ${line} ${unitLabel}`) as SelectionAudit["selection"],
  }));
  const eligibleAudits = audits.filter((a) => a.eligible);
  const eligibleWinner = eligibleAudits.length ? eligibleAudits.reduce((a, b) => (a.evPct > b.evPct ? a : b)) : null;
  const fallbackByEv = audits.length ? audits.reduce((a, b) => (a.evPct > b.evPct ? a : b)) : null;
  return {
    market,
    selections: audits,
    eligibleWinner,
    fallbackByEv,
    booksSeen: group.map((t) => t.book),
    hasDraw: false,
    extra: { line },
  };
}

function evaluateTotals(totals: TotalsQuote[]): EvaluatedMarket | null {
  return evaluateOverUnder(totals, "Total goals", "goals");
}

function evaluateCorners(quotes: TotalsQuote[]): EvaluatedMarket | null {
  return evaluateOverUnder(quotes, "Total corners", "corners");
}

function evaluateCards(quotes: TotalsQuote[]): EvaluatedMarket | null {
  return evaluateOverUnder(quotes, "Total cards", "cards");
}

function buildValueResult(
  markets: EvaluatedMarket[],
): ValueResult & { winnerMarket: EvaluatedMarket["market"] | null } {
  const cfg = SCORING.value;
  const nonEmpty = markets.filter((m) => m.selections.length > 0);
  if (nonEmpty.length === 0) {
    return {
      score: 50, edgePercent: null, bestOdds: null, bestSelection: null,
      fairProb: null, impliedProb: null, evPercent: null,
      note: "no priced markets available",
      audit: { booksSeen: [], hasDraw: false, selections: [], winner: null, disqualifier: "no_market" },
      winnerMarket: null,
    };
  }

  const eligibleMarkets = nonEmpty.filter((m) => m.eligibleWinner);
  if (eligibleMarkets.length === 0) {
    // Report best fallback for audit; score is neutral.
    const best = nonEmpty.reduce((a, b) =>
      (a.fallbackByEv?.evPct ?? -Infinity) > (b.fallbackByEv?.evPct ?? -Infinity) ? a : b,
    );
    const w = best.fallbackByEv!;
    return {
      score: 50,
      edgePercent: Math.round(w.edgePct * 100) / 100,
      bestOdds: Math.round(w.bestOdds * 1000) / 1000,
      bestSelection: w.selection,
      fairProb: Math.round(w.fairProb * 10000) / 10000,
      impliedProb: Math.round(w.bestImplied * 10000) / 10000,
      evPercent: Math.round(w.evPct * 100) / 100,
      note: `neutral — ${w.disqualifier ?? "no eligible selection"}`,
      audit: {
        booksSeen: best.booksSeen, hasDraw: best.hasDraw,
        selections: best.selections, winner: null, disqualifier: w.disqualifier,
      },
      winnerMarket: best.market,
    };
  }

  const best = eligibleMarkets.reduce((a, b) =>
    (a.eligibleWinner!.evPct) > (b.eligibleWinner!.evPct) ? a : b,
  );
  const w = best.eligibleWinner!;
  const cap = cfg.edgePctForFullScore;
  const clamped = clamp(w.edgePct, -cap, cap);
  const score = clamp(50 + (clamped / cap) * 45, 0, 100);
  return {
    score: Math.round(score * 10) / 10,
    edgePercent: Math.round(w.edgePct * 100) / 100,
    bestOdds: Math.round(w.bestOdds * 1000) / 1000,
    bestSelection: w.selection,
    fairProb: Math.round(w.fairProb * 10000) / 10000,
    impliedProb: Math.round(w.bestImplied * 10000) / 10000,
    evPercent: Math.round(w.evPct * 100) / 100,
    note: `[${best.market}] best ${w.selection} @ ${w.bestOdds.toFixed(2)} (${w.bestBook}), fair ${(w.fairProb * 100).toFixed(1)}%, edge ${w.edgePct.toFixed(1)}%`,
    audit: {
      booksSeen: best.booksSeen, hasDraw: best.hasDraw,
      selections: best.selections, winner: w.selection, disqualifier: null,
    },
    winnerMarket: best.market,
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
  const favImplieds = quotes.map((q) => Math.max(1 / q.home, 1 / q.away));
  const shortestFav = Math.max(...favImplieds);
  const favN =
    shortestFav >= SCORING.trap.favThreshold
      ? clamp((shortestFav - SCORING.trap.favThreshold) / (0.95 - SCORING.trap.favThreshold), 0, 1)
      : 0;
  const bigName = SCORING.trap.bigNames.test(`${event.home} ${event.away}`) ? 1 : 0;
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
  const totalsQuotes = extractTotals(event);
  const cornersQuotes = extractCorners(event);
  const cardsQuotes = extractCards(event);
  const ctx = contextScore(event);
  const mlMarket = evaluateMoneyline(quotes);
  const totalsMarket = evaluateTotals(totalsQuotes);
  const cornersMarket = evaluateCorners(cornersQuotes);
  const cardsMarket = evaluateCards(cardsQuotes);
  const val = buildValueResult(
    [mlMarket, totalsMarket, cornersMarket, cardsMarket].filter(
      (m): m is EvaluatedMarket => m != null && m.selections.length > 0,
    ),
  );
  const exp = explosionScore(event, quotes);
  const trap = trapScore(event, quotes);

  const verdict = decideVerdict(ctx.score, val.score, trap.score);
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
    recommendedMarket: val.bestSelection ? (val.winnerMarket ?? "Moneyline") : null,
    recommendedSelection: val.bestSelection,
    bestOdds: val.bestOdds,
    fairProbability: val.fairProb,
    impliedProbability: val.impliedProb,
    edgePercent: val.edgePercent,
    evPercent: val.evPercent,
    reasoning,
    signals: {
      context: { score: ctx.score, note: ctx.note, tier: ctx.tier },
      explosion: { score: exp.score, note: exp.note },
      value: { score: val.score, note: val.note, audit: val.audit, market: val.winnerMarket },
      trap: { score: trap.score, note: trap.note },
    },
  };
}

