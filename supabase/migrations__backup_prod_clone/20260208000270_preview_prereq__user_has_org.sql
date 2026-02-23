-- 20260208000270_preview_prereq__user_has_org.sql
-- PREREQ canónico para desbloquear GRANTs en 00300 sobre _user_has_org(uuid, uuid)
-- Bootstrap-safe, idempotente. 00400 puede redefinir con CREATE OR REPLACE.

BEGIN;

CREATE SCHEMA IF NOT EXISTS public;

-- Determina si un usuario pertenece a una org (por memberships).
-- Bootstrap-safe: si la tabla no existe aún, retorna FALSE.
CREATE OR REPLACE FUNCTION public._user_has_org(p_user uuid, p_org uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_exists boolean;
BEGIN
  IF p_user IS NULL OR p_org IS NULL THEN
    RETURN FALSE;
  END IF;

  BEGIN
    SELECT EXISTS (
      SELECT 1
      FROM public.memberships m
      WHERE m.user_id = p_user
        AND m.org_id  = p_org
    )
    INTO v_exists;
  EXCEPTION WHEN undefined_table THEN
    RETURN FALSE;
  WHEN others THEN
    RETURN FALSE;
  END;

  RETURN COALESCE(v_exists, FALSE);
END;
$$;

-- Permisos mínimos para evitar crash en 00300
DO $$
BEGIN
  BEGIN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public._user_has_org(uuid, uuid) TO anon, authenticated';
  EXCEPTION WHEN undefined_object THEN
    NULL;
  END;
END $$;

COMMIT;
