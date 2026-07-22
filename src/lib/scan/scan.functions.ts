import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { athensLocalDate } from "@/lib/time";
import { SCAN } from "./config";

/**
 * Trigger a scan. Rate-limited server-side: if a scan finished within the
 * staleAfterMinutes window, we return the existing result instead of re-running.
 */
export const runDailyScan = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) =>
    z.object({ force: z.boolean().optional() }).default({}).parse(raw ?? {}),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const today = athensLocalDate();

    if (!data.force) {
      const { data: last } = await supabaseAdmin
        .from("scans")
        .select("id, scanned_at, fixtures_count")
        .eq("local_date", today)
        .order("scanned_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (last) {
        const ageMin = (Date.now() - new Date(last.scanned_at).getTime()) / 60000;
        if (ageMin < SCAN.staleAfterMinutes) {
          return {
            reused: true,
            scanId: last.id,
            scannedAt: last.scanned_at,
            fixturesCount: last.fixtures_count,
          };
        }
      }
    }

    const { runScanNow } = await import("./scan.server");
    const result = await runScanNow();
    return { reused: false, ...result };
  });

export const getTodayScanSummary = createServerFn({ method: "GET" }).handler(
  async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const today = athensLocalDate();

    const { data: lastScan } = await supabaseAdmin
      .from("scans")
      .select("id, scanned_at, fixtures_count, status")
      .eq("local_date", today)
      .order("scanned_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: rows } = await supabaseAdmin
      .from("match_signals")
      .select("verdict, ev_percent, edge_percent, fair_probability, implied_probability, best_odds, home, away, match_id, recommended_market, recommended_selection")
      .eq("local_date", today);

    const list = rows ?? [];
    const counts = {
      opportunity: list.filter((r) => r.verdict === "opportunity").length,
      trap: list.filter((r) => r.verdict === "trap").length,
      ignore: list.filter((r) => r.verdict === "ignore").length,
    };

    const topEdge = list
      .filter((r) => r.ev_percent != null)
      .sort((a, b) => Number(b.ev_percent) - Number(a.ev_percent))[0] ?? null;

    // Market-conditions signals
    const withEv = list.filter((r) => r.ev_percent != null).map((r) => Number(r.ev_percent));
    const avgAbsEv = withEv.length
      ? withEv.reduce((s, v) => s + Math.abs(v), 0) / withEv.length
      : null;
    const avgDrawImplied = (() => {
      // Rough: use implied of best selection when it happens to be draw.
      // For now compute average implied across matches.
      const vals = list
        .map((r) => (r.implied_probability != null ? Number(r.implied_probability) : null))
        .filter((v): v is number => v != null);
      return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
    })();

    return {
      lastScanAt: lastScan?.scanned_at ?? null,
      fixturesCount: lastScan?.fixtures_count ?? list.length,
      counts,
      topEdge,
      market: { avgAbsEv, avgImplied: avgDrawImplied, sampleSize: list.length },
    };
  },
);

export const getMatchSignals = createServerFn({ method: "GET" })
  .inputValidator((raw: unknown) => z.object({ matchId: z.string() }).parse(raw))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const today = athensLocalDate();
    const { data: row } = await supabaseAdmin
      .from("match_signals")
      .select("*")
      .eq("local_date", today)
      .eq("match_id", data.matchId)
      .maybeSingle();
    return row;
  });

export const listByVerdict = createServerFn({ method: "GET" })
  .inputValidator((raw: unknown) =>
    z
      .object({
        verdict: z.enum(["opportunity", "trap", "ignore"]).optional(),
      })
      .default({})
      .parse(raw ?? {}),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const today = athensLocalDate();
    let q = supabaseAdmin
      .from("match_signals")
      .select(
        "match_id, home, away, kickoff, competition, sport, verdict, ev_percent, edge_percent, value_score, trap_score, context_score, recommended_market, recommended_selection, best_odds",
      )
      .eq("local_date", today)
      .order("ev_percent", { ascending: false });
    if (data.verdict) q = q.eq("verdict", data.verdict);
    const { data: rows } = await q;
    return rows ?? [];
  });
