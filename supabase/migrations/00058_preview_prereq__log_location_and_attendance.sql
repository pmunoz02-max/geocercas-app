CREATE OR REPLACE FUNCTION public.log_location_and_attendance(
  p_lat double precision,
  p_lng double precision
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN '{}'::jsonb;
END;
$$;
