CREATE TABLE public.team_ids (
  name text PRIMARY KEY,
  team_id integer NOT NULL,
  resolved_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.team_ids TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_ids TO authenticated;
GRANT ALL ON public.team_ids TO service_role;
ALTER TABLE public.team_ids ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team_ids readable by anyone" ON public.team_ids FOR SELECT USING (true);

CREATE TABLE public.form_cache (
  team_id integer PRIMARY KEY,
  payload jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.form_cache TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.form_cache TO authenticated;
GRANT ALL ON public.form_cache TO service_role;
ALTER TABLE public.form_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "form_cache readable by anyone" ON public.form_cache FOR SELECT USING (true);