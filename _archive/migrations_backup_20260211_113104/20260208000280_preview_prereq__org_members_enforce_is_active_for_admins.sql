-- 20260208000280_preview_prereq__org_members_enforce_is_active_for_admins.sql
-- PREREQ canónico para desbloquear GRANTs/RLS en 00300 sobre _org_members_enforce_is_active_for_admins()
-- Bootstrap-safe, idempotente. 00400 puede redefinir con CREATE OR REPLACE.

BEGIN;

CREATE SCHEMA IF NOT EXISTS public;

-- Función placeholder: solo necesita EXISTIR para que 00300 haga GRANT sin fallar.
-- Retorna boolean y por bootstrap devolvemos TRUE (no bloquea durante migraciones).
CREATE OR REPLACE FUNCTION public._org_members_enforce_is_active_for_admins()
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT TRUE;
$$;

-- Permisos mínimos para evitar crash en 00300
DO $$
BEGIN
  BEGIN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public._org_members_enforce_is_active_for_admins() TO anon, authenticated';
  EXCEPTION WHEN undefined_object THEN
    NULL;
  END;
END $$;

COMMIT;
