-- 20260208000279_preview_prereq__org_members_user_col.sql
-- PREREQ canónico para desbloquear GRANTs/RLS en 00300 sobre _org_members_user_col()
-- Bootstrap-safe, idempotente. 00400 puede redefinir con CREATE OR REPLACE.

BEGIN;

CREATE SCHEMA IF NOT EXISTS public;

-- Devuelve el nombre de la columna "user" canónica para org_members/memberships.
-- Placeholder bootstrap: retornamos 'user_id' (alineado a tu regla canónica auth.uid()).
CREATE OR REPLACE FUNCTION public._org_members_user_col()
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 'user_id'::text;
$$;

-- Permisos mínimos para evitar crash en 00300
DO $$
BEGIN
  BEGIN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public._org_members_user_col() TO anon, authenticated';
  EXCEPTION WHEN undefined_object THEN
    NULL;
  END;
END $$;

COMMIT;
