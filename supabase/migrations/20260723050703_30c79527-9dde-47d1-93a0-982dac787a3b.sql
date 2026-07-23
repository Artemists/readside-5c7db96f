-- Remove public read access from operational tables. All app reads go through
-- server functions using the service-role client, which bypasses RLS, so
-- revoking anon/public access does not affect functionality.

DROP POLICY IF EXISTS "Match signals are readable by anyone" ON public.match_signals;
DROP POLICY IF EXISTS "Scans are readable by anyone" ON public.scans;
DROP POLICY IF EXISTS "team_ids readable by anyone" ON public.team_ids;
DROP POLICY IF EXISTS "form_cache readable by anyone" ON public.form_cache;

REVOKE SELECT ON public.match_signals FROM anon;
REVOKE SELECT ON public.scans FROM anon;
REVOKE SELECT ON public.team_ids FROM anon;
REVOKE SELECT ON public.form_cache FROM anon;

REVOKE SELECT ON public.match_signals FROM authenticated;
REVOKE SELECT ON public.scans FROM authenticated;
REVOKE SELECT ON public.team_ids FROM authenticated;
REVOKE SELECT ON public.form_cache FROM authenticated;

-- service_role retains ALL (used by server functions via supabaseAdmin).
GRANT ALL ON public.match_signals TO service_role;
GRANT ALL ON public.scans TO service_role;
GRANT ALL ON public.team_ids TO service_role;
GRANT ALL ON public.form_cache TO service_role;
