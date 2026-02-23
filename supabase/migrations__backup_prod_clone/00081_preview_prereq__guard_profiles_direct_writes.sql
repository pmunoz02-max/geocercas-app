CREATE OR REPLACE FUNCTION public.guard_profiles_direct_writes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- no-op prereq guard
  RETURN NEW;
END;
$$;
