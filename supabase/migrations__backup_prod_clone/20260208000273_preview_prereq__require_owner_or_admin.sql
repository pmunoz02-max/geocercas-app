-- 20260208000273_preview_prereq__require_owner_or_admin.sql
-- PREREQ canónico para desbloquear GRANTs en 00300 sobre _require_owner_or_admin(uuid)
-- Bootstrap-safe: durante migraciones NO debe bloquear; 00400 lo redefine con lógica real.
-- Idempotente.

BEGIN;

CREATE SCHEMA IF NOT EXISTS public;

-- En producción normalmente este tipo de función valida permisos y podría lanzar exception.
-- En bootstrap-preview la hacemos "no-bloqueante" (no lanza), solo retorna true/false.
CREATE OR REPLACE FUNCTION public._require_owner_or_admin(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT TRUE;
$$;

-- Permisos mínimos para evitar crash en 00300
DO $$
BEGIN
  BEGIN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public._require_owner_or_admin(uuid) TO anon, authenticated';
  EXCEPTION WHEN undefined_object THEN
    NULL;
  END;
END $$;

COMMIT;
