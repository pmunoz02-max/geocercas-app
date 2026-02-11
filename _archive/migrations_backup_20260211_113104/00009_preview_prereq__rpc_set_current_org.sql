CREATE OR REPLACE FUNCTION public.rpc_set_current_org(
  p_org_id uuid
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
