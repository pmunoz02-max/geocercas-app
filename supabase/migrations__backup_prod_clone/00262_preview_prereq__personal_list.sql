-- 00262_preview_prereq__personal_list.sql
-- PREREQ bootstrap-safe: existe solo para que 00300_preview_rls.sql pueda REVOKE/GRANT
-- Será redefinida por 00400_preview_vft.sql

create or replace function public.personal_list(
  _q text,
  _only_active boolean
)
returns setof public.personal
language plpgsql
security definer
set search_path = public
as $$
begin
  -- no-op bootstrap-safe: retorna 0 filas
  return;
end;
$$;

comment on function public.personal_list(text,boolean)
is 'PREREQ bootstrap-safe (no-op). Exists only to satisfy GRANT/REVOKE in 00300; redefined in 00400.';
