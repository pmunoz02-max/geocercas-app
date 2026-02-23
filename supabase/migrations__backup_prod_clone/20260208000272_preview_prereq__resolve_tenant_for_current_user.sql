-- 20260208000272_preview_prereq__resolve_tenant_for_current_user.sql
-- PREREQ canónico para desbloquear REVOKE/GRANT en 00300 sobre _resolve_tenant_for_current_user()
-- Bootstrap-safe: NO lanza exceptions y retorna NULL si no hay org.
-- 00400 lo redefine con la implementación real.

BEGIN;

CREATE SCHEMA IF NOT EXISTS public;

CREATE OR REPLACE FUNCTION public._resolve_tenant_for_current_user()
RETURNS uuid
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_org uuid;
BEGIN
  -- Bootstrap-safe: no asumir memberships listas, no lanzar exception.
  BEGIN
    SELECT m.org_id
      INTO v_org
    FROM public.memberships m
    WHERE m.user_id = auth.uid()
    ORDER BY m.created_at NULLS LAST
    LIMIT 1;
  EXCEPTION WHEN undefined_table THEN
    RETURN NULL;
  WHEN others THEN
    RETURN NULL;
  END;

  RETURN v_org;
END;
$$;

COMMIT;
