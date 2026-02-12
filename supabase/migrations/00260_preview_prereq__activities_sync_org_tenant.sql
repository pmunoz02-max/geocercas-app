-- 00260_preview_prereq__activities_sync_org_tenant.sql
-- PREREQ bootstrap-safe: existe solo para que 00300_preview_rls.sql pueda GRANT/REVOKE
-- Será redefinida por 00400_preview_vft.sql

create or replace function public.activities_sync_org_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- bootstrap-safe: no tocamos nada, solo retornamos NEW si existe
  return new;
end;
$$;

comment on function public.activities_sync_org_tenant()
is 'PREREQ bootstrap-safe. Exists only to satisfy GRANT/REVOKE in 00300; redefined in 00400.';
