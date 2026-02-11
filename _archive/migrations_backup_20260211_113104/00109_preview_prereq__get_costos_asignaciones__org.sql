-- PREREQ: allow 00300_preview_rls.sql to GRANT/REVOKE on function signature (overload with org_id)
-- Bootstrap no-op. Real implementation comes in 00400_preview_vft.sql

CREATE OR REPLACE FUNCTION public.get_costos_asignaciones(
  p_from   timestamp with time zone,
  p_to     timestamp with time zone,
  p_org_id uuid
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
