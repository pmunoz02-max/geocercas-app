-- 20260208000274_preview_prereq__pick_org_table.sql
-- PREREQ canónico para desbloquear GRANTs/RLS en 00300 sobre _pick_org_table()
-- Bootstrap-safe, idempotente. 00400 puede redefinir con CREATE OR REPLACE.

BEGIN;

CREATE SCHEMA IF NOT EXISTS public;

-- Devuelve la tabla canónica de organizaciones.
-- Placeholder bootstrap: 'organizations' (core multi-tenant).
CREATE OR REPLACE FUNCTION public._pick_org_table()
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 'organizations'::text;
$$;

-- Permisos mínimos para evitar crash en 00300
DO $$
BEGIN
  BEGIN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public._pick_org_table() TO anon, authenticated';
  EXCEPTION WHEN undefined_object THEN
    NULL;
  END;
END $$;

COMMIT;
