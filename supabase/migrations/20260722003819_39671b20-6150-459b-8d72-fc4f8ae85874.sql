
CREATE TABLE public.scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scanned_at timestamptz NOT NULL DEFAULT now(),
  local_date date NOT NULL,
  fixtures_count int NOT NULL DEFAULT 0,
  duration_ms int,
  status text NOT NULL DEFAULT 'ok'
);

GRANT SELECT ON public.scans TO anon, authenticated;
GRANT ALL ON public.scans TO service_role;
ALTER TABLE public.scans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Scans are readable by anyone" ON public.scans FOR SELECT USING (true);

CREATE INDEX scans_local_date_idx ON public.scans(local_date DESC, scanned_at DESC);

CREATE TABLE public.match_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id uuid REFERENCES public.scans(id) ON DELETE CASCADE,
  local_date date NOT NULL,
  match_id text NOT NULL,
  sport text NOT NULL,
  competition text,
  home text NOT NULL,
  away text NOT NULL,
  kickoff timestamptz,
  verdict text NOT NULL,
  context_score numeric(5,2) NOT NULL DEFAULT 0,
  explosion_score numeric(5,2) NOT NULL DEFAULT 0,
  value_score numeric(5,2) NOT NULL DEFAULT 0,
  trap_score numeric(5,2) NOT NULL DEFAULT 0,
  confidence numeric(4,2) NOT NULL DEFAULT 0,
  stake text NOT NULL DEFAULT 'Pass',
  recommended_market text,
  recommended_selection text,
  best_odds numeric(6,3),
  fair_probability numeric(6,4),
  implied_probability numeric(6,4),
  edge_percent numeric(6,2),
  ev_percent numeric(6,2),
  reasoning text,
  signals jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (local_date, match_id)
);

GRANT SELECT ON public.match_signals TO anon, authenticated;
GRANT ALL ON public.match_signals TO service_role;
ALTER TABLE public.match_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Match signals are readable by anyone" ON public.match_signals FOR SELECT USING (true);

CREATE INDEX match_signals_local_date_idx ON public.match_signals(local_date, verdict);
CREATE INDEX match_signals_ev_idx ON public.match_signals(local_date, ev_percent DESC);
