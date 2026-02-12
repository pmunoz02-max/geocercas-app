CREATE OR REPLACE FUNCTION public.list_members_with_email(
  p_org uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN '[]'::jsonb;
END;
$$;
