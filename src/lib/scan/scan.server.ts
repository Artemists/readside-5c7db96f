import { SCAN } from "./config";
import { athensLocalDate } from "@/lib/time";
import { fetchOddsForEvent, listEvents, type CallStatus } from "./fixtures.server";
import { scoreEvent, competitionTier } from "./scoring.server";
import type { ScoredMatch } from "./types";
import { getModelInputs, type ModelFailure } from "@/lib/model/team-form.server";
import {
  attackDefenceRates,
  poissonMatchProbabilities,
  type MatchProbabilities,
} from "@/lib/model/rates";


type ScanStatus = "ok" | "partial" | "rate_limited" | "failed";

/**
 * Fetches today's fixtures across configured sports, scores each with the
 * four-score model, and upserts everything into the DB in one scan.
 * Reuses per-event stored rows when they were scored within eventFreshMinutes.
 */
export async function runScanNow() {
  const apiKey = process.env.ODDS_API_IO_KEY;
  if (!apiKey) throw new Error("Missing ODDS_API_IO_KEY");
  const started = Date.now();
  const localDate = athensLocalDate();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  let apiCalls = 0;
  let sawRateLimit = false;
  let sawFailure = false;
  const noteStatus = (s: CallStatus) => {
    if (s === "rate_limited") sawRateLimit = true;
    else if (s === "failed") sawFailure = true;
  };

  // 1) Pull events across sports, filter to the upcoming kickoff window.
  const stage = {
    fetched: 0,
    afterStatus: 0,
    afterDate: 0,
    oddsOk: 0,
    oddsError: 0,
    scored: 0,
  };
  const nowMs = Date.now();
  const windowEndMs = nowMs + SCAN.windowHours * 3_600_000;
  const provisionalCutoffMs = nowMs + SCAN.provisionalAfterHours * 3_600_000;
  const allEvents: Array<{
    id: string;
    sport: string;
    league?: string;
    home: string;
    away: string;
    date?: string;
  }> = [];
  for (const sport of SCAN.sports) {
    apiCalls++;
    const { events, status } = await listEvents(sport, apiKey);
    noteStatus(status);
    stage.fetched += events.length;
    for (const e of events) {
      // Real values seen: "pending" (upcoming), "settled", "cancelled", "live".
      if (e.status && e.status !== "pending") continue;
      stage.afterStatus++;
      const t = e.date ? new Date(e.date).getTime() : NaN;
      if (Number.isFinite(t) && t >= nowMs && t <= windowEndMs) {
        stage.afterDate++;
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

  // Prioritise higher-tier competitions before capping (quota control).
  allEvents.sort((a, b) => competitionTier(b.league) - competitionTier(a.league));
  const events = allEvents.slice(0, SCAN.maxEvents);


  // Pre-fetch existing fresh signals so we can skip re-fetching their odds.
  // Freshness is by match_id across the whole window (matches can span days).
  const freshCutoff = new Date(nowMs - SCAN.eventFreshMinutes * 60_000).toISOString();
  const { data: freshRows } = events.length
    ? await supabaseAdmin
        .from("match_signals")
        .select("match_id, updated_at")
        .in("match_id", events.map((e) => e.id))
        .gte("updated_at", freshCutoff)
    : { data: [] as Array<{ match_id: string; updated_at: string }> };
  const freshIds = new Set((freshRows ?? []).map((r) => r.match_id));

  // 2) Fetch odds + score (skip fresh ones).
  const scored: ScoredMatch[] = [];
  let reused = 0;
  let diagLogged = 0;
  const marketTally = { moneyline: 0, totals: 0, corners: 0, cards: 0 };
  for (const e of events) {
    if (freshIds.has(e.id)) {
      reused++;
      continue;
    }

    try {
      apiCalls++;
      const { event: odds, status } = await fetchOddsForEvent(
        e.id,
        apiKey,
        SCAN.bookmakers,
      );
      noteStatus(status);
      if (!odds) {
        stage.oddsError++;
        continue;
      }
      stage.oddsOk++;
      const books = odds.bookmakers ?? {};
      const seen = { moneyline: false, totals: false, corners: false, cards: false };
      for (const markets of Object.values(books)) {
        for (const m of markets) {
          const n = (m.name ?? "").toLowerCase();
          if (n === "ml" || n === "moneyline" || n === "h2h") seen.moneyline = true;
          if (n.includes("corner")) seen.corners = true;
          else if (n.includes("card") || n.includes("booking")) seen.cards = true;
          else if (n === "totals" || n === "over/under" || n === "o/u") seen.totals = true;
        }
      }
      if (seen.moneyline) marketTally.moneyline++;
      if (seen.totals) marketTally.totals++;
      if (seen.corners) marketTally.corners++;
      if (seen.cards) marketTally.cards++;
      if (diagLogged < 3) {
        const summary = Object.entries(books).map(([book, markets]) => ({
          book,
          markets: markets.map((m) => m.name),
        }));
        console.log("scan:diag", { eventId: e.id, home: e.home, away: e.away, books: summary });
        diagLogged++;
      }

      // Prefer the already-normalized (string) sport/league from listEvents;
      // /v3/odds returns them as { name, slug } objects which would break
      // downstream string-based checks.
      const merged = {
        ...odds,
        sport: e.sport,
        league: e.league,
        home: odds.home ?? e.home,
        away: odds.away ?? e.away,
        date: odds.date ?? e.date,
      };
      const scoredMatch = scoreEvent(merged);

      // Shadow-mode independent model — never influences verdict/stake/recs.
      const { inputs, reason } = await getModelInputs(merged.home, merged.away);
      if (!inputs) {
        scoredMatch.signals.model = null;
        if (reason) shadowFail[reason]++;
      } else {
        const homeRates = attackDefenceRates(inputs.homeForm);
        const awayRates = attackDefenceRates(inputs.awayForm);
        if (!homeRates || !awayRates) {
          scoredMatch.signals.model = null;
          shadowFail.insufficient_form++;
        } else {
          const probs = poissonMatchProbabilities(
            homeRates.attack,
            homeRates.defence,
            awayRates.attack,
            awayRates.defence,
          );
          const disagreement = computeDisagreement(scoredMatch, probs);
          scoredMatch.signals.model = {
            homeWin: probs.homeWin,
            draw: probs.draw,
            awayWin: probs.awayWin,
            expectedHomeGoals: probs.expectedHomeGoals,
            expectedAwayGoals: probs.expectedAwayGoals,
            over: probs.over,
            under: probs.under,
            sampleSize: inputs.sampleSize,
            disagreement,
          };
          shadowOk++;
          if (disagreement != null) {
            shadowDisagreements.push(disagreement);
          }
        }
      }

      scored.push(scoredMatch);
      stage.scored++;
    } catch (err) {
      console.error("scan: score failed", e.id, err);
      sawFailure = true;
    }
  }
  console.log("scan:markets", { events: events.length, ...marketTally });
  const meanDisagreement =
    shadowDisagreements.length
      ? shadowDisagreements.reduce((a, b) => a + b, 0) / shadowDisagreements.length
      : null;
  console.log("model:shadow", {
    ok: shadowOk,
    ...shadowFail,
    meanDisagreement: meanDisagreement != null ? Number(meanDisagreement.toFixed(4)) : null,
  });

  // 3) Determine scan status.
  let status: ScanStatus;
  if (sawRateLimit && scored.length === 0 && reused === 0) status = "rate_limited";
  else if (sawFailure && scored.length === 0 && reused === 0) status = "failed";
  else if (sawRateLimit || sawFailure) status = "partial";
  else if (events.length === 0) status = "partial";
  else status = "ok";

  const totalFixtures = scored.length + reused;
  const duration = Date.now() - started;
  const { data: scan, error: scanErr } = await supabaseAdmin
    .from("scans")
    .insert({
      local_date: localDate,
      fixtures_count: totalFixtures,
      duration_ms: duration,
      status,
      api_calls: apiCalls,
      stage_stats: stage,
    })
    .select()
    .single();
  if (scanErr || !scan) {
    throw new Error(`scan insert failed: ${scanErr?.message ?? "unknown"}`);
  }

  if (scored.length > 0) {
    const rows = scored.map((s) => {
      const koMs = s.event.kickoff ? new Date(s.event.kickoff).getTime() : NaN;
      const rowLocalDate = Number.isFinite(koMs)
        ? athensLocalDate(new Date(koMs))
        : localDate;
      const provisional = Number.isFinite(koMs) ? koMs > provisionalCutoffMs : false;
      return {
        scan_id: scan.id,
        local_date: rowLocalDate,
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
        provisional,
        updated_at: new Date().toISOString(),
      };
    });
    const { error: rowsErr } = await supabaseAdmin
      .from("match_signals")
      .upsert(rows, { onConflict: "local_date,match_id" });
    if (rowsErr) console.error("match_signals upsert failed", rowsErr);
  }

  return {
    scanId: scan.id,
    scannedAt: scan.scanned_at,
    localDate,
    fixturesCount: totalFixtures,
    scoredCount: scored.length,
    reusedCount: reused,
    apiCalls,
    status,
    durationMs: duration,
  };
}
