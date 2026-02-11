CREATE OR REPLACE FUNCTION public.my_org_ids()
RETURNS uuid[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- prereq no-op: real implementation overridden in 00400_preview_vft.sql
  RETURN ARRAY[]::uuid[];
END;
$$;
