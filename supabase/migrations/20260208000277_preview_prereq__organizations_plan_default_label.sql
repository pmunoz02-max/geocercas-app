-- 20260208000277_preview_prereq__organizations_plan_default_label.sql
-- PREREQ canónico para desbloquear REVOKE/GRANT en 00300 sobre _organizations_plan_default_label()
-- Bootstrap-safe, idempotente. 00400 puede redefinir con CREATE OR REPLACE.

BEGIN;

CREATE SCHEMA IF NOT EXISTS public;

-- Devuelve etiqueta por defecto del plan de una organización.
-- Placeholder bootstrap: retorna 'free' (string estable y no rompe).
CREATE OR REPLACE FUNCTION public._organizations_plan_default_label()
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 'free'::text;
$$;

COMMIT;
