create schema if not exists public;

-- PREREQ STUB: usado por políticas RLS durante bootstrap (firma de 2 argumentos).
-- En PROD valida si p_user_id es admin de p_org_id (memberships/roles).
-- En PREVIEW devolvemos TRUE para no bloquear SELECT durante el bootstrap;
-- luego 20260208000400_preview_vft.sql debe reemplazarla con la implementación real (CREATE OR REPLACE).
create or replace function public.is_org_admin(p_org_id uuid, p_user_id uuid)
returns boolean
language sql
stable
as $$
  select true
$$;
