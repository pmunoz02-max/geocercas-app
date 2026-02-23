CREATE OR REPLACE FUNCTION public.insert_geocerca_json(nombre text, coords jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN NULL::uuid;
END;
$$;
