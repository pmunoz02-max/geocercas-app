CREATE OR REPLACE FUNCTION public.recalc_users_public_role_from_memberships()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- prereq no-op: real implementation overridden in 00400_preview_vft.sql
  RETURN;
END;
$$;
