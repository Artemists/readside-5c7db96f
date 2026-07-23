CREATE TABLE public.polymarket_cache (
  match_id text PRIMARY KEY,
  condition_id text,
  payload jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.polymarket_cache TO service_role;
ALTER TABLE public.polymarket_cache ENABLE ROW LEVEL SECURITY;
-- No policies: service role bypasses RLS. Table is server-only.