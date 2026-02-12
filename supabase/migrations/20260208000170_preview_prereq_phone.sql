create schema if not exists public;

-- Stub para CREATE TABLE (columna generada phone_norm).
-- La versión real será reemplazada en 20260208000400_preview_vft.sql (CREATE OR REPLACE).
create or replace function public.normalize_phone(p_phone text)
returns text
language sql
immutable
as $$
  select regexp_replace(coalesce(p_phone,''), '[^0-9]+', '', 'g');
$$;