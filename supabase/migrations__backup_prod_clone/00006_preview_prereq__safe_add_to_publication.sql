CREATE OR REPLACE FUNCTION public.safe_add_to_publication(
  p_pubname text,
  p_schema text,
  p_tablename text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN;
END;
$$;
