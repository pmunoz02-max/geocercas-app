CREATE OR REPLACE FUNCTION public.role_id_to_role(
  p_role_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- prereq no-op: real mapping logic overridden in 00400_preview_vft.sql
  RETURN NULL;
END;
$$;
