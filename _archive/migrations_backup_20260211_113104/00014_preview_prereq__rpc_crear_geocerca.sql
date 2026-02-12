CREATE OR REPLACE FUNCTION public.rpc_crear_geocerca(
  p_nombre text,
  p_geom jsonb,
  p_activa boolean
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN NULL;
END;
$$;
