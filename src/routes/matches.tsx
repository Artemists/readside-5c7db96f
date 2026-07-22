import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useSuspenseQuery } from "@tanstack/react-query";
import { z } from "zod";

import { MatchCard } from "@/components/betlab/MatchCard";
import { listByVerdict } from "@/lib/scan/scan.functions";

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
        content: "Scanned matches with plain-language decisions and confidence.",
      },
      { property: "og:title", content: "Matches — Readside BetLab" },
      {
        property: "og:description",
        content: "Scanned matches with plain-language decisions and confidence.",
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
  const { verdict } = Route.useSearch() as {
    verdict?: "opportunity" | "trap" | "ignore";
  };
  const fn = useServerFn(listByVerdict);
  const { data } = useSuspenseQuery({
    queryKey: ["matches", verdict ?? "all"],
    queryFn: () => fn({ data: { verdict } }),
  });

  const title = verdict
    ? ({ opportunity: "Opportunities", trap: "Traps", ignore: "Ignore" } as const)[
        verdict
      ]
    : "All matches";

  return (
    <div className="mx-auto w-full max-w-[480px] px-4 py-6 sm:px-6 sm:py-10">
      <div className="mb-5 flex items-baseline justify-between">
        <h1 className="text-[24px] font-bold tracking-[-0.02em] text-text-primary">
          {title}
        </h1>
        <Link
          to="/"
          className="caption-mono text-[11px] text-text-muted hover:text-text-primary"
        >
          ← briefing
        </Link>
      </div>
      <p className="label-mono mb-3 text-[11px]">
        {data.length} {data.length === 1 ? "match" : "matches"}
      </p>
      {data.length === 0 ? (
        <p className="text-[14px] text-text-muted">
          No matches in this bucket right now.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {data.map((m) => (
            <MatchCard key={m.match_id} m={m} />
          ))}
        </div>
      )}
    </div>
  );
}
