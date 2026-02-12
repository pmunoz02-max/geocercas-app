create schema if not exists public;

-- PREREQ STUB: usado por políticas RLS durante bootstrap.
-- En PROD valida si el usuario autenticado es el "root owner".
-- En PREVIEW devolvemos TRUE para no bloquear RLS durante el bootstrap;
-- luego 20260208000400_preview_vft.sql debe reemplazarla con la implementación real (CREATE OR REPLACE).
create or replace function public.is_root_owner()
returns boolean
language sql
stable
as $$
  select true
$$;
