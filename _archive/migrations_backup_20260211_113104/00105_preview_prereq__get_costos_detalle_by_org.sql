-- PREREQ: allow 00300_preview_rls.sql to GRANT/REVOKE on function signature
-- Bootstrap no-op. Real implementation comes in 00400_preview_vft.sql

CREATE OR REPLACE FUNCTION public.get_costos_detalle_by_org(
  p_org_id      uuid,
  p_desde       timestamp with time zone,
  p_hasta       timestamp with time zone,
  p_personal_id uuid,
  p_activity_id uuid,
  p_geocerca_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- no-op prereq (neutral return)
  RETURN '[]'::jsonb;
END;
$$;
