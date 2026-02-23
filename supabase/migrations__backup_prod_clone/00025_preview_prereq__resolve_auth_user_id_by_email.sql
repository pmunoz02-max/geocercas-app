CREATE OR REPLACE FUNCTION public.resolve_auth_user_id_by_email(
  p_email text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- prereq no-op: real implementation overridden in 00400_preview_vft.sql
  RETURN NULL::uuid;
END;
$$;
