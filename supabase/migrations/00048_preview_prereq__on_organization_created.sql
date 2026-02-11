CREATE OR REPLACE FUNCTION public.on_organization_created()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- prereq no-op: real implementation overridden in 00400_preview_vft.sql
  RETURN;
END;
$$;
