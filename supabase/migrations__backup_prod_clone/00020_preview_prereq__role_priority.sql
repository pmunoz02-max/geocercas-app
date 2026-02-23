CREATE OR REPLACE FUNCTION public.role_priority(
  p_role text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN NULL;
END;
$$;
