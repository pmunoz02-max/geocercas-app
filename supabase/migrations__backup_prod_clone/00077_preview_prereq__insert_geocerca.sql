CREATE OR REPLACE FUNCTION public.insert_geocerca(nombre text, wkt text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN NULL::uuid;
END;
$$;
