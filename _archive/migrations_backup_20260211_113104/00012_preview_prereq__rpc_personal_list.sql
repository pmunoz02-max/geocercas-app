CREATE OR REPLACE FUNCTION public.rpc_personal_list(
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
