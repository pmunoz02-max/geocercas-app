-- 00242_preview_prereq__app_asignacion_set_estado.sql
-- PREREQ bootstrap-safe: existe solo para que 00300_preview_rls.sql pueda GRANT/REVOKE
-- Universal: usamos RETURNS boolean (muy típico en set_estado). Será redefinida por 00400_preview_vft.sql.

create or replace function public.app_asignacion_set_estado(
  p_id uuid,
  p_estado text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  -- no-op bootstrap-safe
  return false;
end;
$$;

comment on function public.app_asignacion_set_estado(uuid,text)
is 'PREREQ bootstrap-safe (no-op). Exists only to satisfy GRANT/REVOKE in 00300; redefined in 00400.';
