CREATE OR REPLACE FUNCTION public.invite_member_by_email(
  p_org uuid,
  p_email text,
  p_role public.role_type
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN NULL::uuid;
END;
$$;
