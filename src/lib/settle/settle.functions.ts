import { createServerFn } from "@tanstack/react-start";

// Manual trigger (also runs at the start of every scan).
export const runSettlement = createServerFn({ method: "POST" }).handler(async () => {
  const { settleFinishedMatches } = await import("./settle.server");
  return await settleFinishedMatches();
});

// -------------------- Performance stats --------------------

type SignalRow = {
  match_id: string;
  verdict: string;
  recommended_market: string | null;
  recommended_selection: string | null;
  best_odds: number | string | null;
  fair_probability: number | string | null;
  confidence: number | string | null;
  edge_percent: number | string | null;
  ev_percent: number | string | null;
  outcome: string | null;
  pnl_units: number | string | null;
  signals: unknown;
};

type Bucket = {
  count: number;
  wins: number;
  losses: number;
  voids: number;
  unknowns: number;
  pnl: number;
  edgeSum: number;
  edgeN: number;
  evSum: number;
  evN: number;
};

function emptyBucket(): Bucket {
  return {
    count: 0, wins: 0, losses: 0, voids: 0, unknowns: 0,
    pnl: 0, edgeSum: 0, edgeN: 0, evSum: 0, evN: 0,
  };
}

function pushBucket(b: Bucket, row: SignalRow) {
  b.count++;
  if (row.outcome === "win") b.wins++;
  else if (row.outcome === "loss") b.losses++;
  else if (row.outcome === "void") b.voids++;
  else b.unknowns++;
  const pnl = row.pnl_units != null ? Number(row.pnl_units) : null;
  if (pnl != null && Number.isFinite(pnl)) b.pnl += pnl;
  const e = row.edge_percent != null ? Number(row.edge_percent) : null;
  if (e != null && Number.isFinite(e)) { b.edgeSum += e; b.edgeN++; }
  const ev = row.ev_percent != null ? Number(row.ev_percent) : null;
  if (ev != null && Number.isFinite(ev)) { b.evSum += ev; b.evN++; }
}

function summarize(b: Bucket) {
  const graded = b.wins + b.losses + b.voids;
  const decided = b.wins + b.losses;
  return {
    count: b.count,
    wins: b.wins,
    losses: b.losses,
    voids: b.voids,
    unknowns: b.unknowns,
    winRate: decided > 0 ? b.wins / decided : null,
    pnlUnits: Math.round(b.pnl * 10000) / 10000,
    roi: graded > 0 ? b.pnl / graded : null,
    avgEdgePct: b.edgeN > 0 ? b.edgeSum / b.edgeN : null,
    avgEvPct: b.evN > 0 ? b.evSum / b.evN : null,
  };
}

function dataQualityOf(row: SignalRow): string | null {
  const s = row.signals as
    | { value?: { audit?: { dataQuality?: string | null } } }
    | null;
  return s?.value?.audit?.dataQuality ?? null;
}

function modelWinProbFor(
  row: SignalRow,
): number | null {
  const s = row.signals as
    | { model?: { homeWin?: number; draw?: number; awayWin?: number; over?: Record<string, number>; under?: Record<string, number> } | null }
    | null;
  const model = s?.model ?? null;
  if (!model) return null;
  const market = (row.recommended_market ?? "").toLowerCase();
  const sel = (row.recommended_selection ?? "").trim().toLowerCase();
  if (!sel) return null;
  if (market === "moneyline" || market === "ml" || market === "h2h" || market === "") {
    if (sel === "home") return model.homeWin ?? null;
    if (sel === "draw") return model.draw ?? null;
    if (sel === "away") return model.awayWin ?? null;
  }
  if (market === "total goals") {
    const m = sel.match(/^(over|under)\s*([\d.]+)/i);
    if (!m) return null;
    const key = m[2];
    const side = m[1].toLowerCase();
    const bucket = side === "over" ? model.over : model.under;
    return bucket?.[key] ?? null;
  }
  return null;
}

function confidenceBucket(c: number | null): "Low" | "Medium" | "High" | "Unknown" {
  if (c == null || !Number.isFinite(c)) return "Unknown";
  if (c < 5) return "Low";
  if (c < 8) return "Medium";
  return "High";
}

function probBand(p: number): string {
  const lo = Math.floor(p * 10) * 10;
  const hi = Math.min(lo + 10, 100);
  return `${lo}-${hi}%`;
}

export const getPerformanceStats = createServerFn({ method: "GET" })
  .inputValidator((input?: { lookbackDays?: number }) => ({
    lookbackDays: input?.lookbackDays ?? 30,
  }))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sinceIso = new Date(
      Date.now() - data.lookbackDays * 24 * 3_600_000,
    ).toISOString();

    const { data: rowsRaw, error } = await supabaseAdmin
      .from("match_signals")
      .select("match_id, verdict, recommended_market, recommended_selection, best_odds, fair_probability, confidence, edge_percent, ev_percent, outcome, pnl_units, signals, kickoff, settled_at")
      .gte("kickoff", sinceIso)
      .not("settled_at", "is", null)
      .not("outcome", "is", null);
    if (error) throw new Error(error.message);
    const all = (rowsRaw ?? []) as unknown as SignalRow[];
    // Rows with a graded outcome (exclude 'unknown' from most stats).
    const graded = all.filter((r) => r.outcome && r.outcome !== "unknown");

    // Overall
    const overallBucket = emptyBucket();
    for (const r of graded) pushBucket(overallBucket, r);

    // By verdict
    const byVerdict: Record<string, Bucket> = {};
    for (const r of graded) {
      const k = r.verdict ?? "unknown";
      (byVerdict[k] ??= emptyBucket());
      pushBucket(byVerdict[k], r);
    }

    // By data quality
    const byDataQuality: Record<string, Bucket> = {};
    for (const r of graded) {
      const k = dataQualityOf(r) ?? "unknown";
      (byDataQuality[k] ??= emptyBucket());
      pushBucket(byDataQuality[k], r);
    }

    // By market
    const byMarket: Record<string, Bucket> = {};
    for (const r of graded) {
      const k = r.recommended_market ?? "unknown";
      (byMarket[k] ??= emptyBucket());
      pushBucket(byMarket[k], r);
    }

    // By confidence bucket
    const byConfidence: Record<string, Bucket> = {};
    for (const r of graded) {
      const c = r.confidence != null ? Number(r.confidence) : null;
      const k = confidenceBucket(c);
      (byConfidence[k] ??= emptyBucket());
      pushBucket(byConfidence[k], r);
    }

    // Calibration: bucket by fair_probability in 10% bands.
    const calibration: Record<string, { count: number; wins: number; predictedSum: number }> = {};
    for (const r of graded) {
      const p = r.fair_probability != null ? Number(r.fair_probability) : null;
      if (p == null || !Number.isFinite(p)) continue;
      const band = probBand(p);
      const entry = (calibration[band] ??= { count: 0, wins: 0, predictedSum: 0 });
      entry.count++;
      entry.predictedSum += p;
      if (r.outcome === "win") entry.wins++;
    }
    const calibrationOut = Object.entries(calibration)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([band, e]) => ({
        band,
        count: e.count,
        predictedProbability: e.count ? e.predictedSum / e.count : null,
        actualWinRate: e.count ? e.wins / e.count : null,
      }));

    // Model comparison — rows where signals.model exists AND we can map
    // the recommended selection to a model probability.
    const modelCmp = { count: 0, marketWins: 0, modelSum: 0, marketSum: 0 };
    for (const r of graded) {
      const modelP = modelWinProbFor(r);
      if (modelP == null) continue;
      const marketP = r.fair_probability != null ? Number(r.fair_probability) : null;
      if (marketP == null || !Number.isFinite(marketP)) continue;
      modelCmp.count++;
      modelCmp.modelSum += modelP;
      modelCmp.marketSum += marketP;
      if (r.outcome === "win") modelCmp.marketWins++;
    }

    const summarizeMap = (m: Record<string, Bucket>) => {
      const out: Record<string, ReturnType<typeof summarize>> = {};
      for (const [k, v] of Object.entries(m)) out[k] = summarize(v);
      return out;
    };

    return {
      lookbackDays: data.lookbackDays,
      totalRowsConsidered: all.length,
      totalGraded: graded.length,
      overall: summarize(overallBucket),
      byVerdict: summarizeMap(byVerdict),
      byDataQuality: summarizeMap(byDataQuality),
      byMarket: summarizeMap(byMarket),
      byConfidence: summarizeMap(byConfidence),
      calibration: calibrationOut,
      modelComparison: modelCmp.count > 0
        ? {
            count: modelCmp.count,
            avgModelProbability: modelCmp.modelSum / modelCmp.count,
            avgMarketProbability: modelCmp.marketSum / modelCmp.count,
            actualWinRate: modelCmp.marketWins / modelCmp.count,
          }
        : { count: 0, avgModelProbability: null, avgMarketProbability: null, actualWinRate: null },
    };
  });
