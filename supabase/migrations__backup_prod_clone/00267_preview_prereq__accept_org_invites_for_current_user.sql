-- 00267_preview_prereq__accept_org_invites_for_current_user.sql
-- PREREQ bootstrap-safe: función placeholder para evitar fallo en 00300_preview_rls.sql
-- Será redefinida por 00400_preview_vft.sql

create or replace function public.accept_org_invites_for_current_user()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- no-op (bootstrap-safe)
  return;
end;
$$;

comment on function public.accept_org_invites_for_current_user()
is 'PREREQ bootstrap-safe (no-op). Exists only to satisfy GRANT/REVOKE in 00300; redefined in 00400.';
