-- 00263_preview_prereq__activities_list.sql
-- PREREQ bootstrap-safe: existe solo para que 00300_preview_rls.sql pueda REVOKE/GRANT
-- Nota: usamos RETURNS SETOF record para evitar depender de tipos (bootstrap universal).
-- Será redefinida por 00400_preview_vft.sql con el tipo real.

create or replace function public.activities_list(
  p_include_inactive boolean
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

comment on function public.activities_list(boolean)
is 'PREREQ bootstrap-safe (no-op). Uses RETURNS SETOF record to satisfy GRANT/REVOKE in 00300; redefined in 00400.';
