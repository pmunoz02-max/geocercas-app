CREATE OR REPLACE FUNCTION public.resolve_tenant_id_for_org(
  p_org_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- prereq no-op: real resolution logic overridden in 00400_preview_vft.sql
  RETURN NULL::uuid;
END;
$$;
