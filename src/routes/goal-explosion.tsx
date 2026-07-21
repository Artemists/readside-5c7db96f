import { createFileRoute } from "@tanstack/react-router";

import {
  Bullet,
  Card,
  Divider,
  PageShell,
  Pill,
  SectionLabel,
} from "@/components/betlab/primitives";

export const Route = createFileRoute("/goal-explosion")({
  head: () => ({
    meta: [
      { title: "Goal Explosion — BetLab" },
      {
        name: "description",
        content:
          "High-scoring signal for Man City vs Chelsea with BTTS and Over 2.5 recommended markets.",
      },
      { property: "og:title", content: "Goal Explosion — BetLab" },
    ],
  }),
  component: GoalExplosion,
});

function GoalExplosion() {
  return (
    <PageShell>
      <Card>
        <div className="flex items-center gap-3">
          <span className="text-[36px] leading-none">🔥</span>
          <h1 className="title-display">Goal Explosion</h1>
        </div>
        <p className="subtitle-display">Man City vs Chelsea</p>
        <Divider />
        <SectionLabel>Goal probability</SectionLabel>
        <p className="value-display">87/100</p>
        <Divider />
        <SectionLabel>Markets</SectionLabel>
        <div className="flex gap-2">
          <Pill>BTTS</Pill>
          <Pill>Over 2.5</Pill>
        </div>
        <Divider />
        <SectionLabel>Confidence</SectionLabel>
        <p className="value-display">7.5/10</p>
        <Divider />
        <SectionLabel>Why</SectionLabel>
        <div className="flex flex-col gap-4">
          <Bullet>Both teams pressing high with elevated xG in recent fixtures</Bullet>
          <Bullet>Defensive absences on both sides increase chance conversion</Bullet>
          <Bullet>Head-to-head trending over the last 5 encounters</Bullet>
        </div>
        <SectionLabel>Risk</SectionLabel>
        <Bullet>Chelsea rotation unknown</Bullet>
      </Card>
    </PageShell>
  );
}
