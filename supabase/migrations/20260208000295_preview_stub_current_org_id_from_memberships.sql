create schema if not exists public;

-- PREREQ STUB: usado por políticas RLS durante bootstrap.
-- En PROD normalmente devuelve el org_id "actual" del usuario (desde memberships) usando auth.uid().
-- En PREVIEW devolvemos NULL para permitir que COALESCE(org_id, current_org_id_from_memberships()) funcione
-- solo cuando org_id venga explícito; luego 20260208000400_preview_vft.sql debe reemplazarla con la real.
create or replace function public.current_org_id_from_memberships()
returns uuid
language sql
stable
as $$
  select null::uuid
$$;
