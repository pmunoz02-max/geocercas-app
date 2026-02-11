CREATE OR REPLACE FUNCTION public.get_system_user_id()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN NULL::uuid;
END;
$$;
