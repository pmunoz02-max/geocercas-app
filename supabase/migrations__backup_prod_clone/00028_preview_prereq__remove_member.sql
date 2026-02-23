CREATE OR REPLACE FUNCTION public.remove_member(
  p_org uuid,
  p_user uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- prereq no-op: real implementation overridden in 00400_preview_vft.sql
  RETURN true;
END;
$$;
