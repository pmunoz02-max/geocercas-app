CREATE OR REPLACE FUNCTION public.set_current_org(
  p_org uuid
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
