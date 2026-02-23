CREATE OR REPLACE FUNCTION public.on_org_invite_accepted()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- prereq no-op: real side effects implemented in 00400_preview_vft.sql
  RETURN;
END;
$$;
