CREATE OR REPLACE FUNCTION public.merge_personal_duplicates()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- prereq no-op: real implementation in 00400_preview_vft.sql
  RETURN '{}'::jsonb;
END;
$$;
