-- PREREQ: allow 00300_preview_rls.sql to GRANT/REVOKE on function signature
-- Bootstrap no-op. Real implementation comes in 00400_preview_vft.sql

CREATE OR REPLACE FUNCTION public.get_current_org_id()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- no-op prereq (neutral return)
  RETURN NULL::uuid;
END;
$$;
