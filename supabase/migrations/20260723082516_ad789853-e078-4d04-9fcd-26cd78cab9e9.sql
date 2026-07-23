ALTER TABLE public.team_ids ADD COLUMN IF NOT EXISTS not_found boolean NOT NULL DEFAULT false;
ALTER TABLE public.team_ids ALTER COLUMN team_id DROP NOT NULL;