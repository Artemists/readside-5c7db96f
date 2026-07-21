export function Footer() {
  return (
    <footer className="w-full bg-card">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-6 py-5 sm:px-12">
        <div className="flex items-center justify-between">
          <p className="text-[12px] text-text-disabled">
            Data-driven match intelligence
          </p>
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            <p className="text-[11px] font-medium text-text-disabled">
              Models updated 4m ago
            </p>
          </div>
        </div>
        <div className="h-px w-full bg-border" />
        <div className="flex items-center justify-between text-[11px] text-text-disabled">
          <div className="flex gap-5">
            <span>Privacy</span>
            <span>Terms</span>
            <span>Responsible gambling</span>
          </div>
          <p>© 2026 BetLab. Not financial advice.</p>
        </div>
      </div>
    </footer>
  );
}
