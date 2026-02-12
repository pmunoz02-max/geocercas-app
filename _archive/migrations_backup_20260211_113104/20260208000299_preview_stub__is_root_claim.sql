create schema if not exists public;

-- PREREQ STUB: usado por políticas RLS durante bootstrap (claims legacy).
-- En PREVIEW devolvemos TRUE para no bloquear operaciones mientras termina el bootstrap;
-- luego 20260208000400_preview_vft.sql puede reemplazarla con la implementación real (CREATE OR REPLACE).
create or replace function public._is_root_claim()
returns boolean
language sql
stable
as $$
  select true
$$;
