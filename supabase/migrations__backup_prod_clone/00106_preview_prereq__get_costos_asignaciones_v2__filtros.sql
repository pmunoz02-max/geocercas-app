-- PREREQ: allow 00300_preview_rls.sql to GRANT/REVOKE on function signature (v2 overload with filters)
-- Bootstrap no-op. Real implementation comes in 00400_preview_vft.sql

CREATE OR REPLACE FUNCTION public.get_costos_asignaciones_v2(
  p_desde     date,
  p_hasta     date,
  p_personal  uuid,
  p_actividad uuid,
  p_geocerca  uuid
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
