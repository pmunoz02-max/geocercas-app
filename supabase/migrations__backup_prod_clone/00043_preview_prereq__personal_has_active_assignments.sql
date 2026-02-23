CREATE OR REPLACE FUNCTION public.personal_has_active_assignments(
  p_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- prereq no-op: real logic overridden in 00400_preview_vft.sql
  RETURN false;
END;
$$;
