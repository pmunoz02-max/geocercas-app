-- 20260208000269_preview_prereq__accept_invitation.sql
-- PREREQ canónico para desbloquear GRANTs en 00300 sobre accept_invitation(uuid)
-- Bootstrap-safe: no rompe si faltan tablas; retorna boolean indicando éxito.
-- 00400 puede redefinir con implementación real.

BEGIN;

CREATE SCHEMA IF NOT EXISTS public;

CREATE OR REPLACE FUNCTION public.accept_invitation(p_token uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  -- Bootstrap-safe: si no hay token, no acepta.
  IF p_token IS NULL THEN
    RETURN FALSE;
  END IF;

  -- No-op durante bootstrap (sin tocar tablas legacy/invitations si no existen).
  -- La implementación real en 00400 debe hacer: validar token, crear membership, etc.
  RETURN TRUE;
END;
$$;

-- Permisos mínimos para evitar crash en 00300
DO $$
BEGIN
  BEGIN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.accept_invitation(uuid) TO anon, authenticated';
  EXCEPTION WHEN undefined_object THEN
    NULL;
  END;
END $$;

COMMIT;
