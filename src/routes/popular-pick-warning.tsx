import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import {
  Bullet,
  Card,
  Divider,
  PageShell,
  SectionLabel,
  Spinner,
} from "@/components/betlab/primitives";
import { WC26_MATCHES } from "@/lib/matches";
import { betLabAssessment } from "@/lib/nine-signal";
import { useConsensusOdds } from "@/hooks/use-odds";
import { el } from "@/lib/i18n";

export const Route = createFileRoute("/popular-pick-warning")({
  head: () => ({
    meta: [
      { title: "Popular Pick Warning — BetLab" },
      {
        name: "description",
        content:
          "When the crowd is overconfident: BetLab's contrarian check on popular picks.",
      },
      { property: "og:title", content: "Popular Pick Warning — BetLab" },
    ],
  }),
  component: PopularPickWarning,
});

function PopularPickWarning() {
  const [matchId, setMatchId] = useState(WC26_MATCHES[0].id);
  const match = useMemo(
    () => WC26_MATCHES.find((m) => m.id === matchId)!,
    [matchId],
  );

  const consensus = useConsensusOdds({
    matchId: match.id,
    homeTeam: match.home,
    awayTeam: match.away,
  });

  const assessment = betLabAssessment(match.id);

  const publicConfidence = derivePublicConfidence(consensus.data);
  const verdict =
    publicConfidence != null && publicConfidence - assessment.assessmentPercent > 15
      ? "Proceed carefully · Consider alternatives"
      : "Signal roughly in line with the market";

  return (
    <PageShell>
      <Card>
        <div className="flex items-center gap-3">
          <span className="text-[36px] leading-none">⚠</span>
          <h1 className="title-display">Popular Pick Warning</h1>
        </div>

        <MatchPicker matchId={matchId} onChange={setMatchId} />

        <p className="subtitle-display">
          {match.home} vs {match.away}
        </p>

        <Divider />

        <SectionLabel>The signal</SectionLabel>

        <div className="flex flex-col gap-5">
          <StatBlock
            label={el.publicConfidence}
            value={
              consensus.isLoading ? (
                <Spinner label={el.loadingOdds} />
              ) : publicConfidence != null ? (
                `${publicConfidence.toFixed(0)}%`
              ) : (
                "—"
              )
            }
            hint={publicConfidenceSource(consensus.data)}
          />
          <StatBlock
            label={el.betLabAssessment}
            value={`${assessment.assessmentPercent}%`}
            hint="9-signal model"
          />
        </div>

        <Divider />

        <SectionLabel>Why</SectionLabel>
        <div className="flex flex-col gap-4">
          <Bullet>Crowd sentiment is pricing in the favourite heavily</Bullet>
          <Bullet>Model sees a wider spread between fair and offered odds</Bullet>
          <Bullet>Line movement disagrees with public %</Bullet>
        </div>

        <Divider />
        <SectionLabel>Verdict</SectionLabel>
        <p className="text-[15px] font-medium text-text-primary">{verdict}</p>
      </Card>
    </PageShell>
  );
}

function StatBlock({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg bg-card-inner p-5">
      <span className="text-[14px] text-text-muted">{label}</span>
      <div className="value-display">{value}</div>
      {hint ? <span className="caption-mono">{hint}</span> : null}
    </div>
  );
}

function MatchPicker({
  matchId,
  onChange,
}: {
  matchId: string;
  onChange: (id: string) => void;
}) {
  return (
    <select
      value={matchId}
      onChange={(e) => onChange(e.target.value)}
      className="w-fit rounded-md border border-border bg-card-inner px-3 py-2 text-[14px] text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
    >
      {WC26_MATCHES.map((m) => (
        <option key={m.id} value={m.id}>
          {m.home} vs {m.away}
        </option>
      ))}
    </select>
  );
}

function derivePublicConfidence(
  data: ReturnType<typeof useConsensusOdds>["data"],
): number | null {
  if (!data) return null;
  // Prefer Kalshi/Polymarket implied probability for the home outcome.
  if (data.kalshi != null) return data.kalshi * 100;
  if (data.polymarket != null) return data.polymarket * 100;
  // Fall back to inverse of consensus odds.
  const h = data.consensus.home;
  if (h && h > 1) return (1 / h) * 100;
  return null;
}

function publicConfidenceSource(
  data: ReturnType<typeof useConsensusOdds>["data"],
): string {
  if (!data) return "";
  if (data.kalshi != null) return "Kalshi";
  if (data.polymarket != null) return "Polymarket";
  if (data.bookmakerCount) return `Consensus · ${data.bookmakerCount} books`;
  return "—";
}
