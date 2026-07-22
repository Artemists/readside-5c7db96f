import { Link } from "@tanstack/react-router";
import { useState, type MouseEvent } from "react";

export type MatchCardData = {
  match_id: string;
  home: string;
  away: string;
  competition?: string | null;
  sport?: string | null;
  verdict: string;
  recommended_market?: string | null;
  recommended_selection?: string | null;
  best_odds?: number | string | null;
  stake?: string | null;
  confidence?: number | string | null;
  provisional?: boolean | null;
  value_score?: number | string | null;
  trap_score?: number | string | null;
  context_score?: number | string | null;
  explosion_score?: number | string | null;
  ev_percent?: number | string | null;
  fair_probability?: number | string | null;
  implied_probability?: number | string | null;
};

const n = (v: unknown): number | null => {
  if (v == null) return null;
  const x = typeof v === "string" ? parseFloat(v) : (v as number);
  return Number.isFinite(x) ? x : null;
};

export function summarySentence(m: MatchCardData): string {
  const trap = n(m.trap_score) ?? 0;
  const value = n(m.value_score) ?? 0;
  const explosion = n(m.explosion_score) ?? 0;
  const ctx = n(m.context_score) ?? 0;
  if (trap > 60) return "Public money is inflating the favourite. Avoid.";
  if (value >= 70) return "Our model prices this shorter than the market.";
  if (explosion > 65) return "Both sides concede. The goals market looks live.";
  if (ctx > 7) return "Bookmakers disagree on this price.";
  return "Small edge. Marginal call.";
}

function confidenceLabel(c: number | null): string {
  if (c == null) return "—";
  if (c <= 4) return "Low";
  if (c <= 7) return "Medium";
  return "High";
}

function decisionPhrase(m: MatchCardData): string {
  const market = (m.recommended_market ?? "").toLowerCase();
  const sel = m.recommended_selection ?? "";
  if (!sel) return "Awaiting selection";
  if (market.includes("moneyline") || market === "ml" || market === "h2h" || market === "") {
    const s = sel.toLowerCase();
    if (s === "home" || s === m.home.toLowerCase()) return `Back ${m.home}`;
    if (s === "away" || s === m.away.toLowerCase()) return `Back ${m.away}`;
    if (s === "draw" || s === "x") return "Back the draw";
    return `Back ${sel}`;
  }
  if (market.includes("over") || market.includes("under") || market.includes("total")) {
    return sel.match(/^(over|under)/i) ? sel.replace(/^./, (c) => c.toUpperCase()) : `${sel} goals`;
  }
  return sel;
}

function VerdictChip({ verdict, muted }: { verdict: string; muted: boolean }) {
  const label =
    verdict === "opportunity" ? "Opportunity" : verdict === "trap" ? "Trap" : "Ignore";
  const cls = muted
    ? "bg-card text-text-muted"
    : verdict === "opportunity"
      ? "bg-accent/15 text-accent"
      : verdict === "trap"
        ? "bg-amber-500/10 text-accent-dim"
        : "bg-card text-text-muted";
  return (
    <span
      className={`caption-mono shrink-0 rounded px-2 py-0.5 text-[11px] uppercase ${cls}`}
    >
      {label}
    </span>
  );
}

function ScoreBar({
  label,
  value,
  max,
  accent,
}: {
  label: string;
  value: number | null;
  max: number;
  accent?: boolean;
}) {
  const v = value ?? 0;
  const pct = Math.max(0, Math.min(100, (v / max) * 100));
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between text-[12px]">
        <span className="text-text-secondary">{label}</span>
        <span className="caption-mono text-[11px] text-text-muted">
          {value != null ? (max === 10 ? v.toFixed(1) : v.toFixed(0)) : "—"}/{max}
        </span>
      </div>
      <div className="h-[3px] w-full overflow-hidden rounded-full bg-card">
        <div
          className={`h-full ${accent ? "bg-accent" : "bg-text-disabled/60"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function MatchCard({ m }: { m: MatchCardData }) {
  const [open, setOpen] = useState(false);
  const odds = n(m.best_odds);
  const confidence = n(m.confidence);
  const ev = n(m.ev_percent);
  const fair = n(m.fair_probability);
  const implied = n(m.implied_probability);
  const isOpp = m.verdict === "opportunity";
  const summary = summarySentence(m);
  const decision = decisionPhrase(m);

  const handleToggle = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setOpen((v) => !v);
  };

  return (
    <Link
      to="/match/$matchId"
      params={{ matchId: m.match_id }}
      className="flex flex-col rounded-[18px] border border-white/10 bg-card-inner p-4 transition-colors hover:bg-card"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-[15px] font-semibold leading-tight text-text-primary">
            {m.home} · {m.away}
          </p>
          {m.competition || m.sport ? (
            <p className="caption-mono mt-1 text-[11px] uppercase text-text-muted">
              {m.competition ?? m.sport}
            </p>
          ) : null}
        </div>
        <VerdictChip verdict={m.verdict} muted={!isOpp} />
      </div>

      {/* Decision */}
      <div className="mt-3 flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-[20px] font-bold leading-tight text-text-primary">
          {decision}
        </span>
        <span className="shrink-0 text-[20px] font-bold leading-tight text-accent">
          {odds != null ? `@ ${odds.toFixed(2)}` : "Odds pending"}
        </span>
      </div>

      {/* Stake line */}
      <p className="caption-mono mt-3 text-[13px] text-text-muted">
        {(m.stake ?? "Pass")} · {confidenceLabel(confidence)} confidence
      </p>
      {m.provisional ? (
        <p className="caption-mono mt-1 text-[12px] text-text-disabled">
          Provisional · price may move
        </p>
      ) : null}

      {/* Summary sentence */}
      <p className="mt-4 text-[14px] leading-snug text-text-secondary">{summary}</p>

      {/* Why toggle */}
      <button
        type="button"
        onClick={handleToggle}
        className="caption-mono mt-5 self-start text-[11px] uppercase text-accent"
      >
        {open ? "− Why" : "+ Why?"}
      </button>

      {open ? (
        <div className="mt-3 flex flex-col gap-2.5">
          <ScoreBar label="Value" value={n(m.value_score)} max={100} accent />
          <ScoreBar label="Context" value={n(m.context_score)} max={10} />
          <ScoreBar label="Explosion" value={n(m.explosion_score)} max={100} />
          <ScoreBar label="Trap" value={n(m.trap_score)} max={100} />
          <p className="caption-mono mt-1 text-[11px] text-text-muted">
            Expected value {ev != null ? `${ev >= 0 ? "+" : ""}${ev.toFixed(1)}%` : "—"}
            {" · "}
            Fair {fair != null ? `${(fair * 100).toFixed(0)}%` : "—"} vs implied{" "}
            {implied != null ? `${(implied * 100).toFixed(0)}%` : "—"}
          </p>
        </div>
      ) : null}
    </Link>
  );
}
