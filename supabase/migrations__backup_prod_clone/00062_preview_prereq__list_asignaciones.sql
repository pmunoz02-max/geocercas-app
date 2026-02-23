CREATE OR REPLACE FUNCTION public.list_asignaciones(
  p_tenant_id uuid,
  p_personal_id uuid,
  p_geocerca_id uuid,
  p_estado text
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
