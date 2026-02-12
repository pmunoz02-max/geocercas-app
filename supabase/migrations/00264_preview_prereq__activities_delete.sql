-- 00264_preview_prereq__activities_delete.sql
-- PREREQ bootstrap-safe: existe solo para que 00300_preview_rls.sql pueda REVOKE/GRANT
-- Será redefinida por 00400_preview_vft.sql

create or replace function public.activities_delete(
  p_id uuid
)
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

comment on function public.activities_delete(uuid)
is 'PREREQ bootstrap-safe (no-op). Exists only to satisfy GRANT/REVOKE in 00300; redefined in 00400.';
