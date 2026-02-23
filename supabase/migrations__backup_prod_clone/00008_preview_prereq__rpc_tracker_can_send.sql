CREATE OR REPLACE FUNCTION public.rpc_tracker_can_send()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN FALSE;
END;
$$;
