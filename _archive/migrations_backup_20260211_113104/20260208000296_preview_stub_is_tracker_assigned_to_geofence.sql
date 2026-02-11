create schema if not exists public;

-- PREREQ STUB: usado por políticas RLS durante bootstrap.
-- En PROD valida si el usuario (auth.uid()) tiene asignación vigente a esa geocerca/org.
-- En PREVIEW devolvemos TRUE para no bloquear SELECT durante el bootstrap;
-- luego 20260208000400_preview_vft.sql debe reemplazarla con la implementación real (CREATE OR REPLACE).
create or replace function public.is_tracker_assigned_to_geofence(p_org_id uuid, p_geofence_id uuid)
returns boolean
language sql
stable
as $$
  select true
$$;
