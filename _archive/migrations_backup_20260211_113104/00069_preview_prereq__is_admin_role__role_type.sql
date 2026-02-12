CREATE OR REPLACE FUNCTION public.is_admin_role(p_role public.role_type)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN false;
END;
$$;
