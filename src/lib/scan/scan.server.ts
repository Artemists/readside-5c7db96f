import { SCAN } from "./config";
import { athensLocalDate } from "@/lib/time";
import { fetchOddsForEvent, listEvents } from "./fixtures.server";
import { scoreEvent } from "./scoring.server";
import type { ScoredMatch } from "./types";

/**
 * Fetches today's fixtures across configured sports, scores each with the
 * four-score model, and upserts everything into the DB in one scan.
 */
export async function runScanNow() {
  const apiKey = process.env.ODDS_API_IO_KEY;
  if (!apiKey) {
    throw new Error("Missing ODDS_API_IO_KEY");
  }
  const started = Date.now();
  const localDate = athensLocalDate();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // 1) Pull events across sports, filter to today (Athens-local).
  const allEvents: Array<{
    id: string;
    sport: string;
    league?: string;
    home: string;
    away: string;
    date?: string;
  }> = [];
  for (const sport of SCAN.sports) {
    const list = await listEvents(sport, apiKey);
    for (const e of list) {
      const d = e.date ? athensLocalDate(new Date(e.date)) : null;
      if (d && d === localDate) {
        allEvents.push({
          id: String(e.id),
          sport: e.sport ?? sport,
          league: e.league,
          home: e.home,
          away: e.away,
          date: e.date,
        });
      }
    }
  }

  // Cap to protect quota.
  const events = allEvents.slice(0, SCAN.maxEvents);

  // 2) Fetch odds + score.
  const scored: ScoredMatch[] = [];
  for (const e of events) {
    try {
      const odds = await fetchOddsForEvent(e.id, apiKey);
      if (!odds) continue;
      const merged = {
        ...odds,
        sport: e.sport,
        league: e.league ?? odds.league,
        home: odds.home ?? e.home,
        away: odds.away ?? e.away,
        date: odds.date ?? e.date,
      };
      scored.push(scoreEvent(merged));
    } catch (err) {
      console.error("scan: score failed", e.id, err);
    }
  }

  // 3) Persist scan row + rows.
  const duration = Date.now() - started;
  const { data: scan, error: scanErr } = await supabaseAdmin
    .from("scans")
    .insert({
      local_date: localDate,
      fixtures_count: scored.length,
      duration_ms: duration,
      status: scored.length === 0 ? "partial" : "ok",
    })
    .select()
    .single();
  if (scanErr || !scan) {
    throw new Error(`scan insert failed: ${scanErr?.message ?? "unknown"}`);
  }

  if (scored.length > 0) {
    const rows = scored.map((s) => ({
      scan_id: scan.id,
      local_date: localDate,
      match_id: s.event.id,
      sport: s.event.sport,
      competition: s.event.competition,
      home: s.event.home,
      away: s.event.away,
      kickoff: s.event.kickoff,
      verdict: s.verdict,
      context_score: s.contextScore,
      explosion_score: s.explosionScore,
      value_score: s.valueScore,
      trap_score: s.trapScore,
      confidence: s.confidence,
      stake: s.stake,
      recommended_market: s.recommendedMarket,
      recommended_selection: s.recommendedSelection,
      best_odds: s.bestOdds,
      fair_probability: s.fairProbability,
      implied_probability: s.impliedProbability,
      edge_percent: s.edgePercent,
      ev_percent: s.evPercent,
      reasoning: s.reasoning,
      signals: s.signals as never,
      updated_at: new Date().toISOString(),
    }));
    const { error: rowsErr } = await supabaseAdmin
      .from("match_signals")
      .upsert(rows, { onConflict: "local_date,match_id" });
    if (rowsErr) {
      console.error("match_signals upsert failed", rowsErr);
    }
  }

  return {
    scanId: scan.id,
    scannedAt: scan.scanned_at,
    localDate,
    fixturesCount: scored.length,
    durationMs: duration,
  };
}
