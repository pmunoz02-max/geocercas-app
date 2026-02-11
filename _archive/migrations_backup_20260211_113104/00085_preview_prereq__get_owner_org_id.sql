CREATE OR REPLACE FUNCTION public.get_owner_org_id(p_uid uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN NULL::uuid;
END;
$$;
