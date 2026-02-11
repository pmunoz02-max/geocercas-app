-- 20260208000278_preview_prereq__org_parent_table_of_org_members.sql
-- PREREQ canónico para desbloquear GRANTs/RLS en 00300 sobre _org_parent_table_of_org_members()
-- Bootstrap-safe, idempotente. 00400 puede redefinir con CREATE OR REPLACE.

BEGIN;

CREATE SCHEMA IF NOT EXISTS public;

-- Devuelve el nombre de la tabla "padre" canónica para miembros de organización.
-- Placeholder bootstrap: retornamos 'memberships' (core multi-tenant por org_id).
CREATE OR REPLACE FUNCTION public._org_parent_table_of_org_members()
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 'memberships'::text;
$$;

-- Permisos mínimos para evitar crash en 00300
DO $$
BEGIN
  BEGIN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public._org_parent_table_of_org_members() TO anon, authenticated';
  EXCEPTION WHEN undefined_object THEN
    NULL;
  END;
END $$;

COMMIT;
