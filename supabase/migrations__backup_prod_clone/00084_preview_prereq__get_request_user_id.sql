CREATE OR REPLACE FUNCTION public.get_request_user_id()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN NULL::uuid;
END;
$$;
