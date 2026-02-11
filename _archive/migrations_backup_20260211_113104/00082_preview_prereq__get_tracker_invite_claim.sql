CREATE OR REPLACE FUNCTION public.get_tracker_invite_claim(p_invite_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN '{}'::jsonb;
END;
$$;
