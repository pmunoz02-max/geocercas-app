CREATE OR REPLACE FUNCTION public.normalize_phone_for_personal(
  p_phone text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- prereq no-op: real normalization logic overridden in 00400_preview_vft.sql
  RETURN p_phone;
END;
$$;
