-- PREREQ: allow 00300_preview_rls.sql to GRANT/REVOKE on function signature that must exist.
-- This is a bootstrap no-op and will be replaced by 00400_preview_vft.sql (CREATE OR REPLACE).

CREATE OR REPLACE FUNCTION public.geocerca_get(p_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- no-op prereq (neutral return)
  RETURN NULL::jsonb;
END;
$$;
