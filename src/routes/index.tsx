import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import {
  Card,
  Divider,
  SectionLabel,
  Spinner,
  StatCard,
  WarningBadge,
} from "@/components/betlab/primitives";
import {
  getTodayScanSummary,
  listUpcoming,
  runDailyScan,
} from "@/lib/scan/scan.functions";
import { athensLocalDate, athensLocalTime } from "@/lib/time";
import { MatchCard } from "@/components/betlab/MatchCard";


export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Today's briefing — Readside BetLab" },
      {
        name: "description",
        content:
          "Live scan of today's football fixtures with Opportunity, Trap and Ignore verdicts.",
      },
      { property: "og:title", content: "Today's briefing — Readside BetLab" },
      {
        property: "og:description",
        content:
          "Live scan of today's football fixtures with Opportunity, Trap and Ignore verdicts.",
      },
    ],
  }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData({
        queryKey: ["scan-summary"],
        queryFn: () => getTodayScanSummary(),
      }),
      context.queryClient.ensureQueryData({
        queryKey: ["upcoming"],
        queryFn: () => listUpcoming(),
      }),
    ]),
  component: MorningBriefing,
});

function MorningBriefing() {
  const qc = useQueryClient();
  const router = useRouter();
  const runScan = useServerFn(runDailyScan);
  const fetchSummary = useServerFn(getTodayScanSummary);
  const fetchUpcoming = useServerFn(listUpcoming);

  const summary = useQuery({
    queryKey: ["scan-summary"],
    queryFn: () => fetchSummary(),
    staleTime: 60_000,
  });

  const upcoming = useQuery({
    queryKey: ["upcoming"],
    queryFn: () => fetchUpcoming(),
    staleTime: 60_000,
  });

  const scan = useMutation({
    mutationFn: (force: boolean) => runScan({ data: { force } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scan-summary"] });
      qc.invalidateQueries({ queryKey: ["upcoming"] });
      router.invalidate();
    },
    onError: (err) => {
      console.error(err);
      toast.error("Δεν ήταν δυνατή η εκτέλεση σάρωσης");
    },
  });

  // Auto-run once per page load only. Triggers if today has no successful
  // scan, or the latest scan is older than the staleness threshold. Never
  // re-scans on navigation back within the same session — the ref guard
  // enforces "at most once per mount".
  const autoRan = useRef(false);
  useEffect(() => {
    if (autoRan.current) return;
    const s = summary.data;
    if (!s) return;
    autoRan.current = true;
    const stale =
      !!s.lastScanAt &&
      Date.now() - new Date(s.lastScanAt).getTime() > 30 * 60 * 1000;
    if (!s.hasSuccessfulScan || stale) scan.mutate(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary.data?.hasSuccessfulScan, summary.data?.lastScanAt]);


  const s = summary.data;
  const counts = s?.counts ?? { opportunity: 0, trap: 0, ignore: 0 };
  const conditions = deriveConditions(s?.market);
  const scanning = scan.isPending;

  const showDegradedNotice = !!s?.degraded && !!s?.hasSuccessfulScan;
  const showNoScanNotice = !s?.hasSuccessfulScan;
  const lastScanLabel = s?.lastScanAt
    ? athensLocalTime(new Date(s.lastScanAt))
    : null;

  const [conditionsOpen, setConditionsOpen] = useState(false);
  const [diagOpen, setDiagOpen] = useState(false);

  const groupedUpcoming = useMemo(
    () => groupByDay(upcoming.data ?? []),
    [upcoming.data],
  );

  return (
    <div className="mx-auto w-full max-w-[480px] px-4 py-6 sm:px-6 sm:py-10">
      <Card className="gap-5 p-4 sm:p-6">
        {/* Greeting row */}
        <div className="flex min-h-[60px] items-center justify-between gap-3">
          <h1 className="text-[28px] font-bold leading-none tracking-[-0.02em] text-text-primary">
            Good morning.
          </h1>
          {scanning ? (
            <Spinner label="Scanning…" />
          ) : lastScanLabel ? (
            <span className="caption-mono shrink-0 text-[13px] text-text-muted">
              Updated {lastScanLabel}
            </span>
          ) : null}
        </div>


        {showDegradedNotice && s ? (
          <WarningBadge>
            {s.latest?.status === "rate_limited"
              ? `Rate-limited. Showing ${s.lastScanAt ? athensLocalTime(new Date(s.lastScanAt)) : "earlier"}.`
              : `Could not refresh. Showing ${s.lastScanAt ? athensLocalTime(new Date(s.lastScanAt)) : "earlier"}.`}
          </WarningBadge>
        ) : null}

        {/* Market conditions — single line, expandable */}
        {conditions.summary ? (
          <button
            type="button"
            onClick={() => setConditionsOpen((v) => !v)}
            className="flex min-h-[44px] items-center justify-between gap-3 text-left"
          >
            <span className="text-[13px] text-text-secondary">
              {conditions.summary}
            </span>
            {conditions.bullets.length > 0 ? (
              <span className="caption-mono shrink-0 text-[11px] text-text-muted">
                {conditionsOpen ? "−" : "+"}
              </span>
            ) : null}
          </button>
        ) : null}
        {conditionsOpen && conditions.bullets.length > 0 ? (
          <ul className="flex flex-col gap-1.5 pl-3">
            {conditions.bullets.map((b) => (
              <li key={b} className="text-[13px] text-text-muted">
                · {b}
              </li>
            ))}
          </ul>
        ) : null}

        <Divider />

        {/* Today's signals */}
        <SectionLabel>Today's signals</SectionLabel>
        {showNoScanNotice ? (
          <p className="text-[15px] leading-relaxed text-text-muted">
            No scan has completed successfully today.{" "}
            {s?.latest?.status === "rate_limited"
              ? "Provider is rate-limiting — check back in a few minutes."
              : s?.latest?.status === "failed"
                ? "The last attempt failed — check back in a few minutes."
                : "One is starting automatically."}
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            <VerdictLink to="opportunity">
              <StatCard icon="🔥" value={counts.opportunity} label="Opportunities" emphasis="accent" />
            </VerdictLink>
            <VerdictLink to="trap">
              <StatCard icon="⚠" value={counts.trap} label="Traps" />
            </VerdictLink>
            <VerdictLink to="ignore">
              <StatCard icon="🚫" value={counts.ignore} label="Ignore" />
            </VerdictLink>
          </div>
        )}

        {s?.topEdge ? (
          <>
            <Divider />
            <SectionLabel>Top edge</SectionLabel>
            <MatchCard m={s.topEdge as never} />
          </>
        ) : null}


        {/* Coming up */}
        {groupedUpcoming.length > 0 ? (
          <>
            <Divider />
            <SectionLabel>Coming up</SectionLabel>
            <div className="flex flex-col gap-5">
              {groupedUpcoming.map((g) => (
                <div key={g.key} className="flex flex-col gap-2">
                  <p className="label-mono text-[11px]">
                    {g.label} · {g.rows.length} {g.rows.length === 1 ? "match" : "matches"}
                  </p>
                  <div className="flex flex-col gap-1">
                    {g.rows.map((m) => (
                      <UpcomingRow key={m.match_id} m={m} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : null}

        <Divider />

        {/* Diagnostics — collapsed */}
        <div>
          <button
            type="button"
            onClick={() => setDiagOpen((v) => !v)}
            className="caption-mono min-h-[44px] text-[11px] text-text-disabled hover:text-text-muted"
          >
            {diagOpen ? "− Diagnostics" : "+ Diagnostics"}
          </button>
          {diagOpen ? <Diagnostics summary={s} /> : null}
        </div>
      </Card>
    </div>
  );
}

function UpcomingRow({
  m,
}: {
  m: {
    match_id: string;
    home: string;
    away: string;
    kickoff: string | null;
    verdict: string;
    ev_percent: number | null;
    provisional?: boolean | null;
  };
}) {
  const time = m.kickoff ? athensLocalTime(new Date(m.kickoff)) : "—";
  return (
    <Link
      to="/match/$matchId"
      params={{ matchId: m.match_id }}
      className="flex min-h-[44px] items-center justify-between gap-3 rounded-[8px] px-2 py-2 hover:bg-card-inner"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="caption-mono w-10 shrink-0 text-[11px] text-text-muted">
          {time}
        </span>
        <span className="min-w-0 truncate text-[13px] text-text-primary">
          {m.home} · {m.away}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {m.provisional ? (
          <span className="caption-mono text-[10px] text-text-disabled">prov</span>
        ) : null}
        <span
          className={
            "caption-mono text-[11px] " +
            (m.verdict === "opportunity"
              ? "text-accent"
              : m.verdict === "trap"
                ? "text-accent-dim"
                : "text-text-muted")
          }
        >
          {m.ev_percent != null ? `${Number(m.ev_percent).toFixed(1)}%` : "—"}
        </span>
      </div>
    </Link>
  );
}

type UpcomingRowT = Awaited<ReturnType<typeof listUpcoming>>[number];

function groupByDay(rows: UpcomingRowT[]): Array<{
  key: string;
  label: string;
  rows: UpcomingRowT[];
}> {
  const today = athensLocalDate();
  const tomorrow = athensLocalDate(new Date(Date.now() + 86_400_000));
  const map = new Map<string, UpcomingRowT[]>();
  for (const r of rows) {
    if (!r.kickoff) continue;
    const d = athensLocalDate(new Date(r.kickoff));
    const arr = map.get(d) ?? [];
    arr.push(r);
    map.set(d, arr);
  }
  const keys = Array.from(map.keys()).sort();
  return keys.map((k) => {
    let label: string;
    if (k === today) label = "TODAY";
    else if (k === tomorrow) label = "TOMORROW";
    else
      label = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/Athens",
        weekday: "long",
      })
        .format(new Date(k + "T12:00:00Z"))
        .toUpperCase();
    return { key: k, label, rows: map.get(k)! };
  });
}

function Diagnostics({
  summary,
}: {
  summary: ReturnType<typeof useQuery<Awaited<ReturnType<typeof getTodayScanSummary>>>>["data"] | undefined;
}) {
  const latest = summary?.latest;
  const ss = latest?.stageStats as
    | { fetched?: number; afterStatus?: number; afterDate?: number; oddsOk?: number; oddsError?: number; scored?: number }
    | null
    | undefined;
  return (
    <div className="mt-2 flex flex-col gap-1 text-[11px] text-text-disabled">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="caption-mono text-[11px]">
          {latest
            ? `Last ${athensLocalTime(new Date(latest.scannedAt))} · ${latest.status}`
            : "No scan yet"}
        </span>
        <span className="caption-mono text-[11px]">
          {latest ? `${latest.fixturesCount} fx · ${latest.apiCalls} calls` : ""}
        </span>
      </div>
      {ss ? (
        <div className="caption-mono text-[11px]">
          fetched {ss.fetched ?? 0} → pending {ss.afterStatus ?? 0} → window {ss.afterDate ?? 0} → odds {ss.oddsOk ?? 0} (err {ss.oddsError ?? 0}) → scored {ss.scored ?? 0}
        </div>
      ) : null}
    </div>
  );
}

function VerdictLink({
  to,
  children,
}: {
  to: "opportunity" | "trap" | "ignore";
  children: React.ReactNode;
}) {
  return (
    <Link
      to="/matches"
      search={{ verdict: to }}
      className="flex transition-transform hover:-translate-y-0.5"
    >
      {children}
    </Link>
  );
}

export function VerdictChip({
  verdict,
}: {
  verdict: "opportunity" | "trap" | "ignore";
}) {
  const map = {
    opportunity: { label: "Opportunity", cls: "bg-accent/15 text-accent" },
    trap: { label: "Trap", cls: "bg-amber-500/10 text-accent-dim" },
    ignore: { label: "Ignore", cls: "bg-card text-text-muted" },
  } as const;
  const c = map[verdict];
  return (
    <span className={`caption-mono rounded px-2 py-0.5 ${c.cls}`}>{c.label}</span>
  );
}

function deriveConditions(
  market: { avgAbsEv: number | null; avgImplied: number | null; sampleSize: number } | undefined,
): { summary: string | null; bullets: string[] } {
  if (!market || market.sampleSize === 0) return { summary: null, bullets: [] };
  const bullets: string[] = [];
  let headline: string | null = null;
  if (market.avgAbsEv != null) {
    if (market.avgAbsEv < 2) {
      headline = "Thin edges today";
      bullets.push(`Avg |EV| ${market.avgAbsEv.toFixed(1)}% across ${market.sampleSize} matches`);
    } else if (market.avgAbsEv > 6) {
      headline = "High edge dispersion";
      bullets.push(`Avg |EV| ${market.avgAbsEv.toFixed(1)}% — bigger opportunities and traps`);
    }
  }
  if (market.avgImplied != null && market.avgImplied > 0.55) {
    bullets.push(`Chalky day — avg best pick priced at ${(market.avgImplied * 100).toFixed(0)}% implied`);
  }
  if (!headline && market.avgAbsEv != null) {
    headline = `Avg EV ${market.avgAbsEv.toFixed(1)}%`;
  }
  const summary =
    headline && market.avgAbsEv != null && !headline.startsWith("Avg")
      ? `${headline} · Avg EV ${market.avgAbsEv.toFixed(1)}%`
      : headline;
  return { summary, bullets };
}
