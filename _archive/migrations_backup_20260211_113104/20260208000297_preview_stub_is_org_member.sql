create schema if not exists public;

-- PREREQ STUB: usado por políticas RLS durante bootstrap.
-- En PROD valida si auth.uid() pertenece a p_org_id (memberships).
-- En PREVIEW devolvemos TRUE para no bloquear SELECT durante el bootstrap;
-- luego 20260208000400_preview_vft.sql debe reemplazarla con la implementación real (CREATE OR REPLACE).
create or replace function public.is_org_member(p_org_id uuid)
returns boolean
language sql
stable
as $$
  select true
$$;
