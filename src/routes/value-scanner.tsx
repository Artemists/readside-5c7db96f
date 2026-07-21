import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import {
  Card,
  Divider,
  PageShell,
  SectionLabel,
  Spinner,
} from "@/components/betlab/primitives";
import { WC26_MATCHES, type Match } from "@/lib/matches";
import { betLabAssessment } from "@/lib/nine-signal";
import { useNovibetOdds } from "@/hooks/use-odds";
import {
  edgePercent,
  expectedValue,
  formatOdds,
  formatPct,
  impliedProbability,
} from "@/lib/value";
import { el } from "@/lib/i18n";

export const Route = createFileRoute("/value-scanner")({
  head: () => ({
    meta: [
      { title: "Value Scanner — BetLab" },
      {
        name: "description",
        content:
          "Compare live Novibet odds against BetLab's fair probability. Edge %, EV and implied probability per market.",
      },
      { property: "og:title", content: "Value Scanner — BetLab" },
    ],
  }),
  component: ValueScanner,
});

function ValueScanner() {
  return (
    <PageShell>
      <Card>
        <h1 className="title-display">Value Scanner</h1>
        <p className="body-sans">
          Live Novibet odds vs BetLab's 9-signal fair probability. Positive edge
          means the offered price beats the model.
        </p>
        <Divider />
        <SectionLabel>Fixtures</SectionLabel>
        <div className="flex flex-col divide-y divide-border rounded-lg bg-card-inner">
          {WC26_MATCHES.map((m) => (
            <ValueRow key={m.id} match={m} />
          ))}
        </div>
      </Card>
    </PageShell>
  );
}

function ValueRow({ match }: { match: Match }) {
  const [expanded, setExpanded] = useState(false);
  const novibet = useNovibetOdds(
    { matchId: match.id, homeTeam: match.home, awayTeam: match.away },
    expanded,
  );

  const assessment = betLabAssessment(match.id);
  const fair = assessment.fairProbability;

  const view = useMemo(() => {
    if (novibet.data?.status === "ok") {
      return {
        home: novibet.data.home,
        draw: novibet.data.draw,
        away: novibet.data.away,
      };
    }
    return null;
  }, [novibet.data, fallback.data]);

  return (
    <div className="p-5">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between text-left"
      >
        <div>
          <p className="subtitle-display">
            {match.home} <span className="text-text-muted">vs</span> {match.away}
          </p>
          <p className="caption-mono">
            {match.competition} · {new Date(match.kickoff).toUTCString()}
          </p>
        </div>
        <span className="text-text-muted">{expanded ? "−" : "+"}</span>
      </button>

      {expanded ? (
        <div className="mt-5">
          {novibet.isLoading ? (
            <Spinner label={el.loadingOdds} />
          ) : view ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <SectionLabel>
                  {view.source === "novibet" ? "Novibet odds" : "Market average"}
                </SectionLabel>
                {view.source === "consensus" ? <MatchAverageTag /> : null}
              </div>
              <div className="grid grid-cols-3 gap-3">
                <OutcomeCard
                  name={match.home}
                  odds={view.home}
                  fair={fair}
                />
                {view.draw != null ? (
                  <OutcomeCard name="Draw" odds={view.draw} fair={1 - fair - 0.3} />
                ) : (
                  <div />
                )}
                <OutcomeCard
                  name={match.away}
                  odds={view.away}
                  fair={1 - fair - (view.draw != null ? 0.3 : 0)}
                />
              </div>
            </div>
          ) : (
            <p className="caption-mono">Δεν υπάρχουν διαθέσιμες αποδόσεις.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

function OutcomeCard({
  name,
  odds,
  fair,
}: {
  name: string;
  odds: number | null;
  fair: number;
}) {
  if (odds == null) {
    return (
      <div className="rounded-md bg-card p-4">
        <p className="caption-mono">{name}</p>
        <p className="value-display">—</p>
      </div>
    );
  }
  const implied = impliedProbability(odds) * 100;
  const edge = edgePercent(fair, odds);
  const ev = expectedValue(fair, odds);
  const positive = edge > 0;

  return (
    <div className="rounded-md bg-card p-4">
      <p className="caption-mono">{name}</p>
      <p className="value-display">{formatOdds(odds)}</p>
      <div className="mt-2 flex flex-col gap-1 text-[13px]">
        <div className="flex justify-between text-text-muted">
          <span>Implied</span>
          <span>{formatPct(implied)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-muted">Edge</span>
          <span
            className={positive ? "font-semibold text-accent" : "text-text-secondary"}
          >
            {edge >= 0 ? "+" : ""}
            {edge.toFixed(1)}%
          </span>
        </div>
        <div className="flex justify-between text-text-muted">
          <span>EV / 1u</span>
          <span>{ev.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}
