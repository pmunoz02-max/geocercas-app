-- 00252_preview_prereq__admin_enroll_tracker.sql
-- PREREQ bootstrap-safe: existe solo para que 00300_preview_rls.sql pueda REVOKE/GRANT
-- Universal: RETURNS SETOF record para no depender del tipo real.
-- Será redefinida por 00400_preview_vft.sql.

create or replace function public.admin_enroll_tracker(
  p_org_id uuid,
  p_tracker_user_id uuid,
  p_email text,
  p_full_name text
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

comment on function public.admin_enroll_tracker(uuid,uuid,text,text)
is 'PREREQ bootstrap-safe (no-op). Uses RETURNS SETOF record to satisfy GRANT/REVOKE in 00300; redefined in 00400.';
