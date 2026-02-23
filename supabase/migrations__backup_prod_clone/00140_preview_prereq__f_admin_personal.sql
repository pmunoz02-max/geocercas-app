-- 00140_preview_prereq__f_admin_personal.sql
-- PREREQ bootstrap-safe: solo para permitir que 00300_preview_rls.sql avance.
-- Será redefinida por 00400_preview_vft.sql.

create or replace function public.f_admin_personal()
returns setof public.personal
language sql
security definer
set search_path = public
as $$
  select *
  from public.personal
  where false;
$$;

-- Importante: 00300 hace REVOKE/GRANT, la función debe existir
revoke all on function public.f_admin_personal() from public;
grant execute on function public.f_admin_personal() to anon, authenticated;
