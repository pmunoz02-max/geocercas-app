CREATE OR REPLACE FUNCTION public.personal_compute_fingerprint(
  p_nombre text,
  p_apellido text,
  p_email text,
  p_telefono_norm text,
  p_org_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- prereq no-op: real fingerprint logic overridden in 00400_preview_vft.sql
  RETURN '';
END;
$$;
