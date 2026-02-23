-- 00265_preview_prereq__activities_create.sql
-- PREREQ bootstrap-safe: existe solo para que 00300_preview_rls.sql pueda REVOKE/GRANT
-- Será redefinida por 00400_preview_vft.sql

create or replace function public.activities_create(
  p_name text,
  p_description text default null::text,
  p_active boolean default true,
  p_currency_code text default 'USD'::text,
  p_hourly_rate numeric default null::numeric
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
  -- no-op bootstrap-safe: retorna 0 filas pero compila con la firma exacta
  return;
end;
$$;

comment on function public.activities_create(text,text,boolean,text,numeric)
is 'PREREQ bootstrap-safe (no-op). Exists only to satisfy GRANT/REVOKE in 00300; redefined in 00400.';
