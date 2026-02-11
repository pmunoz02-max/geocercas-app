-- PREREQ bootstrap-safe para permitir GRANT/REVOKE en 00300_preview_rls.sql
-- Redefinida por 00400_preview_vft.sql

create or replace function public.app_install_rls(
  p_table regclass,
  p_org_col text,
  p_owner_col text,
  p_require_owner_write boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- no-op (en bootstrap no instalamos nada)
  return;
end;
$$;

comment on function public.app_install_rls(regclass, text, text, boolean) is
'PREREQ bootstrap-safe para pasar 00300_preview_rls.sql; redefinida por 00400_preview_vft.sql';
