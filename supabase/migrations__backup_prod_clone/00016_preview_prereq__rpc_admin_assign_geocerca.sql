CREATE OR REPLACE FUNCTION public.rpc_admin_assign_geocerca(
  p_user_id uuid,
  p_geocerca_id uuid
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
