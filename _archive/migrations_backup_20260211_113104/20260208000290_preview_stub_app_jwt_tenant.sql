create schema if not exists public;

-- PREREQ STUB: usado por políticas RLS heredadas en dumps (ej: tenant_id = app_jwt_tenant()).
-- En App Geocercas el tenant canónico es org_id; este stub evita fallos durante bootstrap.
-- La implementación real (si aplica) puede ser reemplazada luego con CREATE OR REPLACE.
create or replace function public.app_jwt_tenant()
returns uuid
language sql
stable
as $$
  select null::uuid
$$;
