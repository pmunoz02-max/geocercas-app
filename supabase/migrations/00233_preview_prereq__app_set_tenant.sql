-- PREREQ bootstrap-safe para permitir GRANT/REVOKE en 00300_preview_rls.sql
-- Redefinida completamente por 00400_preview_vft.sql

create or replace function public.app_set_tenant(
  p_tenant uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- no-op en bootstrap
  return;
end;
$$;

comment on function public.app_set_tenant(uuid) is
'PREREQ bootstrap-safe para pasar 00300_preview_rls.sql; redefinida por 00400_preview_vft.sql';
