import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[1440px] px-6 py-10 sm:px-12">
      <div className="mx-auto max-w-[620px]">{children}</div>
    </div>
  );
}

export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-6 rounded-xl bg-card p-8 sm:p-12",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <p className="label-mono">{children}</p>;
}

export function Divider() {
  return <div className="h-px w-full bg-border" />;
}

export function Bullet({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="text-[15px] leading-[22px] text-text-muted">·</span>
      <p className="text-[15px] leading-[22px] text-text-secondary">{children}</p>
    </div>
  );
}

export function WarningBadge({ children }: { children: ReactNode }) {
  return (
    <div
      className="inline-flex items-center gap-2.5 rounded-lg px-4 py-2.5"
      style={{ backgroundColor: "rgba(255,186,51,0.08)" }}
    >
      <span className="text-[14px] font-medium text-accent-dim">⚠</span>
      <p className="text-[14px] font-semibold text-accent-dim">{children}</p>
    </div>
  );
}

export function StatCard({
  icon,
  value,
  label,
  emphasis = "default",
}: {
  icon: string;
  value: ReactNode;
  label: string;
  emphasis?: "accent" | "default";
}) {
  return (
    <div className="flex h-24 flex-1 flex-col justify-between rounded-[10px] bg-card-inner p-3">
      <span className="text-[16px] leading-none">{icon}</span>
      <span
        className={cn(
          "value-display text-[26px] leading-none",
          emphasis === "accent" ? "text-accent" : "text-text-primary",
        )}
      >
        {value}
      </span>
      <span className="caption-mono text-[11px] leading-none">{label}</span>
    </div>
  );
}

export function Pill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md bg-card-inner px-3 py-1.5 text-[14px] font-medium text-text-secondary">
      {children}
    </span>
  );
}

export function KeyValueRow({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex items-center justify-between text-[15px]">
      <span className="text-text-muted">{k}</span>
      <span className="font-medium text-text-primary">{v}</span>
    </div>
  );
}

export function StatBar({
  label,
  value,
  max = 100,
}: {
  label: string;
  value: number;
  max?: number;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="flex items-center gap-3">
      <span className="w-20 text-[15px] text-text-secondary">{label}</span>
      <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-card-inner">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-accent"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-6 text-right text-[15px] font-medium text-text-primary">
        {value}
      </span>
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-text-muted">
      <span
        className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-border border-t-accent"
        aria-hidden
      />
      {label ? <span className="caption-mono">{label}</span> : null}
    </div>
  );
}

export function MatchAverageTag() {
  return (
    <span className="caption-mono ml-2 rounded bg-card-inner px-2 py-0.5 text-[11px] text-text-muted">
      ΜΈΣΗ ΑΓΟΡΆΣ
    </span>
  );
}
