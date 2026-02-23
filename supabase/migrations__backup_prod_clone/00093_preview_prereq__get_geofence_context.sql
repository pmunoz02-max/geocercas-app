CREATE OR REPLACE FUNCTION public.get_geofence_context(p_geofence_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN '{}'::jsonb;
END;
$$;
