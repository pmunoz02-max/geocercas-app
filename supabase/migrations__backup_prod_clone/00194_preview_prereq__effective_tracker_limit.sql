-- 00194_preview_prereq__effective_tracker_limit.sql
-- PREREQ bootstrap-safe para destrabar 00300_preview_rls.sql (GRANT/REVOKE)
-- Se redefine completamente en 00400_preview_vft.sql

CREATE OR REPLACE FUNCTION public.effective_tracker_limit(p_org_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- no-op (bootstrap-safe)
  RETURN 0;
END;
$$;
