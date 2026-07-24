import { createFileRoute, Link, notFound, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";

import {
  Card,
  Divider,
  KeyValueRow,
  PageShell,
  SectionLabel,
  StatBar,
} from "@/components/betlab/primitives";
import { getMatchSignals } from "@/lib/scan/scan.functions";
import { decisionPhrase, type MatchCardData } from "@/components/betlab/MatchCard";
import { VerdictChip } from "./index";

export const Route = createFileRoute("/match/$matchId")({
  head: () => ({
    meta: [
      { title: "Match analysis — Readside BetLab" },
      {
        name: "description",
        content: "Plain-English verdict, price check and full breakdown for one match.",
      },
      { property: "og:title", content: "Match analysis — Readside BetLab" },
      {
        property: "og:description",
        content: "Plain-English verdict, price check and full breakdown for one match.",
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

function confidenceWord(c: number): "Low" | "Medium" | "High" {
  if (c <= 4) return "Low";
  if (c <= 7) return "Medium";
  return "High";
}

function MatchDetail() {
  const { matchId } = Route.useParams();
  const fn = useServerFn(getMatchSignals);
  const { data } = useSuspenseQuery({
    queryKey: ["match-signals", matchId],
    queryFn: () => fn({ data: { matchId } }),
  });
  const [open, setOpen] = useState(false);
  if (!data) return null;

  const bestOdds = data.best_odds != null ? Number(data.best_odds) : null;
  const fair = data.fair_probability != null ? Number(data.fair_probability) : null;
  const implied = data.implied_probability != null ? Number(data.implied_probability) : null;
  const edge = data.edge_percent != null ? Number(data.edge_percent) : null;
  const confidence = Number(data.confidence);
  const isIgnore = data.verdict === "ignore";
  const isTrap = data.verdict === "trap";
  const isPass = data.stake === "Pass";
  const dq =
    (data.signals as { value?: { audit?: { dataQuality?: string | null } } } | null)
      ?.value?.audit?.dataQuality ?? null;
  const thinData = dq === "single_book" || dq === "model_single_book";
  const modelPriced = dq === "model" || dq === "model_single_book";

  // Reuse the same plain-English phrasing the card uses. "away" → team name.
  const decision = decisionPhrase(data as unknown as MatchCardData);

  // Headline line for The Answer block.
  const answerLine =
    isIgnore || isTrap
      ? "No bet"
      : bestOdds != null
        ? `${decision} at ${bestOdds.toFixed(2)}`
        : decision;

  const answerReason =
    isIgnore
      ? "Nothing here beats the market strongly enough to be worth a stake."
      : isTrap
        ? "The public is piling in on the favourite. The price is worse than it looks."
        : edge != null && edge > 0
          ? "Our view of the game says this price pays out more than it should."
          : "Marginal edge — the price is close to what we think is fair.";

  // Price check verdict.
  let priceVerdict = "The price is about right.";
  let priceVerdictClass = "text-text-secondary";
  if (edge != null) {
    if (edge > 1) {
      priceVerdict = "The price is generous. It pays more than our view suggests it should.";
      priceVerdictClass = "text-accent";
    } else if (edge < -1) {
      priceVerdict = "The price is too short. It pays less than our view suggests it should.";
      priceVerdictClass = "text-accent-dim";
    }
  }
  const edgeLabel = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)} pts`;

  return (
    <PageShell>
      <Card>
        {/* 1. HEADER */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="caption-mono text-[13px] uppercase text-text-muted">
              {data.competition ?? data.sport}
            </span>
            <h1 className="line-clamp-2 text-[22px] font-semibold leading-tight text-text-primary">
              {data.home} · {data.away}
            </h1>
          </div>
          <VerdictChip verdict={data.verdict as "opportunity" | "trap" | "ignore"} />
        </div>

        {/* 2. THE ANSWER */}
        <div className="flex flex-col gap-2 rounded-[14px] bg-card-inner p-5">
          <p
            className={`text-[24px] font-bold leading-tight ${
              isIgnore || isTrap ? "text-text-muted" : "text-accent"
            }`}
          >
            {answerLine}
          </p>
          <p className="text-[15px] leading-relaxed text-text-secondary">{answerReason}</p>
          {thinData ? (
            <p className="caption-mono text-[13px] text-text-muted">
              Thin data · one bookmaker
            </p>
          ) : null}
          {modelPriced ? (
            <p className="caption-mono text-[13px] text-text-muted">
              Model-priced · not yet validated
            </p>
          ) : null}
          {data.provisional ? (
            <p className="caption-mono text-[13px] text-text-muted">
              Provisional · price may move before kickoff
            </p>
          ) : null}
        </div>

        {/* 3. PRICE CHECK */}
        {fair != null || implied != null ? (
          <div className="flex flex-col gap-3">
            <SectionLabel>Price check</SectionLabel>
            <div className="flex flex-col gap-1.5 text-[15px] text-text-secondary">
              {fair != null ? (
                <p>
                  Our view: wins about{" "}
                  <span className="font-semibold text-text-primary">
                    {Math.round(fair * 100)}
                  </span>{" "}
                  times in 100
                </p>
              ) : null}
              {implied != null ? (
                <p>
                  This price assumes:{" "}
                  <span className="font-semibold text-text-primary">
                    {Math.round(implied * 100)}
                  </span>{" "}
                  times in 100
                </p>
              ) : null}
            </div>
            <p className={`text-[15px] font-medium leading-relaxed ${priceVerdictClass}`}>
              {priceVerdict}
            </p>
            {edge != null && edge < 0 ? (
              <p className="text-[15px] leading-relaxed text-text-muted">
                This doesn't mean they'll lose — it means the odds aren't worth taking.
              </p>
            ) : null}
            {edge != null ? (
              <p className="caption-mono text-[13px] text-text-muted">
                Edge {edgeLabel(edge)}
              </p>
            ) : null}
          </div>
        ) : null}

        {/* 4. STAKE */}
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[15px] text-text-muted">Suggested stake</span>
          <span
            className={`text-[16px] font-semibold ${
              isPass ? "text-text-muted" : "text-accent"
            }`}
          >
            {isPass ? "None" : `${data.stake} · 1 unit`}
          </span>
        </div>

        {/* 5. CONFIDENCE */}
        <div className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[15px] text-text-muted">Confidence</span>
            <span className="flex items-baseline gap-2">
              <span className="text-[16px] font-semibold text-text-primary">
                {confidenceWord(confidence)}
              </span>
              <span className="caption-mono text-[13px] text-text-muted">
                {confidence.toFixed(1)}/10
              </span>
            </span>
          </div>
          {isPass ? (
            <p className="caption-mono text-right text-[13px] text-text-muted">
              read only · not a bet endorsement
            </p>
          ) : null}
        </div>

        <Divider />

        {/* 6. DETAIL (collapsed) */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="caption-mono self-start text-[13px] uppercase text-accent"
        >
          {open ? "− Full breakdown" : "+ Full breakdown"}
        </button>

        {open ? (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-3">
              <SectionLabel>Four-score breakdown</SectionLabel>
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

            <SectionLabel>Raw selection</SectionLabel>
            <div className="flex flex-col gap-2">
              <KeyValueRow k="Market" v={data.recommended_market ?? "—"} />
              <KeyValueRow k="Selection" v={data.recommended_selection ?? "—"} />
              <KeyValueRow
                k="Best odds"
                v={bestOdds != null ? bestOdds.toFixed(2) : "—"}
              />
              <KeyValueRow
                k="Fair probability"
                v={fair != null ? `${(fair * 100).toFixed(1)}%` : "—"}
              />
              <KeyValueRow
                k="Implied probability"
                v={implied != null ? `${(implied * 100).toFixed(1)}%` : "—"}
              />
              <KeyValueRow
                k="Edge"
                v={edge != null ? edgeLabel(edge) : "—"}
              />
              <KeyValueRow
                k="Data quality"
                v={
                  dq === "multi_book"
                    ? "Multi-book"
                    : dq === "single_book"
                      ? "Single book"
                      : dq === "model"
                        ? "Model-priced"
                        : dq === "model_single_book"
                          ? "Single book (model priced)"
                          : "—"
                }
              />
            </div>

            <Divider />

            <SectionLabel>Reasoning</SectionLabel>
            <p className="body-sans text-text-secondary">{data.reasoning}</p>
          </div>
        ) : null}

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
      <span className="caption-mono pl-20 text-[13px] text-text-muted">{hint}</span>
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
