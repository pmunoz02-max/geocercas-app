CREATE OR REPLACE FUNCTION public.lower(
  p_role public.role_type
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- prereq no-op: real implementation overridden in 00400_preview_vft.sql
  RETURN p_role::text;
END;
$$;
