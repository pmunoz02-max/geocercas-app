CREATE OR REPLACE FUNCTION public.is_admin_context()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN false;
END;
$$;
