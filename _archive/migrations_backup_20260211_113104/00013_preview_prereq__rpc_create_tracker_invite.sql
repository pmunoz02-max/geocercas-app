CREATE OR REPLACE FUNCTION public.rpc_create_tracker_invite(
  p_org_id uuid,
  p_email text,
  p_expires_hours integer,
  p_note text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN NULL;
END;
$$;
