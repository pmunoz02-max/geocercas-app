-- 00240_preview_prereq__app_asignacion_upsert.sql
-- PREREQ bootstrap-safe: existe solo para que 00300_preview_rls.sql pueda GRANT/REVOKE
-- Universal: RETURNS SETOF record para no depender del tipo real.
-- Será redefinida por 00400_preview_vft.sql.

create or replace function public.app_asignacion_upsert(
  _id uuid,
  _tenant_id uuid,
  _user_id uuid,
  _personal_id uuid,
  _geocerca_id uuid,
  _start_date date,
  _end_date date,
  _estado text,
  _frecuencia_envio_sec integer
)
returns setof record
language plpgsql
security definer
set search_path = public
as $$
begin
  -- no-op bootstrap-safe: retorna 0 filas
  return;
end;
$$;

comment on function public.app_asignacion_upsert(uuid,uuid,uuid,uuid,uuid,date,date,text,integer)
is 'PREREQ bootstrap-safe (no-op). Uses RETURNS SETOF record to satisfy GRANT/REVOKE in 00300; redefined in 00400.';
