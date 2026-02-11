create schema if not exists public;

-- PREREQ STUB: usado por políticas RLS heredadas en dumps (ej: app_jwt_role() = 'owner').
-- En App Geocercas la fuente de verdad es auth.uid() + memberships/org_id.
-- Este stub evita fallos durante bootstrap. Se puede reemplazar luego con CREATE OR REPLACE.
create or replace function public.app_jwt_role()
returns text
language sql
stable
as $$
  select 'owner'::text
$$;
