
ALTER TABLE public.match_signals
  ADD COLUMN IF NOT EXISTS settled_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS result_home_goals integer NULL,
  ADD COLUMN IF NOT EXISTS result_away_goals integer NULL,
  ADD COLUMN IF NOT EXISTS outcome text NULL,
  ADD COLUMN IF NOT EXISTS pnl_units numeric NULL,
  ADD COLUMN IF NOT EXISTS closing_odds numeric NULL,
  ADD COLUMN IF NOT EXISTS frozen boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS match_signals_settlement_idx
  ON public.match_signals (settled_at, kickoff);
