CREATE OR REPLACE FUNCTION public.safe_geom_from_geojson(
  js jsonb
)
RETURNS geometry
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN NULL;
END;
$$;
