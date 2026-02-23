-- PREREQ bootstrap-safe para permitir GRANT/REVOKE en 00300_preview_rls.sql
-- Redefinida por 00400_preview_vft.sql

create or replace function public.delete_geofence_hard(
  p_geofence_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  -- retorno neutro en bootstrap
  return true;
end;
$$;

comment on function public.delete_geofence_hard(uuid) is
'PREREQ bootstrap-safe para pasar 00300_preview_rls.sql; redefinida por 00400_preview_vft.sql';
