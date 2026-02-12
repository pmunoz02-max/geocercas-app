CREATE OR REPLACE FUNCTION public.get_geocercas_for_current_org()
RETURNS SETOF uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN;
END;
$$;
