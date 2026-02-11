-- 00184_preview_prereq__enforce_owner_role.sql
-- PREREQ bootstrap-safe para destrabar 00300_preview_rls.sql (GRANT/REVOKE)
-- Se redefine completamente en 00400_preview_vft.sql

CREATE OR REPLACE FUNCTION public.enforce_owner_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- no-op (bootstrap-safe)
  RETURN NEW;
END;
$$;
