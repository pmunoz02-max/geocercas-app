CREATE OR REPLACE FUNCTION public.prevent_personal_duplicate_on_undelete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- prereq no-op trigger: real logic overridden in 00400_preview_vft.sql
  RETURN NEW;
END;
$$;
