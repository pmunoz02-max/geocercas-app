CREATE OR REPLACE FUNCTION public.resolve_geofence_id_from_geocerca(
  p_geocerca_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- prereq no-op: real resolution logic overridden in 00400_preview_vft.sql
  RETURN NULL::uuid;
END;
$$;
