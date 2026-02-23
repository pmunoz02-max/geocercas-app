CREATE OR REPLACE FUNCTION public.rpc_admin_upsert_phone(
  p_user_id uuid,
  p_telefono text
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
