-- PREREQ: allow 00300_preview_rls.sql to GRANT/REVOKE on function signature
-- Bootstrap no-op. Real implementation comes in 00400_preview_vft.sql

CREATE OR REPLACE FUNCTION public.get_default_geofence_id(p_org_id uuid)
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
