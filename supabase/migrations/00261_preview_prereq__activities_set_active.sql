-- 00261_preview_prereq__activities_set_active.sql
-- PREREQ bootstrap-safe: existe solo para que 00300_preview_rls.sql pueda REVOKE/GRANT
-- Será redefinida por 00400_preview_vft.sql

create or replace function public.activities_set_active(
  p_id uuid,
  p_active boolean
)
returns table(
  id uuid,
  tenant_id uuid,
  org_id uuid,
  name text,
  description text,
  active boolean,
  currency_code text,
  hourly_rate numeric,
  created_at timestamptz,
  created_by uuid
)
language plpgsql
security definer
set search_path = public
as $$
begin
  -- no-op bootstrap-safe: retorna 0 filas
  return;
end;
$$;

comment on function public.activities_set_active(uuid,boolean)
is 'PREREQ bootstrap-safe (no-op). Exists only to satisfy GRANT/REVOKE in 00300; redefined in 00400.';
