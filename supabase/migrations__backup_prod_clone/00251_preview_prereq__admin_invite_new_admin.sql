-- 00251_preview_prereq__admin_invite_new_admin.sql
-- PREREQ bootstrap-safe: existe solo para que 00300_preview_rls.sql pueda GRANT/REVOKE
-- Universal: RETURNS SETOF record para no depender del tipo real.
-- Será redefinida por 00400_preview_vft.sql.

create or replace function public.admin_invite_new_admin(
  p_email text,
  p_role text
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

comment on function public.admin_invite_new_admin(text,text)
is 'PREREQ bootstrap-safe (no-op). Uses RETURNS SETOF record to satisfy GRANT/REVOKE in 00300; redefined in 00400.';
