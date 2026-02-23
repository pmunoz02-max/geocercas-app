-- 00243_preview_prereq__app_admin_mode.sql
-- PREREQ bootstrap-safe: existe solo para que 00300_preview_rls.sql pueda GRANT/REVOKE
-- Universal: no dependemos del tipo real.
-- Será redefinida por 00400_preview_vft.sql.

create or replace function public.app_admin_mode()
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

comment on function public.app_admin_mode()
is 'PREREQ bootstrap-safe (no-op). Exists only to satisfy GRANT/REVOKE in 00300; redefined in 00400.';
