CREATE OR REPLACE FUNCTION public.has_role(p_org uuid, p_min public.role_type)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN false;
END;
$$;
