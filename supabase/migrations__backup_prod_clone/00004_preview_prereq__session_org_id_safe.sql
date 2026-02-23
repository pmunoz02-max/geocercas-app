CREATE OR REPLACE FUNCTION public.session_org_id_safe()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN NULL;
END;
$$;
