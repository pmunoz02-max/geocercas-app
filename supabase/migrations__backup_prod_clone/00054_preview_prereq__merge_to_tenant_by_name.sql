CREATE OR REPLACE FUNCTION public.merge_to_tenant_by_name(
  p_table regclass,
  p_id_col text,
  p_tenant_col text,
  p_name_col text,
  p_target_tenant uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- prereq no-op: real implementation overridden in 00400_preview_vft.sql
  RETURN '{}'::jsonb;
END;
$$;
