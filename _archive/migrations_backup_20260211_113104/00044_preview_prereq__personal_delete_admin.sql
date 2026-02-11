CREATE OR REPLACE FUNCTION public.personal_delete_admin(
  p_org_id uuid,
  p_user_id uuid,
  p_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- prereq no-op: real deletion logic overridden in 00400_preview_vft.sql
  RETURN true;
END;
$$;
