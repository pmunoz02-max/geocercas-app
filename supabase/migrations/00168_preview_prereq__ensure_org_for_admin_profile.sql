-- 00168_preview_prereq__ensure_org_for_admin_profile.sql
-- PREREQ bootstrap-safe para destrabar 00300_preview_rls.sql (GRANT/REVOKE)
-- Se redefine completamente en 00400_preview_vft.sql

CREATE OR REPLACE FUNCTION public.ensure_org_for_admin_profile()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- no-op (bootstrap-safe)
  RETURN NULL;
END;
$$;
