-- =========================================================
-- PREVIEW PREREQ FUNCTIONS (STUBS)
-- Objetivo: permitir CREATE TABLE con DEFAULTs que llaman funciones
-- Nota: Estas funciones serán reemplazadas por definiciones reales
--       en 20260208000400_preview_vft.sql usando CREATE OR REPLACE.
-- =========================================================

create schema if not exists public;

-- Stub: devuelve NULL para permitir crear tablas.
-- La versión real (en vft) debe CREATE OR REPLACE y devolver org_id canónico.
create or replace function public.get_or_create_default_org_id_for_current_user()
returns uuid
language sql
stable
as $$
  select null::uuid;
$$;
