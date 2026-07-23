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

    // Latest scan (any status) — used for force cooldown.
    const { data: latest } = await supabaseAdmin
      .from("scans")
      .select("id, scanned_at, fixtures_count, status, api_calls")
      .eq("local_date", today)
      .order("scanned_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const now = Date.now();

    if (data.force) {
      // Force: only safety cooldown to prevent double-taps / quota burn.
      if (latest) {
        const ageMin = (now - new Date(latest.scanned_at).getTime()) / 60000;
        if (ageMin < SCAN.forceCooldownMinutes) {
          const nextAvailableAt = new Date(
            new Date(latest.scanned_at).getTime() + SCAN.forceCooldownMinutes * 60_000,
          ).toISOString();
          return {
            reused: true,
            rateLimited: true,
            scanId: latest.id,
            scannedAt: latest.scanned_at,
            fixturesCount: latest.fixtures_count,
            status: latest.status,
            apiCalls: latest.api_calls ?? 0,
            nextAvailableAt,
          };
        }
      }
    } else {
      // Non-force (auto): reuse only if today already has a successful scan
      // that actually scored at least one fixture AND is fresher than the
      // auto-scan cadence. Older-than-cadence rows fall through to a real scan.
      const { data: lastOkArr } = await supabaseAdmin
        .from("scans")
        .select("id, scanned_at, fixtures_count, status, api_calls")
        .eq("local_date", today)
        .in("status", ["ok", "partial"])
        .gt("fixtures_count", 0)
        .order("scanned_at", { ascending: false })
        .limit(1);
      const lastOk = lastOkArr?.[0];
      if (lastOk) {
        const ageMin = (now - new Date(lastOk.scanned_at).getTime()) / 60000;
        if (ageMin < SCAN.autoScanIntervalHours * 60) {
          return {
            reused: true,
            rateLimited: false,
            scanId: lastOk.id,
            scannedAt: lastOk.scanned_at,
            fixturesCount: lastOk.fixtures_count,
            status: lastOk.status,
            apiCalls: lastOk.api_calls ?? 0,
            nextAvailableAt: null,
          };
        }
      }
    }

    const { runScanNow } = await import("./scan.server");
    const result = await runScanNow();
    const nextAvailableAt = new Date(
      new Date(result.scannedAt).getTime() + SCAN.forceCooldownMinutes * 60_000,
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
      .select("id, scanned_at, fixtures_count, status, api_calls, duration_ms, stage_stats")
      .eq("local_date", today)
      .order("scanned_at", { ascending: false })
      .limit(1)
      .maybeSingle<ScanRow & { duration_ms: number | null; stage_stats: Record<string, number> | null }>();

    // Latest successful scan (ok or partial with real fixtures) — used for
    // displayed counts when latest is rate_limited/failed/empty.
    const { data: lastOkArr } = await supabaseAdmin
      .from("scans")
      .select("id, scanned_at, fixtures_count, status, api_calls")
      .eq("local_date", today)
      .in("status", ["ok", "partial"])
      .gt("fixtures_count", 0)
      .order("scanned_at", { ascending: false })
      .limit(1);
    const lastOk = (lastOkArr?.[0] ?? null) as ScanRow | null;


    // Signals for today (from whatever scans have run today).
    const { data: rows } = await supabaseAdmin
      .from("match_signals")
      .select(
        "verdict, ev_percent, edge_percent, fair_probability, implied_probability, best_odds, home, away, match_id, recommended_market, recommended_selection, competition, sport, kickoff, value_score, trap_score, context_score, explosion_score, confidence, stake, provisional, signals",
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
          .filter((r) => {
            if (r.verdict !== "opportunity") return false;
            if (r.ev_percent == null) return false;
            const dq = (r.signals as { value?: { audit?: { disqualifier?: string | null } } } | null)
              ?.value?.audit?.disqualifier;
            return dq == null;
          })
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
          new Date(latest.scanned_at).getTime() + SCAN.autoScanIntervalHours * 3_600_000,
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
      // Latest attempt regardless of outcome — so the UI can honestly show
      // when we last tried, even if that attempt scored zero.
      lastAttemptAt: latest?.scanned_at ?? null,
      lastAttemptStatus: latest?.status ?? null,
      lastAttemptFixtures: latest?.fixtures_count ?? null,
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
            stageStats: latest.stage_stats ?? null,
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
    const { data: row } = await supabaseAdmin
      .from("match_signals")
      .select("*")
      .eq("match_id", data.matchId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return row;
  });

const UPCOMING_COLUMNS =
  "match_id, home, away, kickoff, competition, sport, verdict, ev_percent, edge_percent, value_score, trap_score, context_score, explosion_score, confidence, stake, recommended_market, recommended_selection, best_odds, fair_probability, implied_probability, provisional, signals";

function windowBounds() {
  const now = new Date();
  const end = new Date(now.getTime() + SCAN.windowHours * 3_600_000);
  return { fromIso: now.toISOString(), toIso: end.toISOString() };
}

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
    const { fromIso, toIso } = windowBounds();
    let q = supabaseAdmin
      .from("match_signals")
      .select(UPCOMING_COLUMNS)
      .gte("kickoff", fromIso)
      .lte("kickoff", toIso)
      .order("kickoff", { ascending: true });
    if (data.verdict) q = q.eq("verdict", data.verdict);
    const { data: rows } = await q;
    return rows ?? [];
  });

export const listUpcoming = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { fromIso, toIso } = windowBounds();
  const { data: rows } = await supabaseAdmin
    .from("match_signals")
    .select(UPCOMING_COLUMNS)
    .gte("kickoff", fromIso)
    .lte("kickoff", toIso)
    .order("kickoff", { ascending: true });
  return rows ?? [];
});

/**
 * Read-only diagnostic. Probes the odds provider to discover which sports
 * (and, for sports with events, which leagues + markets per bookmaker) are
 * actually available on our plan. Manual invocation only — never called from
 * a scan. Hard-capped to ~12 provider calls per invocation so it cannot burn
 * the hourly quota.
 */
export const probeProviderCoverage = createServerFn({ method: "POST" }).handler(
  async () => {
    const apiKey = process.env.ODDS_API_IO_KEY;
    if (!apiKey) throw new Error("Missing ODDS_API_IO_KEY");
    const { probeAvailableSports, probeSportDetail } = await import(
      "./fixtures.server"
    );

    const MAX_CALLS = 12;
    // Sports probe uses either 1 call (/v3/sports) or up to 10 (/v3/events × candidates).
    const sports = await probeAvailableSports(apiKey);

    // Assume worst case: sports probe used 10 calls if it fell back.
    const sportsCallsUsed = sports.every((s) => s.source === "sports_endpoint")
      ? 1
      : sports.length;
    let remaining = MAX_CALLS - sportsCallsUsed;

    // Detail each sport known to have events. Each detail call uses up to
    // 1 + 3 = 4 provider calls. Stop when we run out of budget.
    const withEvents = sports.filter(
      (s) => s.ok && (s.eventCount > 0 || s.eventCount === -1),
    );
    const details: Array<Awaited<ReturnType<typeof probeSportDetail>>> = [];
    for (const s of withEvents) {
      if (remaining < 4) break;
      const detail = await probeSportDetail(apiKey, s.sport);
      details.push(detail);
      remaining -= 1 + Math.min(3, detail.eventCount);
    }

    const result = {
      probedAt: new Date().toISOString(),
      sports,
      details,
      budget: { max: MAX_CALLS, remaining },
    };
    console.log("provider:coverage", JSON.stringify(result));
    return result;
  },
);

/**
 * Read-only diagnostic. Answers: does odds-api.io expose a /bookmakers
 * listing, and when we request many books for a real event, how many
 * actually come back? Manual invocation only. Hard-capped at 12 provider
 * calls so it cannot burn quota.
 */
export const probeBookmakerCoverage = createServerFn({ method: "POST" }).handler(
  async () => {
    const apiKey = process.env.ODDS_API_IO_KEY;
    if (!apiKey) throw new Error("Missing ODDS_API_IO_KEY");
    const BASE = "https://api.odds-api.io/v3";
    const MAX_CALLS = 12;
    let used = 0;

    type Attempt = {
      label: string;
      requested: string[];
      httpStatus: number | null;
      error: string | null;
      returned: string[];
      returnedCount: number;
    };

    async function callJson(url: string): Promise<{ status: number | null; body: unknown; error: string | null }> {
      try {
        const res = await fetch(url, { headers: { accept: "application/json" } });
        let body: unknown = null;
        try { body = await res.json(); } catch { /* ignore */ }
        return { status: res.status, body, error: null };
      } catch (err) {
        return { status: null, body: null, error: err instanceof Error ? err.message : String(err) };
      }
    }

    // 1) /bookmakers listing endpoint
    used += 1;
    const listing = await callJson(`${BASE}/bookmakers?apiKey=${encodeURIComponent(apiKey)}`);
    const listingExtract = (() => {
      const b = listing.body as unknown;
      if (Array.isArray(b)) return b as unknown[];
      if (b && typeof b === "object" && Array.isArray((b as { bookmakers?: unknown[] }).bookmakers)) {
        return (b as { bookmakers: unknown[] }).bookmakers;
      }
      return null;
    })();
    const listingNames = listingExtract
      ? listingExtract.map((x) => (typeof x === "string" ? x : (x as { name?: string; slug?: string })?.name ?? (x as { slug?: string })?.slug ?? String(x)))
      : null;
    const listingError =
      listing.error ??
      (listing.body && typeof listing.body === "object" && "error" in listing.body
        ? String((listing.body as { error?: unknown }).error)
        : null);

    // 2) Pick one upcoming football event
    used += 1;
    const eventsResp = await callJson(`${BASE}/events?sport=football&apiKey=${encodeURIComponent(apiKey)}`);
    const eventsArr = (() => {
      const b = eventsResp.body as unknown;
      if (Array.isArray(b)) return b as Array<{ id: string | number; home?: string; away?: string; date?: string; status?: string }>;
      const wrapped = (b as { events?: unknown[] } | null)?.events;
      return Array.isArray(wrapped) ? (wrapped as Array<{ id: string | number; home?: string; away?: string; date?: string; status?: string }>) : [];
    })();
    const nowMs = Date.now();
    const chosen = eventsArr.find((e) => {
      const t = e.date ? Date.parse(e.date) : NaN;
      return Number.isFinite(t) && t > nowMs && (e.status ? String(e.status).toLowerCase() !== "finished" : true);
    }) ?? eventsArr[0] ?? null;

    const attempts: Attempt[] = [];

    async function tryOddsWith(label: string, books: string[]): Promise<Attempt | null> {
      if (!chosen) return null;
      if (used >= MAX_CALLS) return null;
      used += 1;
      const url = `${BASE}/odds?eventId=${encodeURIComponent(String(chosen.id))}&bookmakers=${encodeURIComponent(books.join(","))}&apiKey=${encodeURIComponent(apiKey)}`;
      const r = await callJson(url);
      const raw = Array.isArray(r.body) ? r.body[0] : r.body;
      const errStr =
        r.error ??
        (raw && typeof raw === "object" && "error" in raw ? String((raw as { error?: unknown }).error) : null);
      const bookObj = raw && typeof raw === "object" && "bookmakers" in raw
        ? (raw as { bookmakers?: Record<string, unknown> }).bookmakers ?? {}
        : {};
      const returned = Object.keys(bookObj);
      return {
        label,
        requested: books,
        httpStatus: r.status,
        error: errStr,
        returned,
        returnedCount: returned.length,
      };
    }

    // Current pair
    const current = await tryOddsWith("current_pair", ["Bet365", "Novibet"]);
    if (current) attempts.push(current);

    // Wider set
    const wideBooks = ["Pinnacle", "Bet365", "Novibet", "William Hill", "Unibet", "Betfair", "1xBet", "Betway"];
    const wide = await tryOddsWith("wide_set", wideBooks);
    if (wide) attempts.push(wide);

    // Individually probe each extra book (only if we have budget)
    const extras = ["Pinnacle", "William Hill", "Unibet", "Betfair", "1xBet", "Betway"];
    for (const b of extras) {
      if (used >= MAX_CALLS) break;
      const a = await tryOddsWith(`solo_${b}`, [b]);
      if (a) attempts.push(a);
    }

    const result = {
      probedAt: new Date().toISOString(),
      callsUsed: used,
      maxCalls: MAX_CALLS,
      listing: {
        httpStatus: listing.status,
        error: listingError,
        count: listingNames?.length ?? null,
        bookmakers: listingNames,
        rawSample: listingNames ? null : listing.body,
      },
      event: chosen
        ? { id: String(chosen.id), home: chosen.home, away: chosen.away, date: chosen.date }
        : null,
      attempts,
    };
    console.log("provider:bookmakers", JSON.stringify(result));
    return result;
  },
);


