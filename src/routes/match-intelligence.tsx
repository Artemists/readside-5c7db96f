import { createFileRoute } from "@tanstack/react-router";

import {
  Card,
  Divider,
  KeyValueRow,
  PageShell,
  SectionLabel,
  StatBar,
} from "@/components/betlab/primitives";

export const Route = createFileRoute("/match-intelligence")({
  head: () => ({
    meta: [
      { title: "Match Intelligence — BetLab" },
      {
        name: "description",
        content:
          "The reasoning behind BetLab picks: form, injuries, tempo, and market fit.",
      },
      { property: "og:title", content: "Match Intelligence — BetLab" },
    ],
  }),
  component: MatchIntel,
});

function MatchIntel() {
  return (
    <PageShell>
      <Card>
        <h1 className="title-display">Match Intelligence</h1>
        <SectionLabel>Signal</SectionLabel>
        <div className="flex flex-col gap-4">
          <KeyValueRow k="Match" v="Man City vs Chelsea" />
          <KeyValueRow k="League" v="Premier League" />
          <KeyValueRow k="Kickoff" v="Sat 17:30" />
          <KeyValueRow k="Model confidence" v="7.5 / 10" />
        </div>
        <Divider />
        <SectionLabel>Team form</SectionLabel>
        <div className="flex flex-col gap-4">
          <StatBar label="Attack" value={82} />
          <StatBar label="Defense" value={40} />
          <StatBar label="Tempo" value={90} />
        </div>
        <Divider />
        <SectionLabel>Recommended</SectionLabel>
        <p className="subtitle-display">Interesting</p>
        <div className="flex flex-col gap-3 text-[15px] text-text-secondary">
          <p className="flex items-center gap-2">
            <span className="text-accent">✓</span> BTTS
          </p>
          <p className="flex items-center gap-2">
            <span className="text-accent">✓</span> Over 2.5
          </p>
        </div>
        <p className="subtitle-display mt-2">Avoid</p>
        <p className="flex items-center gap-2 text-[15px] text-text-secondary">
          <span className="text-destructive">✕</span> Man City win @1.35
        </p>
        <p className="text-[15px] text-text-muted">
          High probability does not equal value.
        </p>
      </Card>
    </PageShell>
  );
}
