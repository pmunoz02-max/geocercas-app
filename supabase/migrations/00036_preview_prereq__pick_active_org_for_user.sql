CREATE OR REPLACE FUNCTION public.pick_active_org_for_user(
  p_user uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- prereq no-op: real logic overridden in 00400_preview_vft.sql
  RETURN NULL::uuid;
END;
$$;
