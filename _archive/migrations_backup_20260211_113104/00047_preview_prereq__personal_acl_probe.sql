CREATE OR REPLACE FUNCTION public.personal_acl_probe(
  p_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- prereq no-op: real ACL logic overridden in 00400_preview_vft.sql
  RETURN '{}'::jsonb;
END;
$$;
