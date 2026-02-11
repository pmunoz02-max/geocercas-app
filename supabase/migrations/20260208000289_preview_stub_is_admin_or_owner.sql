create schema if not exists public;

-- PREREQ STUB: usado por políticas RLS durante bootstrap.
-- En PROD valida si p_user_id es admin u owner (memberships/roles).
-- En PREVIEW devolvemos TRUE para no bloquear durante el bootstrap;
-- luego 20260208000400_preview_vft.sql puede reemplazarla con la implementación real.
create or replace function public.is_admin_or_owner(uid uuid)

returns boolean
language sql
stable
as $$
  select true
$$;
