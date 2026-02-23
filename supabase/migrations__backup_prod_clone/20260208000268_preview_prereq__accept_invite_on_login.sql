-- 20260208000268_preview_prereq__accept_invite_on_login.sql
-- PREREQ canónico para desbloquear GRANTs en 00300 sobre accept_invite_on_login()
-- Bootstrap-safe. 00400 puede redefinir con implementación real.

BEGIN;

CREATE SCHEMA IF NOT EXISTS public;

CREATE OR REPLACE FUNCTION public.accept_invite_on_login()
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  -- Bootstrap no-op: en real típicamente revisa un token pendiente y llama accept_invitation(...)
  RETURN TRUE;
END;
$$;

-- Permisos mínimos para evitar crash en 00300
DO $$
BEGIN
  BEGIN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.accept_invite_on_login() TO anon, authenticated';
  EXCEPTION WHEN undefined_object THEN
    NULL;
  END;
END $$;

COMMIT;
