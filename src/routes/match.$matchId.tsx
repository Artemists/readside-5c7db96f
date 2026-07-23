import { createFileRoute, Link, notFound, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useSuspenseQuery } from "@tanstack/react-query";

import {
  Card,
  Divider,
  KeyValueRow,
  PageShell,
  SectionLabel,
  StatBar,
} from "@/components/betlab/primitives";
import { getMatchSignals } from "@/lib/scan/scan.functions";
import { VerdictChip } from "./index";

export const Route = createFileRoute("/match/$matchId")({
  head: () => ({
    meta: [
      { title: "Match analysis — Readside BetLab" },
      {
        name: "description",
        content: "Four-score breakdown, odds and reasoning for a single match.",
      },
      { property: "og:title", content: "Match analysis — Readside BetLab" },
      {
        property: "og:description",
        content: "Four-score breakdown, odds and reasoning for a single match.",
      },
    ],
  }),
  loader: async ({ context, params }) => {
    const row = await context.queryClient.ensureQueryData({
      queryKey: ["match-signals", params.matchId],
      queryFn: () => getMatchSignals({ data: { matchId: params.matchId } }),
    });
    if (!row) throw notFound();
    return row;
  },
  component: MatchDetail,
  errorComponent: MatchErr,
  notFoundComponent: MatchMissing,
});

function MatchDetail() {
  const { matchId } = Route.useParams();
  const fn = useServerFn(getMatchSignals);
  const { data } = useSuspenseQuery({
    queryKey: ["match-signals", matchId],
    queryFn: () => fn({ data: { matchId } }),
  });
  if (!data) return null;

  const bestOdds = data.best_odds != null ? Number(data.best_odds) : null;
  const fair = data.fair_probability != null ? Number(data.fair_probability) : null;
  const implied = data.implied_probability != null ? Number(data.implied_probability) : null;
  const edge = data.edge_percent != null ? Number(data.edge_percent) : null;
  const ev = data.ev_percent != null ? Number(data.ev_percent) : null;

  return (
    <PageShell>
      <Card>
        <div className="flex items-baseline justify-between gap-4">
          <div className="flex flex-col gap-1">
            <span className="caption-mono text-text-muted">
              {data.competition ?? data.sport}
            </span>
            <h1 className="title-display">
              {data.home} · {data.away}
            </h1>
          </div>
          <VerdictChip verdict={data.verdict as "opportunity" | "trap" | "ignore"} />
        </div>

        <Divider />

        <SectionLabel>Four-score breakdown</SectionLabel>
        <div className="flex flex-col gap-3">
          <ScoreRow
            label="Context"
            value={Number(data.context_score)}
            max={10}
            hint="Information edge — markets, bookmakers, tier."
          />
          <ScoreRow
            label="Explosion"
            value={Number(data.explosion_score)}
            hint="Likelihood of a high-scoring / volatile game."
          />
          <ScoreRow
            label="Value"
            value={Number(data.value_score)}
            hint="Model vs market. 50 neutral, >60 positive edge."
          />
          <ScoreRow
            label="Trap"
            value={Number(data.trap_score)}
            hint="Public pressure and overpriced favourites."
          />
        </div>

        <Divider />

        {(() => {
          const isIgnore = data.verdict === "ignore";
          const isPass = data.stake === "Pass";
          return (
            <>
              <SectionLabel>
                {isIgnore ? "Best available selection (not advised)" : "Recommendation"}
              </SectionLabel>
              {isIgnore ? (
                <p className="caption-mono text-text-muted">
                  This match did not clear the model's thresholds. The selection
                  below is shown for transparency only — do not treat it as a pick.
                </p>
              ) : null}
              <div className={`flex flex-col gap-2 ${isIgnore ? "opacity-70" : ""}`}>
                <KeyValueRow k="Market" v={data.recommended_market ?? "—"} />
                <KeyValueRow k="Selection" v={data.recommended_selection ?? "—"} />
                <KeyValueRow k="Best odds" v={bestOdds != null ? bestOdds.toFixed(2) : "—"} />
                <KeyValueRow
                  k="Fair probability"
                  v={fair != null ? `${(fair * 100).toFixed(1)}%` : "—"}
                />
                <KeyValueRow
                  k="Implied probability"
                  v={implied != null ? `${(implied * 100).toFixed(1)}%` : "—"}
                />
                <KeyValueRow k="Edge" v={edge != null ? `${edge.toFixed(1)}%` : "—"} />
                <KeyValueRow k="Expected value" v={ev != null ? `${ev.toFixed(1)}%` : "—"} />
                {isPass ? (
                  <KeyValueRow
                    k="Confidence in read"
                    v={`${Number(data.confidence).toFixed(1)} / 10 · not a bet endorsement`}
                  />
                ) : (
                  <KeyValueRow k="Confidence" v={`${Number(data.confidence).toFixed(1)} / 10`} />
                )}
                <KeyValueRow
                  k="Stake"
                  v={<span className={data.stake === "Small" ? "text-accent" : "text-text-muted"}>{data.stake}</span>}
                />
              </div>
            </>
          );
        })()}

        <Divider />

        <SectionLabel>Reasoning</SectionLabel>
        <p className="body-sans text-text-secondary">{data.reasoning}</p>
        <p className="caption-mono text-text-disabled">
          Verdict is a model output, not a certainty. Use your own judgement.
        </p>

        <div className="pt-2">
          <Link to="/" className="caption-mono text-text-muted hover:text-text-primary">
            ← briefing
          </Link>
        </div>
      </Card>
    </PageShell>
  );
}

function ScoreRow({
  label,
  value,
  max = 100,
  hint,
}: {
  label: string;
  value: number;
  max?: number;
  hint: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <StatBar label={label} value={Math.round(value)} max={max} />
      <span className="caption-mono pl-20 text-text-disabled">{hint}</span>
    </div>
  );
}

function MatchMissing() {
  return (
    <PageShell>
      <Card>
        <h1 className="title-display">Match not found</h1>
        <p className="body-sans">
          This match isn't in today's scan. It may have been dropped by the
          bookmaker feed or scanned on a different day.
        </p>
        <Link to="/" className="caption-mono text-accent">← briefing</Link>
      </Card>
    </PageShell>
  );
}

function MatchErr({ reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <PageShell>
      <Card>
        <h1 className="title-display">Δεν ήταν δυνατή η φόρτωση</h1>
        <button
          onClick={() => { router.invalidate(); reset(); }}
          className="self-start rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground"
        >
          Δοκίμασε ξανά
        </button>
      </Card>
    </PageShell>
  );
}
