import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { athensLocalDate } from "@/lib/time";
import { SCAN } from "./config";

type ScanRow = {
  id: string;
  scanned_at: string;
  fixtures_count: number;
  status: string;
  api_calls?: number | null;
  stage_stats?: Record<string, number> | null;
};

/**
 * Trigger a scan. Rate-limited server-side against the shared scans table:
 *  - Normal (auto/refresh): reuse if last scan < staleAfterMinutes.
 *  - Forced (button): still blocked if last scan < forceCooldownMinutes.
 * The client cannot bypass either limit.
 */
export const runDailyScan = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) =>
    z.object({ force: z.boolean().optional() }).default({}).parse(raw ?? {}),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const today = athensLocalDate();

    const { data: last } = await supabaseAdmin
      .from("scans")
      .select("id, scanned_at, fixtures_count, status, api_calls")
      .eq("local_date", today)
      .order("scanned_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const now = Date.now();
    if (last) {
      const ageMin = (now - new Date(last.scanned_at).getTime()) / 60000;
      const limitMin = data.force ? SCAN.forceCooldownMinutes : SCAN.staleAfterMinutes;
      if (ageMin < limitMin) {
        const nextAvailableAt = new Date(
          new Date(last.scanned_at).getTime() + limitMin * 60_000,
        ).toISOString();
        return {
          reused: true,
          rateLimited: data.force === true,
          scanId: last.id,
          scannedAt: last.scanned_at,
          fixturesCount: last.fixtures_count,
          status: last.status,
          apiCalls: last.api_calls ?? 0,
          nextAvailableAt,
        };
      }
    }

    const { runScanNow } = await import("./scan.server");
    const result = await runScanNow();
    const nextAvailableAt = new Date(
      new Date(result.scannedAt).getTime() + SCAN.staleAfterMinutes * 60_000,
    ).toISOString();
    return { reused: false, rateLimited: false, ...result, nextAvailableAt };
  });

export const getTodayScanSummary = createServerFn({ method: "GET" }).handler(
  async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const today = athensLocalDate();

    // Latest scan (any status)
    const { data: latest } = await supabaseAdmin
      .from("scans")
      .select("id, scanned_at, fixtures_count, status, api_calls, duration_ms")
      .eq("local_date", today)
      .order("scanned_at", { ascending: false })
      .limit(1)
      .maybeSingle<ScanRow & { duration_ms: number | null }>();

    // Latest successful scan (ok or partial) — used for displayed counts
    // when latest is rate_limited/failed.
    const { data: lastOkArr } = await supabaseAdmin
      .from("scans")
      .select("id, scanned_at, fixtures_count, status, api_calls")
      .eq("local_date", today)
      .in("status", ["ok", "partial"])
      .order("scanned_at", { ascending: false })
      .limit(1);
    const lastOk = (lastOkArr?.[0] ?? null) as ScanRow | null;

    // Signals for today (from whatever scans have run today).
    const { data: rows } = await supabaseAdmin
      .from("match_signals")
      .select(
        "verdict, ev_percent, edge_percent, fair_probability, implied_probability, best_odds, home, away, match_id, recommended_market, recommended_selection",
      )
      .eq("local_date", today);

    const list = rows ?? [];
    const hasSuccessfulScan = !!lastOk;
    const counts = hasSuccessfulScan
      ? {
          opportunity: list.filter((r) => r.verdict === "opportunity").length,
          trap: list.filter((r) => r.verdict === "trap").length,
          ignore: list.filter((r) => r.verdict === "ignore").length,
        }
      : { opportunity: 0, trap: 0, ignore: 0 };

    const topEdge = hasSuccessfulScan
      ? list
          .filter((r) => r.ev_percent != null)
          .sort((a, b) => Number(b.ev_percent) - Number(a.ev_percent))[0] ?? null
      : null;

    const withEv = list.filter((r) => r.ev_percent != null).map((r) => Number(r.ev_percent));
    const avgAbsEv = withEv.length
      ? withEv.reduce((s, v) => s + Math.abs(v), 0) / withEv.length
      : null;
    const vals = list
      .map((r) => (r.implied_probability != null ? Number(r.implied_probability) : null))
      .filter((v): v is number => v != null);
    const avgImplied = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;

    const latestStatus = latest?.status ?? null;
    const isDegraded =
      latestStatus === "rate_limited" || latestStatus === "failed";

    const nextScanAvailableAt = latest
      ? new Date(
          new Date(latest.scanned_at).getTime() + SCAN.staleAfterMinutes * 60_000,
        ).toISOString()
      : null;
    const nextForceAvailableAt = latest
      ? new Date(
          new Date(latest.scanned_at).getTime() + SCAN.forceCooldownMinutes * 60_000,
        ).toISOString()
      : null;

    return {
      // Displayed-scan metadata (falls back to last successful).
      lastScanAt: (lastOk ?? latest)?.scanned_at ?? null,
      fixturesCount: (lastOk ?? latest)?.fixtures_count ?? list.length,
      counts,
      topEdge,
      market: { avgAbsEv, avgImplied, sampleSize: hasSuccessfulScan ? list.length : 0 },
      hasSuccessfulScan,
      // Latest-attempt diagnostics.
      latest: latest
        ? {
            scannedAt: latest.scanned_at,
            status: latest.status,
            fixturesCount: latest.fixtures_count,
            apiCalls: latest.api_calls ?? 0,
            durationMs: latest.duration_ms ?? null,
          }
        : null,
      degraded: isDegraded,
      nextScanAvailableAt,
      nextForceAvailableAt,
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
