CREATE OR REPLACE FUNCTION public.move_asignacion_dates(
  p_asignacion_id uuid,
  p_start date,
  p_end date
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
