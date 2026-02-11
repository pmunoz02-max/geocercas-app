CREATE OR REPLACE FUNCTION public.personal_upsert_admin(
  p_org_id uuid,
  p_user_id uuid,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- prereq no-op: real upsert logic overridden in 00400_preview_vft.sql
  RETURN '{}'::jsonb;
END;
$$;
