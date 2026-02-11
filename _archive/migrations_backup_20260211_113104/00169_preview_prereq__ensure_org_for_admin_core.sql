-- 00169_preview_prereq__ensure_org_for_admin_core.sql
-- PREREQ bootstrap-safe para destrabar 00300_preview_rls.sql (GRANT/REVOKE)
-- Se redefine completamente en 00400_preview_vft.sql

CREATE OR REPLACE FUNCTION public.ensure_org_for_admin_core(
  p_user_id uuid,
  p_email text,
  p_role text
)
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
