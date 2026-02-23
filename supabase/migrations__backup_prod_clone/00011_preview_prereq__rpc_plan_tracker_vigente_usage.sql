CREATE OR REPLACE FUNCTION public.rpc_plan_tracker_vigente_usage(
  org_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN '{}'::jsonb;
END;
$$;
