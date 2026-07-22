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
import { SCAN } from "@/lib/scan/config";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Today's briefing — Readside BetLab" },
      {
        name: "description",
        content:
          "Live scan of today's football, basketball and tennis fixtures with Opportunity, Trap and Ignore verdicts.",
      },
      { property: "og:title", content: "Today's briefing — Readside BetLab" },
      {
        property: "og:description",
        content:
          "Live scan of today's football, basketball and tennis fixtures with Opportunity, Trap and Ignore verdicts.",
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scan-summary"] });
      router.invalidate();
    },
    onError: (err) => {
      console.error(err);
      toast.error("Δεν ήταν δυνατή η εκτέλεση σάρωσης");
    },
  });

  // Auto-run once on first mount if data is missing/stale.
  const autoRan = useRef(false);
  useEffect(() => {
    if (autoRan.current) return;
    const s = summary.data;
    if (!s) return;
    autoRan.current = true;
    const stale =
      !s.lastScanAt ||
      Date.now() - new Date(s.lastScanAt).getTime() > SCAN.staleAfterMinutes * 60_000;
    if (stale) scan.mutate(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary.data?.lastScanAt]);

  const s = summary.data;
  const counts = s?.counts ?? { opportunity: 0, trap: 0, ignore: 0 };
  const conditions = deriveConditions(s?.market);
  const scanning = scan.isPending;
  const lastScanLabel = s?.lastScanAt
    ? `Last scan: ${athensLocalTime(new Date(s.lastScanAt))}`
    : "No scan yet today";

  return (
    <PageShell>
      <Card>
        <div className="flex items-start justify-between gap-4">
          <h1 className="title-display">Good morning.</h1>
          <button
            type="button"
            onClick={() => scan.mutate(true)}
            disabled={scanning}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-card-inner px-4 py-2 text-[13px] font-medium text-text-secondary transition-colors hover:text-text-primary disabled:opacity-60"
          >
            {scanning ? <Spinner label="Scanning…" /> : "Rescan"}
          </button>
        </div>

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
            Not enough data yet — run a scan.
          </p>
        )}

        <Divider />

        <SectionLabel>Today's signals</SectionLabel>
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

        <div className="flex items-center justify-between pt-2 text-[11px] text-text-disabled">
          <span className="caption-mono">{lastScanLabel}</span>
          <span className="caption-mono">
            {s?.fixturesCount ?? 0} fixtures scanned
          </span>
        </div>
      </Card>
    </PageShell>
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
