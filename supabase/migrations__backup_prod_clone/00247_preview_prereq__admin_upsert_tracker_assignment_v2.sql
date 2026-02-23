-- 00247_preview_prereq__admin_upsert_tracker_assignment_v2.sql
-- PREREQ bootstrap-safe: existe solo para que 00300_preview_rls.sql pueda GRANT/REVOKE
-- Universal: RETURNS SETOF record para no depender del tipo real.
-- Será redefinida por 00400_preview_vft.sql.

create or replace function public.admin_upsert_tracker_assignment_v2(
  p_org_id uuid,
  p_tracker_user_id uuid,
  p_geofence_id uuid,
  p_activity_id uuid,
  p_start_date date,
  p_end_date date,
  p_active boolean
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

comment on function public.admin_upsert_tracker_assignment_v2(uuid,uuid,uuid,uuid,date,date,boolean)
is 'PREREQ bootstrap-safe (no-op). Uses RETURNS SETOF record to satisfy GRANT/REVOKE in 00300; redefined in 00400.';
