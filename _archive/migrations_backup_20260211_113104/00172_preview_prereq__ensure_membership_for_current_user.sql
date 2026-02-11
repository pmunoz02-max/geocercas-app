-- 00172_preview_prereq__ensure_membership_for_current_user.sql
-- PREREQ bootstrap-safe para destrabar 00300_preview_rls.sql (GRANT/REVOKE)
-- Se redefine completamente en 00400_preview_vft.sql

CREATE OR REPLACE FUNCTION public.ensure_membership_for_current_user()
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
