// Settle finished matches. Resolves final scores via API-Football, grades
// the stored recommended_selection, and writes pnl_units + outcome.
// This must never throw out — errors are logged and the row is left to retry.

import { findTeamId } from "@/lib/model/team-form.server";

const API_BASE = "https://v3.football.api-sports.io";
const LOOKBACK_HOURS = 7 * 24;
const MAX_AGE_HOURS = 7 * 24; // give up after 7 days

type SignalRow = {
  id: string;
  match_id: string;
  home: string;
  away: string;
  kickoff: string | null;
  recommended_market: string | null;
  recommended_selection: string | null;
  best_odds: number | string | null;
};

type FixtureHit = {
  fixture: { id: number; date: string; status?: { short?: string } };
  teams: { home: { id: number }; away: { id: number } };
  goals: { home: number | null; away: number | null };
};

async function apiGet(path: string, key: string): Promise<unknown> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "x-apisports-key": key },
  });
  if (!res.ok) throw new Error(`api-football ${path} → ${res.status}`);
  return await res.json();
}

async function findFinalScore(
  home: string,
  away: string,
  kickoff: string,
  key: string,
): Promise<{ homeGoals: number; awayGoals: number } | null> {
  const [homeId, awayId] = await Promise.all([findTeamId(home), findTeamId(away)]);
  if (!homeId || !awayId) return null;
  try {
    const body = (await apiGet(
      `/fixtures/headtohead?h2h=${homeId}-${awayId}&last=20`,
      key,
    )) as { response?: FixtureHit[]; fixtures?: FixtureHit[] };
    const list = body.response ?? body.fixtures ?? [];
    const koMs = new Date(kickoff).getTime();
    const done = list.filter((f) => {
      const s = f.fixture?.status?.short ?? "";
      return (s === "FT" || s === "AET" || s === "PEN") &&
        f.goals.home != null && f.goals.away != null;
    });
    if (!done.length) return null;
    // Nearest by kickoff time (within 48h).
    const nearest = done
      .map((f) => ({ f, delta: Math.abs(new Date(f.fixture.date).getTime() - koMs) }))
      .sort((a, b) => a.delta - b.delta)[0];
    if (!nearest || nearest.delta > 48 * 3_600_000) return null;
    // Orient goals to our home/away using the fixture's home team id.
    const fixHomeIsOurHome = nearest.f.teams.home.id === homeId;
    const hg = nearest.f.goals.home as number;
    const ag = nearest.f.goals.away as number;
    return fixHomeIsOurHome
      ? { homeGoals: hg, awayGoals: ag }
      : { homeGoals: ag, awayGoals: hg };
  } catch (err) {
    console.error("settle: h2h fetch failed", home, away, err);
    return null;
  }
}

type Outcome = "win" | "loss" | "void" | "unknown";

function gradeSelection(
  market: string | null,
  selection: string | null,
  homeGoals: number,
  awayGoals: number,
): Outcome {
  if (!market || !selection) return "unknown";
  const m = market.toLowerCase();
  const s = selection.trim().toLowerCase();

  if (m === "moneyline" || m === "ml" || m === "h2h") {
    const result = homeGoals > awayGoals ? "home" : homeGoals < awayGoals ? "away" : "draw";
    return s === result ? "win" : "loss";
  }
  if (m === "total goals") {
    const parsed = s.match(/^(over|under)\s*([\d.]+)/i);
    if (!parsed) return "unknown";
    const side = parsed[1].toLowerCase();
    const line = Number(parsed[2]);
    if (!Number.isFinite(line)) return "unknown";
    const total = homeGoals + awayGoals;
    if (total === line) return "void";
    if (side === "over") return total > line ? "win" : "loss";
    return total < line ? "win" : "loss";
  }
  // Corners / cards — no result feed available.
  return "unknown";
}

function computePnl(outcome: Outcome, odds: number | null): number | null {
  if (outcome === "unknown" || odds == null) return null;
  if (outcome === "win") return odds - 1;
  if (outcome === "loss") return -1;
  return 0; // void
}

export async function settleFinishedMatches(): Promise<{
  attempted: number;
  settled: number;
  giveUp: number;
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const lookbackIso = new Date(nowMs - LOOKBACK_HOURS * 3_600_000).toISOString();

  const { data, error } = await supabaseAdmin
    .from("match_signals")
    .select("id, match_id, home, away, kickoff, recommended_market, recommended_selection, best_odds")
    .lt("kickoff", nowIso)
    .gte("kickoff", lookbackIso)
    .is("settled_at", null)
    .limit(50);
  if (error) {
    console.error("settle: query failed", error);
    return { attempted: 0, settled: 0, giveUp: 0 };
  }
  const rows = (data ?? []) as unknown as SignalRow[];
  if (!rows.length) return { attempted: 0, settled: 0, giveUp: 0 };

  const apiKey = process.env.API_FOOTBALL_KEY;
  let settled = 0;
  let giveUp = 0;
  const giveUpCutoffMs = nowMs - MAX_AGE_HOURS * 3_600_000;

  for (const row of rows) {
    const koMs = row.kickoff ? new Date(row.kickoff).getTime() : NaN;
    if (!Number.isFinite(koMs)) continue;

    let score: { homeGoals: number; awayGoals: number } | null = null;
    if (apiKey) {
      score = await findFinalScore(row.home, row.away, row.kickoff!, apiKey);
    }

    if (!score) {
      // Give up after 7 days so we stop chasing.
      if (koMs < giveUpCutoffMs) {
        await supabaseAdmin
          .from("match_signals")
          .update({
            outcome: "unknown",
            settled_at: nowIso,
            frozen: true,
          } as never)
          .eq("id", row.id);
        giveUp++;
      }
      continue;
    }

    const odds = row.best_odds != null ? Number(row.best_odds) : null;
    const outcome = gradeSelection(
      row.recommended_market,
      row.recommended_selection,
      score.homeGoals,
      score.awayGoals,
    );
    const pnl = computePnl(outcome, odds);

    const { error: updErr } = await supabaseAdmin
      .from("match_signals")
      .update({
        settled_at: nowIso,
        result_home_goals: score.homeGoals,
        result_away_goals: score.awayGoals,
        outcome,
        pnl_units: pnl,
        closing_odds: odds,
        frozen: true,
      } as never)
      .eq("id", row.id);
    if (updErr) {
      console.error("settle: update failed", row.match_id, updErr);
      continue;
    }
    settled++;
  }

  console.log("settle:done", { attempted: rows.length, settled, giveUp });
  return { attempted: rows.length, settled, giveUp };
}
