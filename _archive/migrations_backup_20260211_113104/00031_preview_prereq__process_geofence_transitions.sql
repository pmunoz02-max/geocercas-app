CREATE OR REPLACE FUNCTION public.process_geofence_transitions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- prereq no-op: real implementation overridden in 00400_preview_vft.sql
  RETURN;
END;
$$;
