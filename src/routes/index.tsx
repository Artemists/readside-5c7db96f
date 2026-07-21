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
      { title: "Readside BetLab" },
      {
        name: "description",
        content:
          "Today's market conditions, signals and traps across football matches.",
      },
      { property: "og:title", content: "Readside BetLab" },
    ],
  }),
  component: MorningBriefing,
});

function MorningBriefing() {
  const { opportunities, traps, ignore } = getTodaySignals();
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
          <StatCard icon="🔥" value={opportunities} label="Opportunities" />
          <StatCard icon="⚠" value={traps} label="Traps" />
          <StatCard icon="🚫" value={ignore} label="Ignore" />
        </div>
      </Card>
    </PageShell>
  );
}

/** Deterministic per-local-day signal counts (Europe/Athens). */
function getTodaySignals() {
  const key = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Athens",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const rand = (min: number, max: number, salt: number) => {
    const x = Math.imul(h ^ salt, 2654435761) >>> 0;
    return min + (x % (max - min + 1));
  };
  return {
    opportunities: rand(2, 8, 1),
    traps: rand(1, 6, 2),
    ignore: rand(6, 16, 3),
  };
}
