-- 00163_preview_prereq__ensure_org_for_new_admin.sql
-- PREREQ bootstrap-safe: solo para permitir que 00300_preview_rls.sql avance.
-- Será redefinida completamente por 00400_preview_vft.sql.

create or replace function public.ensure_org_for_new_admin()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  -- no-op neutro
  return null::uuid;
end;
$$;

-- Opcional: 00300 aplicará los GRANT/REVOKE canónicos
revoke all on function public.ensure_org_for_new_admin() from public;
grant execute on function public.ensure_org_for_new_admin() to anon, authenticated;
