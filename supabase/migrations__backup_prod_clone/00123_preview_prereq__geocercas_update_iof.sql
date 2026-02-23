-- PREREQ: allow 00300_preview_rls.sql to GRANT/REVOKE on trigger function
-- Bootstrap no-op. Real implementation comes in 00400_preview_vft.sql

CREATE OR REPLACE FUNCTION public.geocercas_update_iof()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- no-op prereq
  RETURN NEW;
END;
$$;
