-- 20260208000271_preview_prereq__set_current_org_for_user.sql
-- PREREQ canónico para desbloquear GRANTs en 00300 sobre _set_current_org_for_user(uuid, uuid)
-- Bootstrap-safe: durante migraciones no debe fallar ni depender de tablas extra.
-- 00400 puede redefinir con implementación real.

BEGIN;

CREATE SCHEMA IF NOT EXISTS public;

-- En el core real esto probablemente escribe en alguna tabla/setting.
-- Para bootstrap, lo hacemos "no-op" y retorna true si los argumentos no son NULL.
CREATE OR REPLACE FUNCTION public._set_current_org_for_user(p_user_id uuid, p_org_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  IF p_user_id IS NULL OR p_org_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- No-op bootstrap (sin escribir nada)
  RETURN TRUE;
END;
$$;

-- Permisos mínimos para evitar crash en 00300
DO $$
BEGIN
  BEGIN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public._set_current_org_for_user(uuid, uuid) TO anon, authenticated';
  EXCEPTION WHEN undefined_object THEN
    NULL;
  END;
END $$;

COMMIT;
