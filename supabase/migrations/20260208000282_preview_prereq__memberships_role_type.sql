-- 20260208000282_preview_prereq__memberships_role_type.sql
-- PREREQ canónico para desbloquear REVOKE/GRANT en 00300 sobre _memberships_role_type()
-- Bootstrap-safe, idempotente. 00400 puede redefinir con CREATE OR REPLACE.

BEGIN;

CREATE SCHEMA IF NOT EXISTS public;

-- Función placeholder: su objetivo aquí es EXISTIR para que 00300 pueda REVOKE/GRANT sin fallar.
-- Retornamos un regtype neutro (text) para evitar depender de enums/tablas aún no listas.
CREATE OR REPLACE FUNCTION public._memberships_role_type()
RETURNS regtype
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 'text'::regtype;
$$;

COMMIT;
