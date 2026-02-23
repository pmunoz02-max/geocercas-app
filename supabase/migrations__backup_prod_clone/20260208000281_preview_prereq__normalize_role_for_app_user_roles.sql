-- 20260208000281_preview_prereq__normalize_role_for_app_user_roles.sql
-- PREREQ canónico para desbloquear GRANTs/RLS en 00300 sobre _normalize_role_for_app_user_roles(...)
-- Bootstrap-safe, idempotente. 00400 puede redefinir con CREATE OR REPLACE.

BEGIN;

CREATE SCHEMA IF NOT EXISTS public;

-- Normaliza el rol a un valor canónico para app_user_roles.
-- Implementación bootstrap: conserva solo roles conocidos y baja a minúsculas.
-- Si llega NULL/vacío/desconocido -> NULL (para no inventar permisos).
CREATE OR REPLACE FUNCTION public._normalize_role_for_app_user_roles(
  p_user uuid,
  p_org  uuid,
  p_role text
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v text;
BEGIN
  IF p_role IS NULL THEN
    RETURN NULL;
  END IF;

  v := lower(btrim(p_role));
  IF v = '' THEN
    RETURN NULL;
  END IF;

  -- Canonical roles del core (ajusta en 00400 si tu canonical set difiere)
  IF v IN ('owner', 'admin', 'tracker', 'viewer') THEN
    RETURN v;
  END IF;

  -- Algunas variantes comunes (bootstrap-friendly)
  IF v IN ('superadmin', 'super_admin') THEN
    RETURN 'admin';
  END IF;

  RETURN NULL;
END;
$$;

-- Permisos mínimos para evitar crash en 00300
DO $$
BEGIN
  BEGIN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public._normalize_role_for_app_user_roles(uuid, uuid, text) TO anon, authenticated';
  EXCEPTION WHEN undefined_object THEN
    NULL;
  END;
END $$;

COMMIT;
