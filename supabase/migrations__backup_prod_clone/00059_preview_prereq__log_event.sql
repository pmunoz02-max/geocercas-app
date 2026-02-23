CREATE OR REPLACE FUNCTION public.log_event(
  p_action text,
  p_entity text,
  p_entity_id uuid,
  p_details jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- no-op prereq: real implementation in 00400_preview_vft.sql
  RETURN;
END;
$$;
