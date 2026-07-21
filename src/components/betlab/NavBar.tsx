import { Link } from "@tanstack/react-router";

const links = [
  { to: "/", label: "Signals" },
  { to: "/match-intelligence", label: "Analysis" },
  { to: "/value-scanner", label: "Value scanner" },
  { to: "/popular-pick-warning", label: "Warnings" },
  { to: "/yesterday", label: "History" },
] as const;

export function NavBar() {
  return (
    <header className="w-full bg-card">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between px-6 py-4 sm:px-12">
        <div className="flex items-center gap-10">
          <Link to="/" className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-accent">
              <span className="h-2 w-2 rounded-sm bg-background" />
            </span>
            <span className="font-display text-[15px] font-bold tracking-tight text-text-primary">
              BetLab
            </span>
          </Link>
          <nav className="hidden items-center gap-7 md:flex">
            {links.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className="text-[13px] font-normal text-text-disabled transition-colors hover:text-text-primary"
                activeProps={{ className: "text-text-primary font-medium" }}
                activeOptions={{ exact: l.to === "/" }}
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded border border-border px-2.5 py-1 text-[12px] font-medium text-text-muted">
            <span>EN</span>
            <span className="text-[10px] text-text-disabled">▾</span>
          </div>
        </div>
      </div>
    </header>
  );
}
