import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useSuspenseQuery } from "@tanstack/react-query";
import { z } from "zod";

import {
  Card,
  Divider,
  PageShell,
  SectionLabel,
} from "@/components/betlab/primitives";
import { listByVerdict } from "@/lib/scan/scan.functions";
import { VerdictChip } from "./index";

const SearchSchema = z.object({
  verdict: z.enum(["opportunity", "trap", "ignore"]).optional(),
});

export const Route = createFileRoute("/matches")({
  validateSearch: SearchSchema,
  head: () => ({
    meta: [
      { title: "Matches — Readside BetLab" },
      {
        name: "description",
        content: "Today's scanned matches filtered by verdict.",
      },
      { property: "og:title", content: "Matches — Readside BetLab" },
      {
        property: "og:description",
        content: "Today's scanned matches filtered by verdict.",
      },
    ],
  }),
  loaderDeps: ({ search }) => ({ verdict: search.verdict }),
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData({
      queryKey: ["matches", deps.verdict ?? "all"],
      queryFn: () => listByVerdict({ data: { verdict: deps.verdict } }),
    }),
  component: MatchesPage,
});

function MatchesPage() {
  const { verdict } = Route.useSearch() as { verdict?: "opportunity" | "trap" | "ignore" };
  const fn = useServerFn(listByVerdict);
  const { data } = useSuspenseQuery({
    queryKey: ["matches", verdict ?? "all"],
    queryFn: () => fn({ data: { verdict } }),
  });

  const title = verdict
    ? ({ opportunity: "Opportunities", trap: "Traps", ignore: "Ignore" } as const)[verdict]
    : "All matches";

  return (
    <PageShell>
      <Card>
        <div className="flex items-baseline justify-between">
          <h1 className="title-display">{title}</h1>
          <Link to="/" className="caption-mono text-text-muted hover:text-text-primary">
            ← briefing
          </Link>
        </div>
        <Divider />
        <SectionLabel>{data.length} matches</SectionLabel>
        {data.length === 0 ? (
          <p className="text-[14px] text-text-muted">
            No matches in this bucket for today.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {data.map((m) => (
              <Link
                key={m.match_id}
                to="/match/$matchId"
                params={{ matchId: m.match_id }}
                className="flex flex-col gap-2 rounded-[10px] bg-card-inner p-4 transition-colors hover:bg-card"
              >
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-[15px] font-semibold text-text-primary">
                    {m.home} · {m.away}
                  </span>
                  <VerdictChip verdict={m.verdict as "opportunity" | "trap" | "ignore"} />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-x-4 text-[12px] text-text-muted">
                  <span>
                    {m.competition ?? m.sport ?? "—"}
                  </span>
                  <span className="caption-mono">
                    EV {m.ev_percent != null ? `${Number(m.ev_percent).toFixed(1)}%` : "—"} ·
                    Value {Number(m.value_score).toFixed(0)} ·
                    Trap {Number(m.trap_score).toFixed(0)} ·
                    Ctx {Number(m.context_score).toFixed(1)}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </PageShell>
  );
}
