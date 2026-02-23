CREATE OR REPLACE FUNCTION public.insert_tracker_position(
  p_lat double precision,
  p_lng double precision,
  p_accuracy double precision,
  p_recorded_at timestamp with time zone,
  p_source text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN NULL::uuid;
END;
$$;
