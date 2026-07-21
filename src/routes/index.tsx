import { createFileRoute } from "@tanstack/react-router";

import {
  Bullet,
  Card,
  Divider,
  PageShell,
  SectionLabel,
  StatCard,
  WarningBadge,
} from "@/components/betlab/primitives";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Morning Briefing — BetLab" },
      {
        name: "description",
        content:
          "Today's market conditions, signals and traps across football matches.",
      },
      { property: "og:title", content: "Morning Briefing — BetLab" },
    ],
  }),
  component: MorningBriefing,
});

function MorningBriefing() {
  return (
    <PageShell>
      <Card>
        <h1 className="title-display">Good morning.</h1>
        <Divider />
        <SectionLabel>Today's market conditions</SectionLabel>
        <WarningBadge>High uncertainty day</WarningBadge>
        <div className="flex flex-col gap-4">
          <Bullet>Several key teams have rotation risk</Bullet>
          <Bullet>Many favorites are overpriced</Bullet>
          <Bullet>Goal markets look stronger than winner markets</Bullet>
        </div>
        <Divider />
        <SectionLabel>Today's signals</SectionLabel>
        <div className="flex gap-3">
          <StatCard icon="🔥" value={5} label="Opportunities" />
          <StatCard icon="⚠" value={4} label="Traps" />
          <StatCard icon="🚫" value={12} label="Ignore" />
        </div>
      </Card>
    </PageShell>
  );
}
