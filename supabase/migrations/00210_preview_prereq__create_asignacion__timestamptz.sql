-- PREREQ bootstrap-safe para permitir GRANT/REVOKE en 00300_preview_rls.sql
-- Redefinida por 00400_preview_vft.sql

create or replace function public.create_asignacion(
  p_user_id uuid,
  p_geocerca_id uuid,
  p_inicio timestamp with time zone,
  p_fin timestamp with time zone,
  p_frecuencia_min integer,
  p_nombre text,
  p_telefono text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  -- retorno neutro en bootstrap
  return null;
end;
$$;

comment on function public.create_asignacion(uuid, uuid, timestamp with time zone, timestamp with time zone, integer, text, text) is
'PREREQ bootstrap-safe para pasar 00300_preview_rls.sql; redefinida por 00400_preview_vft.sql';
