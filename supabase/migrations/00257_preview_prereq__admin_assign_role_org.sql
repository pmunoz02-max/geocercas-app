-- 00257_preview_prereq__admin_assign_role_org.sql
-- PREREQ bootstrap-safe: existe solo para que 00300_preview_rls.sql pueda GRANT/REVOKE
-- Será redefinida por 00400_preview_vft.sql

create or replace function public.admin_assign_role_org(
  p_email text,
  p_role_slug text,
  p_org_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- no-op bootstrap-safe
  return;
end;
$$;

comment on function public.admin_assign_role_org(text,text,uuid)
is 'PREREQ bootstrap-safe (no-op). Exists only to satisfy GRANT/REVOKE in 00300; redefined in 00400.';
