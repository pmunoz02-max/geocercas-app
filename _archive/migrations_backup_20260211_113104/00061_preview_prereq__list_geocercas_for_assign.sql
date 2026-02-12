CREATE OR REPLACE FUNCTION public.list_geocercas_for_assign()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN '[]'::jsonb;
END;
$$;
