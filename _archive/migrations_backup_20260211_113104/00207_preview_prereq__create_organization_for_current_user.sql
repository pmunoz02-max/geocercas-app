-- PREREQ bootstrap-safe para permitir GRANT/REVOKE en 00300_preview_rls.sql
-- Redefinida por 00400_preview_vft.sql

create or replace function public.create_organization_for_current_user(
  p_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  -- retorno neutro en bootstrap
  return null;
end;
$$;

comment on function public.create_organization_for_current_user(text) is
'PREREQ bootstrap-safe para pasar 00300_preview_rls.sql; redefinida por 00400_preview_vft.sql';
