CREATE OR REPLACE FUNCTION public.set_current_org_on_membership_insert()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN;
END;
$$;
