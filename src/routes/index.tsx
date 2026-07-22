import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

import {
  Bullet,
  Card,
  Divider,
  PageShell,
  SectionLabel,
  Spinner,
  StatCard,
  WarningBadge,
} from "@/components/betlab/primitives";
import {
  getTodayScanSummary,
  runDailyScan,
} from "@/lib/scan/scan.functions";
import { athensLocalTime } from "@/lib/time";


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
    context.queryClient.ensureQueryData({
      queryKey: ["scan-summary"],
      queryFn: () => getTodayScanSummary(),
    }),
  component: MorningBriefing,
});

function MorningBriefing() {
  const qc = useQueryClient();
  const router = useRouter();
  const runScan = useServerFn(runDailyScan);
  const fetchSummary = useServerFn(getTodayScanSummary);

  const summary = useQuery({
    queryKey: ["scan-summary"],
    queryFn: () => fetchSummary(),
    staleTime: 60_000,
  });

  const scan = useMutation({
    mutationFn: (force: boolean) => runScan({ data: { force } }),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["scan-summary"] });
      router.invalidate();
      if (result?.rateLimited) {
        const next = result.nextAvailableAt
          ? athensLocalTime(new Date(result.nextAvailableAt))
          : "later";
        toast.message(`Rate-limited. Next scan available at ${next}.`);
      }
    },
    onError: (err) => {
      console.error(err);
      toast.error("Δεν ήταν δυνατή η εκτέλεση σάρωσης");
    },
  });

  // Auto-run once on first load if — and only if — today has no
  // successful scan yet. Never triggered by opening or navigating otherwise.
  const autoRan = useRef(false);
  useEffect(() => {
    if (autoRan.current) return;
    const s = summary.data;
    if (!s) return;
    autoRan.current = true;
    if (!s.hasSuccessfulScan) scan.mutate(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary.data?.hasSuccessfulScan]);


  const s = summary.data;
  const counts = s?.counts ?? { opportunity: 0, trap: 0, ignore: 0 };
  const conditions = deriveConditions(s?.market);
  const scanning = scan.isPending;

  const nextForceAt = s?.nextForceAvailableAt ? new Date(s.nextForceAvailableAt) : null;
  const forceBlocked = !!nextForceAt && nextForceAt.getTime() > Date.now();
  const rescanLabel = scanning
    ? null
    : forceBlocked && nextForceAt
      ? `Next scan at ${athensLocalTime(nextForceAt)}`
      : "Rescan";

  const showDegradedNotice = !!s?.degraded && !!s?.hasSuccessfulScan;
  const showNoScanNotice = !s?.hasSuccessfulScan;

  return (
    <PageShell>
      <Card>
        <div className="flex items-start justify-between gap-4">
          <h1 className="title-display">Good morning.</h1>
          <button
            type="button"
            onClick={() => scan.mutate(true)}
            disabled={scanning || forceBlocked}
            title={forceBlocked && nextForceAt ? `Next scan available at ${athensLocalTime(nextForceAt)}` : undefined}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-card-inner px-4 py-2 text-[13px] font-medium text-text-secondary transition-colors hover:text-text-primary disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {scanning ? <Spinner label="Scanning…" /> : rescanLabel}
          </button>
        </div>

        {showDegradedNotice && s ? (
          <WarningBadge>
            {s.latest?.status === "rate_limited"
              ? `Rate-limited by odds provider. Showing results from ${s.lastScanAt ? athensLocalTime(new Date(s.lastScanAt)) : "earlier"}. Could not refresh.`
              : `Could not refresh scan. Showing results from ${s.lastScanAt ? athensLocalTime(new Date(s.lastScanAt)) : "earlier"}.`}
          </WarningBadge>
        ) : null}

        <Divider />

        <SectionLabel>Today's market conditions</SectionLabel>
        {conditions.badge ? <WarningBadge>{conditions.badge}</WarningBadge> : null}
        {conditions.bullets.length > 0 ? (
          <div className="flex flex-col gap-4">
            {conditions.bullets.map((b) => (
              <Bullet key={b}>{b}</Bullet>
            ))}
          </div>
        ) : (
          <p className="text-[14px] text-text-muted">
            {showNoScanNotice
              ? "No successful scan yet today."
              : "Not enough data yet — run a scan."}
          </p>
        )}

        <Divider />

        <SectionLabel>Today's signals</SectionLabel>
        {showNoScanNotice ? (
          <p className="text-[14px] text-text-muted">
            No scan has completed successfully today. {s?.latest?.status === "rate_limited"
              ? "The odds provider is rate-limiting requests — try again later."
              : s?.latest?.status === "failed"
                ? "The last attempt failed — try again in a few minutes."
                : "Tap Rescan to start one."}
          </p>
        ) : (
          <div className="flex gap-3">
            <VerdictLink to="opportunity">
              <StatCard icon="🔥" value={counts.opportunity} label="Opportunities" />
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
            <SectionLabel>Top edge preview</SectionLabel>
            <Link
              to="/match/$matchId"
              params={{ matchId: s.topEdge.match_id }}
              className="flex flex-col gap-2 rounded-[10px] bg-card-inner p-5 transition-colors hover:bg-card"
            >
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-[16px] font-semibold text-text-primary">
                  {s.topEdge.home} · {s.topEdge.away}
                </span>
                <span className="value-display text-accent">
                  {s.topEdge.ev_percent != null
                    ? `${Number(s.topEdge.ev_percent).toFixed(1)}%`
                    : "—"}
                </span>
              </div>
              <div className="flex items-center justify-between text-[13px] text-text-muted">
                <span>
                  {s.topEdge.recommended_market ?? "Moneyline"} · {s.topEdge.recommended_selection ?? "—"}
                  {s.topEdge.best_odds != null ? ` @ ${Number(s.topEdge.best_odds).toFixed(2)}` : ""}
                </span>
                <VerdictChip verdict="opportunity" />
              </div>
            </Link>
          </>
        ) : null}

        <Divider />
        <Diagnostics summary={s} />
      </Card>
    </PageShell>
  );
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
    <div className="flex flex-col gap-1 text-[11px] text-text-disabled">
      <div className="flex items-center justify-between">
        <span className="caption-mono">
          {latest
            ? `Last attempt ${athensLocalTime(new Date(latest.scannedAt))} · ${latest.status}`
            : "No scan yet today"}
        </span>
        <span className="caption-mono">
          {latest ? `${latest.fixturesCount} fixtures · ${latest.apiCalls} API calls` : ""}
        </span>
      </div>
      {ss ? (
        <div className="caption-mono">
          Pipeline: fetched {ss.fetched ?? 0} → pending {ss.afterStatus ?? 0} → today {ss.afterDate ?? 0} → odds ok {ss.oddsOk ?? 0} (err {ss.oddsError ?? 0}) → scored {ss.scored ?? 0}
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
      className="flex flex-1 transition-transform hover:-translate-y-0.5"
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
) {
  if (!market || market.sampleSize === 0) return { badge: null, bullets: [] as string[] };
  const bullets: string[] = [];
  let badge: string | null = null;
  if (market.avgAbsEv != null) {
    if (market.avgAbsEv < 2) {
      badge = "Thin edges today";
      bullets.push(`Average absolute EV only ${market.avgAbsEv.toFixed(1)}% across ${market.sampleSize} matches`);
    } else if (market.avgAbsEv > 6) {
      badge = "High edge dispersion";
      bullets.push(`Average absolute EV ${market.avgAbsEv.toFixed(1)}% — bigger opportunities and bigger traps`);
    }
  }
  if (market.avgImplied != null && market.avgImplied > 0.55) {
    bullets.push(`Chalky day — average best selection is priced as a favourite (${(market.avgImplied * 100).toFixed(0)}% implied)`);
  }
  return { badge, bullets };
}
