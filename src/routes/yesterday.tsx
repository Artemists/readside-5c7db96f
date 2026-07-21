import { createFileRoute } from "@tanstack/react-router";

import {
  Card,
  Divider,
  PageShell,
  SectionLabel,
} from "@/components/betlab/primitives";

export const Route = createFileRoute("/yesterday")({
  head: () => ({
    meta: [
      { title: "Yesterday's Analysis — BetLab" },
      {
        name: "description",
        content: "How yesterday's BetLab signals performed against the market.",
      },
      { property: "og:title", content: "Yesterday's Analysis — BetLab" },
    ],
  }),
  component: Yesterday,
});

function Yesterday() {
  return (
    <PageShell>
      <Card>
        <h1 className="title-display">Yesterday's Analysis</h1>
        <Divider />
        <SectionLabel>What we called</SectionLabel>
        <p className="subtitle-display">🔥 6 goal opportunities</p>
        <Divider />
        <SectionLabel>Result</SectionLabel>
        <p className="value-display">4/6</p>
        <p className="text-[15px] text-text-secondary">matched expectation</p>
        <Divider />
        <SectionLabel>Insight</SectionLabel>
        <p className="text-[15px] text-text-secondary">
          High tempo + defensive injuries was a strong signal.
        </p>
      </Card>
    </PageShell>
  );
}
