CREATE OR REPLACE FUNCTION public.init_admin_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- no-op prereq trigger
  RETURN NEW;
END;
$$;
