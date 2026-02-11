create schema if not exists public;

-- PREREQ STUB: usado por políticas RLS durante bootstrap.
-- En PROD esta función valida membresía contra public.memberships (auth.uid()).
-- Aquí devolvemos TRUE para no bloquear RLS mientras termina el bootstrap;
-- luego 20260208000400_preview_vft.sql debe reemplazarla con la implementación real (CREATE OR REPLACE).
create or replace function public.is_member_of_org(p_org_id uuid)
returns boolean
language sql
stable
as $$
  select true
$$;
