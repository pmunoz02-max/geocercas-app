-- 20260208000276_preview_prereq__organizations_plan_type.sql
-- PREREQ canónico para desbloquear REVOKE/GRANT en 00300 sobre _organizations_plan_type()
-- Bootstrap-safe, idempotente. 00400 puede redefinir con CREATE OR REPLACE.

BEGIN;

CREATE SCHEMA IF NOT EXISTS public;

-- Devuelve el "tipo" (regtype) asociado al campo plan de organizations.
-- Placeholder bootstrap: usamos 'text' para no depender de enums aún.
CREATE OR REPLACE FUNCTION public._organizations_plan_type()
RETURNS regtype
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 'text'::regtype;
$$;

COMMIT;
