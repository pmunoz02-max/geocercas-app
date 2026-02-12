CREATE OR REPLACE FUNCTION public.rpc_provision_tracker_and_assign(
  p_tracker_user_id uuid,
  p_geofence_id uuid,
  p_frequency_minutes integer,
  p_active boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN;
END;
$$;
