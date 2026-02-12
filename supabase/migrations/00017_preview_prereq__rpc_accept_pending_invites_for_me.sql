CREATE OR REPLACE FUNCTION public.rpc_accept_pending_invites_for_me()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN;
END;
$$;
