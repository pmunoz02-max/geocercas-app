-- 00245_preview_prereq__admins_remove.sql
-- PREREQ bootstrap-safe: existe solo para que 00300_preview_rls.sql pueda REVOKE/GRANT
-- Universal: RETURNS boolean (o podría ser void), pero para no depender del tipo real usamos SETOF record.
-- Será redefinida por 00400_preview_vft.sql.

create or replace function public.admins_remove(
  p_org_id uuid,
  p_user_id uuid
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

comment on function public.admins_remove(uuid,uuid)
is 'PREREQ bootstrap-safe (no-op). Uses RETURNS SETOF record to satisfy GRANT/REVOKE in 00300; redefined in 00400.';
