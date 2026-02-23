CREATE OR REPLACE FUNCTION public.process_geofence_transitions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- prereq no-op trigger
  RETURN NEW;
END;
$$;
