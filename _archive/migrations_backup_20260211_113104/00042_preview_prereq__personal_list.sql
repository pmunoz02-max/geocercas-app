CREATE OR REPLACE FUNCTION public.personal_list(
  _q text,
  _include_deleted boolean,
  _limit integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- prereq no-op: real listing logic overridden in 00400_preview_vft.sql
  RETURN '[]'::jsonb;
END;
$$;
