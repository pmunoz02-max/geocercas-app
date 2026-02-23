CREATE OR REPLACE FUNCTION public.personal_set_vigente(
  p_id uuid,
  p_vigente boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- prereq no-op: real logic overridden in 00400_preview_vft.sql
  RETURN true;
END;
$$;
