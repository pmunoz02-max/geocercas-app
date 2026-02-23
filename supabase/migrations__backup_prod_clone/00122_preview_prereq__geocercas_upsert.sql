-- PREREQ: allow 00300_preview_rls.sql to GRANT/REVOKE on function signature
-- Bootstrap no-op. Real implementation comes in 00400_preview_vft.sql

CREATE OR REPLACE FUNCTION public.geocercas_upsert(
  p_id uuid,
  p_nombre text,
  p_geojson jsonb,
  p_visible boolean,
  p_activa boolean,
  p_color text
)
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
