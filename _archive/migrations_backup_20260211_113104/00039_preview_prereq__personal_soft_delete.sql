CREATE OR REPLACE FUNCTION public.personal_soft_delete(
  p_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- prereq no-op: real soft-delete logic overridden in 00400_preview_vft.sql
  RETURN true;
END;
$$;
