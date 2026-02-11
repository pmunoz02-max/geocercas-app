-- 20260208000275_preview_prereq__pick_membership_role_label.sql
-- PREREQ canónico para desbloquear REVOKE/GRANT en 00300 sobre _pick_membership_role_label(text)
-- Bootstrap-safe, idempotente. 00400 puede redefinir con CREATE OR REPLACE.

BEGIN;

CREATE SCHEMA IF NOT EXISTS public;

-- Elige/normaliza una etiqueta de rol para memberships.
-- Placeholder bootstrap: normaliza a minúsculas y permite set canónico.
-- Si no coincide, retorna NULL.
CREATE OR REPLACE FUNCTION public._pick_membership_role_label(p_desired text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v text;
BEGIN
  IF p_desired IS NULL THEN
    RETURN NULL;
  END IF;

  v := lower(btrim(p_desired));
  IF v = '' THEN
    RETURN NULL;
  END IF;

  IF v IN ('owner', 'admin', 'tracker', 'viewer') THEN
    RETURN v;
  END IF;

  -- variantes comunes
  IF v IN ('superadmin', 'super_admin') THEN
    RETURN 'admin';
  END IF;

  RETURN NULL;
END;
$$;

COMMIT;
